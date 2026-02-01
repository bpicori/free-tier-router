import { describe, it, expect } from "vitest";
import { extractMessageContent } from "./messages.js";

describe("extractMessageContent", () => {
  it("should extract string content from messages", () => {
    const result = extractMessageContent([
      { content: "hello" },
      { content: "world" },
    ]);

    expect(result).toEqual([{ content: "hello" }, { content: "world" }]);
  });

  it("should return empty string for non-string content", () => {
    const result = extractMessageContent([
      { content: [{ type: "text", text: "image content" }] },
      { content: { nested: "object" } },
    ]);

    expect(result).toEqual([{ content: "" }, { content: "" }]);
  });

  it("should return empty string for undefined content", () => {
    const result = extractMessageContent([
      { content: undefined },
      {},
    ]);

    expect(result).toEqual([{ content: "" }, { content: "" }]);
  });

  it("should return empty string for null content", () => {
    const result = extractMessageContent([{ content: null }]);

    expect(result).toEqual([{ content: "" }]);
  });

  it("should handle empty array", () => {
    const result = extractMessageContent([]);

    expect(result).toEqual([]);
  });

  it("should handle mixed content types", () => {
    const result = extractMessageContent([
      { content: "valid string" },
      { content: 123 },
      { content: ["array", "content"] },
      { content: "another string" },
    ]);

    expect(result).toEqual([
      { content: "valid string" },
      { content: "" },
      { content: "" },
      { content: "another string" },
    ]);
  });

  it("should preserve empty string content", () => {
    const result = extractMessageContent([{ content: "" }]);

    expect(result).toEqual([{ content: "" }]);
  });
});
