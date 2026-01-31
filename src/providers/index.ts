/**
 * Providers Module
 *
 * Factory functions and utilities for creating LLM provider instances.
 */

// Re-export base provider factory
export {
  createProvider,
  type BaseProviderConfig,
  type ProviderDefinition,
} from "./base.js";

// Re-export HTTP utilities
export {
  postCompletion,
  postCompletionStream,
  type HttpClientConfig,
  type RateLimitInfo,
} from "./http.js";

// Re-export streaming utilities
export {
  parseSSEStream,
  collectStreamContent,
  getStreamTokenUsage,
  wrapStreamWithCallback,
} from "./stream.js";

// Re-export concrete providers
export {
  createGroqProvider,
  getGroqModels,
  groqSupportsModel,
  GROQ_DEFINITION,
} from "./groq.js";

export {
  createCerebrasProvider,
  getCerebrasModels,
  cerebrasSupportsModel,
  CEREBRAS_DEFINITION,
} from "./cerebras.js";
