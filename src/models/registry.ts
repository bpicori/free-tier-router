import { ModelQualityTier } from "../types/models.js";
import type { ModelConfig, RateLimits } from "../types/models.js";
import type { ProviderType } from "../types/provider.js";
import {
  MODEL_DEFINITIONS,
  type ModelDefinition,
  normalizeModelName,
  isGenericAlias,
  getGenericAliasConfig,
  buildAliasMap,
} from "./aliases.js";
import { getTiersAbove, compareTiers } from "./tiers.js";

/**
 * Entry in the model registry with provider-specific information
 */
export interface ModelRegistryEntry {
  /** Canonical model ID */
  canonicalId: string;
  /** Provider-specific model ID */
  providerModelId: string;
  /** Provider that offers this model */
  provider: ProviderType;
  /** Quality tier */
  qualityTier: ModelQualityTier;
  /** Rate limits (provider-specific) */
  limits: RateLimits;
  /** Tags for categorization */
  tags: string[];
}

/**
 * Query options for finding models
 */
export interface ModelQuery {
  /** Specific model name or generic alias */
  modelName?: string;
  /** Minimum quality tier */
  minTier?: ModelQualityTier;
  /** Exact quality tier */
  tier?: ModelQualityTier;
  /** Filter by provider */
  provider?: ProviderType;
  /** Filter by tag */
  tag?: string;
  /** Filter by model family */
  family?: string;
}

/**
 * Model Registry - manages model definitions, aliases, and provider mappings
 *
 * This registry maintains:
 * - Quality tier mappings for all known models across providers
 * - Alias mappings to normalize model names
 * - Provider-specific model ID mappings
 * - Generic model mappings (e.g., "best-large" → list of Tier 3+ models)
 */
export class ModelRegistry {
  private entries: Map<string, ModelRegistryEntry[]> = new Map();
  private aliasMap: Map<string, string>;
  private providerModels: Map<ProviderType, ModelRegistryEntry[]> = new Map();

  constructor() {
    this.aliasMap = buildAliasMap();
    this.initializeFromDefinitions();
  }

  /**
   * Initialize registry from model definitions
   */
  private initializeFromDefinitions(): void {
    for (const definition of MODEL_DEFINITIONS) {
      for (const provider of definition.providers) {
        // Get the provider-specific model ID (first alias or canonical ID)
        const providerModelId = this.getProviderModelId(definition, provider);

        const entry: ModelRegistryEntry = {
          canonicalId: definition.id,
          providerModelId,
          provider,
          qualityTier: definition.qualityTier,
          limits: this.getDefaultLimits(provider, definition.id),
          tags: definition.tags,
        };

        // Index by canonical ID
        const existing = this.entries.get(definition.id) ?? [];
        existing.push(entry);
        this.entries.set(definition.id, existing);

        // Index by provider
        const providerEntries = this.providerModels.get(provider) ?? [];
        providerEntries.push(entry);
        this.providerModels.set(provider, providerEntries);
      }
    }
  }

  /**
   * Get provider-specific model ID
   * Different providers may use different names for the same model
   */
  private getProviderModelId(
    definition: ModelDefinition,
    provider: ProviderType
  ): string {
    // Provider-specific model ID mappings
    const providerMappings: Record<ProviderType, Record<string, string>> = {
      groq: {
        "llama-3.3-70b": "llama-3.3-70b-versatile",
        "llama-3.1-70b": "llama-3.1-70b-versatile",
        "llama-3.1-8b": "llama-3.1-8b-instant",
        "llama-3.2-3b": "llama-3.2-3b-preview",
        "llama-3.2-1b": "llama-3.2-1b-preview",
        "gemma-2-9b": "gemma2-9b-it",
        "gemma-2-27b": "gemma2-27b-it",
        "qwen-2.5-32b": "qwen-qwq-32b",
        "mistral-small-24b": "mistral-saba-24b",
        "deepseek-r1": "deepseek-r1-distill-llama-70b",
      },
      cerebras: {
        "llama-3.3-70b": "llama-3.3-70b",
        "llama-3.1-70b": "llama-3.1-70b",
        "llama-3.1-8b": "llama-3.1-8b",
        "llama-3.2-3b": "llama-3.2-3b",
        "llama-3.2-1b": "llama-3.2-1b",
        "qwen-2.5-72b": "qwen-2.5-72b",
        "qwen-2.5-32b": "qwen-2.5-32b",
      },
    };

    return providerMappings[provider]?.[definition.id] ?? definition.id;
  }

  /**
   * Get default rate limits for a provider/model combination
   * These are based on typical free tier limits
   */
  private getDefaultLimits(provider: ProviderType, _modelId: string): RateLimits {
    // Default limits by provider (based on free-llm-api-resources)
    const providerLimits: Record<ProviderType, RateLimits> = {
      groq: {
        requestsPerMinute: 30,
        requestsPerDay: 14400,
        tokensPerMinute: 15000,
        tokensPerDay: 500000,
      },
      cerebras: {
        requestsPerMinute: 30,
        requestsPerHour: 900,
        tokensPerMinute: 60000,
      },
    };

    return providerLimits[provider] ?? {};
  }

  /**
   * Find models matching a query
   */
  findModels(query: ModelQuery): ModelRegistryEntry[] {
    let results: ModelRegistryEntry[] = [];

    // Handle generic aliases (e.g., "best-large")
    if (query.modelName && isGenericAlias(query.modelName)) {
      const aliasConfig = getGenericAliasConfig(query.modelName);
      if (aliasConfig) {
        // Update query with alias configuration
        if (aliasConfig.tier) {
          query = { ...query, tier: aliasConfig.tier, modelName: undefined };
        } else if (aliasConfig.minTier) {
          query = { ...query, minTier: aliasConfig.minTier, modelName: undefined };
        } else if (aliasConfig.tag) {
          query = { ...query, tag: aliasConfig.tag, modelName: undefined };
        }
      }
    }

    // Handle specific model name
    if (query.modelName) {
      const canonicalId = normalizeModelName(query.modelName);
      results = this.entries.get(canonicalId) ?? [];
    } else {
      // Get all entries
      results = Array.from(this.entries.values()).flat();
    }

    // Apply filters
    if (query.provider) {
      results = results.filter((e) => e.provider === query.provider);
    }

    if (query.tier !== undefined) {
      results = results.filter((e) => e.qualityTier === query.tier);
    }

    if (query.minTier !== undefined) {
      results = results.filter((e) => e.qualityTier >= query.minTier!);
    }

    if (query.tag) {
      results = results.filter((e) =>
        e.tags.some((t) => t.toLowerCase() === query.tag!.toLowerCase())
      );
    }

    if (query.family) {
      const familyModels = MODEL_DEFINITIONS.filter(
        (m) => m.family.toLowerCase() === query.family!.toLowerCase()
      ).map((m) => m.id);
      results = results.filter((e) => familyModels.includes(e.canonicalId));
    }

    // Sort by quality tier (highest first)
    return results.sort((a, b) => compareTiers(b.qualityTier, a.qualityTier));
  }

  /**
   * Find models that match a model name and are available from specified providers
   */
  findMatchingModels(
    modelName: string,
    providers: ProviderType[]
  ): ModelRegistryEntry[] {
    const entries = this.findModels({ modelName });
    return entries.filter((e) => providers.includes(e.provider));
  }

  /**
   * Get the best available model for a generic request
   */
  getBestModel(
    minTier: ModelQualityTier = ModelQualityTier.TIER_1,
    providers?: ProviderType[]
  ): ModelRegistryEntry | null {
    const tiersToCheck = getTiersAbove(minTier);

    for (const tier of tiersToCheck) {
      const models = this.findModels({ tier });
      const filtered = providers
        ? models.filter((m) => providers.includes(m.provider))
        : models;

      const first = filtered[0];
      if (first) {
        return first;
      }
    }

    return null;
  }

  /**
   * Get all models available from a provider
   */
  getProviderModels(provider: ProviderType): ModelRegistryEntry[] {
    return this.providerModels.get(provider) ?? [];
  }

  /**
   * Check if a model is supported by any provider
   */
  isModelSupported(modelName: string): boolean {
    if (isGenericAlias(modelName)) {
      return true;
    }
    const canonicalId = normalizeModelName(modelName);
    return this.entries.has(canonicalId);
  }

  /**
   * Get canonical model ID for an alias
   */
  getCanonicalId(modelName: string): string | null {
    if (isGenericAlias(modelName)) {
      return null; // Generic aliases don't have a single canonical ID
    }
    const canonical = this.aliasMap.get(modelName.toLowerCase());
    return canonical ?? null;
  }

  /**
   * Register a custom model
   */
  registerModel(
    canonicalId: string,
    providerModelId: string,
    provider: ProviderType,
    qualityTier: ModelQualityTier,
    limits: RateLimits = {},
    tags: string[] = []
  ): void {
    const entry: ModelRegistryEntry = {
      canonicalId,
      providerModelId,
      provider,
      qualityTier,
      limits,
      tags,
    };

    // Index by canonical ID
    const existing = this.entries.get(canonicalId) ?? [];
    existing.push(entry);
    this.entries.set(canonicalId, existing);

    // Index by provider
    const providerEntries = this.providerModels.get(provider) ?? [];
    providerEntries.push(entry);
    this.providerModels.set(provider, providerEntries);

    // Add to alias map
    this.aliasMap.set(canonicalId.toLowerCase(), canonicalId);
  }

  /**
   * Convert a registry entry to a ModelConfig
   */
  toModelConfig(entry: ModelRegistryEntry): ModelConfig {
    return {
      id: entry.providerModelId,
      aliases: [entry.canonicalId],
      qualityTier: entry.qualityTier,
      limits: entry.limits,
      tags: entry.tags,
    };
  }

  /**
   * Get all supported canonical model IDs
   */
  getAllCanonicalIds(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Get all supported providers
   */
  getAllProviders(): ProviderType[] {
    return Array.from(this.providerModels.keys());
  }
}

/**
 * Singleton instance of the model registry
 */
let registryInstance: ModelRegistry | null = null;

/**
 * Get the global model registry instance
 */
export function getModelRegistry(): ModelRegistry {
  if (!registryInstance) {
    registryInstance = new ModelRegistry();
  }
  return registryInstance;
}

/**
 * Reset the global model registry (useful for testing)
 */
export function resetModelRegistry(): void {
  registryInstance = null;
}
