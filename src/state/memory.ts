import type {
  StateStore,
  UsageRecord,
  CooldownRecord,
  LatencyRecord,
} from "../types/state.js";
import {
  makeKey,
  isExpired,
  calculateUpdatedUsage,
  calculateUpdatedLatency,
} from "./utils.js";

/**
 * Internal state for the memory store
 */
interface MemoryStoreState {
  usage: Map<string, { record: UsageRecord; expiresAt: number | null }>;
  cooldowns: Map<string, CooldownRecord>;
  latency: Map<string, LatencyRecord>;
}

/**
 * Create an in-memory state store
 *
 * This store keeps all data in memory and is suitable for:
 * - Development and testing
 * - Single-process applications
 * - Short-lived processes where persistence isn't needed
 *
 * Note: Data is lost when the process exits.
 *
 * @returns A StateStore implementation
 */
export const createMemoryStore = (): StateStore => {
  const state: MemoryStoreState = {
    usage: new Map(),
    cooldowns: new Map(),
    latency: new Map(),
  };

  const getUsage = async (key: string): Promise<UsageRecord | null> => {
    const entry = state.usage.get(key);
    if (!entry) {
      return null;
    }
    if (isExpired(entry.expiresAt)) {
      state.usage.delete(key);
      return null;
    }
    return entry.record;
  };

  const setUsage = async (
    key: string,
    record: UsageRecord,
    ttlMs?: number
  ): Promise<void> => {
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    state.usage.set(key, { record, expiresAt });
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
    const key = makeKey(provider, model);
    const record = state.cooldowns.get(key);
    if (!record) {
      return null;
    }
    if (Date.now() > record.expiresAt) {
      state.cooldowns.delete(key);
      return null;
    }
    return record;
  };

  const setCooldown = async (record: CooldownRecord): Promise<void> => {
    const key = makeKey(record.provider, record.model);
    state.cooldowns.set(key, record);
  };

  const removeCooldown = async (
    provider: string,
    model: string
  ): Promise<void> => {
    const key = makeKey(provider, model);
    state.cooldowns.delete(key);
  };

  const getLatency = async (
    provider: string,
    model: string
  ): Promise<LatencyRecord | null> => {
    const key = makeKey(provider, model);
    return state.latency.get(key) ?? null;
  };

  const updateLatency = async (
    provider: string,
    model: string,
    latencyMs: number
  ): Promise<void> => {
    const key = makeKey(provider, model);
    const existing = state.latency.get(key) ?? null;
    const updated = calculateUpdatedLatency(existing, provider, model, latencyMs);
    state.latency.set(key, updated);
  };

  const clear = async (): Promise<void> => {
    state.usage.clear();
    state.cooldowns.clear();
    state.latency.clear();
  };

  const close = async (): Promise<void> => {
    // No-op for memory store
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
