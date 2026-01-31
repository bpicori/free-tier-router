/**
 * Configuration Loader
 *
 * Loads and validates YAML configuration files for models and providers.
 */

import { parse } from "yaml";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { RateLimits } from "../types/models.js";
import type {
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

// ============================================================================
// Path Resolution
// ============================================================================

/**
 * Get the config directory path
 */
const getConfigDir = (): string => {
  // In ESM, we need to derive __dirname from import.meta.url
  const currentFile = fileURLToPath(import.meta.url);
  const srcDir = dirname(dirname(currentFile));
  const rootDir = dirname(srcDir);
  return join(rootDir, "config");
};

// ============================================================================
// YAML Parsing
// ============================================================================

/**
 * Parse a YAML file
 */
const parseYamlFile = <T>(filePath: string): T => {
  const content = readFileSync(filePath, "utf-8");
  return parse(content) as T;
};

// ============================================================================
// Conversion Functions (YAML -> Runtime types)
// ============================================================================

/**
 * Convert snake_case rate limits to camelCase
 */
const convertRateLimits = (yaml: RateLimitsYaml): RateLimits => ({
  requestsPerMinute: yaml.requests_per_minute,
  requestsPerHour: yaml.requests_per_hour,
  requestsPerDay: yaml.requests_per_day,
  tokensPerMinute: yaml.tokens_per_minute,
  tokensPerHour: yaml.tokens_per_hour,
  tokensPerDay: yaml.tokens_per_day,
});

/**
 * Merge rate limits (model-specific overrides default)
 */
const mergeRateLimits = (
  defaults: RateLimits,
  overrides?: RateLimitsYaml
): RateLimits => {
  if (!overrides) return defaults;
  return { ...defaults, ...convertRateLimits(overrides) };
};

/**
 * Convert models config from YAML to runtime format
 */
const convertModelsConfig = (yaml: ModelsConfigYaml): ModelsConfig => ({
  models: yaml.models.map(
    (m): ModelDefinition => ({
      id: m.id,
      tier: m.tier,
      family: m.family,
      aliases: m.aliases ?? [],
    })
  ),
  genericAliases: Object.fromEntries(
    Object.entries(yaml.generic_aliases).map(
      ([key, value]): [string, GenericAliasConfig] => [
        key,
        {
          tier: value.tier,
          minTier: value.min_tier,
        },
      ]
    )
  ),
});

/**
 * Convert provider config from YAML to runtime format
 */
const convertProviderConfig = (yaml: ProviderConfigYaml): ProviderConfig => {
  const defaultLimits = convertRateLimits(yaml.defaults.limits);

  return {
    name: yaml.name,
    displayName: yaml.display_name,
    baseUrl: yaml.base_url,
    defaultLimits,
    models: yaml.models.map(
      (m): ProviderModel => ({
        canonical: m.canonical,
        id: m.id,
        limits: mergeRateLimits(defaultLimits, m.limits),
      })
    ),
  };
};

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation error
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

/**
 * Validate that provider models reference canonical models
 */
const validateProviderModels = (
  provider: ProviderConfig,
  canonicalIds: Set<string>
): void => {
  for (const model of provider.models) {
    if (!canonicalIds.has(model.canonical)) {
      throw new ConfigValidationError(
        `Provider "${provider.name}" references unknown model "${model.canonical}". ` +
          `Add it to config/models.yml first.`
      );
    }
  }
};

/**
 * Validate tier values are in range
 */
const validateTiers = (config: ModelsConfig): void => {
  for (const model of config.models) {
    if (model.tier < 1 || model.tier > 5) {
      throw new ConfigValidationError(
        `Model "${model.id}" has invalid tier ${model.tier}. Must be 1-5.`
      );
    }
  }

  for (const [alias, cfg] of Object.entries(config.genericAliases)) {
    if (cfg.tier !== undefined && (cfg.tier < 1 || cfg.tier > 5)) {
      throw new ConfigValidationError(
        `Generic alias "${alias}" has invalid tier ${cfg.tier}. Must be 1-5.`
      );
    }
    if (cfg.minTier !== undefined && (cfg.minTier < 1 || cfg.minTier > 5)) {
      throw new ConfigValidationError(
        `Generic alias "${alias}" has invalid min_tier ${cfg.minTier}. Must be 1-5.`
      );
    }
  }
};

// ============================================================================
// Loader Functions
// ============================================================================

/**
 * Load models configuration from config/models.yml
 */
export const loadModelsConfig = (configDir?: string): ModelsConfig => {
  const dir = configDir ?? getConfigDir();
  const filePath = join(dir, "models.yml");
  const yaml = parseYamlFile<ModelsConfigYaml>(filePath);
  const config = convertModelsConfig(yaml);
  validateTiers(config);
  return config;
};

/**
 * Load a single provider configuration
 */
export const loadProviderConfig = (
  providerName: string,
  configDir?: string
): ProviderConfig => {
  const dir = configDir ?? getConfigDir();
  const filePath = join(dir, "providers", `${providerName}.yml`);
  const yaml = parseYamlFile<ProviderConfigYaml>(filePath);
  return convertProviderConfig(yaml);
};

/**
 * Load all provider configurations from config/providers/
 */
export const loadAllProviderConfigs = (
  configDir?: string
): Map<string, ProviderConfig> => {
  const dir = configDir ?? getConfigDir();
  const providersDir = join(dir, "providers");
  const files = readdirSync(providersDir).filter((f) => f.endsWith(".yml"));

  const providers = new Map<string, ProviderConfig>();

  for (const file of files) {
    const filePath = join(providersDir, file);
    const yaml = parseYamlFile<ProviderConfigYaml>(filePath);
    const config = convertProviderConfig(yaml);
    providers.set(config.name, config);
  }

  return providers;
};

/**
 * Load complete configuration (models + all providers)
 */
export const loadConfig = (configDir?: string): LoadedConfig => {
  const models = loadModelsConfig(configDir);
  const providers = loadAllProviderConfigs(configDir);

  // Validate provider models reference canonical models
  const canonicalIds = new Set(models.models.map((m) => m.id));
  for (const provider of providers.values()) {
    validateProviderModels(provider, canonicalIds);
  }

  return { models, providers };
};

// ============================================================================
// Cached Config (singleton)
// ============================================================================

let cachedConfig: LoadedConfig | null = null;

/**
 * Get the loaded configuration (cached)
 */
export const getConfig = (): LoadedConfig => {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
};

/**
 * Reset cached configuration (for testing)
 */
export const resetConfigCache = (): void => {
  cachedConfig = null;
};
