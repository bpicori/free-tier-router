/**
 * Model Tiers
 *
 * Quality tier comparison functions.
 * Tiers are numbered 1-5 (higher = better capability).
 */

/** All valid tier values */
const ALL_TIERS = [1, 2, 3, 4, 5] as const;

/**
 * Compare two tiers, returns positive if a > b, negative if a < b, 0 if equal
 */
export const compareTiers = (a: number, b: number): number => a - b;

/**
 * Get all tiers at or above a minimum tier (descending order)
 */
export const getTiersAbove = (minimum: number): number[] =>
  ALL_TIERS.filter((t) => t >= minimum).sort((a, b) => b - a);
