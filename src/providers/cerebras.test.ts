import { describe, it, expect } from "vitest";
import {
  createCerebrasProvider,
  getCerebrasModels,
  cerebrasSupportsModel,
  CEREBRAS_DEFINITION,
} from "./cerebras.js";
import { ModelQualityTier } from "../types/models.js";

describe("Cerebras Provider", () => {
  // ─────────────────────────────────────────────────────────────────
  // Provider Definition
  // ─────────────────────────────────────────────────────────────────

  describe("CEREBRAS_DEFINITION", () => {
    it("has correct provider metadata", () => {
      expect(CEREBRAS_DEFINITION.type).toBe("cerebras");
      expect(CEREBRAS_DEFINITION.displayName).toBe("Cerebras");
      expect(CEREBRAS_DEFINITION.baseUrl).toBe("https://api.cerebras.ai/v1");
    });

    it("includes all expected model tiers", () => {
      const models = CEREBRAS_DEFINITION.models;

      // Check we have models across tiers
      const tier3 = models.filter((m) => m.qualityTier === ModelQualityTier.TIER_3);
      const tier2 = models.filter((m) => m.qualityTier === ModelQualityTier.TIER_2);
      const tier1 = models.filter((m) => m.qualityTier === ModelQualityTier.TIER_1);

      expect(tier3.length).toBeGreaterThan(0); // 70B, 72B models
      expect(tier2.length).toBeGreaterThan(0); // 32B models
      expect(tier1.length).toBeGreaterThan(0); // 8B and smaller
    });

    it("includes unique Qwen 72B model", () => {
      const qwen72b = CEREBRAS_DEFINITION.models.find((m) => m.id === "qwen-2.5-72b");

      expect(qwen72b).toBeDefined();
      expect(qwen72b?.qualityTier).toBe(ModelQualityTier.TIER_3);
    });

    it("defines rate limits for all models", () => {
      for (const model of CEREBRAS_DEFINITION.models) {
        expect(model.limits).toBeDefined();
        expect(model.limits.requestsPerMinute).toBeDefined();
        expect(model.limits.tokensPerMinute).toBeDefined();
      }
    });

    it("has higher token limits reflecting Cerebras fast inference", () => {
      // Cerebras is known for extremely fast inference
      for (const model of CEREBRAS_DEFINITION.models) {
        // 60,000 tokens/minute is typical for Cerebras free tier
        expect(model.limits.tokensPerMinute).toBeGreaterThanOrEqual(60000);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Provider Factory
  // ─────────────────────────────────────────────────────────────────

  describe("createCerebrasProvider", () => {
    it("creates a provider with correct properties", () => {
      const provider = createCerebrasProvider({ apiKey: "test-key" });

      expect(provider.name).toBe("cerebras");
      expect(provider.displayName).toBe("Cerebras");
      expect(provider.models.length).toBeGreaterThan(0);
    });

    it("exposes all Cerebras models", () => {
      const provider = createCerebrasProvider({ apiKey: "test-key" });

      // Should have same models as definition
      expect(provider.models).toBe(CEREBRAS_DEFINITION.models);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Model ID Resolution
  // ─────────────────────────────────────────────────────────────────

  describe("getModelId", () => {
    it("maps canonical llama models to clean Cerebras IDs", () => {
      const provider = createCerebrasProvider({ apiKey: "test-key" });

      // Cerebras uses clean model names (no -versatile, -instant suffixes)
      expect(provider.getModelId("llama-3.3-70b")).toBe("llama-3.3-70b");
      expect(provider.getModelId("llama-3.1-70b")).toBe("llama-3.1-70b");
    });

    it("maps Groq-style aliases to Cerebras IDs", () => {
      const provider = createCerebrasProvider({ apiKey: "test-key" });

      // Groq-style suffixes should map to clean Cerebras IDs
      expect(provider.getModelId("llama-3.3-70b-versatile")).toBe("llama-3.3-70b");
      expect(provider.getModelId("llama-3.1-8b-instant")).toBe("llama-3.1-8b");
    });

    it("supports Qwen models", () => {
      const provider = createCerebrasProvider({ apiKey: "test-key" });

      expect(provider.getModelId("qwen-2.5-72b")).toBe("qwen-2.5-72b");
      expect(provider.getModelId("qwen-2.5-32b")).toBe("qwen-2.5-32b");
    });

    it("returns null for unsupported models", () => {
      const provider = createCerebrasProvider({ apiKey: "test-key" });

      expect(provider.getModelId("gpt-4")).toBeNull();
      expect(provider.getModelId("deepseek-r1")).toBeNull(); // Groq only
      expect(provider.getModelId("gemma-2-9b")).toBeNull(); // Groq only
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Model Support Utilities
  // ─────────────────────────────────────────────────────────────────

  describe("cerebrasSupportsModel", () => {
    it("returns true for supported canonical models", () => {
      expect(cerebrasSupportsModel("llama-3.3-70b")).toBe(true);
      expect(cerebrasSupportsModel("llama-3.1-8b")).toBe(true);
      expect(cerebrasSupportsModel("qwen-2.5-72b")).toBe(true);
    });

    it("returns true for aliased model names", () => {
      expect(cerebrasSupportsModel("llama-3.3-70b-versatile")).toBe(true);
      expect(cerebrasSupportsModel("llama-3.1-8b-instruct")).toBe(true);
      expect(cerebrasSupportsModel("qwen-2.5-72b-instruct")).toBe(true);
    });

    it("returns false for unsupported models", () => {
      expect(cerebrasSupportsModel("gpt-4")).toBe(false);
      expect(cerebrasSupportsModel("claude-3-opus")).toBe(false);
      expect(cerebrasSupportsModel("deepseek-r1")).toBe(false); // Groq only
      expect(cerebrasSupportsModel("gemma-2-9b")).toBe(false); // Groq only
    });
  });

  describe("getCerebrasModels", () => {
    it("returns all Cerebras model configurations", () => {
      const models = getCerebrasModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models).toBe(CEREBRAS_DEFINITION.models);
    });

    it("includes both Llama and Qwen model families", () => {
      const models = getCerebrasModels();

      const llamaModels = models.filter((m) => m.id.includes("llama"));
      const qwenModels = models.filter((m) => m.id.includes("qwen"));

      expect(llamaModels.length).toBeGreaterThan(0);
      expect(qwenModels.length).toBeGreaterThan(0);
    });
  });
});
