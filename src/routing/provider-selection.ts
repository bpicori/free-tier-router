/**
 * Provider Selection Module
 *
 * Pure functions for selecting the best provider/model combination
 * based on model availability, quality tiers, and routing strategy.
 */

import type { ProviderModelCandidate } from "../types/provider.js";
import {
  providerSupportsModel,
  getProviderModelId,
} from "../types/provider.js";
import type { RoutingContext, SelectionError } from "../types/strategy.js";
import { ok, err, type Result } from "neverthrow";
import {
  isGenericAlias,
  getGenericAliasConfig,
  normalizeModelName,
} from "../models/model-definitions.js";
import type {
  ConfiguredProvider,
  SelectionDependencies,
  ProviderMatch,
} from "./types.js";
import { debug } from "../utils/debug.js";

/**
 * Resolve a model name through user aliases and normalization
 *
 * @param model - The model name to resolve
 * @param aliases - User-defined model aliases
 * @returns The resolved model name
 */
export const resolveModelName = (
  model: string,
  aliases: Record<string, string>
): string => {
  // First check user-defined aliases
  if (aliases[model]) {
    return aliases[model];
  }
  // Then normalize using the model registry
  return normalizeModelName(model);
};

/**
 * Find all providers that support a given model
 *
 * @param modelId - The model ID to find providers for
 * @param providers - Available configured providers
 * @returns Array of matching provider/model pairs
 */
export const findProvidersForModel = (
  modelId: string,
  providers: ConfiguredProvider[]
): ProviderMatch[] => {
  debug.log(
    `findProvidersForModel: checking ${providers.length} providers for model "${modelId}"`
  );
  providers.forEach(({ definition }) => {
    debug.log(`  Provider ${definition.name}:`, {
      models: definition.models.map((m) => m.id),
      modelMapping: Object.keys(definition.modelMapping),
    });
  });

  return providers
    .filter(({ definition }) => providerSupportsModel(definition, modelId))
    .flatMap((configuredProvider) => {
      const { definition } = configuredProvider;
      const providerModelId = getProviderModelId(definition, modelId);
      const modelConfig = definition.models.find(
        (m) => m.id === providerModelId
      );

      return modelConfig
        ? [{ provider: configuredProvider, model: modelConfig }]
        : [];
    });
};

/**
 * Check if a model matches the alias configuration
 */
const matchesAliasConfig = (
  modelConfig: { qualityTier: number },
  aliasConfig: { tier?: number; minTier?: number }
): boolean => {
  if (aliasConfig.tier !== undefined) {
    return modelConfig.qualityTier === aliasConfig.tier;
  }
  if (aliasConfig.minTier !== undefined) {
    return modelConfig.qualityTier >= aliasConfig.minTier;
  }
  return false;
};

/**
 * Find providers for a generic model alias (e.g., "best-large")
 *
 * @param alias - The generic alias to find providers for
 * @param providers - Available configured providers
 * @returns Array of matching provider/model pairs
 */
export const findProvidersForGenericAlias = (
  alias: string,
  providers: ConfiguredProvider[]
): ProviderMatch[] => {
  const aliasConfig = getGenericAliasConfig(alias);
  if (!aliasConfig) {
    return [];
  }

  return providers.flatMap((configuredProvider) =>
    configuredProvider.definition.models
      .filter((modelConfig) => matchesAliasConfig(modelConfig, aliasConfig))
      .map((model) => ({ provider: configuredProvider, model }))
  );
};

/**
 * Build a single candidate with quota information
 * Returns null if the provider should be skipped
 */
const buildCandidate = async (
  match: ProviderMatch,
  excludedProviders: ReadonlySet<string>,
  deps: Pick<SelectionDependencies, "tracker" | "stateStore">
): Promise<ProviderModelCandidate | null> => {
  const { tracker, stateStore } = deps;
  const { provider: configuredProvider, model } = match;
  const { definition, config: providerConfig } = configuredProvider;

  // Skip excluded providers
  if (excludedProviders.has(definition.name)) {
    debug.log(`Skipping ${definition.name}/${model.id}: excluded`);
    return null;
  }

  // Check if in cooldown
  if (await tracker.isInCooldown(definition.name, model.id)) {
    const cooldownUntil = await tracker.getCooldownUntil(
      definition.name,
      model.id
    );
    debug.log(
      `Skipping ${definition.name}/${model.id}: in cooldown until ${cooldownUntil?.toISOString()}`
    );
    return null;
  }

  // Get quota status and latency in parallel
  const [quota, latencyRecord] = await Promise.all([
    tracker.getQuotaStatus(definition.name, model.id, model.limits),
    stateStore.getLatency(definition.name, model.id),
  ]);

  return {
    provider: definition,
    model,
    quota,
    priority: providerConfig.priority,
    latencyMs: latencyRecord?.averageMs,
    isFreeCredits: providerConfig.isFreeCredits,
  };
};

/**
 * Build provider candidates with quota information
 *
 * @param matches - Provider/model matches to build candidates from
 * @param excludedProviders - Providers to exclude from consideration
 * @param deps - Selection dependencies (tracker, stateStore)
 * @returns Array of provider candidates with quota info
 */
export const buildCandidates = async (
  matches: ProviderMatch[],
  excludedProviders: ReadonlySet<string>,
  deps: Pick<SelectionDependencies, "tracker" | "stateStore">
): Promise<ProviderModelCandidate[]> => {
  const results = await Promise.all(
    matches.map((match) => buildCandidate(match, excludedProviders, deps))
  );

  return results.filter(
    (candidate): candidate is ProviderModelCandidate => candidate !== null
  );
};

/**
 * Sort candidates by quality tier (highest first)
 *
 * @param candidates - Candidates to sort
 * @returns New array sorted by quality tier descending
 */
export const sortByQualityTier = (
  candidates: ProviderModelCandidate[]
): ProviderModelCandidate[] => {
  return [...candidates].sort(
    (a, b) => b.model.qualityTier - a.model.qualityTier
  );
};

/**
 * Selection errors with more context
 */
export type ProviderSelectionError =
  | { type: "no_matching_providers"; model: string }
  | { type: "no_available_candidates"; model: string }
  | { type: "strategy_error"; error: SelectionError }
  | { type: "provider_not_found"; providerName: string };

/**
 * Select a provider/model for a request
 *
 * This is the main selection function that orchestrates:
 * 1. Model name resolution (aliases, normalization)
 * 2. Provider matching (which providers support the model)
 * 3. Candidate building (quota status, latency)
 * 4. Quality sorting (prefer higher quality models)
 * 5. Strategy application (priority, least-used, etc.)
 *
 * @param model - The requested model name
 * @param context - Routing context with exclusions and retry count
 * @param deps - Selection dependencies
 * @returns Result with selected provider/model or error
 */
export const selectProvider = async (
  model: string,
  context: RoutingContext,
  deps: SelectionDependencies
): Promise<Result<ProviderMatch, ProviderSelectionError>> => {
  const { providers, tracker, stateStore, strategy, modelAliases } = deps;

  // Resolve model name
  const resolvedModel = resolveModelName(model, modelAliases);
  debug.log(`Selecting provider for model: ${model} -> ${resolvedModel}`);

  // Find matching providers
  const matches = isGenericAlias(resolvedModel)
    ? findProvidersForGenericAlias(resolvedModel, providers)
    : findProvidersForModel(resolvedModel, providers);

  debug.log(
    `Found ${matches.length} matching providers:`,
    matches.map((m) => `${m.provider.definition.name}/${m.model.id}`)
  );

  if (matches.length === 0) {
    return err({ type: "no_matching_providers", model: resolvedModel });
  }

  // Build candidates with quota info
  const candidates = await buildCandidates(matches, context.excludedProviders, {
    tracker,
    stateStore,
  });

  debug.log(`Available candidates: ${candidates.length}/${matches.length}`);

  if (candidates.length === 0) {
    debug.log(`No available candidates - all providers filtered out`);
    return err({ type: "no_available_candidates", model: resolvedModel });
  }

  // Sort by quality tier
  const sorted = sortByQualityTier(candidates);

  // Apply routing strategy
  const strategyResult = strategy.select(sorted, context);

  if (strategyResult.isErr()) {
    return err({ type: "strategy_error", error: strategyResult.error });
  }

  const selected = strategyResult.value;

  // Find the ConfiguredProvider that matches the selected ProviderDefinition
  const configuredProvider = providers.find(
    (p) => p.definition.name === selected.provider.name
  );

  if (!configuredProvider) {
    return err({
      type: "provider_not_found",
      providerName: selected.provider.name,
    });
  }

  return ok({ provider: configuredProvider, model: selected.model });
};
