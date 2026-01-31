/**
 * Time window types for rate limiting
 */
export type TimeWindow = "minute" | "hour" | "day";

/**
 * Duration of each time window in milliseconds
 */
export const WINDOW_DURATION_MS: Record<TimeWindow, number> = {
  minute: 60 * 1000,
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
};

/**
 * All time windows in order from smallest to largest
 */
export const ALL_WINDOWS: TimeWindow[] = ["minute", "hour", "day"];

/**
 * Get the start timestamp of the current window
 *
 * Uses floor division to align windows to clock boundaries:
 * - minute windows start at :00 seconds
 * - hour windows start at :00:00
 * - day windows start at 00:00:00 UTC
 *
 * @param window - The time window type
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Start timestamp of the current window
 */
export const getWindowStart = (
  window: TimeWindow,
  now: number = Date.now()
): number => {
  const duration = WINDOW_DURATION_MS[window];
  return Math.floor(now / duration) * duration;
};

/**
 * Get the end timestamp of the current window
 *
 * @param window - The time window type
 * @param now - Current timestamp (defaults to Date.now())
 * @returns End timestamp of the current window
 */
export const getWindowEnd = (
  window: TimeWindow,
  now: number = Date.now()
): number => {
  return getWindowStart(window, now) + WINDOW_DURATION_MS[window];
};

/**
 * Get time remaining until the window resets
 *
 * @param window - The time window type
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Milliseconds until window resets
 */
export const getTimeUntilReset = (
  window: TimeWindow,
  now: number = Date.now()
): number => {
  return getWindowEnd(window, now) - now;
};

/**
 * Create a storage key for a provider/model/window combination
 *
 * @param provider - Provider name
 * @param model - Model ID
 * @param window - Time window type
 * @returns Storage key string
 */
export const makeUsageKey = (
  provider: string,
  model: string,
  window: TimeWindow
): string => `${provider}:${model}:${window}`;
