/**
 * State Storage Module
 *
 * Provides pluggable persistence for rate limit tracking data.
 * Choose the appropriate store based on your deployment needs:
 *
 * - **MemoryStore**: In-memory, fast, no persistence (default)
 * - **FileStore**: JSON file persistence, single-process only
 * - **RedisStore**: Redis-backed, multi-process/distributed
 */

// Re-export store factories
export { createMemoryStore } from "./memory.js";
export { createFileStore, type FileStoreConfig } from "./file.js";
export { createRedisStore, type RedisStoreConfig, type RedisClient } from "./redis.js";
