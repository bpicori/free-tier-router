// Model and rate limit types
export {
  ModelQualityTier,
  type RateLimits,
  type ModelConfig,
  type QuotaStatus,
} from "./models.js";

// OpenAI-compatible types
export {
  type ChatCompletionRole,
  type ChatCompletionMessage,
  type ToolCall,
  type Tool,
  type ResponseFormat,
  type ChatCompletionRequest,
  type ChatCompletionChoice,
  type CompletionUsage,
  type ChatCompletionResponse,
  type ChatCompletionDelta,
  type ChatCompletionChunkChoice,
  type ChatCompletionChunk,
} from "./openai.js";

// Provider types
export {
  type ProviderType,
  type ProviderDefinition,
  type ProviderModelCandidate,
  providerSupportsModel,
  getProviderModelId,
} from "./provider.js";

// Configuration types
export {
  type RoutingStrategyType,
  type ProviderConfig,
  type RetryConfig,
  type FreeTierRouterConfig,
  type StateStoreConfig,
  type ResolvedConfig,
  type ResolvedProviderConfig,
  DEFAULT_CONFIG,
  resolveConfig,
} from "./config.js";

// Error types
export {
  FreeTierRouterError,
  AllProvidersExhaustedError,
  RateLimitError,
  ProviderError,
  ModelNotFoundError,
  ConfigurationError,
  TimeoutError,
} from "./errors.js";

// Strategy types
export {
  type RoutingContext,
  type RoutingStrategy,
  type SelectProviderFn,
  type SelectionError,
  type StrategyName,
} from "./strategy.js";

// State store types
export {
  type UsageRecord,
  type CooldownRecord,
  type LatencyRecord,
  type StateStore,
} from "./state.js";

// Re-export Result type from neverthrow for convenience
export { type Result, ok, err } from "neverthrow";
