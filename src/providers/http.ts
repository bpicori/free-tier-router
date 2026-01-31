import type { ChatCompletionRequest, ChatCompletionResponse } from "../types/openai.js";
import { RateLimitError, ProviderError } from "../types/errors.js";

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  /** Base URL for the API */
  baseUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Additional headers to include */
  headers?: Record<string, string>;
}

/**
 * Response from a rate-limited request
 */
export interface RateLimitInfo {
  /** When the rate limit resets */
  resetAt?: Date;
  /** Retry-After header value in seconds */
  retryAfterSeconds?: number;
}

/**
 * Parse Retry-After header value
 */
const parseRetryAfter = (value: string | null): number | undefined => {
  if (!value) return undefined;

  // Try parsing as seconds
  const seconds = parseInt(value, 10);
  if (!isNaN(seconds)) return seconds;

  // Try parsing as HTTP date
  const date = new Date(value);
  if (!isNaN(date.getTime())) {
    const secondsUntil = Math.ceil((date.getTime() - Date.now()) / 1000);
    return Math.max(0, secondsUntil);
  }

  return undefined;
};

/**
 * Extract rate limit info from response headers
 */
const extractRateLimitInfo = (headers: Headers): RateLimitInfo => {
  const retryAfter = parseRetryAfter(headers.get("Retry-After"));
  const resetAt = retryAfter ? new Date(Date.now() + retryAfter * 1000) : undefined;

  return { resetAt, retryAfterSeconds: retryAfter };
};

/**
 * Create headers for API request
 */
const createHeaders = (
  apiKey: string,
  extraHeaders?: Record<string, string>,
  isStreaming = false
): Record<string, string> => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiKey}`,
  Accept: isStreaming ? "text/event-stream" : "application/json",
  ...extraHeaders,
});

/**
 * Make a non-streaming chat completion request
 */
export const postCompletion = async (
  config: HttpClientConfig,
  request: ChatCompletionRequest
): Promise<ChatCompletionResponse> => {
  const { baseUrl, apiKey, timeoutMs = 30_000, headers: extraHeaders } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: createHeaders(apiKey, extraHeaders, false),
      body: JSON.stringify({ ...request, stream: false }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      const rateLimitInfo = extractRateLimitInfo(response.headers);
      throw new RateLimitError(
        "Rate limit exceeded",
        rateLimitInfo.resetAt,
        rateLimitInfo.retryAfterSeconds
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new ProviderError(
        `API request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return (await response.json()) as ChatCompletionResponse;
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof ProviderError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("Request timeout", 408);
    }

    throw new ProviderError(
      `Network error: ${error instanceof Error ? error.message : "Unknown"}`,
      0
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Make a streaming chat completion request
 * Returns the raw Response for SSE processing
 */
export const postCompletionStream = async (
  config: HttpClientConfig,
  request: ChatCompletionRequest
): Promise<Response> => {
  const { baseUrl, apiKey, timeoutMs = 120_000, headers: extraHeaders } = config;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: createHeaders(apiKey, extraHeaders, true),
      body: JSON.stringify({ ...request, stream: true }),
      signal: controller.signal,
    });

    // Don't clear timeout here - let stream handle its own timeout
    clearTimeout(timeoutId);

    if (response.status === 429) {
      const rateLimitInfo = extractRateLimitInfo(response.headers);
      throw new RateLimitError(
        "Rate limit exceeded",
        rateLimitInfo.resetAt,
        rateLimitInfo.retryAfterSeconds
      );
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new ProviderError(
        `API request failed: ${response.status} ${response.statusText}`,
        response.status,
        errorBody
      );
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof RateLimitError || error instanceof ProviderError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("Request timeout", 408);
    }

    throw new ProviderError(
      `Network error: ${error instanceof Error ? error.message : "Unknown"}`,
      0
    );
  }
};
