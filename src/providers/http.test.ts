import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postCompletion, postCompletionStream } from "./http.js";
import { RateLimitError, ProviderError } from "../types/errors.js";
import type { ChatCompletionRequest, ChatCompletionResponse } from "../types/openai.js";

const testConfig = {
  baseUrl: "https://api.test.com/v1",
  apiKey: "test-api-key",
};

const testRequest: ChatCompletionRequest = {
  model: "llama-3.3-70b",
  messages: [{ role: "user", content: "Hello" }],
};

const mockResponse: ChatCompletionResponse = {
  id: "chatcmpl-123",
  object: "chat.completion",
  created: 1234567890,
  model: "llama-3.3-70b",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Hi there!" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

describe("http", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ─────────────────────────────────────────────────────────────────
  // Non-Streaming Requests
  // ─────────────────────────────────────────────────────────────────

  describe("postCompletion", () => {
    it("sends request with correct headers", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      await postCompletion(testConfig, testRequest);

      expect(fetch).toHaveBeenCalledWith(
        "https://api.test.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer test-api-key",
          }),
        })
      );
    });

    it("returns parsed response on success", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      const result = await postCompletion(testConfig, testRequest);

      expect(result.id).toBe("chatcmpl-123");
      expect(result.choices[0]?.message.content).toBe("Hi there!");
    });

    it("throws RateLimitError on 429", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("Rate limited", {
          status: 429,
          headers: { "Retry-After": "60" },
        })
      );

      await expect(postCompletion(testConfig, testRequest)).rejects.toThrow(
        RateLimitError
      );
    });

    it("parses Retry-After header into resetAt", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("Rate limited", {
          status: 429,
          headers: { "Retry-After": "30" },
        })
      );

      try {
        await postCompletion(testConfig, testRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const rateLimitError = error as RateLimitError;
        expect(rateLimitError.retryAfterSeconds).toBe(30);
        expect(rateLimitError.resetAt).toBeInstanceOf(Date);
      }
    });

    it("throws ProviderError on other HTTP errors", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 })
      );

      await expect(postCompletion(testConfig, testRequest)).rejects.toThrow(
        ProviderError
      );
    });

    it("includes status code in ProviderError", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("Bad Request", { status: 400 })
      );

      try {
        await postCompletion(testConfig, testRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).statusCode).toBe(400);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Streaming Requests
  // ─────────────────────────────────────────────────────────────────

  describe("postCompletionStream", () => {
    it("returns Response for SSE processing", async () => {
      const mockStreamResponse = new Response("data: test\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });

      vi.mocked(fetch).mockResolvedValueOnce(mockStreamResponse);

      const response = await postCompletionStream(testConfig, testRequest);

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    });

    it("sets stream: true in request body", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("", { status: 200 })
      );

      await postCompletionStream(testConfig, testRequest);

      const callArgs = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(callArgs?.[1]?.body as string);
      expect(body.stream).toBe(true);
    });

    it("throws RateLimitError on 429", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response("Rate limited", { status: 429 })
      );

      await expect(postCompletionStream(testConfig, testRequest)).rejects.toThrow(
        RateLimitError
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Custom Headers
  // ─────────────────────────────────────────────────────────────────

  describe("custom headers", () => {
    it("includes additional headers in request", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );

      await postCompletion(
        { ...testConfig, headers: { "X-Custom": "value" } },
        testRequest
      );

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Custom": "value",
          }),
        })
      );
    });
  });
});
