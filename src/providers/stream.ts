import type { ChatCompletionChunk } from "../types/openai.js";
import { ProviderError } from "../types/errors.js";

/**
 * Parse Server-Sent Events (SSE) from a ReadableStream
 *
 * SSE Format:
 * ```
 * data: {"id":"...","choices":[...]}
 *
 * data: {"id":"...","choices":[...]}
 *
 * data: [DONE]
 * ```
 *
 * @param response - Fetch Response with SSE body
 * @yields ChatCompletionChunk for each parsed event
 */
export async function* parseSSEStream(
  response: Response
): AsyncGenerator<ChatCompletionChunk, void, unknown> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ProviderError("Response body is not readable", 0);
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          const chunk = parseSSELine(buffer);
          if (chunk) yield chunk;
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      // Keep the last potentially incomplete line in buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const chunk = parseSSELine(line);
        if (chunk) yield chunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Parse a single SSE line
 *
 * @param line - Raw SSE line
 * @returns Parsed chunk or null if not a data line
 */
const parseSSELine = (line: string): ChatCompletionChunk | null => {
  const trimmed = line.trim();

  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith(":")) {
    return null;
  }

  // Only process data lines
  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const data = trimmed.slice(5).trim();

  // [DONE] signals end of stream
  if (data === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(data) as ChatCompletionChunk;
  } catch {
    // Skip malformed JSON
    return null;
  }
};

/**
 * Collect all content from a stream into a single string
 *
 * Useful for testing or when you need the full response
 *
 * @param stream - AsyncIterable of chunks
 * @returns Concatenated content string
 */
export const collectStreamContent = async (
  stream: AsyncIterable<ChatCompletionChunk>
): Promise<string> => {
  let content = "";

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      content += delta;
    }
  }

  return content;
};

/**
 * Count tokens used in a stream (from final chunk usage)
 *
 * Note: Only works if stream_options.include_usage was set
 *
 * @param stream - AsyncIterable of chunks
 * @returns Total tokens or null if not available
 */
export const getStreamTokenUsage = async (
  stream: AsyncIterable<ChatCompletionChunk>
): Promise<number | null> => {
  let lastChunk: ChatCompletionChunk | null = null;

  for await (const chunk of stream) {
    lastChunk = chunk;
  }

  return lastChunk?.usage?.total_tokens ?? null;
};

/**
 * Transform stream to include token counting
 *
 * Wraps a chunk stream to track accumulated content for token estimation
 *
 * @param stream - Source chunk stream
 * @param onComplete - Callback with final content when stream ends
 * @yields Original chunks unchanged
 */
export async function* wrapStreamWithCallback(
  stream: AsyncIterable<ChatCompletionChunk>,
  onComplete: (content: string, lastChunk: ChatCompletionChunk | null) => void
): AsyncGenerator<ChatCompletionChunk, void, unknown> {
  let content = "";
  let lastChunk: ChatCompletionChunk | null = null;

  try {
    for await (const chunk of stream) {
      lastChunk = chunk;
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        content += delta;
      }
      yield chunk;
    }
  } finally {
    onComplete(content, lastChunk);
  }
}
