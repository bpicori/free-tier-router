/**
 * Message utilities for extracting and transforming message content.
 */

/**
 * Message with potentially non-string content (e.g., multimodal content arrays)
 */
export type MessageInput = {
  content?: string | unknown;
};

/**
 * Normalized message with string content
 */
export type NormalizedMessage = {
  content: string;
};

/**
 * Extract string content from messages, converting non-string content to empty string.
 * This is used for token estimation where we need simple string content.
 *
 * @param messages - Array of messages with potentially non-string content
 * @returns Array of messages with normalized string content
 */
export const extractMessageContent = (
  messages: readonly MessageInput[]
): NormalizedMessage[] =>
  messages.map((m) => ({
    content: typeof m.content === "string" ? m.content : "",
  }));
