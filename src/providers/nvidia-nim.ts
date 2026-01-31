/**
 * NVIDIA NIM Provider
 *
 * Provides NVIDIA NIM configuration loaded from config/providers/nvidia-nim.yml
 * API Docs: https://docs.api.nvidia.com/nim/reference/llm-apis
 *
 * NVIDIA NIM offers free access to various LLMs with an OpenAI-compatible API.
 * Free tier: 40 requests/minute (requires phone number verification)
 * Note: Models may have context window limitations
 */

import type { ProviderDefinition } from "../types/provider.js";
import type { ModelConfig } from "../types/models.js";
import { getConfig } from "../config/index.js";

/**
 * Build ProviderDefinition from loaded config
 */
const buildNvidiaNimProvider = (): ProviderDefinition => {
  const config = getConfig();
  const providerConfig = config.providers.get("nvidia-nim");

  if (!providerConfig) {
    throw new Error(
      "NVIDIA NIM provider config not found. Check config/providers/nvidia-nim.yml"
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
    name: "nvidia-nim",
    displayName: providerConfig.displayName,
    baseUrl: providerConfig.baseUrl,
    models,
    modelMapping,
  };
};

/** Cached provider definition */
let cachedProvider: ProviderDefinition | null = null;

/**
 * NVIDIA NIM provider definition
 */
export const NVIDIA_NIM_PROVIDER: ProviderDefinition = new Proxy(
  {} as ProviderDefinition,
  {
    get(_, prop) {
      if (!cachedProvider) {
        cachedProvider = buildNvidiaNimProvider();
      }
      return cachedProvider[prop as keyof ProviderDefinition];
    },
  }
);

/**
 * Get all NVIDIA NIM model configurations
 */
export const getNvidiaNimModels = (): readonly ModelConfig[] => {
  if (!cachedProvider) {
    cachedProvider = buildNvidiaNimProvider();
  }
  return cachedProvider.models;
};

/**
 * Reset cached provider (for testing)
 */
export const resetNvidiaNimProvider = (): void => {
  cachedProvider = null;
};
