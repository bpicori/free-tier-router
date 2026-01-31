/**
 * Configuration Module
 *
 * Exports configuration types and loader functions.
 */

// Schema types
export type {
  ModelsConfigYaml,
  ProviderConfigYaml,
  RateLimitsYaml,
  ModelsConfig,
  ProviderConfig,
  ModelDefinition,
  GenericAliasConfig,
  ProviderModel,
  LoadedConfig,
} from "./schema.js";

// Loader functions
export {
  loadModelsConfig,
  loadProviderConfig,
  loadAllProviderConfigs,
  loadConfig,
  getConfig,
  resetConfigCache,
  ConfigValidationError,
} from "./loader.js";
