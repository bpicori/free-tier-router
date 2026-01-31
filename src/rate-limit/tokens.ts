/**
 * Token estimation utilities
 *
 * LLM APIs charge by tokens, but we don't always know exact token counts
 * before making a request. These utilities provide rough estimates.
 */

/**
 * Estimate token count from text using a simple heuristic
 *
 * Most LLMs use ~4 characters per token on average for English text.
 * This is a rough approximation - actual tokenization varies by model.
 *
 * ## Accuracy Notes
 *
 * - English prose: ~4 chars/token (pretty accurate)
 * - Code: ~3 chars/token (underestimates)
 * - Non-Latin scripts: ~1-2 chars/token (significantly underestimates)
 * - Whitespace/punctuation: varies widely
 *
 * For safety, we round up to avoid underestimating usage.
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export const estimateTokens = (text: string): number => {
  if (!text) return 0;
  // ~4 characters per token, rounded up
  return Math.ceil(text.length / 4);
};

/**
 * Estimate tokens for a chat message
 *
 * Accounts for message overhead (role, formatting) in addition to content.
 * Each message has ~4 tokens of overhead for role/formatting.
 *
 * @param content - Message content
 * @returns Estimated token count including overhead
 */
export const estimateMessageTokens = (content: string): number => {
  const contentTokens = estimateTokens(content);
  const overhead = 4; // role, delimiters, etc.
  return contentTokens + overhead;
};

/**
 * Estimate total tokens for an array of messages
 *
 * @param messages - Array of message contents
 * @returns Total estimated tokens
 */
export const estimateChatTokens = (messages: Array<{ content: string }>): number => {
  const messageTokens = messages.reduce(
    (sum, msg) => sum + estimateMessageTokens(msg.content),
    0
  );
  // Add ~3 tokens for chat completion overhead
  return messageTokens + 3;
};
