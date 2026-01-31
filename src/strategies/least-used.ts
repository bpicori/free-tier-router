import type { RoutingStrategy, RoutingContext } from "../types/strategy.js";
import type { ProviderModelCandidate } from "../types/provider.js";
import type { QuotaStatus } from "../types/models.js";

/**
 * Calculate a normalized "availability score" from quota status
 *
 * Higher score = more quota available = better choice
 * Returns a value between 0 and 1 representing the overall availability
 *
 * The score is calculated by taking the minimum remaining percentage
 * across all rate limit windows (minute, hour, day) for both requests and tokens.
 * This ensures we don't pick a provider that's close to hitting ANY limit.
 */
const calculateAvailabilityScore = (
  quota: QuotaStatus,
  limits: {
    requestsPerMinute?: number;
    requestsPerHour?: number;
    requestsPerDay?: number;
    tokensPerMinute?: number;
    tokensPerHour?: number;
    tokensPerDay?: number;
  }
): number => {
  const percentages: number[] = [];

  // Calculate request percentages for each window
  if (
    limits.requestsPerMinute !== undefined &&
    quota.requestsRemaining.minute !== null
  ) {
    percentages.push(quota.requestsRemaining.minute / limits.requestsPerMinute);
  }
  if (
    limits.requestsPerHour !== undefined &&
    quota.requestsRemaining.hour !== null
  ) {
    percentages.push(quota.requestsRemaining.hour / limits.requestsPerHour);
  }
  if (
    limits.requestsPerDay !== undefined &&
    quota.requestsRemaining.day !== null
  ) {
    percentages.push(quota.requestsRemaining.day / limits.requestsPerDay);
  }

  // Calculate token percentages for each window
  if (
    limits.tokensPerMinute !== undefined &&
    quota.tokensRemaining.minute !== null
  ) {
    percentages.push(quota.tokensRemaining.minute / limits.tokensPerMinute);
  }
  if (
    limits.tokensPerHour !== undefined &&
    quota.tokensRemaining.hour !== null
  ) {
    percentages.push(quota.tokensRemaining.hour / limits.tokensPerHour);
  }
  if (limits.tokensPerDay !== undefined && quota.tokensRemaining.day !== null) {
    percentages.push(quota.tokensRemaining.day / limits.tokensPerDay);
  }

  // If no limits are configured, treat as fully available
  if (percentages.length === 0) {
    return 1;
  }

  // Return the minimum percentage (most constrained limit)
  return Math.min(...percentages);
};

/**
 * Least Used routing strategy
 *
 * Routes requests to the provider with the highest remaining quota.
 * This maximizes the time before any provider is exhausted.
 *
 * Within the same quality tier (candidates are pre-sorted by tier),
 * selects the provider with the highest availability score.
 *
 * @example
 * ```typescript
 * const strategy = createLeastUsedStrategy();
 * // Groq: 80% quota remaining
 * // Cerebras: 40% quota remaining
 * // → Routes to Groq (highest remaining)
 * ```
 */
export const createLeastUsedStrategy = (): RoutingStrategy => {
  return {
    name: "least-used",

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
      // Within the same tier, we want to pick the one with highest availability
      const firstCandidate = available[0];
      if (!firstCandidate) {
        return null;
      }

      const bestTier = firstCandidate.model.qualityTier;

      const sameTierCandidates = available.filter(
        (c) => c.model.qualityTier === bestTier
      );

      // Calculate availability scores and sort by highest
      const withScores = sameTierCandidates.map((candidate) => ({
        candidate,
        score: calculateAvailabilityScore(
          candidate.quota,
          candidate.model.limits
        ),
      }));

      // Sort by score descending (highest availability first)
      // On tie, use priority as tiebreaker
      withScores.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (Math.abs(scoreDiff) > 0.001) {
          return scoreDiff;
        }
        // Tiebreaker: lower priority number = higher priority
        return a.candidate.priority - b.candidate.priority;
      });

      return withScores[0]?.candidate ?? null;
    },
  };
};
