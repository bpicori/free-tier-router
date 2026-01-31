import type { Provider } from "../types/provider.js";
import type { ModelConfig } from "../types/models.js";
import { ModelQualityTier } from "../types/models.js";
import {
  createProvider,
  type BaseProviderConfig,
  type ProviderDefinition,
} from "./base.js";

/**
 * Groq provider configuration
 * API Docs: https://console.groq.com/docs/api
 *
 * Free tier limits (approximate):
 * - 30 requests per minute
 * - 14,400 tokens per minute (varies by model)
 * - 14,400 requests per day
 */

/**
 * Groq model configurations with free tier rate limits
 *
 * Rate limits from https://console.groq.com/docs/rate-limits
 * Note: Free tier limits are subject to change
 */
const GROQ_MODELS: ModelConfig[] = [
  // Tier 5 - Frontier/Reasoning
  {
    id: "deepseek-r1-distill-llama-70b",
    aliases: ["deepseek-r1", "deepseek-r1-0528"],
    qualityTier: ModelQualityTier.TIER_5,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 1000,
      tokensPerMinute: 6000,
    },
    tags: ["reasoning", "frontier"],
  },

  // Tier 3 - Large Models
  {
    id: "llama-3.3-70b-versatile",
    aliases: ["llama-3.3-70b", "llama-3.3-70b-instruct"],
    qualityTier: ModelQualityTier.TIER_3,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 6000,
      tokensPerDay: 500000,
    },
    tags: ["instruct", "versatile"],
  },
  {
    id: "llama-3.3-70b-specdec",
    aliases: [],
    qualityTier: ModelQualityTier.TIER_3,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 6000,
      tokensPerDay: 500000,
    },
    tags: ["instruct", "speculative-decoding"],
  },
  {
    id: "llama-3.1-70b-versatile",
    aliases: ["llama-3.1-70b", "llama-3.1-70b-instruct"],
    qualityTier: ModelQualityTier.TIER_3,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 6000,
      tokensPerDay: 500000,
    },
    tags: ["instruct"],
  },

  // Tier 2 - Medium Models
  {
    id: "qwen-qwq-32b",
    aliases: ["qwen-2.5-32b", "qwen-2.5-32b-instruct"],
    qualityTier: ModelQualityTier.TIER_2,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 6000,
      tokensPerDay: 500000,
    },
    tags: ["instruct", "reasoning"],
  },
  {
    id: "gemma2-9b-it",
    aliases: ["gemma-2-9b", "gemma-2-9b-it"],
    qualityTier: ModelQualityTier.TIER_1,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 15000,
      tokensPerDay: 500000,
    },
    tags: ["instruct"],
  },
  {
    id: "mistral-saba-24b",
    aliases: ["mistral-small-24b", "mistral-small-24b-instruct"],
    qualityTier: ModelQualityTier.TIER_2,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 6000,
      tokensPerDay: 500000,
    },
    tags: ["instruct"],
  },

  // Tier 1 - Small Models
  {
    id: "llama-3.2-3b-preview",
    aliases: ["llama-3.2-3b", "llama-3.2-3b-instruct"],
    qualityTier: ModelQualityTier.TIER_1,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 6000,
      tokensPerDay: 500000,
    },
    tags: ["instruct", "small", "fast"],
  },
  {
    id: "llama-3.2-1b-preview",
    aliases: ["llama-3.2-1b", "llama-3.2-1b-instruct"],
    qualityTier: ModelQualityTier.TIER_1,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 6000,
      tokensPerDay: 500000,
    },
    tags: ["instruct", "tiny", "fast"],
  },
  {
    id: "llama-3.1-8b-instant",
    aliases: ["llama-3.1-8b", "llama-3.1-8b-instruct"],
    qualityTier: ModelQualityTier.TIER_1,
    limits: {
      requestsPerMinute: 30,
      requestsPerDay: 14400,
      tokensPerMinute: 6000,
      tokensPerDay: 500000,
    },
    tags: ["instruct", "fast"],
  },
];

/**
 * Map canonical model IDs to Groq-specific model IDs
 */
const GROQ_MODEL_MAPPING: Record<string, string> = {
  // Tier 5
  "deepseek-r1": "deepseek-r1-distill-llama-70b",
  "deepseek-r1-distill-llama-70b": "deepseek-r1-distill-llama-70b",

  // Tier 3
  "llama-3.3-70b": "llama-3.3-70b-versatile",
  "llama-3.3-70b-versatile": "llama-3.3-70b-versatile",
  "llama-3.3-70b-specdec": "llama-3.3-70b-specdec",
  "llama-3.1-70b": "llama-3.1-70b-versatile",
  "llama-3.1-70b-versatile": "llama-3.1-70b-versatile",

  // Tier 2
  "qwen-2.5-32b": "qwen-qwq-32b",
  "qwen-qwq-32b": "qwen-qwq-32b",
  "gemma-2-9b": "gemma2-9b-it",
  "gemma2-9b-it": "gemma2-9b-it",
  "mistral-small-24b": "mistral-saba-24b",
  "mistral-saba-24b": "mistral-saba-24b",

  // Tier 1
  "llama-3.2-3b": "llama-3.2-3b-preview",
  "llama-3.2-3b-preview": "llama-3.2-3b-preview",
  "llama-3.2-1b": "llama-3.2-1b-preview",
  "llama-3.2-1b-preview": "llama-3.2-1b-preview",
  "llama-3.1-8b": "llama-3.1-8b-instant",
  "llama-3.1-8b-instant": "llama-3.1-8b-instant",
};

/**
 * Groq provider definition
 */
export const GROQ_DEFINITION: ProviderDefinition = {
  type: "groq",
  displayName: "Groq",
  baseUrl: "https://api.groq.com/openai/v1",
  models: GROQ_MODELS,
  modelMapping: GROQ_MODEL_MAPPING,
};

/**
 * Create a Groq provider instance
 *
 * @param config - Provider configuration with API key
 * @returns Configured Groq provider
 *
 * @example
 * ```typescript
 * const groq = createGroqProvider({
 *   apiKey: process.env.GROQ_API_KEY!,
 * });
 *
 * const response = await groq.createCompletion({
 *   model: "llama-3.3-70b",
 *   messages: [{ role: "user", content: "Hello!" }],
 * });
 * ```
 */
export const createGroqProvider = (config: BaseProviderConfig): Provider => {
  return createProvider(GROQ_DEFINITION, config);
};

/**
 * Get all Groq model configurations
 */
export const getGroqModels = (): readonly ModelConfig[] => GROQ_MODELS;

/**
 * Check if Groq supports a specific model
 */
export const groqSupportsModel = (modelId: string): boolean => {
  const normalizedId = modelId.toLowerCase();
  return (
    normalizedId in GROQ_MODEL_MAPPING ||
    GROQ_MODELS.some(
      (m) =>
        m.id.toLowerCase() === normalizedId ||
        m.aliases?.some((a) => a.toLowerCase() === normalizedId)
    )
  );
};
