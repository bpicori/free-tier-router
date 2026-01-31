# Model Alias System

This document explains how the model alias system works in the free-tier router.

## Overview

The router supports flexible model naming through an alias system that allows users to request models using various naming conventions. The system resolves these aliases to canonical model IDs and then maps them to provider-specific model names.

## Two Types of Aliases

### 1. Specific Model Aliases

Defined in `MODEL_DEFINITIONS` in `src/models/aliases.ts`, these map alternative names to a canonical model ID:

```
User requests              →  Normalized to      →  Provider's actual model
──────────────────────────────────────────────────────────────────────────────
"llama-3.3-70b"                "llama-3.3-70b"       "llama-3.3-70b-versatile" (groq)
"llama-3.3-70b-versatile"      "llama-3.3-70b"       "llama-3.3-70b-versatile" (groq)
"meta-llama/llama-3.3-70b"     "llama-3.3-70b"       "llama-3.3-70b-versatile" (groq)
"deepseek-r1"                  "deepseek-r1"         "deepseek-r1-distill-llama-70b" (groq)
```

This allows users to use:
- **Canonical IDs**: `llama-3.3-70b`
- **Variant names**: `llama-3.3-70b-versatile`, `llama-3.3-70b-instruct`
- **Provider-prefixed names**: `meta-llama/llama-3.3-70b`, `qwen/qwen-2.5-72b`

### 2. Generic Aliases

Defined in `GENERIC_MODEL_ALIASES`, these map capability/size names to quality tiers or tags:

| Alias | Resolves to |
|-------|-------------|
| `best` | Any model (prefers highest tier available) |
| `best-xl` | Tier 4 models (100B+ params) |
| `best-large` | Tier 3 models (36-100B params, e.g., 70B) |
| `best-medium` | Tier 2 models (9-35B params, e.g., 32B) |
| `best-small` | Tier 1 models (1-8B params) |
| `best-reasoning` | Models tagged with "reasoning" |
| `best-fast` | Models tagged with "fast" |
| `best-code` | Models tagged with "code" |
| `70b` | Tier 3 models |
| `32b` | Tier 2 models |
| `8b` | Tier 1 models |

## Resolution Flow

When you call `router.chat.completions.create({ model: "meta-llama/llama-8b" })`:

```
1. resolveModelName("meta-llama/llama-8b")
   │
   ├─ Check user-defined aliases (from config.modelAliases)
   │   → Not found
   │
   └─ Check buildAliasMap()
       → Found: "meta-llama/llama-3.1-8b" => "llama-3.1-8b"
       → Returns: "llama-3.1-8b"

2. isGenericAlias("llama-3.1-8b")
   → false (it's a specific model, not a generic alias)

3. findProvidersForModel("llama-3.1-8b")
   → Finds groq and cerebras support this model
   → Returns their specific model IDs (e.g., "llama-3.1-8b-instant")

4. Strategy selects best provider based on availability/rate limits/priority
```

## The Alias Map Structure

The `buildAliasMap()` function creates a lookup Map:

```typescript
const aliasMap = buildAliasMap();
// Map {
//   "llama-3.3-70b"               => "llama-3.3-70b",  // canonical ID
//   "llama-3.3-70b-versatile"     => "llama-3.3-70b",  // variant alias
//   "meta-llama/llama-3.3-70b"    => "llama-3.3-70b",  // provider-prefixed alias
//   "llama-3.1-8b"                => "llama-3.1-8b",
//   "meta-llama/llama-3.1-8b"     => "llama-3.1-8b",   // provider-prefixed alias
//   "deepseek-r1"                 => "deepseek-r1",
//   "deepseek-ai/deepseek-r1"     => "deepseek-r1",    // provider-prefixed alias
//   "qwen-2.5-72b"                => "qwen-2.5-72b",
//   "qwen/qwen-2.5-72b"           => "qwen-2.5-72b",   // provider-prefixed alias
//   ...
// }
```

## Custom User Aliases

Users can define their own aliases in the router configuration:

```typescript
const router = createRouter({
  providers: [
    { type: "groq", apiKey: process.env.GROQ_API_KEY },
    { type: "cerebras", apiKey: process.env.CEREBRAS_API_KEY },
  ],
  modelAliases: {
    "gpt-4": "llama-3.3-70b",        // Map OpenAI model names to available models
    "gpt-3.5-turbo": "llama-3.1-8b",
    "my-fast-model": "llama-3.1-8b",
    "my-smart-model": "llama-3.3-70b",
  }
});

// Now these all work:
router.chat.completions.create({ model: "gpt-4" })          // Uses llama-3.3-70b
router.chat.completions.create({ model: "my-fast-model" })  // Uses llama-3.1-8b
```

User-defined aliases take priority over built-in aliases.

## Quality Tiers

Models are organized into quality tiers:

| Tier | Size | Examples |
|------|------|----------|
| Tier 5 | Frontier/Reasoning | DeepSeek R1 |
| Tier 4 | XL (100B+) | Llama 3.1 405B |
| Tier 3 | Large (36-100B) | Llama 3.3 70B, Qwen 2.5 72B |
| Tier 2 | Medium (9-35B) | Qwen 2.5 32B, Gemma 2 27B |
| Tier 1 | Small (1-8B) | Llama 3.1 8B, Gemma 2 9B |

When using generic aliases like `best` or `best-large`, the router selects from models in the appropriate tier based on availability and the configured routing strategy.

## Adding New Models

To add a new model alias, update `MODEL_DEFINITIONS` in `src/models/aliases.ts`:

```typescript
{
  id: "new-model-70b",                    // Canonical ID
  qualityTier: ModelQualityTier.TIER_3,   // Quality tier
  aliases: [
    "new-model-70b-instruct",             // Variant names
    "provider/new-model-70b",             // Provider-prefixed name
  ],
  providers: ["groq", "cerebras"],        // Which providers offer this model
  family: "new-model",                    // Model family
  tags: ["instruct"],                     // Tags for generic alias matching
}
```
