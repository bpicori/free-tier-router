/**
 * free-tier-router (Browser Build)
 *
 * This entry point exports only browser-compatible modules.
 * Use this when bundling for browser environments.
 *
 * Import from "free-tier-router/browser" instead of "free-tier-router"
 */

export const VERSION = "0.1.0";

// Export all types
export * from "./types/index.js";

// Export model registry
export * from "./models/index.js";

// Export only browser-safe state stores (memory only)
export { createMemoryStore } from "./state/memory.js";

// Export rate limit tracking
export * from "./rate-limit/index.js";

// Export providers
export * from "./providers/index.js";

// Export routing strategies
export * from "./strategies/index.js";

// Export main router
export {
  createRouter,
  type Router,
  type CompletionMetadata,
} from "./router.js";

// Export debug utilities
export { setDebugEnabled, isDebugEnabled } from "./utils/debug.js";
