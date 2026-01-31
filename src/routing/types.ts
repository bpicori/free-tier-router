/**
 * Routing Module Types
 *
 * Shared types for provider selection and request execution.
 */

import type OpenAI from "openai";
import type { ProviderDefinition } from "../types/provider.js";
import type { ResolvedProviderConfig, RetryConfig } from "../types/config.js";
import type { StateStore } from "../types/state.js";
import type { RoutingStrategy } from "../types/strategy.js";
import type { RateLimitTracker } from "../rate-limit/tracker.js";
import type { ModelConfig } from "../types/models.js";

/**
 * Provider with configuration metadata and OpenAI client
 */
export interface ConfiguredProvider {
  /** Provider definition with models and base URL */
  definition: ProviderDefinition;
  /** User-provided configuration */
  config: ResolvedProviderConfig;
  /** OpenAI-compatible client for API calls */
  client: OpenAI;
}

/**
 * Dependencies required for provider selection
 */
export interface SelectionDependencies {
  /** Configured providers to select from */
  providers: ConfiguredProvider[];
  /** Rate limit tracker for quota checking */
  tracker: RateLimitTracker;
  /** State store for latency data */
  stateStore: StateStore;
  /** Routing strategy for selection logic */
  strategy: RoutingStrategy;
  /** User-defined model aliases */
  modelAliases: Record<string, string>;
}

/**
 * Dependencies required for request execution
 */
export interface ExecutionDependencies {
  /** Selection dependencies */
  selection: SelectionDependencies;
  /** Retry configuration */
  retry: RetryConfig;
  /** Whether to throw when all providers are exhausted */
  throwOnExhausted: boolean;
}

/**
 * Result of a successful execution
 */
export interface ExecutionResult<T> {
  /** The response from the provider */
  response: T;
  /** Provider that handled the request */
  providerName: string;
  /** Model that was used */
  modelId: string;
  /** Request latency in milliseconds */
  latencyMs: number;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Match result from provider selection
 */
export interface ProviderMatch {
  /** The configured provider */
  provider: ConfiguredProvider;
  /** The model configuration */
  model: ModelConfig;
}
