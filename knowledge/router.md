# Router

This document explains how the router works in the free-tier router library.

## Overview

The router provides an OpenAI-compatible interface that intelligently routes requests across multiple free-tier LLM providers. It handles provider selection, rate limiting, and automatic failover.

## Basic Usage

```typescript
import { createRouter } from "free-tier-router";

const router = createRouter({
  providers: [
    { type: "groq", apiKey: process.env.GROQ_API_KEY },
    { type: "cerebras", apiKey: process.env.CEREBRAS_API_KEY },
    { type: "openrouter", apiKey: process.env.OPENROUTER_API_KEY },
  ],
  strategy: "least-used",
});

// OpenAI-compatible API
const response = await router.chat.completions.create({
  model: "llama-3.3-70b",
  messages: [{ role: "user", content: "Hello!" }],
});

// With metadata about which provider was used
const { response, metadata } = await router.createCompletion({
  model: "llama-3.3-70b",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(`Used ${metadata.provider} in ${metadata.latencyMs}ms`);
```

## Configuration Options

```typescript
interface FreeTierRouterConfig {
  // Required: At least one provider
  providers: ProviderConfig[];
  
  // Routing strategy: "priority" (default) or "least-used"
  strategy?: "priority" | "least-used";
  
  // Custom model aliases (e.g., { "gpt-4": "llama-3.3-70b" })
  modelAliases?: Record<string, string>;
  
  // Request timeout in ms (default: 60000)
  timeoutMs?: number;
  
  // Retry configuration
  retry?: {
    maxRetries?: number;        // default: 3
    initialBackoffMs?: number;  // default: 1000
    maxBackoffMs?: number;      // default: 30000
    backoffMultiplier?: number; // default: 2
  };
  
  // Throw error when all providers exhausted (default: true)
  throwOnExhausted?: boolean;
}
```

## How Provider Selection Works

When you make a request, the router follows this flow:

```
Request with model "llama-3.3-70b"
        │
        ▼
┌───────────────────────────────┐
│  1. Resolve Model Name        │  Check user aliases, then normalize
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  2. Find Matching Providers   │  Which providers support this model?
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  3. Filter by Availability    │  Remove rate-limited/cooldown providers
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  4. Sort by Quality Tier      │  Higher quality models first
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  5. Apply Routing Strategy    │  Priority or least-used selection
└───────────────────────────────┘
        │
        ▼
     Selected Provider
```

## Routing Strategies

### Priority Strategy (default)

Selects providers in order of configured priority. Lower priority number = higher preference.

```typescript
createRouter({
  providers: [
    { type: "groq", apiKey: "...", priority: 1 },     // Preferred
    { type: "cerebras", apiKey: "...", priority: 2 }, // Fallback
  ],
  strategy: "priority",
});
```

### Least-Used Strategy

Distributes load across providers by selecting the one with most remaining quota.

```typescript
createRouter({
  providers: [
    { type: "groq", apiKey: "..." },
    { type: "cerebras", apiKey: "..." },
  ],
  strategy: "least-used",
});
```

## Rate Limiting & Failover

The router automatically handles rate limits:

1. **Pre-request check**: Before each request, checks if the provider has quota remaining
2. **429 handling**: If a provider returns 429, marks it as rate-limited and retries with another
3. **Cooldown**: Rate-limited providers enter a cooldown period (from `Retry-After` header or 60s default)
4. **Automatic failover**: Seamlessly switches to the next available provider

```
Request fails with 429
        │
        ▼
┌───────────────────────────────┐
│  Mark provider rate-limited   │  Set cooldown based on Retry-After
└───────────────────────────────┘
        │
        ▼
┌───────────────────────────────┐
│  Select next provider         │  Skip rate-limited providers
└───────────────────────────────┘
        │
        ▼
     Retry request
```

## Streaming Support

```typescript
// Streaming completion
const stream = await router.chat.completions.create({
  model: "llama-3.3-70b",
  messages: [{ role: "user", content: "Hello!" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}

// With metadata
const { stream, metadata } = await router.createCompletionStream({
  model: "llama-3.3-70b",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(`Streaming from ${metadata.provider}`);
```

## Router Methods

| Method | Description |
|--------|-------------|
| `chat.completions.create()` | OpenAI-compatible completion (streaming or non-streaming) |
| `createCompletion()` | Non-streaming completion with metadata |
| `createCompletionStream()` | Streaming completion with metadata |
| `listModels()` | List all available models across providers |
| `isModelAvailable(model)` | Check if a model is available |
| `getQuotaStatus()` | Get rate limit status for all provider/model combinations |
| `close()` | Release resources and close connections |

## Architecture

The router is composed of several modules:

```
src/router.ts          Main entry point, creates router instance
src/routing/
  ├── provider-selection.ts   Provider selection logic
  ├── executor.ts             Request execution with retry
  ├── errors.ts               Rate limit error parsing
  └── types.ts                Shared types
```

- **router.ts**: Orchestrates dependencies and exposes the public API
- **provider-selection.ts**: Pure functions for finding and selecting providers
- **executor.ts**: Generic execution with retry logic and failover

## Error Handling

```typescript
import { AllProvidersExhaustedError } from "free-tier-router";

try {
  const response = await router.chat.completions.create({
    model: "llama-3.3-70b",
    messages: [{ role: "user", content: "Hello!" }],
  });
} catch (error) {
  if (error instanceof AllProvidersExhaustedError) {
    console.log("Attempted providers:", error.attemptedProviders);
    console.log("Earliest reset:", error.earliestResetTime);
  }
}
```

## See Also

- [Providers](./providers.md) - Available providers and how to add new ones
- [Model Configuration](./model-configuration.md) - How model name resolution works
- [Rate Limiting](./rate-limit.md) - How rate limits work
