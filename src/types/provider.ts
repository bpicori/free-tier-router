import type { ModelConfig, QuotaStatus } from "./models.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from "./openai.js";

/**
 * Supported provider types
 */
export type ProviderType = "groq" | "cerebras";

/**
 * Provider interface - all providers must implement this
 */
export interface Provider {
  /** Provider identifier */
  readonly name: ProviderType;
  /** Display name for logging/debugging */
  readonly displayName: string;
  /** Models available from this provider */
  readonly models: ModelConfig[];

  /**
   * Create a chat completion (non-streaming)
   */
  createCompletion(
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse>;

  /**
   * Create a streaming chat completion
   */
  createCompletionStream(
    request: ChatCompletionRequest
  ): AsyncIterable<ChatCompletionChunk>;

  /**
   * Check if this provider supports a specific model
   */
  supportsModel(modelId: string): boolean;

  /**
   * Get the provider-specific model ID for a canonical model name
   */
  getModelId(canonicalModelId: string): string | null;
}

/**
 * Provider with runtime quota information
 * Used by routing strategies to make decisions
 */
export interface ProviderModelCandidate {
  /** The provider instance */
  provider: Provider;
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

/**
 * Result of a completion request with metadata
 */
export interface CompletionResult {
  /** The completion response */
  response: ChatCompletionResponse;
  /** Which provider handled the request */
  provider: ProviderType;
  /** Which model was used */
  model: string;
  /** Request latency in milliseconds */
  latencyMs: number;
  /** Tokens used (from response or estimated) */
  tokensUsed: number;
}

/**
 * Result of a streaming completion with metadata
 */
export interface StreamingCompletionResult {
  /** Async iterable of chunks */
  stream: AsyncIterable<ChatCompletionChunk>;
  /** Which provider handled the request */
  provider: ProviderType;
  /** Which model was used */
  model: string;
}
