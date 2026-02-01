/**
 * Configuration Loader
 *
 * Loads configuration from bundled TypeScript (generated from YAML at build time).
 * This approach works in all environments: Node.js, browser, Cloudflare Workers.
 *
 * To update configuration:
 * 1. Edit config/models.yml or config/providers/*.yml
 * 2. Run: npm run build:config
 * 3. Commit the regenerated src/config/bundled.ts
 */

import { BUNDLED_MODELS, BUNDLED_PROVIDERS } from "./bundled.js";
import type { RateLimits } from "../types/models.js";
import type {
  RateLimitsYaml,
  ModelsConfig,
  ProviderConfig,
  ModelDefinition,
  GenericAliasConfig,
  ProviderModel,
  LoadedConfig,
  ModelsConfigYaml,
  ProviderConfigYaml,
} from "./schema.js";

// ============================================================================
// Conversion Functions (YAML format -> Runtime types)
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
 * Convert models config from YAML format to runtime format
 */
const convertModelsConfig = (yaml: ModelsConfigYaml): ModelsConfig => ({
  definitions: yaml.models.map(
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
 * Convert provider config from YAML format to runtime format
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
  for (const model of config.definitions) {
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
// Loader Functions (from bundled config)
// ============================================================================

/**
 * Load models configuration from bundled config
 */
export const loadModelsConfig = (): ModelsConfig => {
  const config = convertModelsConfig(BUNDLED_MODELS);
  validateTiers(config);
  return config;
};

/**
 * Load a single provider configuration from bundled config
 */
export const loadProviderConfig = (providerName: string): ProviderConfig => {
  const yaml = BUNDLED_PROVIDERS[providerName];
  if (!yaml) {
    throw new ConfigValidationError(
      `Provider "${providerName}" not found in bundled config.`
    );
  }
  return convertProviderConfig(yaml);
};

/**
 * Load all provider configurations from bundled config
 */
export const loadAllProviderConfigs = (): Map<string, ProviderConfig> => {
  const providers = new Map<string, ProviderConfig>();

  for (const [name, yaml] of Object.entries(BUNDLED_PROVIDERS)) {
    const config = convertProviderConfig(yaml);
    providers.set(name, config);
  }

  return providers;
};

/**
 * Load complete configuration (models + all providers)
 */
export const loadConfig = (): LoadedConfig => {
  const models = loadModelsConfig();
  const providers = loadAllProviderConfigs();

  // Validate provider models reference canonical models
  const canonicalIds = new Set(models.definitions.map((m) => m.id));
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
