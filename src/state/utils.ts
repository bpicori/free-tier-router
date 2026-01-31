import type { UsageRecord, LatencyRecord } from "../types/state.js";

/**
 * Configuration for latency averaging
 */
export interface LatencyConfig {
  /** Weight given to previous average (0-1). Default: 0.8 */
  decay: number;
  /** Maximum samples to track. Default: 100 */
  maxSamples: number;
}

const DEFAULT_LATENCY_CONFIG: LatencyConfig = {
  decay: 0.8,
  maxSamples: 100,
};

/**
 * Create a composite key from provider and model
 */
export const makeKey = (provider: string, model: string): string =>
  `${provider}:${model}`;

/**
 * Check if a timestamp has expired
 */
export const isExpired = (expiresAt: number | null): boolean =>
  expiresAt !== null && Date.now() > expiresAt;

/**
 * Calculate updated usage record
 *
 * If the existing record is from a different time window, starts fresh.
 * Otherwise, increments the counters.
 *
 * @param existing - Existing usage record (or null if none)
 * @param requests - Number of requests to add
 * @param tokens - Number of tokens to add
 * @param windowStart - Start timestamp of the current window
 * @returns Updated usage record
 */
export const calculateUpdatedUsage = (
  existing: UsageRecord | null,
  requests: number,
  tokens: number,
  windowStart: number
): UsageRecord => {
  const shouldReset = !existing || existing.windowStart !== windowStart;

  return shouldReset
    ? { requests, tokens, windowStart }
    : {
        requests: existing.requests + requests,
        tokens: existing.tokens + tokens,
        windowStart: existing.windowStart,
      };
};

/**
 * Calculate updated latency record using Exponential Moving Average (EMA)
 *
 * ## Why EMA instead of simple average?
 *
 * | Approach          | Storage      | Adapts to changes? | Complexity |
 * |-------------------|--------------|--------------------| -----------|
 * | Simple average    | sum + count  | No (all-time avg)  | Simple     |
 * | Rolling window    | Array of N   | Yes                | Complex    |
 * | EMA (this)        | 1 number     | Yes                | Simple     |
 *
 * EMA is the best tradeoff: minimal storage, adapts to recent changes.
 *
 * ## The Formula
 *
 * ```
 * newAverage = (oldAverage × decay) + (newSample × (1 - decay))
 * ```
 *
 * With decay = 0.8:
 * - 80% of the new average comes from history
 * - 20% comes from the latest sample
 *
 * ## Example: Tracking latency over 5 requests
 *
 * Samples: 100ms, 120ms, 90ms, 500ms (spike!), 110ms
 *
 * | Request | Sample | Calculation                    | New Average |
 * |---------|--------|--------------------------------|-------------|
 * | 1       | 100ms  | (first sample)                 | 100ms       |
 * | 2       | 120ms  | 100 × 0.8 + 120 × 0.2 = 80+24  | 104ms       |
 * | 3       | 90ms   | 104 × 0.8 + 90 × 0.2 = 83+18   | 101ms       |
 * | 4       | 500ms  | 101 × 0.8 + 500 × 0.2 = 81+100 | 181ms       |
 * | 5       | 110ms  | 181 × 0.8 + 110 × 0.2 = 145+22 | 167ms       |
 *
 * Notice: The 500ms spike raised the average, but didn't dominate it.
 * After another normal sample, it's already recovering toward the true average.
 *
 * @param existing - Existing latency record (or null if none)
 * @param provider - Provider name
 * @param model - Model ID
 * @param latencyMs - New latency sample in milliseconds
 * @param config - Optional configuration (decay=0.8 means 80% history, 20% new)
 * @returns Updated latency record
 */
export const calculateUpdatedLatency = (
  existing: LatencyRecord | null,
  provider: string,
  model: string,
  latencyMs: number,
  config: LatencyConfig = DEFAULT_LATENCY_CONFIG
): LatencyRecord => {
  const { decay, maxSamples } = config;

  // First sample - just use the raw value as the starting average
  if (!existing) {
    return {
      provider,
      model,
      averageMs: latencyMs,
      sampleCount: 1,
      updatedAt: Date.now(),
    };
  }

  // EMA: newAverage = oldAverage × decay + newSample × (1 - decay)
  const newAverage = existing.averageMs * decay + latencyMs * (1 - decay);

  return {
    provider,
    model,
    averageMs: newAverage,
    sampleCount: Math.min(existing.sampleCount + 1, maxSamples),
    updatedAt: Date.now(),
  };
};
