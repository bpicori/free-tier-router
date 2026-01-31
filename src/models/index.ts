/**
 * Model Registry Module
 *
 * Provides model definitions, aliases, quality tiers, and provider mappings
 * for intelligent model-first routing.
 */

// Re-export types
export type { ModelDefinition } from "./aliases.js";
export type { ModelRegistryEntry, ModelQuery } from "./registry.js";
export type { TierInfo } from "./tiers.js";

// Re-export aliases functionality
export {
  MODEL_DEFINITIONS,
  GENERIC_MODEL_ALIASES,
  normalizeModelName,
  isGenericAlias,
  getGenericAliasConfig,
  getModelsByFamily,
  getModelsByTier,
  getModelsByProvider,
  getModelDefinition,
  buildAliasMap,
} from "./aliases.js";

// Re-export tiers functionality
export {
  TIER_INFO,
  getTierInfo,
  compareTiers,
  meetsTierRequirement,
  getTiersAbove,
  getTiersBelow,
} from "./tiers.js";

// Re-export registry functionality
export type { ModelRegistryState } from "./registry.js";
export {
  // Factory function
  createModelRegistry,
  // Pure query functions
  findModels,
  findMatchingModels,
  getBestModel,
  getProviderModels,
  isModelSupported,
  getCanonicalId,
  toModelConfig,
  getAllCanonicalIds,
  getAllProviders,
  registerModel,
  // Singleton accessors
  getModelRegistryState,
  resetModelRegistry,
} from "./registry.js";
