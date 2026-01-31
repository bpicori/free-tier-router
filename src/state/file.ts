import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
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
 * Configuration for file-based state store
 */
export interface FileStoreConfig {
  /** Directory to store state files */
  directory: string;
  /** File name for the state file (default: "state.json") */
  filename?: string;
  /** How often to flush to disk in milliseconds (default: 1000) */
  flushIntervalMs?: number;
}

/**
 * Persisted state structure
 */
interface PersistedState {
  usage: Record<string, { record: UsageRecord; expiresAt: number | null }>;
  cooldowns: Record<string, CooldownRecord>;
  latency: Record<string, LatencyRecord>;
  lastUpdated: number;
}

/**
 * Create an empty persisted state
 */
const createEmptyState = (): PersistedState => ({
  usage: {},
  cooldowns: {},
  latency: {},
  lastUpdated: Date.now(),
});

/**
 * Create a file-based state store
 *
 * This store persists data to a JSON file and is suitable for:
 * - Single-process applications that need persistence
 * - Development and testing with state preservation
 * - Low-throughput applications
 *
 * Note: Not suitable for high-concurrency scenarios or multi-process deployments.
 *
 * @param config - Configuration for the file store
 * @returns A StateStore implementation
 */
export const createFileStore = (config: FileStoreConfig): StateStore => {
  const filepath = join(config.directory, config.filename ?? "state.json");
  const flushIntervalMs = config.flushIntervalMs ?? 1000;

  let state: PersistedState = createEmptyState();
  let isDirty = false;
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let isInitialized = false;

  /**
   * Ensure directory exists
   */
  const ensureDirectory = async (): Promise<void> => {
    const dir = dirname(filepath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  };

  /**
   * Load state from file
   */
  const loadState = async (): Promise<void> => {
    if (isInitialized) return;

    await ensureDirectory();

    if (existsSync(filepath)) {
      try {
        const content = await readFile(filepath, "utf-8");
        const loaded = JSON.parse(content) as PersistedState;
        state = {
          usage: loaded.usage ?? {},
          cooldowns: loaded.cooldowns ?? {},
          latency: loaded.latency ?? {},
          lastUpdated: loaded.lastUpdated ?? Date.now(),
        };
      } catch {
        // If file is corrupted, start fresh
        state = createEmptyState();
      }
    }

    isInitialized = true;

    // Start periodic flush
    if (flushIntervalMs > 0) {
      flushTimer = setInterval(() => {
        if (isDirty) {
          flush().catch(() => {
            // Ignore flush errors in background
          });
        }
      }, flushIntervalMs);
    }
  };

  /**
   * Flush state to file
   */
  const flush = async (): Promise<void> => {
    if (!isDirty) return;

    await ensureDirectory();
    state.lastUpdated = Date.now();
    await writeFile(filepath, JSON.stringify(state, null, 2), "utf-8");
    isDirty = false;
  };

  /**
   * Mark state as dirty (needs flush)
   */
  const markDirty = (): void => {
    isDirty = true;
  };

  /**
   * Clean up expired records
   */
  const cleanupExpired = (): void => {
    const now = Date.now();

    // Clean expired usage records
    for (const [key, entry] of Object.entries(state.usage)) {
      if (isExpired(entry.expiresAt)) {
        delete state.usage[key];
        markDirty();
      }
    }

    // Clean expired cooldowns
    for (const [key, record] of Object.entries(state.cooldowns)) {
      if (now > record.expiresAt) {
        delete state.cooldowns[key];
        markDirty();
      }
    }
  };

  const getUsage = async (key: string): Promise<UsageRecord | null> => {
    await loadState();
    const entry = state.usage[key];
    if (!entry) {
      return null;
    }
    if (isExpired(entry.expiresAt)) {
      delete state.usage[key];
      markDirty();
      return null;
    }
    return entry.record;
  };

  const setUsage = async (
    key: string,
    record: UsageRecord,
    ttlMs?: number
  ): Promise<void> => {
    await loadState();
    const expiresAt = ttlMs ? Date.now() + ttlMs : null;
    state.usage[key] = { record, expiresAt };
    markDirty();
  };

  const incrementUsage = async (
    key: string,
    requests: number,
    tokens: number,
    windowStart: number,
    ttlMs: number
  ): Promise<UsageRecord> => {
    await loadState();
    const existing = await getUsage(key);
    const updated = calculateUpdatedUsage(existing, requests, tokens, windowStart);
    await setUsage(key, updated, ttlMs);
    return updated;
  };

  const getCooldown = async (
    provider: string,
    model: string
  ): Promise<CooldownRecord | null> => {
    await loadState();
    const key = makeKey(provider, model);
    const record = state.cooldowns[key];
    if (!record) {
      return null;
    }
    if (Date.now() > record.expiresAt) {
      delete state.cooldowns[key];
      markDirty();
      return null;
    }
    return record;
  };

  const setCooldown = async (record: CooldownRecord): Promise<void> => {
    await loadState();
    const key = makeKey(record.provider, record.model);
    state.cooldowns[key] = record;
    markDirty();
  };

  const removeCooldown = async (
    provider: string,
    model: string
  ): Promise<void> => {
    await loadState();
    const key = makeKey(provider, model);
    delete state.cooldowns[key];
    markDirty();
  };

  const getLatency = async (
    provider: string,
    model: string
  ): Promise<LatencyRecord | null> => {
    await loadState();
    const key = makeKey(provider, model);
    return state.latency[key] ?? null;
  };

  const updateLatency = async (
    provider: string,
    model: string,
    latencyMs: number
  ): Promise<void> => {
    await loadState();
    const key = makeKey(provider, model);
    const existing = state.latency[key] ?? null;
    const updated = calculateUpdatedLatency(existing, provider, model, latencyMs);
    state.latency[key] = updated;
    markDirty();
  };

  const clear = async (): Promise<void> => {
    await loadState();
    state = createEmptyState();
    isDirty = true;
    await flush();

    // Try to remove the file
    try {
      await unlink(filepath);
    } catch {
      // File might not exist, ignore
    }
  };

  const close = async (): Promise<void> => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    cleanupExpired();
    await flush();
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
