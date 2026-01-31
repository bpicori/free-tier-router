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
import type {
  ProviderDefinition,
  ProviderModelCandidate,
  ProviderType,
} from "./types/provider.js";
import { providerSupportsModel, getProviderModelId } from "./types/provider.js";
import type { RoutingContext } from "./types/strategy.js";
import type { ModelConfig, QuotaStatus } from "./types/models.js";
import type { StateStore } from "./types/state.js";
import {
  FreeTierRouterConfig,
  ResolvedConfig,
  ResolvedProviderConfig,
  resolveConfig,
} from "./types/config.js";
import {
  AllProvidersExhaustedError,
  RateLimitError,
  ConfigurationError,
} from "./types/errors.js";
import { createMemoryStore } from "./state/memory.js";
import { createRateLimitTracker } from "./rate-limit/tracker.js";
import { estimateChatTokens } from "./rate-limit/tokens.js";
import { createStrategy } from "./strategies/index.js";
import { getProvider } from "./providers/index.js";
import {
  isGenericAlias,
  getGenericAliasConfig,
  normalizeModelName,
} from "./models/aliases.js";

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
 * Provider with configuration metadata
 */
interface ConfiguredProvider {
  definition: ProviderDefinition;
  config: ResolvedProviderConfig;
  client: OpenAI;
}

/**
 * Create a router instance
 *
 * The router provides an OpenAI-compatible interface that routes requests
 * to the best available provider based on:
 * 1. Model availability (which providers support the requested model)
 * 2. Model quality tier (prefer higher quality when multiple options exist)
 * 3. Routing strategy (priority, least-used, etc.)
 * 4. Rate limit status (skip rate-limited providers)
 *
 * @param config - Router configuration
 * @returns Router instance
 *
 * @example
 * ```typescript
 * const router = createRouter({
 *   providers: [
 *     { type: "groq", apiKey: process.env.GROQ_API_KEY! },
 *     { type: "cerebras", apiKey: process.env.CEREBRAS_API_KEY! },
 *   ],
 *   strategy: "least-used",
 * });
 *
 * // OpenAI-compatible usage
 * const response = await router.chat.completions.create({
 *   model: "llama-3.3-70b",
 *   messages: [{ role: "user", content: "Hello!" }],
 * });
 * ```
 */
export const createRouter = (config: FreeTierRouterConfig): Router => {
  const resolved = resolveConfig(config);

  if (resolved.providers.length === 0) {
    throw new ConfigurationError("At least one provider must be configured");
  }

  // Create state store
  const stateStore = createStateStore(config);

  // Create rate limit tracker
  const tracker = createRateLimitTracker({ store: stateStore });

  // Create routing strategy
  const strategy = createStrategy(resolved.strategy);

  // Create provider instances with OpenAI clients
  const providers = createProviders(resolved);

  // Apply custom model aliases from config
  const modelAliases = resolved.modelAliases;

  /**
   * Resolve model name through user aliases and normalization
   */
  const resolveModelName = (model: string): string => {
    // First check user-defined aliases
    if (modelAliases[model]) {
      return modelAliases[model];
    }
    // Then normalize using the model registry
    return normalizeModelName(model);
  };

  /**
   * Find all providers that support a given model
   */
  const findProvidersForModel = (
    modelId: string
  ): Array<{ provider: ConfiguredProvider; model: ModelConfig }> => {
    return providers.reduce<
      Array<{ provider: ConfiguredProvider; model: ModelConfig }>
    >((acc, configuredProvider) => {
      const { definition } = configuredProvider;

      if (providerSupportsModel(definition, modelId)) {
        const providerModelId = getProviderModelId(definition, modelId);
        const modelConfig = definition.models.find(
          (m) => m.id === providerModelId
        );

        if (modelConfig) {
          acc.push({ provider: configuredProvider, model: modelConfig });
        }
      }

      return acc;
    }, []);
  };

  /**
   * Find providers for a generic model alias (e.g., "best-large")
   */
  const findProvidersForGenericAlias = (
    alias: string
  ): Array<{ provider: ConfiguredProvider; model: ModelConfig }> => {
    const aliasConfig = getGenericAliasConfig(alias);
    if (!aliasConfig) {
      return [];
    }

    const results: Array<{ provider: ConfiguredProvider; model: ModelConfig }> =
      [];

    for (const configuredProvider of providers) {
      const { definition } = configuredProvider;

      for (const modelConfig of definition.models) {
        let matches = false;

        // Match by specific tier
        if (aliasConfig.tier !== undefined) {
          matches = modelConfig.qualityTier === aliasConfig.tier;
        }
        // Match by minimum tier
        else if (aliasConfig.minTier !== undefined) {
          matches = modelConfig.qualityTier >= aliasConfig.minTier;
        }

        if (matches) {
          results.push({ provider: configuredProvider, model: modelConfig });
        }
      }
    }

    return results;
  };

  /**
   * Build provider candidates with quota information
   */
  const buildCandidates = async (
    matches: Array<{ provider: ConfiguredProvider; model: ModelConfig }>,
    excludedProviders: Set<string>
  ): Promise<ProviderModelCandidate[]> => {
    const candidates: ProviderModelCandidate[] = [];

    await Promise.all(
      matches.map(async ({ provider: configuredProvider, model }) => {
        const { definition, config: providerConfig } = configuredProvider;

        // Skip excluded providers
        if (excludedProviders.has(definition.name)) {
          return;
        }

        // Check if in cooldown
        if (await tracker.isInCooldown(definition.name, model.id)) {
          return;
        }

        // Get quota status
        const quota = await tracker.getQuotaStatus(
          definition.name,
          model.id,
          model.limits
        );

        // Get latency from state store
        const latencyRecord = await stateStore.getLatency(
          definition.name,
          model.id
        );

        candidates.push({
          provider: definition,
          model,
          quota,
          priority: providerConfig.priority,
          latencyMs: latencyRecord?.averageMs,
          isFreeCredits: providerConfig.isFreeCredits,
        });
      })
    );

    return candidates;
  };

  /**
   * Sort candidates by quality tier (highest first)
   */
  const sortByQualityTier = (
    candidates: ProviderModelCandidate[]
  ): ProviderModelCandidate[] => {
    return [...candidates].sort(
      (a, b) => b.model.qualityTier - a.model.qualityTier
    );
  };

  /**
   * Select a provider/model for a request
   */
  const selectProvider = async (
    model: string,
    context: RoutingContext
  ): Promise<{ provider: ConfiguredProvider; model: ModelConfig } | null> => {
    // Resolve model name
    const resolvedModel = resolveModelName(model);

    // Find matching providers
    let matches: Array<{ provider: ConfiguredProvider; model: ModelConfig }>;

    if (isGenericAlias(resolvedModel)) {
      matches = findProvidersForGenericAlias(resolvedModel);
    } else {
      matches = findProvidersForModel(resolvedModel);
    }

    if (matches.length === 0) {
      return null;
    }

    // Build candidates with quota info
    const candidates = await buildCandidates(
      matches,
      context.excludedProviders
    );

    if (candidates.length === 0) {
      return null;
    }

    // Sort by quality tier
    const sorted = sortByQualityTier(candidates);

    // Apply routing strategy
    const selected = strategy.selectProvider(sorted, context);

    if (!selected) {
      return null;
    }

    // Find the ConfiguredProvider that matches the selected ProviderDefinition
    const configuredProvider = providers.find(
      (p) => p.definition.name === selected.provider.name
    );

    if (!configuredProvider) {
      return null;
    }

    return { provider: configuredProvider, model: selected.model };
  };

  /**
   * Check if an error is a rate limit (429) error
   */
  const isRateLimitError = (
    error: unknown
  ): error is {
    status: number;
    message?: string;
    headers?: Record<string, string>;
  } => {
    if (typeof error !== "object" || error === null) {
      return false;
    }
    const errorObj = error as Record<string, unknown>;
    return errorObj.status === 429;
  };

  /**
   * Parse rate limit error from OpenAI SDK error
   */
  const parseRateLimitError = (error: unknown): RateLimitError | null => {
    if (isRateLimitError(error)) {
      // Try to get Retry-After from headers
      const retryAfter = error.headers?.["retry-after"];
      let resetAt: Date | undefined;
      let retryAfterSeconds: number | undefined;

      if (retryAfter) {
        retryAfterSeconds = parseInt(retryAfter, 10);
        if (!isNaN(retryAfterSeconds)) {
          resetAt = new Date(Date.now() + retryAfterSeconds * 1000);
        }
      }

      return new RateLimitError(
        error.message || "Rate limited",
        resetAt,
        retryAfterSeconds
      );
    }
    return null;
  };

  /**
   * Execute a non-streaming completion request with retry logic
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
    const excludedProviders = new Set<string>();
    let retryCount = 0;
    let lastError: Error | null = null;

    const { maxRetries, initialBackoffMs, maxBackoffMs, backoffMultiplier } =
      resolved.retry;

    while (retryCount <= maxRetries) {
      const context: RoutingContext = {
        request: params as any,
        excludedProviders,
        retryCount,
      };

      // Select provider
      const selected = await selectProvider(params.model, context);

      if (!selected) {
        // No more providers available
        break;
      }

      const { provider, model } = selected;
      const startTime = Date.now();

      try {
        // Estimate tokens for rate limiting check
        const estimatedTokens = estimateChatTokens(
          params.messages.map((m) => ({
            content: typeof m.content === "string" ? (m.content ?? "") : "",
          }))
        );

        // Check if we can make the request
        const canRequest = await tracker.canMakeRequest(
          provider.definition.name,
          model.id,
          model.limits,
          estimatedTokens
        );

        if (!canRequest) {
          excludedProviders.add(provider.definition.name);
          continue;
        }

        // Make the request using OpenAI SDK
        const response = await provider.client.chat.completions.create({
          ...params,
          model: model.id,
          stream: false,
        });

        const latencyMs = Date.now() - startTime;
        const tokensUsed = response.usage?.total_tokens ?? 0;

        // Record usage
        await tracker.recordUsage(
          provider.definition.name,
          model.id,
          tokensUsed
        );

        // Update latency
        await stateStore.updateLatency(
          provider.definition.name,
          model.id,
          latencyMs
        );

        return {
          response,
          provider: provider.definition.name,
          model: model.id,
          latencyMs,
          retryCount,
        };
      } catch (error) {
        lastError = error as Error;

        // Handle rate limit errors
        const rateLimitError = parseRateLimitError(error);
        if (rateLimitError) {
          // Mark provider as rate limited
          await tracker.markRateLimited(
            provider.definition.name,
            model.id,
            rateLimitError.resetAt
          );

          // Exclude and retry immediately
          excludedProviders.add(provider.definition.name);
          retryCount++;
          continue;
        }

        // For other errors, apply backoff and retry
        excludedProviders.add(provider.definition.name);
        retryCount++;

        if (retryCount <= maxRetries) {
          const backoffMs = Math.min(
            initialBackoffMs * Math.pow(backoffMultiplier, retryCount - 1),
            maxBackoffMs
          );
          await sleep(backoffMs);
        }
      }
    }

    // All providers exhausted
    const attemptedProviders = Array.from(excludedProviders) as ProviderType[];
    const allCooldowns = await Promise.all(
      providers.map(async ({ definition }) => {
        for (const model of definition.models) {
          const cooldown = await tracker.getCooldownUntil(
            definition.name,
            model.id
          );
          if (cooldown) return cooldown;
        }
        return null;
      })
    );
    const validCooldowns = allCooldowns.filter((c): c is Date => c !== null);
    const earliestReset =
      validCooldowns.length > 0
        ? new Date(Math.min(...validCooldowns.map((d) => d.getTime())))
        : undefined;

    if (resolved.throwOnExhausted) {
      throw new AllProvidersExhaustedError(attemptedProviders, earliestReset);
    }

    throw lastError ?? new Error("No providers available");
  };

  /**
   * Execute a streaming completion request with retry logic
   */
  const executeStreamingCompletion = async (
    params: Omit<ChatCompletionCreateParamsStreaming, "stream">
  ): Promise<{
    stream: Stream<ChatCompletionChunk>;
    provider: ProviderType;
    model: string;
    retryCount: number;
  }> => {
    const excludedProviders = new Set<string>();
    let retryCount = 0;
    let lastError: Error | null = null;

    const { maxRetries, initialBackoffMs, maxBackoffMs, backoffMultiplier } =
      resolved.retry;

    while (retryCount <= maxRetries) {
      const context: RoutingContext = {
        request: params as any,
        excludedProviders,
        retryCount,
      };

      // Select provider
      const selected = await selectProvider(params.model, context);

      if (!selected) {
        // No more providers available
        break;
      }

      const { provider, model } = selected;
      const startTime = Date.now();

      try {
        // Estimate tokens for rate limiting check
        const estimatedTokens = estimateChatTokens(
          params.messages.map((m) => ({
            content: typeof m.content === "string" ? (m.content ?? "") : "",
          }))
        );

        // Check if we can make the request
        const canRequest = await tracker.canMakeRequest(
          provider.definition.name,
          model.id,
          model.limits,
          estimatedTokens
        );

        if (!canRequest) {
          excludedProviders.add(provider.definition.name);
          continue;
        }

        // Make the streaming request using OpenAI SDK
        const stream = await provider.client.chat.completions.create({
          ...params,
          model: model.id,
          stream: true,
        });

        // Note: Usage tracking for streaming happens via finalMessage() or
        // by the caller consuming the stream. We record a minimum usage here.
        // For proper token counting, use stream_options: { include_usage: true }
        const latencyMs = Date.now() - startTime;
        await stateStore.updateLatency(
          provider.definition.name,
          model.id,
          latencyMs
        );

        // Record at least 1 request
        await tracker.recordUsage(
          provider.definition.name,
          model.id,
          estimatedTokens
        );

        return {
          stream,
          provider: provider.definition.name,
          model: model.id,
          retryCount,
        };
      } catch (error) {
        lastError = error as Error;

        // Handle rate limit errors
        const rateLimitError = parseRateLimitError(error);
        if (rateLimitError) {
          // Mark provider as rate limited
          await tracker.markRateLimited(
            provider.definition.name,
            model.id,
            rateLimitError.resetAt
          );

          // Exclude and retry immediately
          excludedProviders.add(provider.definition.name);
          retryCount++;
          continue;
        }

        // For other errors, apply backoff and retry
        excludedProviders.add(provider.definition.name);
        retryCount++;

        if (retryCount <= maxRetries) {
          const backoffMs = Math.min(
            initialBackoffMs * Math.pow(backoffMultiplier, retryCount - 1),
            maxBackoffMs
          );
          await sleep(backoffMs);
        }
      }
    }

    // All providers exhausted
    const attemptedProviders = Array.from(excludedProviders) as ProviderType[];
    const allCooldowns = await Promise.all(
      providers.map(async ({ definition }) => {
        for (const model of definition.models) {
          const cooldown = await tracker.getCooldownUntil(
            definition.name,
            model.id
          );
          if (cooldown) return cooldown;
        }
        return null;
      })
    );
    const validCooldowns = allCooldowns.filter((c): c is Date => c !== null);
    const earliestReset =
      validCooldowns.length > 0
        ? new Date(Math.min(...validCooldowns.map((d) => d.getTime())))
        : undefined;

    if (resolved.throwOnExhausted) {
      throw new AllProvidersExhaustedError(attemptedProviders, earliestReset);
    }

    throw lastError ?? new Error("No providers available");
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
   * List all available models
   */
  const listModels = (): ModelConfig[] => {
    const models: ModelConfig[] = [];
    const seen = new Set<string>();

    for (const { definition } of providers) {
      for (const model of definition.models) {
        if (!seen.has(model.id)) {
          seen.add(model.id);
          models.push(model);
        }
      }
    }

    return models;
  };

  /**
   * Check if a model is available
   */
  const isModelAvailable = (model: string): boolean => {
    const resolvedModel = resolveModelName(model);

    if (isGenericAlias(resolvedModel)) {
      return findProvidersForGenericAlias(resolvedModel).length > 0;
    }

    return findProvidersForModel(resolvedModel).length > 0;
  };

  /**
   * Get quota status for all provider/model combinations
   */
  const getQuotaStatus = async (): Promise<
    Array<{ provider: ProviderType; model: string; quota: QuotaStatus }>
  > => {
    const results: Array<{
      provider: ProviderType;
      model: string;
      quota: QuotaStatus;
    }> = [];

    await Promise.all(
      providers.map(async ({ definition }) => {
        for (const model of definition.models) {
          const quota = await tracker.getQuotaStatus(
            definition.name,
            model.id,
            model.limits
          );
          results.push({
            provider: definition.name,
            model: model.id,
            quota,
          });
        }
      })
    );

    return results;
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
 * Create provider instances from config
 */
const createProviders = (config: ResolvedConfig): ConfiguredProvider[] => {
  const providers: ConfiguredProvider[] = [];

  for (const providerConfig of config.providers) {
    if (!providerConfig.enabled) continue;

    try {
      const definition = getProvider(providerConfig.type);

      // Create OpenAI client configured for this provider
      const client = new OpenAI({
        apiKey: providerConfig.apiKey,
        baseURL: providerConfig.baseUrl ?? definition.baseUrl,
        timeout: config.timeoutMs,
      });

      providers.push({ definition, config: providerConfig, client });
    } catch {
      // Skip unknown provider types
      continue;
    }
  }

  return providers;
};

/**
 * Sleep utility
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
