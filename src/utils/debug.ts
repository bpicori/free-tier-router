/**
 * Debug Logger Utility
 *
 * Provides conditional logging for the router.
 * Logs are only output when debug mode is enabled.
 */

/**
 * Debug logger interface
 */
export interface DebugLogger {
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

/**
 * No-op logger that discards all messages
 */
const noopLogger: DebugLogger = {
  log: () => {},
  error: () => {},
  warn: () => {},
};

/**
 * Active logger that outputs to console with [Router] prefix
 */
const activeLogger: DebugLogger = {
  log: (...args) => console.log("[Router]", ...args),
  error: (...args) => console.error("[Router]", ...args),
  warn: (...args) => console.warn("[Router]", ...args),
};

/**
 * Global debug state
 */
let globalDebugEnabled = false;

/**
 * Set global debug state
 */
export const setDebugEnabled = (enabled: boolean): void => {
  globalDebugEnabled = enabled;
};

/**
 * Check if debug is enabled
 */
export const isDebugEnabled = (): boolean => globalDebugEnabled;

/**
 * Get the appropriate logger based on debug state
 */
export const getLogger = (): DebugLogger =>
  globalDebugEnabled ? activeLogger : noopLogger;

/**
 * Convenience function for debug logging
 */
export const debug = {
  log: (...args: unknown[]): void => {
    if (globalDebugEnabled) {
      console.log("[Router]", ...args);
    }
  },
  error: (...args: unknown[]): void => {
    if (globalDebugEnabled) {
      console.error("[Router]", ...args);
    }
  },
  warn: (...args: unknown[]): void => {
    if (globalDebugEnabled) {
      console.warn("[Router]", ...args);
    }
  },
};
