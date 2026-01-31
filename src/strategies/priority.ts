import type { RoutingStrategy, RoutingContext } from "../types/strategy.js";
import type { ProviderModelCandidate } from "../types/provider.js";

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
export const createPriorityStrategy = (): RoutingStrategy => {
  return {
    name: "priority",

    selectProvider(
      candidates: ProviderModelCandidate[],
      context: RoutingContext
    ): ProviderModelCandidate | null {
      // Filter out excluded providers
      const available = candidates.filter(
        (c) => !context.excludedProviders.has(c.provider.name)
      );

      if (available.length === 0) {
        return null;
      }

      // Candidates are already sorted by quality tier (highest first)
      // Within the same tier, we want to pick by priority (lowest number = highest priority)
      // Group by quality tier and pick the highest priority within the best tier
      const firstCandidate = available[0];
      if (!firstCandidate) {
        return null;
      }

      const bestTier = firstCandidate.model.qualityTier;

      const sameTierCandidates = available.filter(
        (c) => c.model.qualityTier === bestTier
      );

      // Sort by priority (lower = higher priority)
      const sorted = [...sameTierCandidates].sort(
        (a, b) => a.priority - b.priority
      );

      return sorted[0] ?? null;
    },
  };
};
