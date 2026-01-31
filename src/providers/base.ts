import type { Provider, ProviderType } from "../types/provider.js";
import type { ModelConfig } from "../types/models.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from "../types/openai.js";
import { postCompletion, postCompletionStream, type HttpClientConfig } from "./http.js";
import { parseSSEStream } from "./stream.js";

/**
 * Base provider configuration
 */
export interface BaseProviderConfig {
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Additional headers */
  headers?: Record<string, string>;
}

/**
 * Provider definition for factory
 */
export interface ProviderDefinition {
  /** Provider type identifier */
  type: ProviderType;
  /** Display name for logs */
  displayName: string;
  /** Base URL for API */
  baseUrl: string;
  /** Available models */
  models: ModelConfig[];
  /** Map canonical model IDs to provider-specific IDs */
  modelMapping: Record<string, string>;
}

/**
 * Create a provider instance from a definition
 *
 * This factory creates a Provider that:
 * - Makes HTTP requests to the provider's API
 * - Parses SSE streams for streaming responses
 * - Maps canonical model names to provider-specific IDs
 *
 * @param definition - Provider definition with models and API config
 * @param config - Runtime config (API key, timeout)
 * @returns Provider instance
 */
export const createProvider = (
  definition: ProviderDefinition,
  config: BaseProviderConfig
): Provider => {
  const { type, displayName, baseUrl, models, modelMapping } = definition;
  const { apiKey, timeoutMs, headers } = config;

  const httpConfig: HttpClientConfig = {
    baseUrl,
    apiKey,
    timeoutMs,
    headers,
  };

  /**
   * Get provider-specific model ID from canonical ID
   */
  const getModelId = (canonicalModelId: string): string | null => {
    // Direct mapping exists
    if (modelMapping[canonicalModelId]) {
      return modelMapping[canonicalModelId];
    }

    // Check if it's already a provider-specific ID
    const providerIds = Object.values(modelMapping);
    if (providerIds.includes(canonicalModelId)) {
      return canonicalModelId;
    }

    // Check model configs for ID or alias match
    for (const model of models) {
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
   * Check if provider supports a model
   */
  const supportsModel = (modelId: string): boolean => {
    return getModelId(modelId) !== null;
  };

  /**
   * Create a non-streaming completion
   */
  const createCompletion = async (
    request: ChatCompletionRequest
  ): Promise<ChatCompletionResponse> => {
    const providerModelId = getModelId(request.model);
    if (!providerModelId) {
      throw new Error(`Model ${request.model} is not supported by ${displayName}`);
    }

    const providerRequest = {
      ...request,
      model: providerModelId,
      stream: false,
    };

    return postCompletion(httpConfig, providerRequest);
  };

  /**
   * Create a streaming completion
   */
  const createCompletionStream = async function* (
    request: ChatCompletionRequest
  ): AsyncIterable<ChatCompletionChunk> {
    const providerModelId = getModelId(request.model);
    if (!providerModelId) {
      throw new Error(`Model ${request.model} is not supported by ${displayName}`);
    }

    const providerRequest = {
      ...request,
      model: providerModelId,
      stream: true,
    };

    const response = await postCompletionStream(httpConfig, providerRequest);
    yield* parseSSEStream(response);
  };

  return {
    name: type,
    displayName,
    models,
    createCompletion,
    createCompletionStream,
    supportsModel,
    getModelId,
  };
};
