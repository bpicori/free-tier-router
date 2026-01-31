import type { StateStore } from "../types/state.js";
import type { RateLimits, QuotaStatus } from "../types/models.js";
import {
  type TimeWindow,
  ALL_WINDOWS,
  WINDOW_DURATION_MS,
  getWindowStart,
  getWindowEnd,
  makeUsageKey,
} from "./windows.js";

/**
 * Rate limit tracker configuration
 */
export interface RateLimitTrackerConfig {
  /** State store for persistence */
  store: StateStore;
  /** Default cooldown duration in ms when no Retry-After header (default: 60000) */
  defaultCooldownMs?: number;
}

/**
 * Rate limit tracker interface
 */
export interface RateLimitTracker {
  /**
   * Record usage after a successful request
   */
  recordUsage: (
    provider: string,
    model: string,
    tokens: number
  ) => Promise<void>;

  /**
   * Get current quota status for a provider/model
   */
  getQuotaStatus: (
    provider: string,
    model: string,
    limits: RateLimits
  ) => Promise<QuotaStatus>;

  /**
   * Check if a request can be made without exceeding limits
   */
  canMakeRequest: (
    provider: string,
    model: string,
    limits: RateLimits,
    estimatedTokens?: number
  ) => Promise<boolean>;

  /**
   * Mark a provider/model as rate limited (after receiving 429)
   */
  markRateLimited: (
    provider: string,
    model: string,
    resetAt?: Date
  ) => Promise<void>;

  /**
   * Check if a provider/model is currently in cooldown
   */
  isInCooldown: (provider: string, model: string) => Promise<boolean>;

  /**
   * Get cooldown expiration time (or null if not in cooldown)
   */
  getCooldownUntil: (provider: string, model: string) => Promise<Date | null>;

  /**
   * Clear cooldown for a provider/model
   */
  clearCooldown: (provider: string, model: string) => Promise<void>;
}

/**
 * Get the limit value for a specific window and metric
 */
const getLimitForWindow = (
  limits: RateLimits,
  window: TimeWindow,
  metric: "requests" | "tokens"
): number | null => {
  const key =
    `${metric}Per${window.charAt(0).toUpperCase()}${window.slice(1)}` as keyof RateLimits;
  const value = limits[key];
  return value ?? null;
};

/**
 * Create a rate limit tracker
 *
 * Tracks API usage across multiple time windows (minute, hour, day) and
 * manages cooldowns when rate limits are hit.
 *
 * ## How it works
 *
 * 1. **Usage tracking**: Records requests and tokens in time-aligned windows
 * 2. **Quota checking**: Compares current usage against configured limits
 * 3. **Cooldown management**: Temporarily blocks providers after 429 responses
 *
 * ## Sliding window algorithm
 *
 * Windows are aligned to clock boundaries (e.g., minute windows start at :00).
 * When a new window starts, the old usage data expires via TTL.
 *
 * @param config - Tracker configuration
 * @returns RateLimitTracker instance
 */
export const createRateLimitTracker = (
  config: RateLimitTrackerConfig
): RateLimitTracker => {
  const { store, defaultCooldownMs = 60_000 } = config;

  const recordUsage = async (
    provider: string,
    model: string,
    tokens: number
  ): Promise<void> => {
    const now = Date.now();

    // Record usage in all time windows
    await Promise.all(
      ALL_WINDOWS.map(async (window) => {
        const key = makeUsageKey(provider, model, window);
        const windowStart = getWindowStart(window, now);
        const ttlMs = WINDOW_DURATION_MS[window];

        await store.incrementUsage(key, 1, tokens, windowStart, ttlMs);
      })
    );
  };

  const getQuotaStatus = async (
    provider: string,
    model: string,
    limits: RateLimits
  ): Promise<QuotaStatus> => {
    const now = Date.now();

    // Get usage for all windows in parallel
    const usagePromises = ALL_WINDOWS.map(async (window) => {
      const key = makeUsageKey(provider, model, window);
      const windowStart = getWindowStart(window, now);
      const usage = await store.getUsage(key);

      // If usage is from a different window, it's stale
      if (!usage || usage.windowStart !== windowStart) {
        return { window, requests: 0, tokens: 0 };
      }

      return { window, requests: usage.requests, tokens: usage.tokens };
    });

    const usageByWindow = await Promise.all(usagePromises);

    // Calculate remaining quota for each window
    const requestsRemaining: QuotaStatus["requestsRemaining"] = {
      minute: null,
      hour: null,
      day: null,
    };
    const tokensRemaining: QuotaStatus["tokensRemaining"] = {
      minute: null,
      hour: null,
      day: null,
    };
    const resetTimes: QuotaStatus["resetTimes"] = {
      minute: null,
      hour: null,
      day: null,
    };

    for (const { window, requests, tokens } of usageByWindow) {
      const requestLimit = getLimitForWindow(limits, window, "requests");
      const tokenLimit = getLimitForWindow(limits, window, "tokens");

      if (requestLimit !== null) {
        requestsRemaining[window] = Math.max(0, requestLimit - requests);
        resetTimes[window] = new Date(getWindowEnd(window, now));
      }

      if (tokenLimit !== null) {
        tokensRemaining[window] = Math.max(0, tokenLimit - tokens);
        if (!resetTimes[window]) {
          resetTimes[window] = new Date(getWindowEnd(window, now));
        }
      }
    }

    // Check for cooldown
    const cooldown = await store.getCooldown(provider, model);
    const cooldownUntil = cooldown ? new Date(cooldown.expiresAt) : undefined;

    return {
      requestsRemaining,
      tokensRemaining,
      resetTimes,
      cooldownUntil,
    };
  };

  const canMakeRequest = async (
    provider: string,
    model: string,
    limits: RateLimits,
    estimatedTokens: number = 0
  ): Promise<boolean> => {
    // Check cooldown first
    if (await isInCooldown(provider, model)) {
      return false;
    }

    const quota = await getQuotaStatus(provider, model, limits);

    // Check request limits
    for (const window of ALL_WINDOWS) {
      const remaining = quota.requestsRemaining[window];
      if (remaining !== null && remaining <= 0) {
        return false;
      }
    }

    // Check token limits if we have an estimate
    if (estimatedTokens > 0) {
      for (const window of ALL_WINDOWS) {
        const remaining = quota.tokensRemaining[window];
        if (remaining !== null && remaining < estimatedTokens) {
          return false;
        }
      }
    }

    return true;
  };

  const markRateLimited = async (
    provider: string,
    model: string,
    resetAt?: Date
  ): Promise<void> => {
    const expiresAt = resetAt?.getTime() ?? Date.now() + defaultCooldownMs;

    await store.setCooldown({
      provider,
      model,
      expiresAt,
    });
  };

  const isInCooldown = async (
    provider: string,
    model: string
  ): Promise<boolean> => {
    const cooldown = await store.getCooldown(provider, model);
    return cooldown !== null;
  };

  const getCooldownUntil = async (
    provider: string,
    model: string
  ): Promise<Date | null> => {
    const cooldown = await store.getCooldown(provider, model);
    return cooldown ? new Date(cooldown.expiresAt) : null;
  };

  const clearCooldown = async (
    provider: string,
    model: string
  ): Promise<void> => {
    await store.removeCooldown(provider, model);
  };

  return {
    recordUsage,
    getQuotaStatus,
    canMakeRequest,
    markRateLimited,
    isInCooldown,
    getCooldownUntil,
    clearCooldown,
  };
};
