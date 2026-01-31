/**
 * Routing Module
 *
 * Provides provider selection and request execution with retry logic.
 */

// Types
export type {
  ConfiguredProvider,
  SelectionDependencies,
  ExecutionDependencies,
  ExecutionResult,
  ProviderMatch,
} from "./types.js";

// Provider selection
export {
  resolveModelName,
  findProvidersForModel,
  findProvidersForGenericAlias,
  buildCandidates,
  sortByQualityTier,
  selectProvider,
} from "./provider-selection.js";

// Error parsing
export { isRateLimitError, parseRateLimitError } from "./errors.js";

// Execution
export type { ExecutionParams, ExecuteCallback, PostExecutionCallbacks } from "./executor.js";
export { executeWithRetry } from "./executor.js";
