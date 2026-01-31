// Re-export strategy interface from types
export type {
  RoutingStrategy,
  RoutingContext,
  SelectProviderFn,
  SelectionError,
  StrategyName,
} from "../types/strategy.js";

// Strategy implementations
export { createPriorityStrategy } from "./priority.js";
export { createLeastUsedStrategy } from "./least-used.js";

import type { RoutingStrategy } from "../types/strategy.js";
import type { RoutingStrategyType } from "../types/config.js";
import { createPriorityStrategy } from "./priority.js";
import { createLeastUsedStrategy } from "./least-used.js";

/**
 * Create a routing strategy from a strategy type name
 *
 * @param type - Strategy type identifier
 * @returns The routing strategy instance
 * @throws Error if strategy type is not supported
 */
export const createStrategy = (type: RoutingStrategyType): RoutingStrategy => {
  switch (type) {
    case "priority":
      return createPriorityStrategy();
    case "least-used":
      return createLeastUsedStrategy();
    default:
      throw new Error(`Unknown routing strategy: ${type}`);
  }
};

/**
 * Available strategy types
 */
export const AVAILABLE_STRATEGIES: RoutingStrategyType[] = [
  "priority",
  "least-used",
];
