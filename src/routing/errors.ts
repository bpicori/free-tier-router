/**
 * Error Parsing Utilities
 *
 * Functions for detecting and parsing rate limit errors from provider responses.
 */

import { RateLimitError } from "../types/errors.js";

/**
 * Shape of an error with rate limit information
 */
interface RateLimitErrorShape {
  status: number;
  message?: string;
  headers?: Record<string, string>;
}

/**
 * Check if an error is a rate limit (429) error
 *
 * @param error - The error to check
 * @returns True if the error indicates rate limiting
 */
export const isRateLimitError = (
  error: unknown
): error is RateLimitErrorShape => {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const errorObj = error as Record<string, unknown>;
  return errorObj.status === 429;
};

/**
 * Parse a rate limit error from an OpenAI SDK error
 *
 * Extracts reset time from Retry-After header if available.
 *
 * @param error - The error to parse
 * @returns RateLimitError if the error is a rate limit error, null otherwise
 */
export const parseRateLimitError = (error: unknown): RateLimitError | null => {
  if (!isRateLimitError(error)) {
    return null;
  }

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
};
