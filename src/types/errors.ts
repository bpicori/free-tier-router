import type { ProviderType } from "./provider.js";

/**
 * Base error class for free-tier-router errors
 */
export class FreeTierRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FreeTierRouterError";
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Error thrown when all providers are exhausted (rate limited)
 */
export class AllProvidersExhaustedError extends FreeTierRouterError {
  /** Providers that were attempted */
  readonly attemptedProviders: ProviderType[];
  /** Earliest time when a provider might become available */
  readonly earliestResetTime?: Date;

  constructor(
    attemptedProviders: ProviderType[],
    earliestResetTime?: Date
  ) {
    const resetMsg = earliestResetTime
      ? ` Earliest reset: ${earliestResetTime.toISOString()}`
      : "";
    super(
      `All providers exhausted. Attempted: ${attemptedProviders.join(", ")}.${resetMsg}`
    );
    this.name = "AllProvidersExhaustedError";
    this.attemptedProviders = attemptedProviders;
    this.earliestResetTime = earliestResetTime;
  }
}

/**
 * Error thrown when a provider returns a rate limit error (429)
 */
export class RateLimitError extends FreeTierRouterError {
  /** Provider that returned the rate limit */
  readonly provider: ProviderType;
  /** Model that was rate limited */
  readonly model: string;
  /** Time when the rate limit resets (from Retry-After header) */
  readonly resetAt?: Date;
  /** Raw Retry-After header value */
  readonly retryAfter?: string;

  constructor(
    provider: ProviderType,
    model: string,
    resetAt?: Date,
    retryAfter?: string
  ) {
    const resetMsg = resetAt ? ` Resets at: ${resetAt.toISOString()}` : "";
    super(`Rate limited by ${provider} for model ${model}.${resetMsg}`);
    this.name = "RateLimitError";
    this.provider = provider;
    this.model = model;
    this.resetAt = resetAt;
    this.retryAfter = retryAfter;
  }
}

/**
 * Error thrown when a provider returns an API error
 */
export class ProviderError extends FreeTierRouterError {
  /** Provider that returned the error */
  readonly provider: ProviderType;
  /** HTTP status code */
  readonly statusCode: number;
  /** Raw error response from provider */
  readonly rawError?: unknown;

  constructor(
    provider: ProviderType,
    statusCode: number,
    message: string,
    rawError?: unknown
  ) {
    super(`Provider ${provider} error (${statusCode}): ${message}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.statusCode = statusCode;
    this.rawError = rawError;
  }
}

/**
 * Error thrown when no provider supports the requested model
 */
export class ModelNotFoundError extends FreeTierRouterError {
  /** The model that was requested */
  readonly model: string;
  /** Available models that could be used instead */
  readonly availableModels?: string[];

  constructor(model: string, availableModels?: string[]) {
    const suggestion = availableModels?.length
      ? ` Available: ${availableModels.slice(0, 5).join(", ")}${availableModels.length > 5 ? "..." : ""}`
      : "";
    super(`Model "${model}" not found.${suggestion}`);
    this.name = "ModelNotFoundError";
    this.model = model;
    this.availableModels = availableModels;
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends FreeTierRouterError {
  constructor(message: string) {
    super(`Configuration error: ${message}`);
    this.name = "ConfigurationError";
  }
}

/**
 * Error thrown when a request times out
 */
export class TimeoutError extends FreeTierRouterError {
  /** Provider that timed out */
  readonly provider: ProviderType;
  /** Timeout duration in milliseconds */
  readonly timeoutMs: number;

  constructor(provider: ProviderType, timeoutMs: number) {
    super(`Request to ${provider} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.provider = provider;
    this.timeoutMs = timeoutMs;
  }
}
