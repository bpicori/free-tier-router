/**
 * Request Execution Module
 *
 * Handles request execution with retry logic, rate limit handling,
 * and provider failover. Provides a generic execution function that
 * works for both streaming and non-streaming completions.
 */

import type { ProviderType } from "../types/provider.js";
import type { RoutingContext } from "../types/strategy.js";
import type { ModelConfig } from "../types/models.js";
import { AllProvidersExhaustedError } from "../types/errors.js";
import { estimateChatTokens } from "../rate-limit/tokens.js";
import { selectProvider } from "./provider-selection.js";
import { parseRateLimitError } from "./errors.js";
import type {
  ConfiguredProvider,
  ExecutionDependencies,
  ExecutionResult,
} from "./types.js";

/**
 * Sleep utility for backoff delays
 */
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parameters for request execution
 */
export interface ExecutionParams {
  /** The requested model name */
  model: string;
  /** Messages to estimate tokens from */
  messages: Array<{ content?: string | null }>;
}

/**
 * Callback to execute the actual API request
 */
export type ExecuteCallback<T> = (
  provider: ConfiguredProvider,
  model: ModelConfig
) => Promise<T>;

/**
 * Callback for post-execution actions (e.g., recording usage)
 */
export interface PostExecutionCallbacks {
  /** Called after successful execution with latency */
  onSuccess?: (
    provider: ConfiguredProvider,
    model: ModelConfig,
    latencyMs: number,
    response: unknown
  ) => Promise<void>;
}

/**
 * Execute a request with retry logic and provider failover
 *
 * This function handles the common retry logic for both streaming
 * and non-streaming completions:
 *
 * 1. Select a provider using the routing strategy
 * 2. Check if request can be made (rate limits)
 * 3. Execute the request via the provided callback
 * 4. Handle errors with appropriate retry/failover logic
 * 5. Track usage and latency
 *
 * @param params - Execution parameters (model, messages for token estimation)
 * @param execute - Callback to execute the actual API request
 * @param deps - Execution dependencies
 * @param callbacks - Optional post-execution callbacks
 * @returns Execution result with response and metadata
 */
export const executeWithRetry = async <T>(
  params: ExecutionParams,
  execute: ExecuteCallback<T>,
  deps: ExecutionDependencies,
  callbacks?: PostExecutionCallbacks
): Promise<ExecutionResult<T>> => {
  const { selection, retry, throwOnExhausted } = deps;
  const { tracker, providers, stateStore } = selection;
  const { maxRetries, initialBackoffMs, maxBackoffMs, backoffMultiplier } = retry;

  const excludedProviders = new Set<string>();
  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount <= maxRetries) {
    const context: RoutingContext = {
      request: params as any,
      excludedProviders,
      retryCount,
    };

    // Select provider
    const selectionResult = await selectProvider(params.model, context, selection);

    if (selectionResult.isErr()) {
      // No more providers available
      break;
    }

    const { provider, model } = selectionResult.value;
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

      // Execute the request via callback
      const response = await execute(provider, model);

      const latencyMs = Date.now() - startTime;

      // Update latency
      await stateStore.updateLatency(
        provider.definition.name,
        model.id,
        latencyMs
      );

      // Call success callback if provided
      if (callbacks?.onSuccess) {
        await callbacks.onSuccess(provider, model, latencyMs, response);
      }

      return {
        response,
        providerName: provider.definition.name,
        modelId: model.id,
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

  // All providers exhausted - gather cooldown information
  const attemptedProviders = Array.from(excludedProviders) as ProviderType[];
  const earliestReset = await findEarliestReset(providers, tracker);

  if (throwOnExhausted) {
    throw new AllProvidersExhaustedError(attemptedProviders, earliestReset);
  }

  throw lastError ?? new Error("No providers available");
};

/**
 * Find the earliest reset time across all providers
 */
const findEarliestReset = async (
  providers: ConfiguredProvider[],
  tracker: ExecutionDependencies["selection"]["tracker"]
): Promise<Date | undefined> => {
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
  
  return validCooldowns.length > 0
    ? new Date(Math.min(...validCooldowns.map((d) => d.getTime())))
    : undefined;
};
