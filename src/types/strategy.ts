import type { ChatCompletionRequest } from "./openai.js";
import type { ProviderModelCandidate } from "./provider.js";

/**
 * Context provided to routing strategies
 */
export interface RoutingContext {
  /** The original request */
  request: ChatCompletionRequest;
  /** Providers that have already been tried and failed */
  excludedProviders: Set<string>;
  /** Number of retry attempts so far */
  retryCount: number;
}

/**
 * Interface for routing strategies
 * Strategies determine which provider/model to use for a request
 */
export interface RoutingStrategy {
  /** Strategy identifier */
  readonly name: string;

  /**
   * Select the best provider/model candidate for a request
   *
   * @param candidates - Available provider/model combinations, already sorted by quality tier
   * @param context - Routing context with request info and exclusions
   * @returns The selected candidate, or null if no suitable candidate
   */
  selectProvider(
    candidates: ProviderModelCandidate[],
    context: RoutingContext
  ): ProviderModelCandidate | null;
}
