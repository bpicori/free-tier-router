import type {
  RoutingStrategy,
  RoutingContext,
  SelectionError,
} from "../types/strategy.js";
import type { ProviderModelCandidate } from "../types/provider.js";
import { ok, err, type Result } from "neverthrow";

/**
 * Select provider using priority strategy
 *
 * Pure function that implements the priority selection logic:
 * 1. Filter out excluded providers
 * 2. Among remaining candidates in the best tier, select by priority
 */
const selectByPriority = (
  candidates: readonly ProviderModelCandidate[],
  context: RoutingContext
): Result<ProviderModelCandidate, SelectionError> => {
  // Filter out excluded providers
  const available = candidates.filter(
    (c) => !context.excludedProviders.has(c.provider.name)
  );

  if (available.length === 0) {
    return err(
      candidates.length === 0 ? "no_candidates" : "all_providers_excluded"
    );
  }

  // Candidates are already sorted by quality tier (highest first)
  // Within the same tier, we want to pick by priority (lowest number = highest priority)
  const firstCandidate = available[0];
  if (!firstCandidate) {
    return err("no_available_provider");
  }

  const bestTier = firstCandidate.model.qualityTier;

  const sameTierCandidates = available.filter(
    (c) => c.model.qualityTier === bestTier
  );

  // Sort by priority (lower = higher priority)
  const sorted = [...sameTierCandidates].sort(
    (a, b) => a.priority - b.priority
  );

  const selected = sorted[0];
  return selected ? ok(selected) : err("no_available_provider");
};

/**
 * Priority Fallback routing strategy
 *
 * Routes requests to providers in configured priority order.
 * Within the same quality tier (candidates are pre-sorted by tier),
 * selects the provider with the lowest priority number (highest priority).
 *
 * This is the recommended default strategy for predictable behavior
 * when you have preferred providers.
 *
 * @example
 * ```typescript
 * const strategy = createPriorityStrategy();
 * // With priorities: Groq=1, Cerebras=2, OpenRouter=3
 * // Will always try Groq first, then Cerebras, then OpenRouter
 * ```
 */
export const createPriorityStrategy = (): RoutingStrategy => ({
  name: "priority",
  select: selectByPriority,
});
