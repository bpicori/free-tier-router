import { describe, it, expect } from "vitest";
import { createProvider, type ProviderDefinition } from "./base.js";
import { ModelQualityTier } from "../types/models.js";

/**
 * Test provider definition
 */
const testDefinition: ProviderDefinition = {
  type: "groq",
  displayName: "Test Provider",
  baseUrl: "https://api.test.com/v1",
  models: [
    {
      id: "llama-3.3-70b-versatile",
      qualityTier: ModelQualityTier.TIER_3,
      limits: { requestsPerMinute: 30 },
      aliases: ["llama-70b"],
    },
    {
      id: "llama-3.1-8b-instant",
      qualityTier: ModelQualityTier.TIER_1,
      limits: { requestsPerMinute: 60 },
    },
  ],
  modelMapping: {
    "llama-3.3-70b": "llama-3.3-70b-versatile",
    "llama-3.1-8b": "llama-3.1-8b-instant",
  },
};

describe("createProvider", () => {
  // ─────────────────────────────────────────────────────────────────
  // Provider Properties
  // ─────────────────────────────────────────────────────────────────

  describe("properties", () => {
    it("exposes provider name and display name", () => {
      const provider = createProvider(testDefinition, { apiKey: "test-key" });

      expect(provider.name).toBe("groq");
      expect(provider.displayName).toBe("Test Provider");
    });

    it("exposes available models", () => {
      const provider = createProvider(testDefinition, { apiKey: "test-key" });

      expect(provider.models).toHaveLength(2);
      expect(provider.models[0]?.id).toBe("llama-3.3-70b-versatile");
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Model ID Resolution
  // ─────────────────────────────────────────────────────────────────

  describe("getModelId", () => {
    it("maps canonical ID to provider-specific ID", () => {
      const provider = createProvider(testDefinition, { apiKey: "test-key" });

      // Canonical → Provider-specific
      expect(provider.getModelId("llama-3.3-70b")).toBe(
        "llama-3.3-70b-versatile"
      );
      expect(provider.getModelId("llama-3.1-8b")).toBe("llama-3.1-8b-instant");
    });

    it("accepts provider-specific ID directly", () => {
      const provider = createProvider(testDefinition, { apiKey: "test-key" });

      // Already provider-specific
      expect(provider.getModelId("llama-3.3-70b-versatile")).toBe(
        "llama-3.3-70b-versatile"
      );
    });

    it("resolves aliases to provider ID", () => {
      const provider = createProvider(testDefinition, { apiKey: "test-key" });

      // Alias defined in model config
      expect(provider.getModelId("llama-70b")).toBe("llama-3.3-70b-versatile");
    });

    it("returns null for unsupported models", () => {
      const provider = createProvider(testDefinition, { apiKey: "test-key" });

      expect(provider.getModelId("gpt-4")).toBeNull();
      expect(provider.getModelId("unknown-model")).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Model Support Check
  // ─────────────────────────────────────────────────────────────────

  describe("supportsModel", () => {
    it("returns true for supported models", () => {
      const provider = createProvider(testDefinition, { apiKey: "test-key" });

      expect(provider.supportsModel("llama-3.3-70b")).toBe(true);
      expect(provider.supportsModel("llama-3.3-70b-versatile")).toBe(true);
      expect(provider.supportsModel("llama-70b")).toBe(true); // alias
    });

    it("returns false for unsupported models", () => {
      const provider = createProvider(testDefinition, { apiKey: "test-key" });

      expect(provider.supportsModel("gpt-4")).toBe(false);
      expect(provider.supportsModel("claude-3")).toBe(false);
    });
  });
});
