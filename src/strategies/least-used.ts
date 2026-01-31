import type {
  RoutingStrategy,
  RoutingContext,
  SelectionError,
} from "../types/strategy.js";
import type { ProviderModelCandidate } from "../types/provider.js";
import type { QuotaStatus, RateLimits } from "../types/models.js";
import { ok, err, type Result } from "neverthrow";

/**
 * Calculate percentage remaining for a single limit window
 * Returns null if limit or remaining is not defined
 */
const calculatePercentage = (
  remaining: number | null,
  limit: number | undefined
): number | null =>
  limit !== undefined && remaining !== null ? remaining / limit : null;

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
  limits: RateLimits
): number => {
  const { requestsRemaining, tokensRemaining } = quota;

  const percentages = [
    calculatePercentage(requestsRemaining.minute, limits.requestsPerMinute),
    calculatePercentage(requestsRemaining.hour, limits.requestsPerHour),
    calculatePercentage(requestsRemaining.day, limits.requestsPerDay),
    calculatePercentage(tokensRemaining.minute, limits.tokensPerMinute),
    calculatePercentage(tokensRemaining.hour, limits.tokensPerHour),
    calculatePercentage(tokensRemaining.day, limits.tokensPerDay),
  ].filter((p): p is number => p !== null);

  // If no limits are configured, treat as fully available
  return percentages.length === 0 ? 1 : Math.min(...percentages);
};

/**
 * Select provider using least-used strategy
 *
 * Pure function that implements the least-used selection logic:
 * 1. Filter out excluded providers
 * 2. Among remaining candidates in the best tier, select by availability score
 */
const selectByLeastUsed = (
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
  // Within the same tier, we want to pick the one with highest availability
  const firstCandidate = available[0];
  if (!firstCandidate) {
    return err("no_available_provider");
  }

  const bestTier = firstCandidate.model.qualityTier;

  const sameTierCandidates = available.filter(
    (c) => c.model.qualityTier === bestTier
  );

  // Calculate availability scores and sort by highest
  const withScores = sameTierCandidates.map((candidate) => ({
    candidate,
    score: calculateAvailabilityScore(candidate.quota, candidate.model.limits),
  }));

  // Sort by score descending (highest availability first)
  // On tie, use priority as tiebreaker
  const sorted = [...withScores].sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.001) {
      return scoreDiff;
    }
    // Tiebreaker: lower priority number = higher priority
    return a.candidate.priority - b.candidate.priority;
  });

  const selected = sorted[0]?.candidate;
  return selected ? ok(selected) : err("no_available_provider");
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
export const createLeastUsedStrategy = (): RoutingStrategy => ({
  name: "least-used",
  select: selectByLeastUsed,
});
