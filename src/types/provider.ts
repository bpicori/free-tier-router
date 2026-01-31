import type { ModelConfig, QuotaStatus } from "./models.js";

/**
 * Supported provider types
 */
export type ProviderType = "groq" | "cerebras";

/**
 * Provider configuration - defines how to connect to a provider
 * This is a pure data structure, no methods or API calls
 */
export interface ProviderDefinition {
  /** Provider type identifier */
  readonly name: ProviderType;
  /** Display name for logging/debugging */
  readonly displayName: string;
  /** Base URL for OpenAI-compatible API */
  readonly baseUrl: string;
  /** Models available from this provider */
  readonly models: ModelConfig[];
  /** Map canonical model IDs to provider-specific IDs */
  readonly modelMapping: Record<string, string>;
}

/**
 * Check if a provider supports a specific model
 */
export const providerSupportsModel = (
  provider: ProviderDefinition,
  modelId: string
): boolean => {
  const normalizedId = modelId.toLowerCase();

  // Check model mapping
  if (normalizedId in provider.modelMapping) {
    return true;
  }

  // Check models list
  return provider.models.some(
    (m) =>
      m.id.toLowerCase() === normalizedId ||
      m.aliases?.some((a) => a.toLowerCase() === normalizedId)
  );
};

/**
 * Get the provider-specific model ID for a canonical model name
 */
export const getProviderModelId = (
  provider: ProviderDefinition,
  canonicalModelId: string
): string | null => {
  // Direct mapping exists
  if (provider.modelMapping[canonicalModelId]) {
    return provider.modelMapping[canonicalModelId];
  }

  // Check if it's already a provider-specific ID
  const providerIds = Object.values(provider.modelMapping);
  if (providerIds.includes(canonicalModelId)) {
    return canonicalModelId;
  }

  // Check model configs for ID or alias match
  for (const model of provider.models) {
    if (model.id === canonicalModelId) {
      return model.id;
    }
    if (model.aliases?.includes(canonicalModelId)) {
      return model.id;
    }
  }

  return null;
};

/**
 * Provider with runtime quota information
 * Used by routing strategies to make decisions
 */
export interface ProviderModelCandidate {
  /** The provider definition */
  provider: ProviderDefinition;
  /** The specific model configuration */
  model: ModelConfig;
  /** Current quota status */
  quota: QuotaStatus;
  /** User-configured provider priority (lower = higher priority) */
  priority: number;
  /** Historical average latency in milliseconds */
  latencyMs?: number;
  /** Whether this provider uses trial credits vs truly free */
  isFreeCredits: boolean;
}
