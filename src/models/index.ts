/**
 * Model Registry Module
 *
 * Provides model definitions, aliases, and quality tier mappings
 * for intelligent model-first routing.
 */

// Re-export types
export type { ModelDefinition, ModelsConfig } from "./model-definitions.js";
export type { ModelRegistryEntry, ModelQuery, ModelRegistryState } from "./registry.js";

// Re-export alias resolution functions
export {
  normalizeModelName,
  isGenericAlias,
  getGenericAliasConfig,
  buildAliasMap,
} from "./model-definitions.js";

// Re-export tier functions
export { compareTiers, getTiersAbove } from "./tiers.js";

// Re-export registry functions
export {
  getBestModel,
  getModelRegistryState,
  resetModelRegistry,
} from "./registry.js";
