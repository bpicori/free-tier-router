/**
 * Model quality tiers (higher = better capability)
 */
export enum ModelQualityTier {
  /** Small models: 1-8B params (Llama 3.1 8B, Gemma 7B) */
  TIER_1 = 1,
  /** Medium models: 9-35B params (Qwen 32B, Gemma 27B) */
  TIER_2 = 2,
  /** Large models: 36-100B params (Llama 3.3 70B) */
  TIER_3 = 3,
  /** XL models: 100B+ params (Llama 3.1 405B) */
  TIER_4 = 4,
  /** Frontier models: Best reasoning (DeepSeek R1, GPT-4o class) */
  TIER_5 = 5,
}

/**
 * Rate limits for a model/provider combination
 */
export interface RateLimits {
  requestsPerMinute?: number;
  requestsPerHour?: number;
  requestsPerDay?: number;
  tokensPerMinute?: number;
  tokensPerHour?: number;
  tokensPerDay?: number;
}

/**
 * Configuration for a specific model within a provider
 */
export interface ModelConfig {
  /** Model identifier (e.g., "llama-3.3-70b") */
  id: string;
  /** Alternative names for this model */
  aliases?: string[];
  /** Model quality ranking */
  qualityTier: ModelQualityTier;
  /** Rate limits for this model */
  limits: RateLimits;
  /** Optional tags for categorization (e.g., "reasoning", "code", "vision") */
  tags?: string[];
}

/**
 * Quota status for a provider/model combination
 */
export interface QuotaStatus {
  requestsRemaining: {
    minute: number | null;
    hour: number | null;
    day: number | null;
  };
  tokensRemaining: {
    minute: number | null;
    hour: number | null;
    day: number | null;
  };
  resetTimes: {
    minute: Date | null;
    hour: Date | null;
    day: Date | null;
  };
  /** Set when 429 received, provider unavailable until this time */
  cooldownUntil?: Date;
}
