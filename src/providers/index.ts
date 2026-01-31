/**
 * Providers Module
 *
 * Provider definitions loaded from config/providers/*.yml.
 * Each provider builds a ProviderDefinition that can be used
 * with the OpenAI SDK by setting the baseURL.
 */

import type { ProviderDefinition, ProviderType } from "../types/provider.js";

// Re-export provider definitions
export { GROQ_PROVIDER, getGroqModels, resetGroqProvider } from "./groq.js";
export { CEREBRAS_PROVIDER, getCerebrasModels, resetCerebrasProvider } from "./cerebras.js";

// Import for registry
import { GROQ_PROVIDER } from "./groq.js";
import { CEREBRAS_PROVIDER } from "./cerebras.js";

/**
 * Registry of all available providers
 */
export const PROVIDER_REGISTRY: Record<ProviderType, ProviderDefinition> = {
  groq: GROQ_PROVIDER,
  cerebras: CEREBRAS_PROVIDER,
};

/**
 * Get a provider definition by type
 */
export const getProvider = (type: ProviderType): ProviderDefinition => {
  const provider = PROVIDER_REGISTRY[type];
  if (!provider) {
    throw new Error(`Unknown provider type: ${type}`);
  }
  return provider;
};

/**
 * Get all available provider types
 */
export const getAvailableProviders = (): ProviderType[] => {
  return Object.keys(PROVIDER_REGISTRY) as ProviderType[];
};
