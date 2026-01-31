# Model Configuration

This document explains how model configuration works in the free-tier router.

## Overview

The router uses a **YAML-driven configuration system** that separates canonical model definitions from provider-specific implementations. This allows flexible model naming through an alias system while maintaining clean mappings to each provider's actual model IDs.

## Configuration Files

```
config/
├── models.yml           # Canonical model definitions
└── providers/
    ├── groq.yml         # Groq provider mappings
    ├── cerebras.yml     # Cerebras provider mappings
    └── openrouter.yml   # OpenRouter provider mappings
```

### models.yml - Model Definitions

Defines canonical models the router accepts:

```yaml
models:
  - id: llama-3.3-70b       # Canonical ID (unique identifier)
    tier: 3                 # Quality tier (1-5)
    family: llama           # Model family
    aliases:                # Alternative names users can request
      - llama-3.3-70b-versatile
      - llama-3.3-70b-instruct
      - meta-llama/llama-3.3-70b

generic_aliases:
  best:
    min_tier: 1
  best-large:
    tier: 3
```

### providers/*.yml - Provider Mappings

Each provider config maps canonical IDs to the provider's actual model IDs:

```yaml
name: groq
base_url: https://api.groq.com/openai/v1

defaults:
  limits:
    requests_per_minute: 30
    tokens_per_minute: 6000

models:
  - canonical: llama-3.3-70b           # References models.yml
    id: llama-3.3-70b-versatile        # Groq's actual model ID
    limits:                             # Optional: override defaults
      tokens_per_minute: 8000
```

## Quality Tiers

Models are organized into quality tiers (higher = more capable):

| Tier | Category | Size/Type | Examples |
|------|----------|-----------|----------|
| 5 | Frontier/Reasoning | Reasoning models | DeepSeek R1 |
| 4 | XL | 100B+ params | Llama 3.1 405B |
| 3 | Large | 36-100B params | Llama 3.3 70B, Qwen 2.5 72B |
| 2 | Medium | 9-35B params | Qwen 2.5 32B, Gemma 2 27B |
| 1 | Small | 1-8B params | Llama 3.1 8B, Gemma 2 9B |

## Alias Types

### 1. Specific Model Aliases

Defined in `config/models.yml`, these map alternative names to a canonical ID:

```
User Request              → Canonical ID    → Provider Model ID
────────────────────────────────────────────────────────────────
"llama-3.3-70b"             llama-3.3-70b     llama-3.3-70b-versatile (groq)
"llama-3.3-70b-versatile"   llama-3.3-70b     llama-3.3-70b (cerebras)
"meta-llama/llama-3.3-70b"  llama-3.3-70b     (provider selected)
```

Supported naming conventions:
- **Canonical IDs**: `llama-3.3-70b`
- **Variant names**: `llama-3.3-70b-versatile`, `llama-3.3-70b-instruct`
- **Provider-prefixed**: `meta-llama/llama-3.3-70b`, `qwen/qwen-2.5-72b`

### 2. Generic Aliases

Map capability/size names to quality tiers:

| Alias | Resolves to |
|-------|-------------|
| `best` | Any model (prefers highest tier available) |
| `best-xl` | Tier 4 models (100B+ params) |
| `best-large` | Tier 3 models (36-100B params) |
| `best-medium` | Tier 2 models (9-35B params) |
| `best-small` | Tier 1 models (1-8B params) |
| `70b` | Tier 3 models |
| `32b` | Tier 2 models |
| `8b` | Tier 1 models |

## Model Registry

The router builds an in-memory registry from configuration at startup:

```typescript
interface ModelsConfig {
  definitions: ModelDefinition[];                  // Model definitions
  genericAliases: Record<string, GenericAliasConfig>;
}

interface ModelRegistryEntry {
  canonicalId: string;       // e.g., "llama-3.3-70b"
  providerModelId: string;   // e.g., "llama-3.3-70b-versatile"
  provider: ProviderType;    // e.g., "groq"
  qualityTier: number;       // 1-5
  limits: RateLimits;        // Provider-specific limits
}

interface ModelRegistryState {
  entries: Map<string, ModelRegistryEntry[]>;      // By canonical ID
  aliasMap: Map<string, string>;                   // Alias → canonical
  providerModels: Map<ProviderType, ModelRegistryEntry[]>;
}
```

## Resolution Flow

When resolving `router.chat.completions.create({ model: "meta-llama/llama-3.1-8b" })`:

```
1. normalizeModelName("meta-llama/llama-3.1-8b")
   │
   ├─ Check alias map (built from models.yml)
   │   → Found: "meta-llama/llama-3.1-8b" => "llama-3.1-8b"
   │
   └─ Returns canonical ID: "llama-3.1-8b"

2. isGenericAlias("llama-3.1-8b")
   → false (it's a specific model)

3. Registry lookup for "llama-3.1-8b"
   → Returns entries for groq and cerebras

4. Routing strategy selects best provider
   → Based on availability, rate limits, priority
```

For generic aliases like `router.chat.completions.create({ model: "best-large" })`:

```
1. isGenericAlias("best-large")
   → true

2. getGenericAliasConfig("best-large")
   → { tier: 3 }

3. Query registry for tier 3 models
   → Returns all Large models (70B class)

4. Routing strategy selects best available
```

## Key Functions

| Function | Module | Purpose |
|----------|--------|---------|
| `normalizeModelName()` | model-definitions.ts | Resolve alias to canonical ID |
| `isGenericAlias()` | model-definitions.ts | Check if name is generic alias |
| `getGenericAliasConfig()` | model-definitions.ts | Get tier config for generic alias |
| `buildAliasMap()` | model-definitions.ts | Build alias lookup map |
| `getModelRegistryState()` | registry.ts | Get initialized registry |
| `getBestModel()` | registry.ts | Find best model for tier |
| `compareTiers()` | tiers.ts | Compare quality tiers |
| `getTiersAbove()` | tiers.ts | Get tiers at or above minimum |

## User-Defined Aliases

Users can define custom aliases in router configuration:

```typescript
const router = createRouter({
  providers: [
    { type: "groq", apiKey: process.env.GROQ_API_KEY },
    { type: "cerebras", apiKey: process.env.CEREBRAS_API_KEY },
  ],
  modelAliases: {
    "gpt-4": "llama-3.3-70b",        // Map OpenAI names
    "gpt-3.5-turbo": "llama-3.1-8b",
    "my-fast-model": "llama-3.1-8b",
    "my-smart-model": "llama-3.3-70b",
  }
});

// These all work:
router.chat.completions.create({ model: "gpt-4" })          // → llama-3.3-70b
router.chat.completions.create({ model: "my-fast-model" })  // → llama-3.1-8b
```

User-defined aliases take priority over built-in aliases.

## Adding New Models

### 1. Add to config/models.yml

```yaml
- id: new-model-70b           # Canonical ID
  tier: 3                     # Quality tier (1-5)
  family: new-model           # Model family
  aliases:
    - new-model-70b-instruct  # Variant names
    - provider/new-model-70b  # Provider-prefixed
```

### 2. Add provider mappings

For each provider offering the model, add to their config:

```yaml
# config/providers/groq.yml
models:
  - canonical: new-model-70b
    id: new-model-70b-versatile  # Provider's actual ID
    limits:                       # Optional overrides
      tokens_per_minute: 8000
```

## Adding New Providers

Create a new YAML file in `config/providers/`:

```yaml
# config/providers/newprovider.yml
name: newprovider
display_name: New Provider
base_url: https://api.newprovider.com/v1

defaults:
  limits:
    requests_per_minute: 30
    requests_per_day: 14400
    tokens_per_minute: 10000

models:
  - canonical: llama-3.3-70b
    id: llama-3.3-70b-chat      # This provider's model ID
```

The config loader automatically discovers and loads all provider YAML files from `config/providers/`.

For detailed instructions on adding new providers, see [Providers](./providers.md).

## Rate Limits

Rate limits are defined at two levels:

1. **Provider defaults** - Applied to all models for that provider
2. **Model-specific overrides** - Override defaults for specific models

```yaml
# Provider defaults
defaults:
  limits:
    requests_per_minute: 30
    tokens_per_minute: 6000

# Model-specific override
models:
  - canonical: gemma-2-9b
    id: gemma2-9b-it
    limits:
      tokens_per_minute: 15000   # Higher limit for this model
```

## Architecture Notes

The configuration system follows functional principles:

- **Immutable state**: Registry state is readonly after creation
- **Pure functions**: Query functions don't mutate state
- **Explicit dependencies**: Config is loaded explicitly, not through globals
- **Separation of concerns**: Model definitions separate from provider mappings
