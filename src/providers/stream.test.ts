import { describe, it, expect } from "vitest";
import {
  parseSSEStream,
  collectStreamContent,
  wrapStreamWithCallback,
} from "./stream.js";
import type { ChatCompletionChunk } from "../types/openai.js";

/**
 * Create a mock Response with SSE body
 */
const createSSEResponse = (lines: string[]): Response => {
  const text = lines.join("\n");
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" },
  });
};

/**
 * Create a valid chunk for testing
 */
const createChunk = (content: string, index = 0): ChatCompletionChunk => ({
  id: "chatcmpl-123",
  object: "chat.completion.chunk",
  created: 1234567890,
  model: "llama-3.3-70b",
  choices: [
    {
      index,
      delta: { content },
      finish_reason: null,
    },
  ],
});

describe("stream", () => {
  // ─────────────────────────────────────────────────────────────────
  // SSE Parsing
  // ─────────────────────────────────────────────────────────────────

  describe("parseSSEStream", () => {
    it("parses data lines into chunks", async () => {
      const chunk1 = createChunk("Hello");
      const chunk2 = createChunk(" world");

      const response = createSSEResponse([
        `data: ${JSON.stringify(chunk1)}`,
        "",
        `data: ${JSON.stringify(chunk2)}`,
        "",
        "data: [DONE]",
      ]);

      const chunks: ChatCompletionChunk[] = [];
      for await (const chunk of parseSSEStream(response)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(2);
      expect(chunks[0]?.choices[0]?.delta.content).toBe("Hello");
      expect(chunks[1]?.choices[0]?.delta.content).toBe(" world");
    });

    it("ignores empty lines and comments", async () => {
      const chunk = createChunk("test");

      const response = createSSEResponse([
        "",
        ": this is a comment",
        `data: ${JSON.stringify(chunk)}`,
        "",
        "",
        "data: [DONE]",
      ]);

      const chunks: ChatCompletionChunk[] = [];
      for await (const chunk of parseSSEStream(response)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
    });

    it("handles [DONE] marker without yielding it", async () => {
      const chunk = createChunk("content");

      const response = createSSEResponse([
        `data: ${JSON.stringify(chunk)}`,
        "",
        "data: [DONE]",
        "", // In real SSE, connection closes after [DONE]
      ]);

      const chunks: ChatCompletionChunk[] = [];
      for await (const chunk of parseSSEStream(response)) {
        chunks.push(chunk);
      }

      // [DONE] should not be yielded as a chunk
      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.choices[0]?.delta.content).toBe("content");
    });

    it("skips malformed JSON gracefully", async () => {
      const validChunk = createChunk("valid");

      const response = createSSEResponse([
        "data: {invalid json}",
        "",
        `data: ${JSON.stringify(validChunk)}`,
        "",
        "data: [DONE]",
      ]);

      const chunks: ChatCompletionChunk[] = [];
      for await (const chunk of parseSSEStream(response)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]?.choices[0]?.delta.content).toBe("valid");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Content Collection
  // ─────────────────────────────────────────────────────────────────

  describe("collectStreamContent", () => {
    it("concatenates all delta content", async () => {
      const chunks: ChatCompletionChunk[] = [
        createChunk("Hello"),
        createChunk(" "),
        createChunk("world"),
        createChunk("!"),
      ];

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      const content = await collectStreamContent(mockStream());

      expect(content).toBe("Hello world!");
    });

    it("handles chunks with no content", async () => {
      const chunks: ChatCompletionChunk[] = [
        createChunk("Hi"),
        { ...createChunk(""), choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
      ];

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      const content = await collectStreamContent(mockStream());

      expect(content).toBe("Hi");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Stream Wrapping
  // ─────────────────────────────────────────────────────────────────

  describe("wrapStreamWithCallback", () => {
    it("calls onComplete with accumulated content", async () => {
      const chunks: ChatCompletionChunk[] = [
        createChunk("Hello"),
        createChunk(" world"),
      ];

      async function* mockStream() {
        for (const chunk of chunks) {
          yield chunk;
        }
      }

      let capturedContent = "";
      let capturedLastChunk: ChatCompletionChunk | null = null;

      const wrapped = wrapStreamWithCallback(mockStream(), (content, lastChunk) => {
        capturedContent = content;
        capturedLastChunk = lastChunk;
      });

      // Consume the stream
      const yielded: ChatCompletionChunk[] = [];
      for await (const chunk of wrapped) {
        yielded.push(chunk);
      }

      expect(capturedContent).toBe("Hello world");
      expect(capturedLastChunk?.choices[0]?.delta.content).toBe(" world");
      expect(yielded).toHaveLength(2);
    });

    it("yields original chunks unchanged", async () => {
      const original = createChunk("test");

      async function* mockStream() {
        yield original;
      }

      const wrapped = wrapStreamWithCallback(mockStream(), () => {});

      const yielded: ChatCompletionChunk[] = [];
      for await (const chunk of wrapped) {
        yielded.push(chunk);
      }

      expect(yielded[0]).toBe(original);
    });
  });
});
