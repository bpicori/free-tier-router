# free-tier-router

A TypeScript library that routes LLM API requests across multiple free-tier providers with intelligent rate limit management and automatic failover.

## Features

- **OpenAI-compatible API** - Drop-in replacement for the OpenAI SDK
- **Automatic failover** - Seamlessly switches providers when rate limits are hit
- **Multiple providers** - Groq, Cerebras, OpenRouter, NVIDIA NIM
- **Smart routing strategies** - Priority-based or least-used selection
- **Rate limit tracking** - Token and request tracking per provider/model
- **Streaming support** - Full support for streaming responses
- **Generic model aliases** - Use `best`, `fast`, etc. for automatic model selection

## Supported Providers

| Provider | Free Tier Limits | Sign Up |
|----------|------------------|---------|
| [Groq](https://console.groq.com) | 30 req/min, 14,400 req/day | [Get API Key](https://console.groq.com/keys) |
| [Cerebras](https://cloud.cerebras.ai) | 30 req/min, 14,400 req/day | [Get API Key](https://cloud.cerebras.ai/) |
| [OpenRouter](https://openrouter.ai) | 20 req/min, 50 req/day | [Get API Key](https://openrouter.ai/keys) |
| [NVIDIA NIM](https://build.nvidia.com) | 40 req/min | [Get API Key](https://build.nvidia.com/) (requires phone verification) |

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
    { type: "openrouter", apiKey: process.env.OPENROUTER_API_KEY },
    { type: "nvidia-nim", apiKey: process.env.NVIDIA_NIM_API_KEY },
  ],
});

// OpenAI-compatible interface
const response = await router.chat.completions.create({
  model: "llama-3.3-70b",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(response.choices[0].message.content);
```

### With Metadata

```typescript
// Get metadata about which provider was used
const { response, metadata } = await router.createCompletion({
  model: "best", // Generic alias - picks best available model
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(`Provider: ${metadata.provider}, Model: ${metadata.model}`);
console.log(`Latency: ${metadata.latencyMs}ms, Retries: ${metadata.retryCount}`);
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
    {
      type: "openrouter",
      apiKey: "...",
      priority: 2,
    },
    {
      type: "nvidia-nim",
      apiKey: "...",
      priority: 3,
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

| Model | Tier | Providers |
|-------|------|-----------|
| `gpt-oss-120b` | 4 (XL) | Groq, Cerebras, OpenRouter, NVIDIA NIM |
| `llama-3.3-70b` | 3 (Large) | Groq, Cerebras, OpenRouter, NVIDIA NIM |
| `qwen-3-32b` | 2 (Medium) | Groq, OpenRouter |
| `llama-3.1-8b` | 1 (Small) | Groq, Cerebras, OpenRouter, NVIDIA NIM |

## Generic Aliases

Use these instead of specific model names for automatic routing:

| Alias | Description |
|-------|-------------|
| `best` | Best available model (any tier) |
| `best-xl` | Best XL model (tier 4, 100B+) |
| `best-large` | Best large model (tier 3, 36-100B) |
| `best-medium` | Best medium model (tier 2, 9-35B) |
| `best-small` | Best small model (tier 1, 1-8B) |
| `fast` | Alias for `best-small` |

## Streaming

```typescript
const { stream, metadata } = await router.createCompletionStream({
  model: "llama-3.3-70b",
  messages: [{ role: "user", content: "Tell me a story" }],
});

console.log(`Using: ${metadata.provider}/${metadata.model}`);

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

## API Reference

### Router Methods

```typescript
// OpenAI-compatible interface
router.chat.completions.create(params);

// With metadata
router.createCompletion(params); // Returns { response, metadata }
router.createCompletionStream(params); // Returns { stream, metadata }

// Utilities
router.listModels(); // List available models
router.isModelAvailable(model); // Check model availability
router.getQuotaStatus(); // Get rate limit status for all providers
router.clearAllCooldowns(); // Reset rate limit tracking
router.close(); // Clean up resources
```

### Metadata Object

```typescript
interface CompletionMetadata {
  provider: "groq" | "cerebras" | "openrouter" | "nvidia-nim";
  model: string;
  latencyMs: number;
  retryCount: number;
}
```

## Routing Strategies

### Priority Strategy (default)

Providers are tried in order of priority (lower number = higher priority). Use this when you have a preferred provider.

```typescript
const router = createRouter({
  providers: [
    { type: "groq", apiKey: "...", priority: 0 }, // Tried first
    { type: "cerebras", apiKey: "...", priority: 1 }, // Fallback
  ],
  strategy: "priority",
});
```

### Least-Used Strategy

Distributes requests across providers based on remaining quota. Use this to maximize throughput across all providers.

```typescript
const router = createRouter({
  providers: [
    { type: "groq", apiKey: "..." },
    { type: "cerebras", apiKey: "..." },
    { type: "openrouter", apiKey: "..." },
  ],
  strategy: "least-used",
});
```


## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run playground chat
npm run playground:chat
```

## License

MIT
