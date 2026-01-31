/**
 * Groq Provider
 *
 * Provides Groq configuration loaded from config/providers/groq.yml
 * API Docs: https://console.groq.com/docs/api
 */

import type { ProviderDefinition } from "../types/provider.js";
import type { ModelConfig } from "../types/models.js";
import { getConfig } from "../config/index.js";

/**
 * Build ProviderDefinition from loaded config
 */
const buildGroqProvider = (): ProviderDefinition => {
  const config = getConfig();
  const providerConfig = config.providers.get("groq");

  if (!providerConfig) {
    throw new Error("Groq provider config not found. Check config/providers/groq.yml");
  }

  // Get model tier info from models config
  const modelTiers = new Map(
    config.models.models.map((m) => [m.id, m.tier])
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
    name: "groq",
    displayName: providerConfig.displayName,
    baseUrl: providerConfig.baseUrl,
    models,
    modelMapping,
  };
};

/** Cached provider definition */
let cachedProvider: ProviderDefinition | null = null;

/**
 * Groq provider definition
 */
export const GROQ_PROVIDER: ProviderDefinition = new Proxy({} as ProviderDefinition, {
  get(_, prop) {
    if (!cachedProvider) {
      cachedProvider = buildGroqProvider();
    }
    return cachedProvider[prop as keyof ProviderDefinition];
  },
});

/**
 * Get all Groq model configurations
 */
export const getGroqModels = (): readonly ModelConfig[] => {
  if (!cachedProvider) {
    cachedProvider = buildGroqProvider();
  }
  return cachedProvider.models;
};

/**
 * Reset cached provider (for testing)
 */
export const resetGroqProvider = (): void => {
  cachedProvider = null;
};
