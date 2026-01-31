/**
 * Cerebras Provider
 *
 * Provides Cerebras configuration loaded from config/providers/cerebras.yml
 * API Docs: https://inference-docs.cerebras.ai/
 */

import type { ProviderDefinition } from "../types/provider.js";
import type { ModelConfig } from "../types/models.js";
import { getConfig } from "../config/index.js";

/**
 * Build ProviderDefinition from loaded config
 */
const buildCerebrasProvider = (): ProviderDefinition => {
  const config = getConfig();
  const providerConfig = config.providers.get("cerebras");

  if (!providerConfig) {
    throw new Error("Cerebras provider config not found. Check config/providers/cerebras.yml");
  }

  // Get model tier info from models config
  const modelTiers = new Map(
    config.models.definitions.map((m) => [m.id, m.tier])
  );

  // Build ModelConfig array
  const models: ModelConfig[] = providerConfig.models.map((pm) => ({
    id: pm.id,
    aliases: [pm.canonical],
    qualityTier: modelTiers.get(pm.canonical) ?? 1,
    limits: pm.limits,
  }));

  // Build model mapping (canonical -> provider-specific)
  const modelMapping: Record<string, string> = {};
  for (const pm of providerConfig.models) {
    modelMapping[pm.canonical] = pm.id;
    modelMapping[pm.id] = pm.id; // Also map provider ID to itself
  }

  return {
    name: "cerebras",
    displayName: providerConfig.displayName,
    baseUrl: providerConfig.baseUrl,
    models,
    modelMapping,
  };
};

/** Cached provider definition */
let cachedProvider: ProviderDefinition | null = null;

/**
 * Cerebras provider definition
 */
export const CEREBRAS_PROVIDER: ProviderDefinition = new Proxy({} as ProviderDefinition, {
  get(_, prop) {
    if (!cachedProvider) {
      cachedProvider = buildCerebrasProvider();
    }
    return cachedProvider[prop as keyof ProviderDefinition];
  },
});

/**
 * Get all Cerebras model configurations
 */
export const getCerebrasModels = (): readonly ModelConfig[] => {
  if (!cachedProvider) {
    cachedProvider = buildCerebrasProvider();
  }
  return cachedProvider.models;
};

/**
 * Reset cached provider (for testing)
 */
export const resetCerebrasProvider = (): void => {
  cachedProvider = null;
};
