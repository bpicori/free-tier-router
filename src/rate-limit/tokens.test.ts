import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  estimateMessageTokens,
  estimateChatTokens,
} from "./tokens.js";

describe("tokens", () => {
  describe("estimateTokens", () => {
    it("estimates ~4 characters per token", () => {
      // 100 characters → ~25 tokens
      const text = "a".repeat(100);

      expect(estimateTokens(text)).toBe(25);
    });

    it("rounds up to avoid underestimating", () => {
      // 10 characters → 3 tokens (not 2.5)
      const text = "hello worl";

      expect(estimateTokens(text)).toBe(3);
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });

    it("handles typical prompt sizes", () => {
      const shortPrompt = "What is 2+2?"; // 12 chars → 3 tokens
      const mediumPrompt = "Explain the concept of recursion in programming."; // 48 chars → 12 tokens

      expect(estimateTokens(shortPrompt)).toBe(3);
      expect(estimateTokens(mediumPrompt)).toBe(12);
    });
  });

  describe("estimateMessageTokens", () => {
    it("adds overhead for message formatting", () => {
      const content = "Hello"; // 5 chars → 2 tokens + 4 overhead = 6

      expect(estimateMessageTokens(content)).toBe(6);
    });
  });

  describe("estimateChatTokens", () => {
    it("sums message tokens plus chat overhead", () => {
      const messages = [
        { content: "You are a helpful assistant." }, // 28 chars → 7 + 4 = 11
        { content: "Hello!" }, // 6 chars → 2 + 4 = 6
      ];

      // 11 + 6 + 3 (chat overhead) = 20
      expect(estimateChatTokens(messages)).toBe(20);
    });

    it("handles empty conversation", () => {
      expect(estimateChatTokens([])).toBe(3); // Just chat overhead
    });
  });
});
