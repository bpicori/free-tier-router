# Providers

This document explains how providers work in the free-tier router and how to add new ones.

## Overview

Providers are external LLM inference services that offer OpenAI-compatible APIs. The router abstracts away provider differences, letting you use multiple providers through a single interface with automatic failover and rate limit management.

## Supported Providers

| Provider | Base URL | Free Tier Limits |
|----------|----------|------------------|
| **Groq** | `https://api.groq.com/openai/v1` | 30 req/min, varies by model |
| **Cerebras** | `https://api.cerebras.ai/v1` | 30 req/min, 14,400 req/day |
| **OpenRouter** | `https://openrouter.ai/api/v1` | 20 req/min, 50 req/day |
| **NVIDIA NIM** | `https://integrate.api.nvidia.com/v1` | 40 req/min (phone verification required) |

## Configuration Files

```
config/providers/
├── groq.yml        # Groq configuration
├── cerebras.yml    # Cerebras configuration
├── openrouter.yml  # OpenRouter configuration
└── nvidia-nim.yml  # NVIDIA NIM configuration

src/providers/
├── index.ts        # Provider registry
├── groq.ts         # Groq provider implementation
├── cerebras.ts     # Cerebras provider implementation
├── openrouter.ts   # OpenRouter provider implementation
└── nvidia-nim.ts   # NVIDIA NIM provider implementation
```

## Provider Configuration Structure

Each provider has a YAML configuration file in `config/providers/`:

```yaml
name: groq                              # Provider identifier (matches ProviderType)
display_name: Groq                      # Human-readable name
base_url: https://api.groq.com/openai/v1  # OpenAI-compatible API endpoint

defaults:
  limits:
    requests_per_minute: 30             # Default rate limits
    requests_per_day: 14400
    tokens_per_minute: 6000

models:
  - canonical: llama-3.3-70b            # References config/models.yml
    id: llama-3.3-70b-versatile         # Provider's actual model ID
    limits:                             # Optional: override defaults
      tokens_per_minute: 12000
```

### Key Fields

| Field | Description |
|-------|-------------|
| `name` | Provider identifier, must match a `ProviderType` value |
| `display_name` | Human-readable name for logs and debugging |
| `base_url` | OpenAI-compatible API endpoint |
| `defaults.limits` | Default rate limits applied to all models |
| `models[].canonical` | References a model ID from `config/models.yml` |
| `models[].id` | The provider's actual model identifier |
| `models[].limits` | Optional per-model rate limit overrides |

## Rate Limit Configuration

Rate limits can be specified at multiple granularities:

```yaml
limits:
  requests_per_minute: 30    # Requests per minute
  requests_per_hour: 900     # Requests per hour
  requests_per_day: 14400    # Requests per day
  tokens_per_minute: 6000    # Tokens per minute
  tokens_per_hour: 100000    # Tokens per hour
  tokens_per_day: 500000     # Tokens per day
```

Limits are optional - only specify what the provider enforces.

## Provider Implementation

Each provider has a TypeScript file in `src/providers/` that builds a `ProviderDefinition`:

```typescript
interface ProviderDefinition {
  name: ProviderType;                    // Provider identifier
  displayName: string;                   // Human-readable name
  baseUrl: string;                       // API endpoint
  models: ModelConfig[];                 // Available models with limits
  modelMapping: Record<string, string>;  // Canonical ID → Provider ID
}
```

### Implementation Pattern

```typescript
import type { ProviderDefinition } from "../types/provider.js";
import type { ModelConfig } from "../types/models.js";
import { getConfig } from "../config/index.js";

const buildProvider = (): ProviderDefinition => {
  const config = getConfig();
  const providerConfig = config.providers.get("provider-name");

  if (!providerConfig) {
    throw new Error("Provider config not found");
  }

  // Get model tier info from models config
  const modelTiers = new Map(
    config.models.definitions.map((m) => [m.id, m.tier])
  );

  // Build ModelConfig array
  const models: ModelConfig[] = providerConfig.models.map((pm) => ({
    id: pm.id,
    aliases: [pm.canonical],
    qualityTier: modelTiers.get(pm.canonical) ?? 1,
    limits: pm.limits,
  }));

  // Build model mapping (canonical -> provider-specific)
  const modelMapping: Record<string, string> = {};
  for (const pm of providerConfig.models) {
    modelMapping[pm.canonical] = pm.id;
    modelMapping[pm.id] = pm.id;
  }

  return {
    name: "provider-name",
    displayName: providerConfig.displayName,
    baseUrl: providerConfig.baseUrl,
    models,
    modelMapping,
  };
};

// Lazy initialization with caching
let cachedProvider: ProviderDefinition | null = null;

export const PROVIDER: ProviderDefinition = new Proxy({} as ProviderDefinition, {
  get(_, prop) {
    if (!cachedProvider) {
      cachedProvider = buildProvider();
    }
    return cachedProvider[prop as keyof ProviderDefinition];
  },
});
```

## Adding a New Provider

### Step 1: Update ProviderType

Add the new provider to `src/types/provider.ts`:

```typescript
export type ProviderType = "groq" | "cerebras" | "openrouter" | "new-provider";
```

### Step 2: Create YAML Configuration

Create `config/providers/new-provider.yml`:

```yaml
name: new-provider
display_name: New Provider
base_url: https://api.newprovider.com/v1

defaults:
  limits:
    requests_per_minute: 30
    requests_per_day: 1000
    tokens_per_minute: 10000

models:
  - canonical: llama-3.3-70b
    id: llama-3.3-70b-chat
    limits:
      requests_per_day: 500

  - canonical: llama-3.1-8b
    id: llama-3.1-8b-instant
```

### Step 3: Create Provider Implementation

Create `src/providers/new-provider.ts`:

```typescript
import type { ProviderDefinition } from "../types/provider.js";
import type { ModelConfig } from "../types/models.js";
import { getConfig } from "../config/index.js";

const buildNewProvider = (): ProviderDefinition => {
  const config = getConfig();
  const providerConfig = config.providers.get("new-provider");

  if (!providerConfig) {
    throw new Error(
      "New provider config not found. Check config/providers/new-provider.yml"
    );
  }

  const modelTiers = new Map(
    config.models.definitions.map((m) => [m.id, m.tier])
  );

  const models: ModelConfig[] = providerConfig.models.map((pm) => ({
    id: pm.id,
    aliases: [pm.canonical],
    qualityTier: modelTiers.get(pm.canonical) ?? 1,
    limits: pm.limits,
  }));

  const modelMapping: Record<string, string> = {};
  for (const pm of providerConfig.models) {
    modelMapping[pm.canonical] = pm.id;
    modelMapping[pm.id] = pm.id;
  }

  return {
    name: "new-provider",
    displayName: providerConfig.displayName,
    baseUrl: providerConfig.baseUrl,
    models,
    modelMapping,
  };
};

let cachedProvider: ProviderDefinition | null = null;

export const NEW_PROVIDER: ProviderDefinition = new Proxy(
  {} as ProviderDefinition,
  {
    get(_, prop) {
      if (!cachedProvider) {
        cachedProvider = buildNewProvider();
      }
      return cachedProvider[prop as keyof ProviderDefinition];
    },
  }
);

export const getNewProviderModels = (): readonly ModelConfig[] => {
  if (!cachedProvider) {
    cachedProvider = buildNewProvider();
  }
  return cachedProvider.models;
};

export const resetNewProvider = (): void => {
  cachedProvider = null;
};
```

### Step 4: Register the Provider

Update `src/providers/index.ts`:

```typescript
// Add exports
export {
  NEW_PROVIDER,
  getNewProviderModels,
  resetNewProvider,
} from "./new-provider.js";

// Add import
import { NEW_PROVIDER } from "./new-provider.js";

// Add to registry
export const PROVIDER_REGISTRY: Record<ProviderType, ProviderDefinition> = {
  groq: GROQ_PROVIDER,
  cerebras: CEREBRAS_PROVIDER,
  openrouter: OPENROUTER_PROVIDER,
  "nvidia-nim": NVIDIA_NIM_PROVIDER,
  "new-provider": NEW_PROVIDER,
};
```

### Step 5: Use the Provider

```typescript
import { createRouter } from "free-tier-router";

const router = createRouter({
  providers: [
    { type: "new-provider", apiKey: process.env.NEW_PROVIDER_API_KEY },
    { type: "groq", apiKey: process.env.GROQ_API_KEY },
  ],
});
```

## Provider Selection Flow

When making a request, the router selects a provider:

```
Request: model="llama-3.3-70b"
        │
        ▼
┌───────────────────────────────┐
│  1. Find Supporting Providers │  Which providers have this model?
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  2. Check Rate Limits         │  Filter out rate-limited providers
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  3. Apply Strategy            │  Priority or least-used selection
└───────────────────────────────┘
        │
        ▼
     Execute Request
```

## Free LLM Provider Resources

For a comprehensive list of free LLM API providers, see:
[github.com/cheahjs/free-llm-api-resources](https://github.com/cheahjs/free-llm-api-resources)

### Candidates for Implementation

| Provider | Free Tier | Notes |
|----------|-----------|-------|
| Google AI Studio | 15 req/min | Gemini models, data used for training |
| Cloudflare Workers AI | 10,000 neurons/day | Many open models |
| Cohere | 20 req/min, 1000 req/month | Aya and Command models |
| GitHub Models | Copilot subscription | Restrictive token limits |

## Architecture Notes

The provider system follows functional principles:

- **Configuration-driven**: Provider definitions come from YAML, not hardcoded
- **Lazy initialization**: Providers use Proxy for on-demand building
- **Immutable definitions**: `ProviderDefinition` is readonly after creation
- **Separation of concerns**: Config loading, provider building, and routing are separate
- **Explicit dependencies**: Config passed explicitly, no global state

## See Also

- [Model Configuration](./model-configuration.md) - How models are configured
- [Rate Limiting](./rate-limit.md) - How rate limits work
- [Router](./router.md) - How the router selects providers
