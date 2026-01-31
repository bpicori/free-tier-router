# Rate Limiting

This document explains how rate limiting works in the free-tier router library.

## Overview

The rate-limit module tracks API usage across multiple time windows and manages cooldowns when rate limits are hit. It enables the router to make intelligent decisions about which providers have available quota before attempting requests.

## Core Concepts

### Time Windows

Rate limits are tracked across three time windows, aligned to clock boundaries:

| Window | Duration | Alignment |
|--------|----------|-----------|
| minute | 60s | :00 seconds |
| hour | 3600s | :00:00 |
| day | 86400s | 00:00:00 UTC |

```typescript
import { getWindowStart, getWindowEnd, getTimeUntilReset } from "free-tier-router";

const now = Date.now();

// Get when the current minute window started
getWindowStart("minute", now);  // e.g., 1706745600000

// Get when it will reset
getWindowEnd("minute", now);    // e.g., 1706745660000

// Get ms until reset
getTimeUntilReset("minute", now);  // e.g., 45000 (45 seconds)
```

### Usage Tracking

Each request records both request count and token usage in all three windows simultaneously:

```
Request: 500 tokens
    │
    ▼
┌─────────────────────────────────────┐
│  Record in minute window            │  key: "groq:llama-3.3-70b:minute"
│  Record in hour window              │  key: "groq:llama-3.3-70b:hour"
│  Record in day window               │  key: "groq:llama-3.3-70b:day"
└─────────────────────────────────────┘
```

### Cooldowns

When a provider returns 429 (rate limited), the tracker puts it in cooldown:

```
429 Response
    │
    ▼
┌─────────────────────────────────────┐
│  Parse Retry-After header           │  If present, use that duration
│  OR use default (60s)               │  Otherwise, 60 second cooldown
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Provider enters cooldown           │  All requests blocked until expiry
└─────────────────────────────────────┘
```

## Rate Limit Tracker

The main interface for tracking usage and checking quota.

### Creating a Tracker

```typescript
import { createRateLimitTracker } from "free-tier-router";
import { createMemoryStore } from "free-tier-router/stores";

const tracker = createRateLimitTracker({
  store: createMemoryStore(),
  defaultCooldownMs: 60_000,  // 60s cooldown when no Retry-After
});
```

### API Methods

| Method | Description |
|--------|-------------|
| `recordUsage(provider, model, tokens)` | Record usage after successful request |
| `getQuotaStatus(provider, model, limits)` | Get current quota across all windows |
| `canMakeRequest(provider, model, limits, estimatedTokens?)` | Check if request is allowed |
| `markRateLimited(provider, model, resetAt?)` | Enter cooldown after 429 |
| `isInCooldown(provider, model)` | Check if provider is in cooldown |
| `getCooldownUntil(provider, model)` | Get cooldown expiration time |
| `clearCooldown(provider, model)` | Clear cooldown (e.g., after manual reset) |

### Checking Quota

```typescript
const limits = {
  requestsPerMinute: 30,
  requestsPerDay: 14400,
  tokensPerDay: 500_000,
};

// Get detailed quota status
const quota = await tracker.getQuotaStatus("groq", "llama-3.3-70b", limits);
console.log(quota.requestsRemaining.minute);  // 25
console.log(quota.tokensRemaining.day);       // 450000
console.log(quota.resetTimes.minute);         // Date when minute resets

// Simple availability check
const canRequest = await tracker.canMakeRequest(
  "groq",
  "llama-3.3-70b",
  limits,
  500  // estimated tokens for this request
);
```

### Recording Usage

```typescript
// After a successful request, record the usage
await tracker.recordUsage("groq", "llama-3.3-70b", 523);
```

### Handling 429 Responses

```typescript
// When receiving a 429, mark the provider as rate limited
const retryAfter = response.headers.get("Retry-After");
const resetAt = retryAfter 
  ? new Date(Date.now() + parseInt(retryAfter) * 1000)
  : undefined;

await tracker.markRateLimited("groq", "llama-3.3-70b", resetAt);

// Check cooldown status
if (await tracker.isInCooldown("groq", "llama-3.3-70b")) {
  const until = await tracker.getCooldownUntil("groq", "llama-3.3-70b");
  console.log(`Rate limited until ${until}`);
}
```

## Token Estimation

Since providers charge by tokens but we don't know exact counts until after tokenization, the module provides estimation utilities.

```typescript
import { 
  estimateTokens, 
  estimateMessageTokens, 
  estimateChatTokens 
} from "free-tier-router";

// Estimate tokens from raw text (~4 chars per token)
estimateTokens("Hello, world!");  // 4

// Estimate with message overhead (+4 tokens for role/formatting)
estimateMessageTokens("Hello, world!");  // 8

// Estimate full chat completion
estimateChatTokens([
  { content: "You are helpful." },
  { content: "What is 2+2?" },
]);  // ~15 tokens
```

### Accuracy Notes

| Content Type | Accuracy |
|--------------|----------|
| English prose | ~4 chars/token (accurate) |
| Code | ~3 chars/token (underestimates) |
| Non-Latin scripts | ~1-2 chars/token (significantly underestimates) |

Estimates are rounded up to avoid underestimating usage.

## Architecture

```
src/rate-limit/
  ├── index.ts      Re-exports public API
  ├── tracker.ts    Rate limit tracker implementation
  ├── windows.ts    Time window utilities
  └── tokens.ts     Token estimation utilities
```

### Data Flow

```
Request comes in
      │
      ▼
┌─────────────────────────────────────┐
│  1. Estimate tokens                 │  tokens.ts
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│  2. Check if request allowed        │  tracker.canMakeRequest()
│     - Check cooldown status         │
│     - Check quota in all windows    │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│  3. Make request to provider        │
└─────────────────────────────────────┘
      │
      ├── Success ──▶ tracker.recordUsage()
      │
      └── 429 ──────▶ tracker.markRateLimited()
```

## State Storage

The tracker requires a `StateStore` implementation for persistence:

```typescript
interface StateStore {
  // Usage tracking
  getUsage(key: string): Promise<UsageRecord | null>;
  setUsage(key: string, record: UsageRecord, ttlMs?: number): Promise<void>;
  incrementUsage(key, requests, tokens, windowStart, ttlMs): Promise<UsageRecord>;
  
  // Cooldown management
  getCooldown(provider: string, model: string): Promise<CooldownRecord | null>;
  setCooldown(record: CooldownRecord): Promise<void>;
  removeCooldown(provider: string, model: string): Promise<void>;
  
  // Cleanup
  clear(): Promise<void>;
  close(): Promise<void>;
}
```

The library provides a `MemoryStore` for in-process storage. For distributed deployments, implement a Redis-backed store.

## Integration with Router

The router uses the rate limit tracker internally:

1. **Pre-request**: Calls `canMakeRequest()` to filter available providers
2. **Provider selection**: Uses quota status to rank providers (least-used strategy)
3. **Post-request**: Calls `recordUsage()` with actual token count
4. **On 429**: Calls `markRateLimited()` and retries with next provider

## See Also

- [Router](./router.md) - How the router uses rate limiting
- [Model Aliases](./model-aliases.md) - Model name resolution
