import type { ProviderType } from "./provider.js";

/**
 * Available routing strategies
 */
export type RoutingStrategyType = "priority" | "least-used";

/**
 * Configuration for a single provider
 */
export interface ProviderConfig {
  /** Provider type */
  type: ProviderType;
  /** API key for authentication */
  apiKey: string;
  /** Priority for routing (lower = higher priority). Default: 0 */
  priority?: number;
  /** Whether this provider is enabled. Default: true */
  enabled?: boolean;
  /** Whether this provider uses trial credits vs truly free. Default: false */
  isFreeCredits?: boolean;
  /** Custom base URL for the provider API */
  baseUrl?: string;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts. Default: 3 */
  maxRetries: number;
  /** Initial backoff delay in milliseconds. Default: 1000 */
  initialBackoffMs: number;
  /** Maximum backoff delay in milliseconds. Default: 30000 */
  maxBackoffMs: number;
  /** Backoff multiplier. Default: 2 */
  backoffMultiplier: number;
}

/**
 * Main configuration for the free-tier router
 */
export interface FreeTierRouterConfig {
  /** Provider configurations */
  providers: ProviderConfig[];
  /** Routing strategy to use. Default: "priority" */
  strategy?: RoutingStrategyType;
  /** State store for persistence. Default: in-memory */
  stateStore?: StateStoreConfig;
  /** Retry configuration */
  retry?: Partial<RetryConfig>;
  /** 
   * Model aliases for convenience
   * Maps user-friendly names to specific model IDs
   * e.g., { "fast": "llama-3.1-8b", "smart": "llama-3.3-70b" }
   */
  modelAliases?: Record<string, string>;
  /**
   * Default timeout for requests in milliseconds. Default: 60000
   */
  timeoutMs?: number;
  /**
   * Whether to throw on all providers exhausted. Default: true
   * If false, returns null instead of throwing
   */
  throwOnExhausted?: boolean;
}

/**
 * State store configuration
 */
export type StateStoreConfig =
  | { type: "memory" }
  | { type: "file"; path: string }
  | { type: "redis"; url: string; prefix?: string };

/**
 * Validated and normalized configuration with defaults applied
 */
export interface ResolvedConfig {
  providers: ResolvedProviderConfig[];
  strategy: RoutingStrategyType;
  retry: RetryConfig;
  modelAliases: Record<string, string>;
  timeoutMs: number;
  throwOnExhausted: boolean;
}

/**
 * Provider config with defaults resolved
 */
export interface ResolvedProviderConfig {
  type: ProviderType;
  apiKey: string;
  priority: number;
  enabled: boolean;
  isFreeCredits: boolean;
  baseUrl?: string;
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
  strategy: "priority" as const,
  retry: {
    maxRetries: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    backoffMultiplier: 2,
  },
  timeoutMs: 60000,
  throwOnExhausted: true,
} as const;

/**
 * Resolve configuration with defaults
 */
export function resolveConfig(config: FreeTierRouterConfig): ResolvedConfig {
  return {
    providers: config.providers
      .filter((p) => p.enabled !== false)
      .map((p) => ({
        type: p.type,
        apiKey: p.apiKey,
        priority: p.priority ?? 0,
        enabled: p.enabled ?? true,
        isFreeCredits: p.isFreeCredits ?? false,
        baseUrl: p.baseUrl,
      })),
    strategy: config.strategy ?? DEFAULT_CONFIG.strategy,
    retry: {
      ...DEFAULT_CONFIG.retry,
      ...config.retry,
    },
    modelAliases: config.modelAliases ?? {},
    timeoutMs: config.timeoutMs ?? DEFAULT_CONFIG.timeoutMs,
    throwOnExhausted: config.throwOnExhausted ?? DEFAULT_CONFIG.throwOnExhausted,
  };
}
