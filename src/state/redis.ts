import type {
  StateStore,
  UsageRecord,
  CooldownRecord,
  LatencyRecord,
} from "../types/state.js";
import { calculateUpdatedUsage, calculateUpdatedLatency } from "./utils.js";

/**
 * Redis client interface (compatible with ioredis)
 * Users must provide their own Redis client instance
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: (string | number)[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  quit(): Promise<string>;
}

/**
 * Configuration for Redis-based state store
 */
export interface RedisStoreConfig {
  /** Redis client instance (e.g., from ioredis) */
  client: RedisClient;
  /** Key prefix for all stored data (default: "ftr:") */
  prefix?: string;
}

/**
 * Create keys for different data types
 */
const createKeys = (prefix: string) => ({
  usage: (key: string) => `${prefix}usage:${key}`,
  cooldown: (provider: string, model: string) =>
    `${prefix}cooldown:${provider}:${model}`,
  latency: (provider: string, model: string) =>
    `${prefix}latency:${provider}:${model}`,
});

/**
 * Parse JSON safely
 */
const parseJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

/**
 * Create a Redis-based state store
 *
 * This store persists data to Redis and is suitable for:
 * - Multi-process/distributed deployments
 * - High-availability scenarios
 * - Production environments
 *
 * Requires an external Redis client (e.g., ioredis) to be provided.
 *
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * import { createRedisStore } from 'free-tier-router';
 *
 * const redis = new Redis({ host: 'localhost', port: 6379 });
 * const store = createRedisStore({ client: redis });
 * ```
 *
 * @param config - Configuration with Redis client
 * @returns A StateStore implementation
 */
export const createRedisStore = (config: RedisStoreConfig): StateStore => {
  const { client } = config;
  const prefix = config.prefix ?? "ftr:";
  const keys = createKeys(prefix);

  const getUsage = async (key: string): Promise<UsageRecord | null> => {
    const data = await client.get(keys.usage(key));
    return parseJson<UsageRecord>(data);
  };

  const setUsage = async (
    key: string,
    record: UsageRecord,
    ttlMs?: number
  ): Promise<void> => {
    const redisKey = keys.usage(key);
    const value = JSON.stringify(record);

    if (ttlMs) {
      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await client.set(redisKey, value, "EX", ttlSeconds);
    } else {
      await client.set(redisKey, value);
    }
  };

  const incrementUsage = async (
    key: string,
    requests: number,
    tokens: number,
    windowStart: number,
    ttlMs: number
  ): Promise<UsageRecord> => {
    const existing = await getUsage(key);
    const updated = calculateUpdatedUsage(existing, requests, tokens, windowStart);
    await setUsage(key, updated, ttlMs);
    return updated;
  };

  const getCooldown = async (
    provider: string,
    model: string
  ): Promise<CooldownRecord | null> => {
    const data = await client.get(keys.cooldown(provider, model));
    const record = parseJson<CooldownRecord>(data);

    if (record && Date.now() > record.expiresAt) {
      // Expired, clean up
      await client.del(keys.cooldown(provider, model));
      return null;
    }

    return record;
  };

  const setCooldown = async (record: CooldownRecord): Promise<void> => {
    const redisKey = keys.cooldown(record.provider, record.model);
    const value = JSON.stringify(record);

    // Calculate TTL from expiresAt
    const ttlMs = record.expiresAt - Date.now();
    if (ttlMs > 0) {
      const ttlSeconds = Math.ceil(ttlMs / 1000);
      await client.set(redisKey, value, "EX", ttlSeconds);
    }
  };

  const removeCooldown = async (
    provider: string,
    model: string
  ): Promise<void> => {
    await client.del(keys.cooldown(provider, model));
  };

  const getLatency = async (
    provider: string,
    model: string
  ): Promise<LatencyRecord | null> => {
    const data = await client.get(keys.latency(provider, model));
    return parseJson<LatencyRecord>(data);
  };

  const updateLatency = async (
    provider: string,
    model: string,
    latencyMs: number
  ): Promise<void> => {
    const redisKey = keys.latency(provider, model);
    const existing = await getLatency(provider, model);
    const updated = calculateUpdatedLatency(existing, provider, model, latencyMs);
    await client.set(redisKey, JSON.stringify(updated));
  };

  const clear = async (): Promise<void> => {
    // Find all keys with our prefix and delete them
    const allKeys = await client.keys(`${prefix}*`);
    if (allKeys.length > 0) {
      await client.del(...allKeys);
    }
  };

  const close = async (): Promise<void> => {
    await client.quit();
  };

  return {
    getUsage,
    setUsage,
    incrementUsage,
    getCooldown,
    setCooldown,
    removeCooldown,
    getLatency,
    updateLatency,
    clear,
    close,
  };
};
