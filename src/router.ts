/**
 * Main Router Module
 *
 * Exposes an OpenAI-compatible interface for chat completions with
 * intelligent routing across multiple free-tier providers.
 *
 * Uses the official OpenAI SDK for all API calls, delegating the actual
 * communication to a battle-tested library. This router focuses solely on:
 * - Provider selection based on rate limits
 * - Model-first routing (find best provider for requested model)
 * - Automatic failover on rate limit errors
 */

import OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletion,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";
import type { ProviderType } from "./types/provider.js";
import type { ModelConfig, QuotaStatus } from "./types/models.js";
import type { StateStore } from "./types/state.js";
import {
  FreeTierRouterConfig,
  ResolvedConfig,
  resolveConfig,
} from "./types/config.js";
import { ConfigurationError } from "./types/errors.js";
import { createMemoryStore } from "./state/memory.js";
import { createRateLimitTracker } from "./rate-limit/tracker.js";
import { createStrategy } from "./strategies/index.js";
import { getProvider } from "./providers/index.js";
import { isGenericAlias } from "./models/aliases.js";
import type {
  ConfiguredProvider,
  SelectionDependencies,
  ExecutionDependencies,
} from "./routing/types.js";
import {
  executeWithRetry,
  resolveModelName,
  findProvidersForModel,
  findProvidersForGenericAlias,
} from "./routing/index.js";

/**
 * Result metadata from a completion request
 */
export interface CompletionMetadata {
  /** Provider that handled the request */
  provider: ProviderType;
  /** Model that was used */
  model: string;
  /** Request latency in milliseconds */
  latencyMs: number;
  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Router instance interface
 */
export interface Router {
  /**
   * OpenAI-compatible chat completions API
   */
  chat: {
    completions: {
      create(
        params: ChatCompletionCreateParamsNonStreaming
      ): Promise<ChatCompletion>;
      create(
        params: ChatCompletionCreateParamsStreaming
      ): Promise<Stream<ChatCompletionChunk>>;
      create(
        params:
          | ChatCompletionCreateParamsNonStreaming
          | ChatCompletionCreateParamsStreaming
      ): Promise<ChatCompletion | Stream<ChatCompletionChunk>>;
    };
  };

  /**
   * Get completion with metadata about which provider was used
   */
  createCompletion(
    params: ChatCompletionCreateParamsNonStreaming
  ): Promise<{ response: ChatCompletion; metadata: CompletionMetadata }>;

  /**
   * Create streaming completion with metadata
   */
  createCompletionStream(
    params: Omit<ChatCompletionCreateParamsStreaming, "stream">
  ): Promise<{
    stream: Stream<ChatCompletionChunk>;
    metadata: Omit<CompletionMetadata, "latencyMs">;
  }>;

  /**
   * List available models across all providers
   */
  listModels(): ModelConfig[];

  /**
   * Check if a specific model is available
   */
  isModelAvailable(model: string): boolean;

  /**
   * Get current quota status for all providers
   */
  getQuotaStatus(): Promise<
    Array<{
      provider: ProviderType;
      model: string;
      quota: QuotaStatus;
    }>
  >;

  /**
   * Close the router and release resources
   */
  close(): Promise<void>;
}

/**
 * Create a router instance with OpenAI-compatible interface.
 * See knowledge/router.md for detailed documentation.
 */
export const createRouter = (config: FreeTierRouterConfig): Router => {
  const resolved = resolveConfig(config);

  if (resolved.providers.length === 0) {
    throw new ConfigurationError("At least one provider must be configured");
  }

  // Create dependencies
  const stateStore = createStateStore(config);
  const tracker = createRateLimitTracker({ store: stateStore });
  const strategy = createStrategy(resolved.strategy);
  const providers = createProviders(resolved);

  // Build selection dependencies
  const selectionDeps: SelectionDependencies = {
    providers,
    tracker,
    stateStore,
    strategy,
    modelAliases: resolved.modelAliases,
  };

  // Build execution dependencies
  const executionDeps: ExecutionDependencies = {
    selection: selectionDeps,
    retry: resolved.retry,
    throwOnExhausted: resolved.throwOnExhausted,
  };

  /**
   * Execute a non-streaming completion
   */
  const executeCompletion = async (
    params: ChatCompletionCreateParamsNonStreaming
  ): Promise<{
    response: ChatCompletion;
    provider: ProviderType;
    model: string;
    latencyMs: number;
    retryCount: number;
  }> => {
    const result = await executeWithRetry<ChatCompletion>(
      {
        model: params.model,
        messages: params.messages.map((m) => ({
          content: typeof m.content === "string" ? m.content : "",
        })),
      },
      async (provider, model) => {
        const response = await provider.client.chat.completions.create({
          ...params,
          model: model.id,
          stream: false,
        });
        return response;
      },
      executionDeps,
      {
        onSuccess: async (provider, model, _latencyMs, response) => {
          // Record token usage after successful completion
          const tokensUsed =
            (response as ChatCompletion).usage?.total_tokens ?? 0;
          await tracker.recordUsage(
            provider.definition.name,
            model.id,
            tokensUsed
          );
        },
      }
    );

    return {
      response: result.response,
      provider: result.providerName as ProviderType,
      model: result.modelId,
      latencyMs: result.latencyMs,
      retryCount: result.retryCount,
    };
  };

  /**
   * Execute a streaming completion
   */
  const executeStreamingCompletion = async (
    params: Omit<ChatCompletionCreateParamsStreaming, "stream">
  ): Promise<{
    stream: Stream<ChatCompletionChunk>;
    provider: ProviderType;
    model: string;
    retryCount: number;
  }> => {
    const result = await executeWithRetry<Stream<ChatCompletionChunk>>(
      {
        model: params.model,
        messages: params.messages.map((m) => ({
          content: typeof m.content === "string" ? m.content : "",
        })),
      },
      async (provider, model) => {
        const stream = await provider.client.chat.completions.create({
          ...params,
          model: model.id,
          stream: true,
        });
        return stream;
      },
      executionDeps,
      {
        onSuccess: async (provider, model) => {
          // For streaming, we estimate tokens since we don't have usage info yet
          // The caller can track actual usage from stream consumption
          const estimatedTokens = params.messages.reduce((acc, m) => {
            const content = typeof m.content === "string" ? m.content : "";
            return acc + Math.ceil(content.length / 4);
          }, 0);
          await tracker.recordUsage(
            provider.definition.name,
            model.id,
            estimatedTokens
          );
        },
      }
    );

    return {
      stream: result.response,
      provider: result.providerName as ProviderType,
      model: result.modelId,
      retryCount: result.retryCount,
    };
  };

  /**
   * Create completion with metadata
   */
  const createCompletion = async (
    params: ChatCompletionCreateParamsNonStreaming
  ): Promise<{ response: ChatCompletion; metadata: CompletionMetadata }> => {
    const result = await executeCompletion(params);

    return {
      response: result.response,
      metadata: {
        provider: result.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        retryCount: result.retryCount,
      },
    };
  };

  /**
   * Create streaming completion with metadata
   */
  const createCompletionStream = async (
    params: Omit<ChatCompletionCreateParamsStreaming, "stream">
  ): Promise<{
    stream: Stream<ChatCompletionChunk>;
    metadata: Omit<CompletionMetadata, "latencyMs">;
  }> => {
    const result = await executeStreamingCompletion(params);

    return {
      stream: result.stream,
      metadata: {
        provider: result.provider,
        model: result.model,
        retryCount: result.retryCount,
      },
    };
  };

  /**
   * List all available models (deduplicated by ID)
   */
  const listModels = (): ModelConfig[] => {
    const allModels = providers.flatMap(({ definition }) => definition.models);

    // Deduplicate by model ID, keeping first occurrence
    const seen = new Set<string>();
    return allModels.filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
  };

  /**
   * Check if a model is available
   */
  const isModelAvailable = (model: string): boolean => {
    const resolvedModel = resolveModelName(model, resolved.modelAliases);

    if (isGenericAlias(resolvedModel)) {
      return findProvidersForGenericAlias(resolvedModel, providers).length > 0;
    }

    return findProvidersForModel(resolvedModel, providers).length > 0;
  };

  /**
   * Get quota status for all provider/model combinations
   */
  const getQuotaStatus = async (): Promise<
    Array<{ provider: ProviderType; model: string; quota: QuotaStatus }>
  > => {
    // Build all provider/model pairs
    const pairs = providers.flatMap(({ definition }) =>
      definition.models.map((model) => ({
        definition,
        model,
      }))
    );

    // Fetch quota status for all pairs in parallel
    return Promise.all(
      pairs.map(async ({ definition, model }) => ({
        provider: definition.name,
        model: model.id,
        quota: await tracker.getQuotaStatus(
          definition.name,
          model.id,
          model.limits
        ),
      }))
    );
  };

  /**
   * Close the router
   */
  const close = async (): Promise<void> => {
    await stateStore.close();
  };

  // Build OpenAI-compatible interface
  const chat = {
    completions: {
      create: async (
        params:
          | ChatCompletionCreateParamsNonStreaming
          | ChatCompletionCreateParamsStreaming
      ): Promise<ChatCompletion | Stream<ChatCompletionChunk>> => {
        if ("stream" in params && params.stream) {
          const { stream } = await executeStreamingCompletion(params);
          return stream;
        }
        const result = await executeCompletion(
          params as ChatCompletionCreateParamsNonStreaming
        );
        return result.response;
      },
    },
  };

  return {
    chat: chat as Router["chat"],
    createCompletion,
    createCompletionStream,
    listModels,
    isModelAvailable,
    getQuotaStatus,
    close,
  };
};

/**
 * Create state store from config
 */
const createStateStore = (config: FreeTierRouterConfig): StateStore => {
  const storeConfig = config.stateStore;

  if (!storeConfig) {
    return createMemoryStore();
  }

  switch (storeConfig.type) {
    case "memory":
      return createMemoryStore();
    case "file":
      // Dynamic import would be needed for file store
      // For now, fall back to memory store
      return createMemoryStore();
    case "redis":
      // Dynamic import would be needed for redis store
      // For now, fall back to memory store
      return createMemoryStore();
    default:
      return createMemoryStore();
  }
};

/**
 * Try to create a single provider instance
 * Returns null if creation fails (e.g., unknown provider type)
 */
const tryCreateProvider = (
  providerConfig: ResolvedConfig["providers"][number],
  timeoutMs: number
): ConfiguredProvider | null => {
  try {
    const definition = getProvider(providerConfig.type);

    // Create OpenAI client configured for this provider
    const client = new OpenAI({
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseUrl ?? definition.baseUrl,
      timeout: timeoutMs,
    });

    return { definition, config: providerConfig, client };
  } catch {
    // Skip unknown provider types
    return null;
  }
};

/**
 * Create provider instances from config
 */
const createProviders = (config: ResolvedConfig): ConfiguredProvider[] =>
  config.providers
    .filter((providerConfig) => providerConfig.enabled)
    .map((providerConfig) => tryCreateProvider(providerConfig, config.timeoutMs))
    .filter((provider): provider is ConfiguredProvider => provider !== null);
