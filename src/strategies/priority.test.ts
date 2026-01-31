import { describe, it, expect } from "vitest";
import { createPriorityStrategy } from "./priority.js";
import type { RoutingContext } from "../types/strategy.js";
import type { ProviderModelCandidate } from "../types/provider.js";
import { ModelQualityTier } from "../types/models.js";

/**
 * Helper to create a mock candidate
 */
const createMockCandidate = (
  overrides: Partial<{
    providerName: string;
    modelId: string;
    qualityTier: ModelQualityTier;
    priority: number;
    requestsRemaining: number;
  }> = {}
): ProviderModelCandidate => {
  const {
    providerName = "test-provider",
    modelId = "test-model",
    qualityTier = ModelQualityTier.TIER_3,
    priority = 0,
    requestsRemaining = 100,
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
        requestsPerMinute: 100,
        requestsPerDay: 1000,
      },
    },
    quota: {
      requestsRemaining: {
        minute: requestsRemaining,
        hour: null,
        day: requestsRemaining * 10,
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

describe("PriorityStrategy", () => {
  const strategy = createPriorityStrategy();

  it("should have the correct name", () => {
    expect(strategy.name).toBe("priority");
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

  it("should select the highest priority candidate (lowest priority number)", () => {
    const candidates = [
      createMockCandidate({ providerName: "groq", priority: 2 }),
      createMockCandidate({ providerName: "cerebras", priority: 1 }),
      createMockCandidate({ providerName: "openrouter", priority: 3 }),
    ];

    const result = strategy.selectProvider(candidates, createContext());
    expect(result?.provider.name).toBe("cerebras");
  });

  it("should respect excluded providers", () => {
    const candidates = [
      createMockCandidate({ providerName: "groq", priority: 1 }),
      createMockCandidate({ providerName: "cerebras", priority: 2 }),
    ];

    const result = strategy.selectProvider(
      candidates,
      createContext(["groq"])
    );
    expect(result?.provider.name).toBe("cerebras");
  });

  it("should return null when all candidates are excluded", () => {
    const candidates = [
      createMockCandidate({ providerName: "groq", priority: 1 }),
      createMockCandidate({ providerName: "cerebras", priority: 2 }),
    ];

    const result = strategy.selectProvider(
      candidates,
      createContext(["groq", "cerebras"])
    );
    expect(result).toBeNull();
  });

  it("should prefer higher quality tier even with lower priority", () => {
    // Note: candidates are pre-sorted by quality tier, so TIER_3 comes first
    const candidates = [
      createMockCandidate({
        providerName: "groq",
        qualityTier: ModelQualityTier.TIER_3,
        priority: 3,
      }),
      createMockCandidate({
        providerName: "cerebras",
        qualityTier: ModelQualityTier.TIER_1,
        priority: 1,
      }),
    ];

    const result = strategy.selectProvider(candidates, createContext());
    // Should pick groq because it's TIER_3 (highest), even though priority is 3
    expect(result?.provider.name).toBe("groq");
  });

  it("should use priority as tiebreaker within same quality tier", () => {
    const candidates = [
      createMockCandidate({
        providerName: "groq",
        qualityTier: ModelQualityTier.TIER_3,
        priority: 2,
      }),
      createMockCandidate({
        providerName: "cerebras",
        qualityTier: ModelQualityTier.TIER_3,
        priority: 1,
      }),
      createMockCandidate({
        providerName: "openrouter",
        qualityTier: ModelQualityTier.TIER_3,
        priority: 3,
      }),
    ];

    const result = strategy.selectProvider(candidates, createContext());
    // Within TIER_3, should pick cerebras (priority 1)
    expect(result?.provider.name).toBe("cerebras");
  });
});
