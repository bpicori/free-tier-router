// AUTO-GENERATED FILE - DO NOT EDIT DIRECTLY
// Source: config/models.yml and config/providers/*.yml
// Regenerate with: npm run build:config

import type { ModelsConfigYaml, ProviderConfigYaml } from "./schema.js";

export const BUNDLED_MODELS: ModelsConfigYaml = {
  models: [
    {
      id: "gpt-oss-120b",
      tier: 4,
      family: "gpt-oss",
      aliases: ["openai/gpt-oss-120b"],
    },
    {
      id: "llama-3.3-70b",
      tier: 3,
      family: "llama",
      aliases: ["llama-3.3-70b-versatile", "llama-3.3-70b-instruct"],
    },
    {
      id: "qwen-3-32b",
      tier: 2,
      family: "qwen",
      aliases: ["qwen/qwen3-32b"],
    },
    {
      id: "llama-3.1-8b",
      tier: 1,
      family: "llama",
      aliases: ["llama-3.1-8b-instant", "llama-3.1-8b-instruct"],
    },
  ],
  generic_aliases: {
    best: {
      min_tier: 1,
    },
    "best-xl": {
      tier: 4,
    },
    "best-large": {
      tier: 3,
    },
    "best-medium": {
      tier: 2,
    },
    "best-small": {
      tier: 1,
    },
    fast: {
      tier: 1,
    },
  },
};

export const BUNDLED_PROVIDERS: Record<string, ProviderConfigYaml> = {
  cerebras: {
    name: "cerebras",
    display_name: "Cerebras",
    base_url: "https://api.cerebras.ai/v1",
    defaults: {
      limits: {
        requests_per_minute: 30,
        requests_per_hour: 900,
        requests_per_day: 14400,
        tokens_per_minute: 60000,
        tokens_per_day: 1000000,
      },
    },
    models: [
      {
        canonical: "gpt-oss-120b",
        id: "gpt-oss-120b",
      },
      {
        canonical: "llama-3.3-70b",
        id: "llama-3.3-70b",
      },
      {
        canonical: "llama-3.1-8b",
        id: "llama-3.1-8b",
      },
    ],
  },
  groq: {
    name: "groq",
    display_name: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    defaults: {
      limits: {
        requests_per_minute: 30,
        requests_per_day: 14400,
        tokens_per_minute: 6000,
        tokens_per_day: 500000,
      },
    },
    models: [
      {
        canonical: "gpt-oss-120b",
        id: "openai/gpt-oss-120b",
        limits: {
          requests_per_day: 1000,
          tokens_per_minute: 8000,
        },
      },
      {
        canonical: "llama-3.3-70b",
        id: "llama-3.3-70b-versatile",
      },
      {
        canonical: "qwen-3-32b",
        id: "qwen/qwen3-32b",
      },
      {
        canonical: "llama-3.1-8b",
        id: "llama-3.1-8b-instant",
      },
    ],
  },
  "nvidia-nim": {
    name: "nvidia-nim",
    display_name: "NVIDIA NIM",
    base_url: "https://integrate.api.nvidia.com/v1",
    defaults: {
      limits: {
        requests_per_minute: 40,
      },
    },
    models: [
      {
        canonical: "gpt-oss-120b",
        id: "openai/gpt-oss-120b",
        limits: {
          requests_per_minute: 40,
        },
      },
      {
        canonical: "llama-3.3-70b",
        id: "meta/llama-3.3-70b-instruct",
        limits: {
          requests_per_minute: 40,
        },
      },
      {
        canonical: "llama-3.1-8b",
        id: "meta/llama-3.1-8b-instruct",
        limits: {
          requests_per_minute: 40,
        },
      },
    ],
  },
  openrouter: {
    name: "openrouter",
    display_name: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    defaults: {
      limits: {
        requests_per_minute: 20,
        requests_per_day: 50,
      },
    },
    models: [
      {
        canonical: "gpt-oss-120b",
        id: "openai/gpt-oss-120b:free",
        limits: {
          requests_per_minute: 20,
          requests_per_day: 50,
        },
      },
      {
        canonical: "llama-3.3-70b",
        id: "meta-llama/llama-3.3-70b-instruct:free",
        limits: {
          requests_per_minute: 20,
          requests_per_day: 50,
        },
      },
      {
        canonical: "qwen-3-32b",
        id: "qwen/qwen3-32b:free",
        limits: {
          requests_per_minute: 20,
          requests_per_day: 50,
        },
      },
      {
        canonical: "llama-3.1-8b",
        id: "meta-llama/llama-3.1-8b-instruct:free",
        limits: {
          requests_per_minute: 20,
          requests_per_day: 50,
        },
      },
    ],
  },
};
