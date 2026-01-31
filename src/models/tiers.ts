import { ModelQualityTier } from "../types/models.js";

/**
 * Model tier metadata for categorization
 */
export interface TierInfo {
  tier: ModelQualityTier;
  name: string;
  description: string;
  parameterRange: string;
}

/**
 * Tier information lookup
 */
export const TIER_INFO: Record<ModelQualityTier, TierInfo> = {
  [ModelQualityTier.TIER_1]: {
    tier: ModelQualityTier.TIER_1,
    name: "Small",
    description: "Small models: 1-8B params",
    parameterRange: "1-8B",
  },
  [ModelQualityTier.TIER_2]: {
    tier: ModelQualityTier.TIER_2,
    name: "Medium",
    description: "Medium models: 9-35B params",
    parameterRange: "9-35B",
  },
  [ModelQualityTier.TIER_3]: {
    tier: ModelQualityTier.TIER_3,
    name: "Large",
    description: "Large models: 36-100B params",
    parameterRange: "36-100B",
  },
  [ModelQualityTier.TIER_4]: {
    tier: ModelQualityTier.TIER_4,
    name: "XL",
    description: "XL models: 100B+ params",
    parameterRange: "100B+",
  },
  [ModelQualityTier.TIER_5]: {
    tier: ModelQualityTier.TIER_5,
    name: "Frontier",
    description: "Frontier models: Best reasoning capabilities",
    parameterRange: "Varies",
  },
};

/**
 * Get tier info for a given tier
 */
export function getTierInfo(tier: ModelQualityTier): TierInfo {
  return TIER_INFO[tier];
}

/**
 * Compare two tiers, returns positive if a > b, negative if a < b, 0 if equal
 */
export function compareTiers(
  a: ModelQualityTier,
  b: ModelQualityTier
): number {
  return a - b;
}

/**
 * Check if tier meets minimum requirement
 */
export function meetsTierRequirement(
  tier: ModelQualityTier,
  minimum: ModelQualityTier
): boolean {
  return tier >= minimum;
}

/**
 * Get all tiers at or above a minimum tier
 */
export function getTiersAbove(minimum: ModelQualityTier): ModelQualityTier[] {
  return Object.values(ModelQualityTier)
    .filter((t): t is ModelQualityTier => typeof t === "number")
    .filter((t) => t >= minimum)
    .sort((a, b) => b - a); // Descending order (highest first)
}

/**
 * Get all tiers at or below a maximum tier
 */
export function getTiersBelow(maximum: ModelQualityTier): ModelQualityTier[] {
  return Object.values(ModelQualityTier)
    .filter((t): t is ModelQualityTier => typeof t === "number")
    .filter((t) => t <= maximum)
    .sort((a, b) => b - a); // Descending order (highest first)
}
