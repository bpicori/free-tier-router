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
export {
  OPENROUTER_PROVIDER,
  getOpenRouterModels,
  resetOpenRouterProvider,
} from "./openrouter.js";
export {
  NVIDIA_NIM_PROVIDER,
  getNvidiaNimModels,
  resetNvidiaNimProvider,
} from "./nvidia-nim.js";

// Import for registry
import { GROQ_PROVIDER } from "./groq.js";
import { CEREBRAS_PROVIDER } from "./cerebras.js";
import { OPENROUTER_PROVIDER } from "./openrouter.js";
import { NVIDIA_NIM_PROVIDER } from "./nvidia-nim.js";

/**
 * Registry of all available providers
 */
export const PROVIDER_REGISTRY: Record<ProviderType, ProviderDefinition> = {
  groq: GROQ_PROVIDER,
  cerebras: CEREBRAS_PROVIDER,
  openrouter: OPENROUTER_PROVIDER,
  "nvidia-nim": NVIDIA_NIM_PROVIDER,
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
