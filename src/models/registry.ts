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
  readonly canonicalId: string;
  /** Provider-specific model ID */
  readonly providerModelId: string;
  /** Provider that offers this model */
  readonly provider: ProviderType;
  /** Quality tier */
  readonly qualityTier: ModelQualityTier;
  /** Rate limits (provider-specific) */
  readonly limits: RateLimits;
}

/**
 * Query options for finding models
 */
export interface ModelQuery {
  /** Specific model name or generic alias */
  readonly modelName?: string;
  /** Minimum quality tier */
  readonly minTier?: ModelQualityTier;
  /** Exact quality tier */
  readonly tier?: ModelQualityTier;
  /** Filter by provider */
  readonly provider?: ProviderType;
  /** Filter by model family */
  readonly family?: string;
}

/**
 * Immutable state for the model registry
 */
export type ModelRegistryState = Readonly<{
  /** Entries indexed by canonical model ID */
  entries: ReadonlyMap<string, readonly ModelRegistryEntry[]>;
  /** Alias map for normalizing model names */
  aliasMap: ReadonlyMap<string, string>;
  /** Entries indexed by provider */
  providerModels: ReadonlyMap<ProviderType, readonly ModelRegistryEntry[]>;
}>;

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Provider-specific model ID mappings
 * Different providers may use different names for the same model
 */
const PROVIDER_MODEL_MAPPINGS: Readonly<
  Record<ProviderType, Readonly<Record<string, string>>>
> = {
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

/**
 * Default rate limits by provider (based on free-llm-api-resources)
 */
const PROVIDER_DEFAULT_LIMITS: Readonly<Record<ProviderType, RateLimits>> = {
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

/**
 * Get provider-specific model ID for a definition
 */
const getProviderModelId = (
  definition: ModelDefinition,
  provider: ProviderType
): string => PROVIDER_MODEL_MAPPINGS[provider]?.[definition.id] ?? definition.id;

/**
 * Get default rate limits for a provider
 */
const getDefaultLimits = (provider: ProviderType): RateLimits =>
  PROVIDER_DEFAULT_LIMITS[provider] ?? {};

/**
 * Build a single registry entry for a provider/model combination
 */
const buildEntry = (
  definition: ModelDefinition,
  provider: ProviderType
): ModelRegistryEntry => ({
  canonicalId: definition.id,
  providerModelId: getProviderModelId(definition, provider),
  provider,
  qualityTier: definition.qualityTier,
  limits: getDefaultLimits(provider),
});

/**
 * Build all entries from model definitions
 */
const buildEntriesFromDefinitions = (): readonly ModelRegistryEntry[] =>
  MODEL_DEFINITIONS.flatMap((definition) =>
    definition.providers.map((provider) => buildEntry(definition, provider))
  );

/**
 * Index entries by a key extractor function
 */
const indexBy = <K>(
  entries: readonly ModelRegistryEntry[],
  keyFn: (entry: ModelRegistryEntry) => K
): ReadonlyMap<K, readonly ModelRegistryEntry[]> => {
  const map = new Map<K, ModelRegistryEntry[]>();

  for (const entry of entries) {
    const key = keyFn(entry);
    const existing = map.get(key) ?? [];
    map.set(key, [...existing, entry]);
  }

  return map;
};

// ============================================================================
// Registry State Factory
// ============================================================================

/**
 * Create a new model registry state from model definitions
 *
 * This is the primary way to create registry state. The returned state
 * is immutable and can be passed to pure query functions.
 */
export const createModelRegistry = (): ModelRegistryState => {
  const entries = buildEntriesFromDefinitions();

  return {
    entries: indexBy(entries, (e) => e.canonicalId),
    aliasMap: buildAliasMap(),
    providerModels: indexBy(entries, (e) => e.provider),
  };
};

/**
 * Register a custom model, returning new state
 *
 * @param state - Current registry state
 * @param canonicalId - Canonical model ID
 * @param providerModelId - Provider-specific model ID
 * @param provider - Provider type
 * @param qualityTier - Quality tier
 * @param limits - Rate limits (optional)
 * @returns New registry state with the model added
 */
export const registerModel = (
  state: ModelRegistryState,
  canonicalId: string,
  providerModelId: string,
  provider: ProviderType,
  qualityTier: ModelQualityTier,
  limits: RateLimits = {}
): ModelRegistryState => {
  const entry: ModelRegistryEntry = {
    canonicalId,
    providerModelId,
    provider,
    qualityTier,
    limits,
  };

  // Build new entries map
  const existingEntries = state.entries.get(canonicalId) ?? [];
  const newEntriesMap = new Map(state.entries);
  newEntriesMap.set(canonicalId, [...existingEntries, entry]);

  // Build new provider models map
  const existingProviderEntries = state.providerModels.get(provider) ?? [];
  const newProviderModelsMap = new Map(state.providerModels);
  newProviderModelsMap.set(provider, [...existingProviderEntries, entry]);

  // Build new alias map
  const newAliasMap = new Map(state.aliasMap);
  newAliasMap.set(canonicalId.toLowerCase(), canonicalId);

  return {
    entries: newEntriesMap,
    aliasMap: newAliasMap,
    providerModels: newProviderModelsMap,
  };
};

// ============================================================================
// Pure Query Functions
// ============================================================================

/**
 * Find models matching a query
 */
export const findModels = (
  state: ModelRegistryState,
  query: ModelQuery
): readonly ModelRegistryEntry[] => {
  // Handle generic aliases (e.g., "best-large")
  const resolvedQuery =
    query.modelName && isGenericAlias(query.modelName)
      ? resolveGenericAliasQuery(query)
      : query;

  // Get initial results
  const initialResults = resolvedQuery.modelName
    ? (state.entries.get(normalizeModelName(resolvedQuery.modelName)) ?? [])
    : Array.from(state.entries.values()).flat();

  // Apply filters and sort
  return initialResults
    .filter((e) => matchesQuery(e, resolvedQuery))
    .sort((a, b) => compareTiers(b.qualityTier, a.qualityTier));
};

/**
 * Resolve a generic alias query to a tier-based query
 */
const resolveGenericAliasQuery = (query: ModelQuery): ModelQuery => {
  if (!query.modelName) return query;

  const aliasConfig = getGenericAliasConfig(query.modelName);
  if (!aliasConfig) return query;

  if (aliasConfig.tier !== undefined) {
    return { ...query, tier: aliasConfig.tier, modelName: undefined };
  }
  if (aliasConfig.minTier !== undefined) {
    return { ...query, minTier: aliasConfig.minTier, modelName: undefined };
  }
  return query;
};

/**
 * Check if an entry matches a query (excluding modelName, which is handled separately)
 */
const matchesQuery = (
  entry: ModelRegistryEntry,
  query: ModelQuery
): boolean => {
  if (query.provider !== undefined && entry.provider !== query.provider) {
    return false;
  }
  if (query.tier !== undefined && entry.qualityTier !== query.tier) {
    return false;
  }
  if (query.minTier !== undefined && entry.qualityTier < query.minTier) {
    return false;
  }
  if (query.family !== undefined) {
    const familyModels = MODEL_DEFINITIONS.filter(
      (m) => m.family.toLowerCase() === query.family!.toLowerCase()
    ).map((m) => m.id);
    if (!familyModels.includes(entry.canonicalId)) {
      return false;
    }
  }
  return true;
};

/**
 * Find models that match a model name and are available from specified providers
 */
export const findMatchingModels = (
  state: ModelRegistryState,
  modelName: string,
  providers: readonly ProviderType[]
): readonly ModelRegistryEntry[] =>
  findModels(state, { modelName }).filter((e) => providers.includes(e.provider));

/**
 * Get the best available model for a generic request
 */
export const getBestModel = (
  state: ModelRegistryState,
  minTier: ModelQualityTier = ModelQualityTier.TIER_1,
  providers?: readonly ProviderType[]
): ModelRegistryEntry | null => {
  const tiersToCheck = getTiersAbove(minTier);

  for (const tier of tiersToCheck) {
    const models = findModels(state, { tier });
    const filtered = providers
      ? models.filter((m) => providers.includes(m.provider))
      : models;

    const first = filtered[0];
    if (first) {
      return first;
    }
  }

  return null;
};

/**
 * Get all models available from a provider
 */
export const getProviderModels = (
  state: ModelRegistryState,
  provider: ProviderType
): readonly ModelRegistryEntry[] => state.providerModels.get(provider) ?? [];

/**
 * Check if a model is supported by any provider
 */
export const isModelSupported = (
  state: ModelRegistryState,
  modelName: string
): boolean => {
  if (isGenericAlias(modelName)) {
    return true;
  }
  const canonicalId = normalizeModelName(modelName);
  return state.entries.has(canonicalId);
};

/**
 * Get canonical model ID for an alias
 */
export const getCanonicalId = (
  state: ModelRegistryState,
  modelName: string
): string | null => {
  if (isGenericAlias(modelName)) {
    return null; // Generic aliases don't have a single canonical ID
  }
  return state.aliasMap.get(modelName.toLowerCase()) ?? null;
};

/**
 * Convert a registry entry to a ModelConfig
 */
export const toModelConfig = (entry: ModelRegistryEntry): ModelConfig => ({
  id: entry.providerModelId,
  aliases: [entry.canonicalId],
  qualityTier: entry.qualityTier,
  limits: entry.limits,
});

/**
 * Get all supported canonical model IDs
 */
export const getAllCanonicalIds = (
  state: ModelRegistryState
): readonly string[] => Array.from(state.entries.keys());

/**
 * Get all supported providers
 */
export const getAllProviders = (
  state: ModelRegistryState
): readonly ProviderType[] => Array.from(state.providerModels.keys());

// ============================================================================
// Singleton State Management
// ============================================================================

/**
 * Cached registry state for singleton pattern
 */
let registryState: ModelRegistryState | null = null;

/**
 * Get the global model registry state
 *
 * For new code, prefer creating your own state with `createModelRegistry()`
 * and passing it explicitly to functions.
 */
export const getModelRegistryState = (): ModelRegistryState => {
  if (!registryState) {
    registryState = createModelRegistry();
  }
  return registryState;
};

/**
 * Reset the global model registry (useful for testing)
 */
export const resetModelRegistry = (): void => {
  registryState = null;
};
