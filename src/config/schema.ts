/**
 * Configuration Schema Types
 *
 * TypeScript types representing the YAML configuration structure.
 * These types are used for parsing and validating config files.
 */

// ============================================================================
// Models Config (models.yml)
// ============================================================================

/**
 * Raw model definition from models.yml
 */
export interface ModelConfigYaml {
  /** Canonical model identifier */
  id: string;
  /** Quality tier (1-5) */
  tier: number;
  /** Model family (e.g., "llama", "qwen") */
  family: string;
  /** Alternative names users can request */
  aliases?: string[];
}

/**
 * Generic alias configuration from models.yml
 */
export interface GenericAliasConfigYaml {
  /** Exact tier match */
  tier?: number;
  /** Minimum tier (inclusive) */
  min_tier?: number;
}

/**
 * Root structure of models.yml
 */
export interface ModelsConfigYaml {
  /** Canonical model definitions */
  models: ModelConfigYaml[];
  /** Generic aliases (e.g., "best-large" -> tier 3) */
  generic_aliases: Record<string, GenericAliasConfigYaml>;
}

// ============================================================================
// Provider Config (providers/*.yml)
// ============================================================================

/**
 * Rate limits in YAML (snake_case)
 */
export interface RateLimitsYaml {
  requests_per_minute?: number;
  requests_per_hour?: number;
  requests_per_day?: number;
  tokens_per_minute?: number;
  tokens_per_hour?: number;
  tokens_per_day?: number;
}

/**
 * Default configuration for a provider
 */
export interface ProviderDefaultsYaml {
  limits: RateLimitsYaml;
}

/**
 * Model mapping in provider config
 */
export interface ProviderModelYaml {
  /** Canonical model ID (from models.yml) */
  canonical: string;
  /** Provider-specific model ID */
  id: string;
  /** Optional limit overrides */
  limits?: RateLimitsYaml;
}

/**
 * Root structure of providers/*.yml
 */
export interface ProviderConfigYaml {
  /** Provider identifier (e.g., "groq") */
  name: string;
  /** Human-readable name */
  display_name: string;
  /** Base URL for API */
  base_url: string;
  /** Default rate limits */
  defaults: ProviderDefaultsYaml;
  /** Model mappings */
  models: ProviderModelYaml[];
}

// ============================================================================
// Loaded Config (after parsing and conversion)
// ============================================================================

import type { RateLimits } from "../types/models.js";

/**
 * Parsed model definition (camelCase, typed tier)
 */
export interface ModelDefinition {
  id: string;
  tier: number;
  family: string;
  aliases: string[];
}

/**
 * Parsed generic alias config
 */
export interface GenericAliasConfig {
  tier?: number;
  minTier?: number;
}

/**
 * Parsed models config
 */
export interface ModelsConfig {
  models: ModelDefinition[];
  genericAliases: Record<string, GenericAliasConfig>;
}

/**
 * Parsed provider model entry
 */
export interface ProviderModel {
  canonical: string;
  id: string;
  limits: RateLimits;
}

/**
 * Parsed provider config
 */
export interface ProviderConfig {
  name: string;
  displayName: string;
  baseUrl: string;
  defaultLimits: RateLimits;
  models: ProviderModel[];
}

/**
 * Complete loaded configuration
 */
export interface LoadedConfig {
  models: ModelsConfig;
  providers: Map<string, ProviderConfig>;
}
