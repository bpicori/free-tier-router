import type { ProviderDefinition } from "../types/provider.js";
import type { ModelConfig } from "../types/models.js";
import { ModelQualityTier } from "../types/models.js";

/**
 * Cerebras provider configuration
 * API Docs: https://inference-docs.cerebras.ai/
 *
 * Cerebras offers extremely fast inference due to their custom silicon.
 * Free tier limits (approximate):
 * - 30 requests per minute
 * - 60,000 tokens per minute (varies by model)
 * - Rate limits are per model
 */

/**
 * Cerebras model configurations with free tier rate limits
 *
 * Note: Cerebras specializes in fast inference with Llama and Qwen models
 */
const CEREBRAS_MODELS: ModelConfig[] = [
  // Tier 3 - Large Models
  {
    id: "llama-3.3-70b",
    aliases: ["llama-3.3-70b-instruct", "llama-3.3-70b-versatile"],
    qualityTier: ModelQualityTier.TIER_3,
    limits: {
      requestsPerMinute: 30,
      requestsPerHour: 900,
      requestsPerDay: 14400,
      tokensPerMinute: 60000,
      tokensPerDay: 1000000,
    },
    tags: ["instruct", "versatile"],
  },
  {
    id: "llama-3.1-70b",
    aliases: ["llama-3.1-70b-instruct", "llama-3.1-70b-versatile"],
    qualityTier: ModelQualityTier.TIER_3,
    limits: {
      requestsPerMinute: 30,
      requestsPerHour: 900,
      requestsPerDay: 14400,
      tokensPerMinute: 60000,
      tokensPerDay: 1000000,
    },
    tags: ["instruct"],
  },
  {
    id: "qwen-2.5-72b",
    aliases: ["qwen-2.5-72b-instruct"],
    qualityTier: ModelQualityTier.TIER_3,
    limits: {
      requestsPerMinute: 30,
      requestsPerHour: 900,
      requestsPerDay: 14400,
      tokensPerMinute: 60000,
      tokensPerDay: 1000000,
    },
    tags: ["instruct"],
  },

  // Tier 2 - Medium Models
  {
    id: "qwen-2.5-32b",
    aliases: ["qwen-2.5-32b-instruct"],
    qualityTier: ModelQualityTier.TIER_2,
    limits: {
      requestsPerMinute: 30,
      requestsPerHour: 900,
      requestsPerDay: 14400,
      tokensPerMinute: 60000,
      tokensPerDay: 1000000,
    },
    tags: ["instruct"],
  },

  // Tier 1 - Small Models
  {
    id: "llama-3.2-3b",
    aliases: ["llama-3.2-3b-instruct", "llama-3.2-3b-preview"],
    qualityTier: ModelQualityTier.TIER_1,
    limits: {
      requestsPerMinute: 30,
      requestsPerHour: 900,
      requestsPerDay: 14400,
      tokensPerMinute: 60000,
      tokensPerDay: 1000000,
    },
    tags: ["instruct", "small", "fast"],
  },
  {
    id: "llama-3.2-1b",
    aliases: ["llama-3.2-1b-instruct", "llama-3.2-1b-preview"],
    qualityTier: ModelQualityTier.TIER_1,
    limits: {
      requestsPerMinute: 30,
      requestsPerHour: 900,
      requestsPerDay: 14400,
      tokensPerMinute: 60000,
      tokensPerDay: 1000000,
    },
    tags: ["instruct", "tiny", "fast"],
  },
  {
    id: "llama-3.1-8b",
    aliases: ["llama-3.1-8b-instruct", "llama-3.1-8b-instant"],
    qualityTier: ModelQualityTier.TIER_1,
    limits: {
      requestsPerMinute: 30,
      requestsPerHour: 900,
      requestsPerDay: 14400,
      tokensPerMinute: 60000,
      tokensPerDay: 1000000,
    },
    tags: ["instruct", "fast"],
  },
];

/**
 * Map canonical model IDs to Cerebras-specific model IDs
 * Cerebras uses clean model names without suffixes like "-versatile"
 */
const CEREBRAS_MODEL_MAPPING: Record<string, string> = {
  // Tier 3
  "llama-3.3-70b": "llama-3.3-70b",
  "llama-3.3-70b-versatile": "llama-3.3-70b",
  "llama-3.3-70b-instruct": "llama-3.3-70b",
  "llama-3.1-70b": "llama-3.1-70b",
  "llama-3.1-70b-versatile": "llama-3.1-70b",
  "llama-3.1-70b-instruct": "llama-3.1-70b",
  "qwen-2.5-72b": "qwen-2.5-72b",
  "qwen-2.5-72b-instruct": "qwen-2.5-72b",

  // Tier 2
  "qwen-2.5-32b": "qwen-2.5-32b",
  "qwen-2.5-32b-instruct": "qwen-2.5-32b",

  // Tier 1
  "llama-3.2-3b": "llama-3.2-3b",
  "llama-3.2-3b-preview": "llama-3.2-3b",
  "llama-3.2-3b-instruct": "llama-3.2-3b",
  "llama-3.2-1b": "llama-3.2-1b",
  "llama-3.2-1b-preview": "llama-3.2-1b",
  "llama-3.2-1b-instruct": "llama-3.2-1b",
  "llama-3.1-8b": "llama-3.1-8b",
  "llama-3.1-8b-instant": "llama-3.1-8b",
  "llama-3.1-8b-instruct": "llama-3.1-8b",
};

/**
 * Cerebras provider definition
 *
 * Use with the OpenAI SDK:
 * ```typescript
 * import OpenAI from "openai";
 *
 * const client = new OpenAI({
 *   apiKey: process.env.CEREBRAS_API_KEY,
 *   baseURL: CEREBRAS_PROVIDER.baseUrl,
 * });
 * ```
 */
export const CEREBRAS_PROVIDER: ProviderDefinition = {
  name: "cerebras",
  displayName: "Cerebras",
  baseUrl: "https://api.cerebras.ai/v1",
  models: CEREBRAS_MODELS,
  modelMapping: CEREBRAS_MODEL_MAPPING,
};

/**
 * Get all Cerebras model configurations
 */
export const getCerebrasModels = (): readonly ModelConfig[] => CEREBRAS_MODELS;
