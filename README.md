# free-tier-router

A TypeScript library that routes LLM API requests across multiple free-tier providers with intelligent rate limit management and automatic failover.

## Features

- OpenAI-compatible API interface (drop-in replacement)
- Automatic failover when rate limits are hit
- Configurable routing strategies (priority-based or least-used)
- Token and request tracking per provider/model
- Streaming support
- Generic model aliases (`best`, `fast`, `best-large`, etc.)

## Supported Providers

- [Groq](https://console.groq.com)
- [Cerebras](https://cloud.cerebras.ai)

## Installation

```bash
npm install free-tier-router
```

## Quick Start

```typescript
import { createRouter } from "free-tier-router";

const router = createRouter({
  providers: [
    { type: "groq", apiKey: process.env.GROQ_API_KEY },
    { type: "cerebras", apiKey: process.env.CEREBRAS_API_KEY },
  ],
});

// OpenAI-compatible interface
const response = await router.chat.completions.create({
  model: "llama-3.3-70b",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);

// Or with metadata about which provider was used
const { response, metadata } = await router.createCompletion({
  model: "best", // Generic alias - picks best available model
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(`Provider: ${metadata.provider}, Model: ${metadata.model}`);
```

## Configuration

```typescript
const router = createRouter({
  // Required: at least one provider
  providers: [
    {
      type: "groq",
      apiKey: "...",
      priority: 0, // Lower = higher priority (default: 0)
      enabled: true, // Default: true
    },
    {
      type: "cerebras",
      apiKey: "...",
      priority: 1,
    },
  ],

  // Routing strategy: "priority" (default) or "least-used"
  strategy: "priority",

  // Request timeout in ms (default: 60000)
  timeoutMs: 60000,

  // Custom model aliases
  modelAliases: {
    "my-fast-model": "llama-3.1-8b",
  },

  // Retry configuration
  retry: {
    maxRetries: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    backoffMultiplier: 2,
  },

  // State persistence: "memory" (default), "file", or "redis"
  stateStore: { type: "memory" },
});
```

## Available Models

| Model | Tier | Family |
|-------|------|--------|
| llama-3.3-70b | 3 (Large) | Llama |
| qwen-3-32b | 2 (Medium) | Qwen |
| llama-3.1-8b | 1 (Small) | Llama |

## Generic Aliases

Use these instead of specific model names for automatic routing:

- `best` - Best available model (any tier)
- `best-large` - Best large model (tier 3)
- `best-medium` - Best medium model (tier 2)
- `best-small` / `fast` - Best small model (tier 1)

## Streaming

```typescript
const { stream, metadata } = await router.createCompletionStream({
  model: "llama-3.3-70b",
  messages: [{ role: "user", content: "Tell me a story" }],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

## API Reference

### Router Methods

```typescript
// OpenAI-compatible interface
router.chat.completions.create(params)

// With metadata
router.createCompletion(params) // Returns { response, metadata }
router.createCompletionStream(params) // Returns { stream, metadata }

// Utilities
router.listModels() // List available models
router.isModelAvailable(model) // Check model availability
router.getQuotaStatus() // Get rate limit status for all providers
router.clearAllCooldowns() // Reset rate limit tracking
router.close() // Clean up resources
```

## License

MIT
