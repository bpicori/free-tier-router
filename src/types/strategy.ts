import type { ChatCompletionRequest } from "./openai.js";
import type { ProviderModelCandidate } from "./provider.js";
import type { Result } from "neverthrow";

/**
 * Context provided to routing strategies
 */
export interface RoutingContext {
  /** The original request */
  readonly request: ChatCompletionRequest;
  /** Providers that have already been tried and failed */
  readonly excludedProviders: ReadonlySet<string>;
  /** Number of retry attempts so far */
  readonly retryCount: number;
}

/**
 * Errors that can occur during provider selection
 */
export type SelectionError =
  | "no_candidates"
  | "no_available_provider"
  | "all_providers_excluded";

/**
 * Type for the strategy selection function
 */
export type SelectProviderFn = (
  candidates: readonly ProviderModelCandidate[],
  context: RoutingContext
) => Result<ProviderModelCandidate, SelectionError>;

/**
 * Strategy name type
 */
export type StrategyName = "priority" | "least-used" | "round-robin";

/**
 * Routing strategy definition
 *
 * Strategies determine which provider/model to use for a request.
 * Each strategy implements a selection function that takes candidates
 * and context, returning a Result with either the selected candidate
 * or an error.
 */
export type RoutingStrategy = Readonly<{
  /** Strategy identifier */
  name: StrategyName;
  /**
   * Select the best provider/model candidate for a request
   *
   * @param candidates - Available provider/model combinations, already sorted by quality tier
   * @param context - Routing context with request info and exclusions
   * @returns Result with the selected candidate or an error
   */
  select: SelectProviderFn;
}>;

