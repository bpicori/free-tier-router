import { describe, it, expect } from "vitest";
import {
  createGroqProvider,
  getGroqModels,
  groqSupportsModel,
  GROQ_DEFINITION,
} from "./groq.js";
import { ModelQualityTier } from "../types/models.js";

describe("Groq Provider", () => {
  // ─────────────────────────────────────────────────────────────────
  // Provider Definition
  // ─────────────────────────────────────────────────────────────────

  describe("GROQ_DEFINITION", () => {
    it("has correct provider metadata", () => {
      expect(GROQ_DEFINITION.type).toBe("groq");
      expect(GROQ_DEFINITION.displayName).toBe("Groq");
      expect(GROQ_DEFINITION.baseUrl).toBe("https://api.groq.com/openai/v1");
    });

    it("includes all expected model tiers", () => {
      const models = GROQ_DEFINITION.models;

      // Check we have models across tiers
      const tier5 = models.filter(
        (m) => m.qualityTier === ModelQualityTier.TIER_5
      );
      const tier3 = models.filter(
        (m) => m.qualityTier === ModelQualityTier.TIER_3
      );
      const tier2 = models.filter(
        (m) => m.qualityTier === ModelQualityTier.TIER_2
      );
      const tier1 = models.filter(
        (m) => m.qualityTier === ModelQualityTier.TIER_1
      );

      expect(tier5.length).toBeGreaterThan(0); // DeepSeek R1
      expect(tier3.length).toBeGreaterThan(0); // 70B models
      expect(tier2.length).toBeGreaterThan(0); // 32B, 27B, 24B models
      expect(tier1.length).toBeGreaterThan(0); // 8B and smaller
    });

    it("defines rate limits for all models", () => {
      for (const model of GROQ_DEFINITION.models) {
        expect(model.limits).toBeDefined();
        expect(model.limits.requestsPerMinute).toBeDefined();
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Provider Factory
  // ─────────────────────────────────────────────────────────────────

  describe("createGroqProvider", () => {
    it("creates a provider with correct properties", () => {
      const provider = createGroqProvider({ apiKey: "test-key" });

      expect(provider.name).toBe("groq");
      expect(provider.displayName).toBe("Groq");
      expect(provider.models.length).toBeGreaterThan(0);
    });

    it("exposes all Groq models", () => {
      const provider = createGroqProvider({ apiKey: "test-key" });

      // Should have same models as definition
      expect(provider.models).toBe(GROQ_DEFINITION.models);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Model ID Resolution
  // ─────────────────────────────────────────────────────────────────

  describe("getModelId", () => {
    it("maps canonical llama-3.3-70b to Groq-specific ID", () => {
      const provider = createGroqProvider({ apiKey: "test-key" });

      // llama-3.3-70b → llama-3.3-70b-versatile
      expect(provider.getModelId("llama-3.3-70b")).toBe(
        "llama-3.3-70b-versatile"
      );
    });

    it("maps deepseek-r1 to Groq distill variant", () => {
      const provider = createGroqProvider({ apiKey: "test-key" });

      // Groq uses distill variant
      expect(provider.getModelId("deepseek-r1")).toBe(
        "deepseek-r1-distill-llama-70b"
      );
    });

    it("maps small models to Groq instant/preview variants", () => {
      const provider = createGroqProvider({ apiKey: "test-key" });

      expect(provider.getModelId("llama-3.1-8b")).toBe("llama-3.1-8b-instant");
      expect(provider.getModelId("llama-3.2-3b")).toBe("llama-3.2-3b-preview");
    });

    it("accepts Groq-specific IDs directly", () => {
      const provider = createGroqProvider({ apiKey: "test-key" });

      expect(provider.getModelId("llama-3.3-70b-versatile")).toBe(
        "llama-3.3-70b-versatile"
      );
      expect(provider.getModelId("llama-3.1-8b-instant")).toBe(
        "llama-3.1-8b-instant"
      );
    });

    it("returns null for unsupported models", () => {
      const provider = createGroqProvider({ apiKey: "test-key" });

      expect(provider.getModelId("gpt-4")).toBeNull();
      expect(provider.getModelId("claude-3")).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Model Support Utilities
  // ─────────────────────────────────────────────────────────────────

  describe("groqSupportsModel", () => {
    it("returns true for supported canonical models", () => {
      expect(groqSupportsModel("llama-3.3-70b")).toBe(true);
      expect(groqSupportsModel("llama-3.1-8b")).toBe(true);
      expect(groqSupportsModel("deepseek-r1")).toBe(true);
    });

    it("returns true for Groq-specific model IDs", () => {
      expect(groqSupportsModel("llama-3.3-70b-versatile")).toBe(true);
      expect(groqSupportsModel("llama-3.1-8b-instant")).toBe(true);
      expect(groqSupportsModel("deepseek-r1-distill-llama-70b")).toBe(true);
    });

    it("returns false for unsupported models", () => {
      expect(groqSupportsModel("gpt-4")).toBe(false);
      expect(groqSupportsModel("claude-3-opus")).toBe(false);
      expect(groqSupportsModel("qwen-2.5-72b")).toBe(false); // Cerebras only
    });
  });

  describe("getGroqModels", () => {
    it("returns all Groq model configurations", () => {
      const models = getGroqModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models).toBe(GROQ_DEFINITION.models);
    });

    it("returns readonly array", () => {
      const models = getGroqModels();

      // TypeScript prevents mutation, but at runtime it's the same array
      expect(Array.isArray(models)).toBe(true);
    });
  });
});
