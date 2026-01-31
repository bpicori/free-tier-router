/**
 * Usage record stored in the state store
 */
export interface UsageRecord {
  /** Number of requests made */
  requests: number;
  /** Number of tokens used */
  tokens: number;
  /** Timestamp of first usage in this window */
  windowStart: number;
}

/**
 * Cooldown record for rate-limited providers
 */
export interface CooldownRecord {
  /** Provider name */
  provider: string;
  /** Model ID */
  model: string;
  /** When the cooldown expires */
  expiresAt: number;
}

/**
 * Latency record for provider performance tracking
 */
export interface LatencyRecord {
  /** Provider name */
  provider: string;
  /** Model ID */
  model: string;
  /** Rolling average latency in milliseconds */
  averageMs: number;
  /** Number of samples in the average */
  sampleCount: number;
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Interface for state storage
 * Implementations handle persistence of rate limit tracking data
 */
export interface StateStore {
  /**
   * Get a usage record
   * @param key - Unique key for the record (e.g., "provider:model:minute")
   */
  getUsage(key: string): Promise<UsageRecord | null>;

  /**
   * Set a usage record
   * @param key - Unique key for the record
   * @param record - The usage record to store
   * @param ttlMs - Time-to-live in milliseconds (optional)
   */
  setUsage(key: string, record: UsageRecord, ttlMs?: number): Promise<void>;

  /**
   * Increment usage counters atomically
   * @param key - Unique key for the record
   * @param requests - Number of requests to add
   * @param tokens - Number of tokens to add
   * @param windowStart - Start of the current window
   * @param ttlMs - Time-to-live in milliseconds
   * @returns The updated usage record
   */
  incrementUsage(
    key: string,
    requests: number,
    tokens: number,
    windowStart: number,
    ttlMs: number
  ): Promise<UsageRecord>;

  /**
   * Get a cooldown record
   * @param provider - Provider name
   * @param model - Model ID
   */
  getCooldown(provider: string, model: string): Promise<CooldownRecord | null>;

  /**
   * Set a cooldown record
   * @param record - The cooldown record to store
   */
  setCooldown(record: CooldownRecord): Promise<void>;

  /**
   * Remove an expired cooldown
   * @param provider - Provider name
   * @param model - Model ID
   */
  removeCooldown(provider: string, model: string): Promise<void>;

  /**
   * Get latency record for a provider/model
   * @param provider - Provider name
   * @param model - Model ID
   */
  getLatency(provider: string, model: string): Promise<LatencyRecord | null>;

  /**
   * Update latency record with a new sample
   * @param provider - Provider name
   * @param model - Model ID
   * @param latencyMs - New latency sample in milliseconds
   */
  updateLatency(
    provider: string,
    model: string,
    latencyMs: number
  ): Promise<void>;

  /**
   * Clear all stored data (useful for testing)
   */
  clear(): Promise<void>;

  /**
   * Close any connections (for cleanup)
   */
  close(): Promise<void>;
}
