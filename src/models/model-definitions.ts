/**
 * Model Definitions
 *
 * Provides access to model definitions loaded from config/models.yml.
 * This module re-exports loaded config data and provides alias resolution.
 */

import { getConfig } from "../config/index.js";

// Re-export types for convenience
export type { ModelDefinition, ModelsConfig } from "../config/index.js";

// ============================================================================
// Internal Config Access
// ============================================================================

/**
 * Get all model definitions from loaded config (internal use)
 */
const getModelDefinitions = () => getConfig().models.models;

/**
 * Get generic alias configuration from loaded config (internal use)
 */
const getGenericAliases = () => getConfig().models.genericAliases;

// ============================================================================
// Alias Resolution (cached for performance)
// ============================================================================

/** Cached alias map (built once on first use) */
let cachedAliasMap: Map<string, string> | null = null;

/**
 * Build alias lookup map from model definitions
 */
export const buildAliasMap = (): Map<string, string> => {
  if (cachedAliasMap) {
    return cachedAliasMap;
  }

  const aliasMap = new Map<string, string>();
  const models = getModelDefinitions();

  for (const model of models) {
    aliasMap.set(model.id.toLowerCase(), model.id);
    for (const alias of model.aliases) {
      aliasMap.set(alias.toLowerCase(), model.id);
    }
  }

  cachedAliasMap = aliasMap;
  return aliasMap;
};

/**
 * Normalize a model name to its canonical form
 */
export const normalizeModelName = (modelName: string): string => {
  const aliasMap = buildAliasMap();
  return aliasMap.get(modelName.toLowerCase()) ?? modelName;
};

/**
 * Check if a model name is a generic alias (e.g., "best-large")
 */
export const isGenericAlias = (modelName: string): boolean =>
  modelName.toLowerCase() in getGenericAliases();

/**
 * Get generic alias configuration
 */
export const getGenericAliasConfig = (
  modelName: string
): { tier?: number; minTier?: number } | null =>
  getGenericAliases()[modelName.toLowerCase()] ?? null;
