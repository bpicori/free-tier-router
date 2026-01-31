import { describe, it, expect } from "vitest";
import { createLeastUsedStrategy } from "./least-used.js";
import type { RoutingContext } from "../types/strategy.js";
import type { ProviderModelCandidate } from "../types/provider.js";
import { ModelQualityTier } from "../types/models.js";

/**
 * Helper to create a mock candidate with configurable quota
 */
const createMockCandidate = (
  overrides: Partial<{
    providerName: string;
    modelId: string;
    qualityTier: ModelQualityTier;
    priority: number;
    requestsPerMinute: number;
    requestsRemainingMinute: number;
    requestsPerDay: number;
    requestsRemainingDay: number;
  }> = {}
): ProviderModelCandidate => {
  const {
    providerName = "test-provider",
    modelId = "test-model",
    qualityTier = ModelQualityTier.TIER_3,
    priority = 0,
    requestsPerMinute = 100,
    requestsRemainingMinute = 100,
    requestsPerDay = 1000,
    requestsRemainingDay = 1000,
  } = overrides;

  return {
    provider: {
      name: providerName as "groq",
      displayName: providerName,
      models: [],
      createCompletion: async () => ({} as never),
      createCompletionStream: async function* () {},
      supportsModel: () => true,
      getModelId: () => modelId,
    },
    model: {
      id: modelId,
      qualityTier,
      limits: {
        requestsPerMinute,
        requestsPerDay,
      },
    },
    quota: {
      requestsRemaining: {
        minute: requestsRemainingMinute,
        hour: null,
        day: requestsRemainingDay,
      },
      tokensRemaining: {
        minute: null,
        hour: null,
        day: null,
      },
      resetTimes: {
        minute: new Date(Date.now() + 60000),
        hour: null,
        day: new Date(Date.now() + 86400000),
      },
    },
    priority,
    isFreeCredits: false,
  };
};

const createContext = (
  excludedProviders: string[] = []
): RoutingContext => ({
  request: {
    model: "test-model",
    messages: [{ role: "user", content: "Hello" }],
  },
  excludedProviders: new Set(excludedProviders),
  retryCount: 0,
});

describe("LeastUsedStrategy", () => {
  const strategy = createLeastUsedStrategy();

  it("should have the correct name", () => {
    expect(strategy.name).toBe("least-used");
  });

  it("should return null when no candidates", () => {
    const result = strategy.selectProvider([], createContext());
    expect(result).toBeNull();
  });

  it("should return the only candidate when there is one", () => {
    const candidate = createMockCandidate({ providerName: "groq" });
    const result = strategy.selectProvider([candidate], createContext());
    expect(result).toBe(candidate);
  });

  it("should select the candidate with highest remaining quota", () => {
    const candidates = [
      createMockCandidate({
        providerName: "groq",
        requestsPerMinute: 100,
        requestsRemainingMinute: 40, // 40% remaining
      }),
      createMockCandidate({
        providerName: "cerebras",
        requestsPerMinute: 100,
        requestsRemainingMinute: 80, // 80% remaining
      }),
      createMockCandidate({
        providerName: "openrouter",
        requestsPerMinute: 100,
        requestsRemainingMinute: 20, // 20% remaining
      }),
    ];

    const result = strategy.selectProvider(candidates, createContext());
    expect(result?.provider.name).toBe("cerebras");
  });

  it("should use priority as tiebreaker when quotas are equal", () => {
    const candidates = [
      createMockCandidate({
        providerName: "groq",
        priority: 2,
        requestsRemainingMinute: 50,
      }),
      createMockCandidate({
        providerName: "cerebras",
        priority: 1, // Higher priority (lower number)
        requestsRemainingMinute: 50,
      }),
    ];

    const result = strategy.selectProvider(candidates, createContext());
    expect(result?.provider.name).toBe("cerebras");
  });

  it("should respect excluded providers", () => {
    const candidates = [
      createMockCandidate({
        providerName: "groq",
        requestsRemainingMinute: 90,
      }),
      createMockCandidate({
        providerName: "cerebras",
        requestsRemainingMinute: 50,
      }),
    ];

    const result = strategy.selectProvider(
      candidates,
      createContext(["groq"])
    );
    expect(result?.provider.name).toBe("cerebras");
  });

  it("should return null when all candidates are excluded", () => {
    const candidates = [
      createMockCandidate({ providerName: "groq" }),
      createMockCandidate({ providerName: "cerebras" }),
    ];

    const result = strategy.selectProvider(
      candidates,
      createContext(["groq", "cerebras"])
    );
    expect(result).toBeNull();
  });

  it("should consider all rate limit windows when calculating availability", () => {
    // Groq: 80% minute remaining, 20% day remaining → min is 20%
    // Cerebras: 50% minute remaining, 60% day remaining → min is 50%
    const candidates = [
      createMockCandidate({
        providerName: "groq",
        requestsPerMinute: 100,
        requestsRemainingMinute: 80,
        requestsPerDay: 1000,
        requestsRemainingDay: 200, // 20%
      }),
      createMockCandidate({
        providerName: "cerebras",
        requestsPerMinute: 100,
        requestsRemainingMinute: 50,
        requestsPerDay: 1000,
        requestsRemainingDay: 600, // 60%
      }),
    ];

    const result = strategy.selectProvider(candidates, createContext());
    // Cerebras has higher minimum availability (50% vs 20%)
    expect(result?.provider.name).toBe("cerebras");
  });

  it("should stay within same quality tier", () => {
    // TIER_3 with 30% remaining vs TIER_1 with 90% remaining
    // Should pick TIER_3 because quality tier is pre-sorted and prioritized
    const candidates = [
      createMockCandidate({
        providerName: "groq",
        qualityTier: ModelQualityTier.TIER_3,
        requestsRemainingMinute: 30,
      }),
      createMockCandidate({
        providerName: "cerebras",
        qualityTier: ModelQualityTier.TIER_1,
        requestsRemainingMinute: 90,
      }),
    ];

    const result = strategy.selectProvider(candidates, createContext());
    // Should pick groq (TIER_3) because candidates are pre-sorted by tier
    // and we only compare within the same tier
    expect(result?.provider.name).toBe("groq");
  });

  it("should handle providers with no configured limits", () => {
    const candidate: ProviderModelCandidate = {
      provider: {
        name: "groq",
        displayName: "Groq",
        models: [],
        createCompletion: async () => ({} as never),
        createCompletionStream: async function* () {},
        supportsModel: () => true,
        getModelId: () => "test-model",
      },
      model: {
        id: "test-model",
        qualityTier: ModelQualityTier.TIER_3,
        limits: {}, // No limits configured
      },
      quota: {
        requestsRemaining: { minute: null, hour: null, day: null },
        tokensRemaining: { minute: null, hour: null, day: null },
        resetTimes: { minute: null, hour: null, day: null },
      },
      priority: 0,
      isFreeCredits: false,
    };

    const result = strategy.selectProvider([candidate], createContext());
    // Should still work and return the candidate (score = 1 when no limits)
    expect(result).toBe(candidate);
  });

  it("should prefer candidate with higher quota within same tier", () => {
    const candidates = [
      createMockCandidate({
        providerName: "groq",
        qualityTier: ModelQualityTier.TIER_3,
        requestsRemainingMinute: 20,
      }),
      createMockCandidate({
        providerName: "cerebras",
        qualityTier: ModelQualityTier.TIER_3,
        requestsRemainingMinute: 80,
      }),
      createMockCandidate({
        providerName: "openrouter",
        qualityTier: ModelQualityTier.TIER_3,
        requestsRemainingMinute: 50,
      }),
    ];

    const result = strategy.selectProvider(candidates, createContext());
    expect(result?.provider.name).toBe("cerebras");
  });
});
