import { ModelQualityTier } from "../types/models.js";
import type { ProviderType } from "../types/provider.js";

/**
 * Model definition with metadata
 */
export interface ModelDefinition {
  /** Canonical model identifier */
  id: string;
  /** Quality tier */
  qualityTier: ModelQualityTier;
  /** Alternative names/aliases for this model */
  aliases: string[];
  /** Providers that offer this model */
  providers: ProviderType[];
  /** Model family (e.g., "llama", "gemma", "qwen") */
  family: string;
  /** Tags for categorization */
  tags: string[];
}

/**
 * Known models with their metadata
 * This registry contains canonical model definitions
 */
export const MODEL_DEFINITIONS: ModelDefinition[] = [
  // Tier 5 - Frontier/Reasoning Models
  {
    id: "deepseek-r1",
    qualityTier: ModelQualityTier.TIER_5,
    aliases: [
      "deepseek-r1-0528",
      "deepseek-ai/deepseek-r1",
      "deepseek-r1-distill-llama-70b",
    ],
    providers: ["groq"],
    family: "deepseek",
    tags: ["reasoning", "frontier"],
  },

  // Tier 4 - XL Models (100B+)
  {
    id: "llama-3.1-405b",
    qualityTier: ModelQualityTier.TIER_4,
    aliases: [
      "llama-3.1-405b-instruct",
      "meta-llama/llama-3.1-405b",
      "meta-llama/llama-3.1-405b-instruct",
    ],
    providers: [],
    family: "llama",
    tags: ["instruct", "xl"],
  },

  // Tier 3 - Large Models (36-100B)
  {
    id: "llama-3.3-70b",
    qualityTier: ModelQualityTier.TIER_3,
    aliases: [
      "llama-3.3-70b-versatile",
      "llama-3.3-70b-instruct",
      "llama-3.3-70b-specdec",
      "meta-llama/llama-3.3-70b",
      "meta-llama/llama-3.3-70b-instruct",
    ],
    providers: ["groq", "cerebras"],
    family: "llama",
    tags: ["instruct", "versatile"],
  },
  {
    id: "llama-3.1-70b",
    qualityTier: ModelQualityTier.TIER_3,
    aliases: [
      "llama-3.1-70b-versatile",
      "llama-3.1-70b-instruct",
      "meta-llama/llama-3.1-70b",
      "meta-llama/llama-3.1-70b-instruct",
    ],
    providers: ["groq", "cerebras"],
    family: "llama",
    tags: ["instruct"],
  },
  {
    id: "qwen-2.5-72b",
    qualityTier: ModelQualityTier.TIER_3,
    aliases: [
      "qwen-2.5-72b-instruct",
      "qwen/qwen-2.5-72b",
      "qwen/qwen-2.5-72b-instruct",
    ],
    providers: ["cerebras"],
    family: "qwen",
    tags: ["instruct"],
  },

  // Tier 2 - Medium Models (9-35B)
  {
    id: "qwen-2.5-32b",
    qualityTier: ModelQualityTier.TIER_2,
    aliases: [
      "qwen-2.5-32b-instruct",
      "qwen/qwen-2.5-32b",
      "qwen/qwen-2.5-32b-instruct",
      "qwen-qwq-32b",
    ],
    providers: ["groq", "cerebras"],
    family: "qwen",
    tags: ["instruct"],
  },
  {
    id: "gemma-2-27b",
    qualityTier: ModelQualityTier.TIER_2,
    aliases: [
      "gemma-2-27b-it",
      "google/gemma-2-27b",
      "google/gemma-2-27b-it",
    ],
    providers: ["groq"],
    family: "gemma",
    tags: ["instruct"],
  },
  {
    id: "mistral-small-24b",
    qualityTier: ModelQualityTier.TIER_2,
    aliases: [
      "mistral-small-24b-instruct",
      "mistralai/mistral-small-24b",
      "mistral-saba-24b",
    ],
    providers: ["groq"],
    family: "mistral",
    tags: ["instruct"],
  },

  // Tier 1 - Small Models (1-8B)
  {
    id: "llama-3.2-3b",
    qualityTier: ModelQualityTier.TIER_1,
    aliases: [
      "llama-3.2-3b-preview",
      "llama-3.2-3b-instruct",
      "meta-llama/llama-3.2-3b",
      "meta-llama/llama-3.2-3b-instruct",
    ],
    providers: ["groq", "cerebras"],
    family: "llama",
    tags: ["instruct", "small", "fast"],
  },
  {
    id: "llama-3.2-1b",
    qualityTier: ModelQualityTier.TIER_1,
    aliases: [
      "llama-3.2-1b-preview",
      "llama-3.2-1b-instruct",
      "meta-llama/llama-3.2-1b",
      "meta-llama/llama-3.2-1b-instruct",
    ],
    providers: ["groq", "cerebras"],
    family: "llama",
    tags: ["instruct", "tiny", "fast"],
  },
  {
    id: "llama-3.1-8b",
    qualityTier: ModelQualityTier.TIER_1,
    aliases: [
      "llama-3.1-8b-instant",
      "llama-3.1-8b-instruct",
      "meta-llama/llama-3.1-8b",
      "meta-llama/llama-3.1-8b-instruct",
    ],
    providers: ["groq", "cerebras"],
    family: "llama",
    tags: ["instruct", "fast"],
  },
  {
    id: "gemma-2-9b",
    qualityTier: ModelQualityTier.TIER_1,
    aliases: [
      "gemma-2-9b-it",
      "google/gemma-2-9b",
      "google/gemma-2-9b-it",
    ],
    providers: ["groq"],
    family: "gemma",
    tags: ["instruct"],
  },
];

/**
 * Generic model aliases that map to quality tiers or tags
 */
export const GENERIC_MODEL_ALIASES: Record<string, { tier?: ModelQualityTier; tag?: string; minTier?: ModelQualityTier }> = {
  // Best available
  "best": { minTier: ModelQualityTier.TIER_1 },
  
  // Size-based aliases
  "best-xl": { tier: ModelQualityTier.TIER_4 },
  "best-large": { tier: ModelQualityTier.TIER_3 },
  "best-medium": { tier: ModelQualityTier.TIER_2 },
  "best-small": { tier: ModelQualityTier.TIER_1 },
  
  // Capability-based aliases
  "best-reasoning": { tag: "reasoning" },
  "best-fast": { tag: "fast" },
  "best-code": { tag: "code" },
  
  // Size shortcuts
  "70b": { tier: ModelQualityTier.TIER_3 },
  "32b": { tier: ModelQualityTier.TIER_2 },
  "8b": { tier: ModelQualityTier.TIER_1 },
};

/**
 * Build a lookup map from alias to canonical model ID
 */
export function buildAliasMap(): Map<string, string> {
  const aliasMap = new Map<string, string>();
  
  for (const model of MODEL_DEFINITIONS) {
    // Add canonical ID
    aliasMap.set(model.id.toLowerCase(), model.id);
    
    // Add all aliases
    for (const alias of model.aliases) {
      aliasMap.set(alias.toLowerCase(), model.id);
    }
  }
  
  return aliasMap;
}

/**
 * Normalize a model name to its canonical form
 */
export function normalizeModelName(modelName: string): string {
  const aliasMap = buildAliasMap();
  const normalized = aliasMap.get(modelName.toLowerCase());
  return normalized ?? modelName;
}

/**
 * Check if a model name is a generic alias
 */
export function isGenericAlias(modelName: string): boolean {
  return modelName.toLowerCase() in GENERIC_MODEL_ALIASES;
}

/**
 * Get generic alias configuration
 */
export function getGenericAliasConfig(modelName: string): { tier?: ModelQualityTier; tag?: string; minTier?: ModelQualityTier } | null {
  return GENERIC_MODEL_ALIASES[modelName.toLowerCase()] ?? null;
}

/**
 * Get all models in a specific family
 */
export function getModelsByFamily(family: string): ModelDefinition[] {
  return MODEL_DEFINITIONS.filter(
    (m) => m.family.toLowerCase() === family.toLowerCase()
  );
}

/**
 * Get all models with a specific tag
 */
export function getModelsByTag(tag: string): ModelDefinition[] {
  return MODEL_DEFINITIONS.filter((m) =>
    m.tags.some((t) => t.toLowerCase() === tag.toLowerCase())
  );
}

/**
 * Get all models in a specific tier
 */
export function getModelsByTier(tier: ModelQualityTier): ModelDefinition[] {
  return MODEL_DEFINITIONS.filter((m) => m.qualityTier === tier);
}

/**
 * Get all models available from a specific provider
 */
export function getModelsByProvider(provider: ProviderType): ModelDefinition[] {
  return MODEL_DEFINITIONS.filter((m) => m.providers.includes(provider));
}

/**
 * Get model definition by canonical ID or alias
 */
export function getModelDefinition(modelName: string): ModelDefinition | null {
  const canonicalId = normalizeModelName(modelName);
  return MODEL_DEFINITIONS.find((m) => m.id === canonicalId) ?? null;
}
