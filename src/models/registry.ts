/**
 * Model Registry
 *
 * Provides model lookup and query functionality based on loaded configuration.
 * Builds registry entries from config/models.yml and config/providers/*.yml.
 */

import type { RateLimits } from "../types/models.js";
import type { ProviderType } from "../types/provider.js";
import {
  getConfig,
  type ProviderConfig,
  type ModelDefinition,
} from "../config/index.js";
import {
  normalizeModelName,
  isGenericAlias,
  getGenericAliasConfig,
  buildAliasMap,
} from "./model-definitions.js";
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
  readonly qualityTier: number;
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
  readonly minTier?: number;
  /** Exact quality tier */
  readonly tier?: number;
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
 * Build a single registry entry from config
 */
const buildEntry = (
  modelDef: ModelDefinition,
  providerConfig: ProviderConfig,
  providerModelId: string,
  limits: RateLimits
): ModelRegistryEntry => ({
  canonicalId: modelDef.id,
  providerModelId,
  provider: providerConfig.name as ProviderType,
  qualityTier: modelDef.tier,
  limits,
});

/**
 * Build all entries from loaded configuration
 */
const buildEntriesFromConfig = (): readonly ModelRegistryEntry[] => {
  const config = getConfig();
  const modelMap = new Map(config.models.models.map((m) => [m.id, m]));
  const entries: ModelRegistryEntry[] = [];

  for (const providerConfig of config.providers.values()) {
    for (const providerModel of providerConfig.models) {
      const modelDef = modelMap.get(providerModel.canonical);
      if (modelDef) {
        entries.push(
          buildEntry(
            modelDef,
            providerConfig,
            providerModel.id,
            providerModel.limits
          )
        );
      }
    }
  }

  return entries;
};

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
 * Create a new model registry state from loaded configuration
 */
const createModelRegistry = (): ModelRegistryState => {
  const entries = buildEntriesFromConfig();

  return {
    entries: indexBy(entries, (e) => e.canonicalId),
    aliasMap: buildAliasMap(),
    providerModels: indexBy(entries, (e) => e.provider),
  };
};

// ============================================================================
// Pure Query Functions
// ============================================================================

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
 * Check if an entry matches a query
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
    const config = getConfig();
    const familyModels = config.models.models
      .filter((m) => m.family.toLowerCase() === query.family!.toLowerCase())
      .map((m) => m.id);
    if (!familyModels.includes(entry.canonicalId)) {
      return false;
    }
  }
  return true;
};

/**
 * Find models matching a query
 */
const findModels = (
  state: ModelRegistryState,
  query: ModelQuery
): readonly ModelRegistryEntry[] => {
  const resolvedQuery =
    query.modelName && isGenericAlias(query.modelName)
      ? resolveGenericAliasQuery(query)
      : query;

  const initialResults = resolvedQuery.modelName
    ? (state.entries.get(normalizeModelName(resolvedQuery.modelName)) ?? [])
    : Array.from(state.entries.values()).flat();

  return initialResults
    .filter((e) => matchesQuery(e, resolvedQuery))
    .sort((a, b) => compareTiers(b.qualityTier, a.qualityTier));
};

/**
 * Get the best available model for a generic request
 */
export const getBestModel = (
  state: ModelRegistryState,
  minTier: number = 1,
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

// ============================================================================
// Singleton State Management
// ============================================================================

let registryState: ModelRegistryState | null = null;

/**
 * Get the global model registry state
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
