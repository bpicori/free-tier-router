import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";

// Create a shared mock for OpenAI create function
const mockCreate = vi.fn();

// Mock OpenAI at module level
vi.mock("openai", () => {
  // Mock APIError class for testing rate limits (must be inside factory)
  class MockAPIError extends Error {
    status: number;
    headers?: Record<string, string>;

    constructor(
      status: number,
      _body: unknown,
      message: string,
      headers?: Record<string, string>
    ) {
      super(message);
      this.name = "APIError";
      this.status = status;
      this.headers = headers;
    }
  }

  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    };

    constructor() {
      // Constructor doesn't need to do anything special
    }

    static APIError = MockAPIError;
  }

  return {
    default: MockOpenAI,
  };
});

// Import after mocking
import { createRouter, type Router } from "./router.js";

// Helper to create 429 errors for testing
const createRateLimitError = (retryAfter: string = "60") => {
  const error = new Error("Rate limited") as Error & {
    status: number;
    headers: Record<string, string>;
  };
  error.status = 429;
  error.headers = { "retry-after": retryAfter };
  return error;
};

/**
 * Create a mock completion response
 */
const createMockResponse = (
  model: string,
  content: string = "Hello!"
): ChatCompletion => ({
  id: "test-completion-id",
  object: "chat.completion",
  created: Date.now(),
  model,
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content,
      },
      finish_reason: "stop",
      logprobs: null,
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  },
});

/**
 * Create a mock stream for testing
 */
const createMockStream = (): Stream<ChatCompletionChunk> => {
  const chunks: ChatCompletionChunk[] = [
    {
      id: "test-stream-id",
      object: "chat.completion.chunk",
      created: Date.now(),
      model: "test-model",
      choices: [
        {
          index: 0,
          delta: { role: "assistant", content: "Hello" },
          finish_reason: null,
          logprobs: null,
        },
      ],
    },
    {
      id: "test-stream-id",
      object: "chat.completion.chunk",
      created: Date.now(),
      model: "test-model",
      choices: [
        {
          index: 0,
          delta: { content: " world!" },
          finish_reason: "stop",
          logprobs: null,
        },
      ],
    },
  ];

  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
    controller: new AbortController(),
  } as unknown as Stream<ChatCompletionChunk>;
};

describe("createRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
  });

  afterEach(async () => {
    // Clean up any routers
  });

  describe("configuration", () => {
    it("should throw if no providers are configured", () => {
      expect(() =>
        createRouter({
          providers: [],
        })
      ).toThrow("At least one provider must be configured");
    });

    it("should create router with single provider", () => {
      const router = createRouter({
        providers: [{ type: "groq", apiKey: "test-key" }],
      });

      expect(router).toBeDefined();
      expect(router.chat).toBeDefined();
      expect(router.chat.completions).toBeDefined();
    });

    it("should create router with multiple providers", () => {
      const router = createRouter({
        providers: [
          { type: "groq", apiKey: "groq-key" },
          { type: "cerebras", apiKey: "cerebras-key" },
        ],
      });

      expect(router).toBeDefined();
    });

    it("should skip disabled providers", () => {
      const router = createRouter({
        providers: [
          { type: "groq", apiKey: "groq-key", enabled: false },
          { type: "cerebras", apiKey: "cerebras-key" },
        ],
      });

      const models = router.listModels();
      // Should only have Cerebras models (no Groq-only models like deepseek-r1)
      const hasGroqOnlyModel = models.some(
        (m) => m.id === "deepseek-r1-distill-llama-70b"
      );
      expect(hasGroqOnlyModel).toBe(false);
    });
  });

  describe("listModels", () => {
    it("should list models from all providers", () => {
      const router = createRouter({
        providers: [
          { type: "groq", apiKey: "groq-key" },
          { type: "cerebras", apiKey: "cerebras-key" },
        ],
      });

      const models = router.listModels();
      expect(models.length).toBeGreaterThan(0);
    });

    it("should deduplicate models available from multiple providers", () => {
      const router = createRouter({
        providers: [
          { type: "groq", apiKey: "groq-key" },
          { type: "cerebras", apiKey: "cerebras-key" },
        ],
      });

      const models = router.listModels();
      const modelIds = models.map((m) => m.id);

      // No duplicate model IDs
      const uniqueIds = new Set(modelIds);
      expect(uniqueIds.size).toBe(modelIds.length);
    });
  });

  describe("isModelAvailable", () => {
    let router: Router;

    beforeEach(() => {
      router = createRouter({
        providers: [
          { type: "groq", apiKey: "groq-key" },
          { type: "cerebras", apiKey: "cerebras-key" },
        ],
      });
    });

    it("should return true for available model", () => {
      expect(router.isModelAvailable("llama-3.3-70b")).toBe(true);
    });

    it("should return true for model alias", () => {
      expect(router.isModelAvailable("llama-3.3-70b-versatile")).toBe(true);
    });

    it("should return false for unavailable model", () => {
      expect(router.isModelAvailable("gpt-4")).toBe(false);
    });

    it("should return true for generic alias", () => {
      expect(router.isModelAvailable("best")).toBe(true);
      expect(router.isModelAvailable("best-large")).toBe(true);
    });
  });

  describe("chat.completions.create (non-streaming)", () => {
    let router: Router;

    beforeEach(() => {
      router = createRouter({
        providers: [
          { type: "groq", apiKey: "groq-key", priority: 0 },
          { type: "cerebras", apiKey: "cerebras-key", priority: 1 },
        ],
        strategy: "priority",
      });
    });

    afterEach(async () => {
      await router.close();
    });

    it("should make completion request to provider", async () => {
      mockCreate.mockResolvedValueOnce(
        createMockResponse("llama-3.3-70b-versatile", "Hello!")
      );

      const response = await router.chat.completions.create({
        model: "llama-3.3-70b",
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response).toBeDefined();
      expect(response.choices[0].message.content).toBe("Hello!");
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("should respect custom model aliases", async () => {
      const routerWithAlias = createRouter({
        providers: [{ type: "groq", apiKey: "groq-key" }],
        modelAliases: {
          fast: "llama-3.1-8b",
        },
      });

      mockCreate.mockResolvedValueOnce(
        createMockResponse("llama-3.1-8b-instant")
      );

      await routerWithAlias.chat.completions.create({
        model: "fast",
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "llama-3.1-8b-instant",
        })
      );

      await routerWithAlias.close();
    });
  });

  describe("chat.completions.create (streaming)", () => {
    let router: Router;

    beforeEach(() => {
      router = createRouter({
        providers: [{ type: "groq", apiKey: "groq-key" }],
      });
    });

    afterEach(async () => {
      await router.close();
    });

    it("should return stream for streaming requests", async () => {
      mockCreate.mockResolvedValueOnce(createMockStream());

      const stream = await router.chat.completions.create({
        model: "llama-3.3-70b",
        messages: [{ role: "user", content: "Hi" }],
        stream: true,
      });

      expect(stream).toBeDefined();
      expect(Symbol.asyncIterator in Object(stream)).toBe(true);
    });
  });

  describe("createCompletion with metadata", () => {
    let router: Router;

    beforeEach(() => {
      router = createRouter({
        providers: [
          { type: "groq", apiKey: "groq-key", priority: 0 },
          { type: "cerebras", apiKey: "cerebras-key", priority: 1 },
        ],
      });
    });

    afterEach(async () => {
      await router.close();
    });

    it("should return metadata with response", async () => {
      mockCreate.mockResolvedValueOnce(
        createMockResponse("llama-3.3-70b-versatile")
      );

      const { response, metadata } = await router.createCompletion({
        model: "llama-3.3-70b",
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(response).toBeDefined();
      expect(metadata.provider).toBe("groq");
      expect(metadata.model).toBe("llama-3.3-70b-versatile");
      expect(metadata.latencyMs).toBeGreaterThanOrEqual(0);
      expect(metadata.retryCount).toBe(0);
    });
  });

  describe("provider failover", () => {
    let router: Router;

    beforeEach(() => {
      router = createRouter({
        providers: [
          { type: "groq", apiKey: "groq-key", priority: 0 },
          { type: "cerebras", apiKey: "cerebras-key", priority: 1 },
        ],
        strategy: "priority",
        retry: {
          maxRetries: 2,
          initialBackoffMs: 10,
          maxBackoffMs: 100,
          backoffMultiplier: 2,
        },
      });
    });

    afterEach(async () => {
      await router.close();
    });

    it("should failover to next provider on rate limit", async () => {
      // First call fails with rate limit
      mockCreate.mockRejectedValueOnce(createRateLimitError("60"));

      // Second call succeeds
      mockCreate.mockResolvedValueOnce(createMockResponse("llama-3.3-70b"));

      const { metadata } = await router.createCompletion({
        model: "llama-3.3-70b",
        messages: [{ role: "user", content: "Hi" }],
      });

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(metadata.provider).toBe("cerebras");
      expect(metadata.retryCount).toBe(1);
    });

    it("should throw AllProvidersExhaustedError when all providers fail", async () => {
      // All calls fail
      mockCreate.mockRejectedValue(createRateLimitError("60"));

      await expect(
        router.createCompletion({
          model: "llama-3.3-70b",
          messages: [{ role: "user", content: "Hi" }],
        })
      ).rejects.toThrow("All providers exhausted");
    });
  });

  describe("routing strategies", () => {
    describe("priority strategy", () => {
      it("should route to highest priority provider first", async () => {
        const router = createRouter({
          providers: [
            { type: "cerebras", apiKey: "cerebras-key", priority: 1 },
            { type: "groq", apiKey: "groq-key", priority: 0 },
          ],
          strategy: "priority",
        });

        mockCreate.mockResolvedValueOnce(
          createMockResponse("llama-3.3-70b-versatile")
        );

        const { metadata } = await router.createCompletion({
          model: "llama-3.3-70b",
          messages: [{ role: "user", content: "Hi" }],
        });

        // Groq has lower priority number = higher priority
        expect(metadata.provider).toBe("groq");

        await router.close();
      });
    });

    describe("least-used strategy", () => {
      it("should route to a valid provider", async () => {
        const router = createRouter({
          providers: [
            { type: "groq", apiKey: "groq-key" },
            { type: "cerebras", apiKey: "cerebras-key" },
          ],
          strategy: "least-used",
        });

        mockCreate.mockResolvedValueOnce(
          createMockResponse("llama-3.3-70b-versatile")
        );

        const { metadata } = await router.createCompletion({
          model: "llama-3.3-70b",
          messages: [{ role: "user", content: "Hi" }],
        });

        // Either provider is valid with empty state
        expect(["groq", "cerebras"]).toContain(metadata.provider);

        await router.close();
      });
    });
  });

  describe("getQuotaStatus", () => {
    it("should return quota status for all providers", async () => {
      const router = createRouter({
        providers: [
          { type: "groq", apiKey: "groq-key" },
          { type: "cerebras", apiKey: "cerebras-key" },
        ],
      });

      const status = await router.getQuotaStatus();

      expect(status.length).toBeGreaterThan(0);

      // Each entry should have provider, model, and quota
      for (const entry of status) {
        expect(entry.provider).toBeDefined();
        expect(entry.model).toBeDefined();
        expect(entry.quota).toBeDefined();
        expect(entry.quota.requestsRemaining).toBeDefined();
      }

      await router.close();
    });
  });

  describe("close", () => {
    it("should close without error", async () => {
      const router = createRouter({
        providers: [{ type: "groq", apiKey: "groq-key" }],
      });

      await expect(router.close()).resolves.not.toThrow();
    });
  });
});
