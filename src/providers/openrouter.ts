/**
 * OpenRouter Provider
 *
 * Provides OpenRouter configuration loaded from config/providers/openrouter.yml
 * API Docs: https://openrouter.ai/docs
 *
 * OpenRouter offers free access to various LLMs with an OpenAI-compatible API.
 * Free tier: 20 requests/minute, 50 requests/day
 */

import type { ProviderDefinition } from "../types/provider.js";
import type { ModelConfig } from "../types/models.js";
import { getConfig } from "../config/index.js";

/**
 * Build ProviderDefinition from loaded config
 */
const buildOpenRouterProvider = (): ProviderDefinition => {
  const config = getConfig();
  const providerConfig = config.providers.get("openrouter");

  if (!providerConfig) {
    throw new Error(
      "OpenRouter provider config not found. Check config/providers/openrouter.yml"
    );
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
    name: "openrouter",
    displayName: providerConfig.displayName,
    baseUrl: providerConfig.baseUrl,
    models,
    modelMapping,
  };
};

/** Cached provider definition */
let cachedProvider: ProviderDefinition | null = null;

/**
 * OpenRouter provider definition
 */
export const OPENROUTER_PROVIDER: ProviderDefinition = new Proxy(
  {} as ProviderDefinition,
  {
    get(_, prop) {
      if (!cachedProvider) {
        cachedProvider = buildOpenRouterProvider();
      }
      return cachedProvider[prop as keyof ProviderDefinition];
    },
  }
);

/**
 * Get all OpenRouter model configurations
 */
export const getOpenRouterModels = (): readonly ModelConfig[] => {
  if (!cachedProvider) {
    cachedProvider = buildOpenRouterProvider();
  }
  return cachedProvider.models;
};

/**
 * Reset cached provider (for testing)
 */
export const resetOpenRouterProvider = (): void => {
  cachedProvider = null;
};
