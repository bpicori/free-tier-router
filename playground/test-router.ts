/**
 * Playground: Test Free Tier Router Usage & Ergonomics
 *
 * This file demonstrates the main API patterns for the router:
 * - OpenAI-compatible interface
 * - Creating completions with metadata
 * - Streaming completions
 * - Model aliases (generic and specific)
 * - Quota status inspection
 * - Available models listing
 *
 * Usage:
 *   1. Copy .env.example to .env and add your API keys
 *   2. Run: npx tsx playground/test-router.ts
 *
 * Or run with inline env vars:
 *   GROQ_API_KEY=xxx CEREBRAS_API_KEY=xxx npx tsx playground/test-router.ts
 */

import { createRouter, type Router, type CompletionMetadata } from "../src/router.js";
import type { ProviderConfig, RoutingStrategyType } from "../src/types/config.js";

// ─────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

// ─────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────

const log = (message: string) => console.log(`\n${message}`);
const divider = () => console.log("─".repeat(60));

const formatMetadata = (metadata: CompletionMetadata | Omit<CompletionMetadata, "latencyMs">) => {
  const parts = [
    `provider: ${metadata.provider}`,
    `model: ${metadata.model}`,
    `retries: ${metadata.retryCount}`,
  ];
  if ("latencyMs" in metadata) {
    parts.push(`latency: ${metadata.latencyMs}ms`);
  }
  return parts.join(", ");
};

// ─────────────────────────────────────────────────────────────────
// Test 1: OpenAI-Compatible Interface
// ─────────────────────────────────────────────────────────────────

const testOpenAICompatible = async (router: Router) => {
  log("📌 Test 1: OpenAI-Compatible Interface");
  divider();
  console.log("Using router.chat.completions.create() - drop-in replacement for OpenAI SDK\n");

  try {
    const response = await router.chat.completions.create({
      model: "llama-3.3-70b", // Use a model alias
      messages: [{ role: "user", content: "What is 2 + 2? Answer in one word." }],
      max_tokens: 50,
    });

    console.log(`Response: ${response.choices[0]?.message?.content ?? "(no content)"}`);
    console.log(`Tokens used: ${response.usage?.total_tokens ?? "N/A"}`);
    console.log(`Model returned: ${response.model}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
  }
};

// ─────────────────────────────────────────────────────────────────
// Test 2: Completion with Metadata
// ─────────────────────────────────────────────────────────────────

const testCompletionWithMetadata = async (router: Router) => {
  log("📌 Test 2: Completion with Metadata");
  divider();
  console.log("Using router.createCompletion() - includes routing metadata\n");

  try {
    const { response, metadata } = await router.createCompletion({
      model: "llama-3.1-8b",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Explain quantum computing in 20 words." },
      ],
      max_tokens: 100,
    });

    console.log(`Response: ${response.choices[0]?.message?.content ?? "(no content)"}`);
    console.log(`Metadata: ${formatMetadata(metadata)}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
  }
};

// ─────────────────────────────────────────────────────────────────
// Test 3: Streaming Completion
// ─────────────────────────────────────────────────────────────────

const testStreamingCompletion = async (router: Router) => {
  log("📌 Test 3: Streaming Completion");
  divider();
  console.log("Using router.createCompletionStream() - streaming with metadata\n");

  try {
    const { stream, metadata } = await router.createCompletionStream({
      model: "llama-3.1-8b",
      messages: [{ role: "user", content: "Count from 1 to 5." }],
      max_tokens: 50,
    });

    console.log(`Metadata: ${formatMetadata(metadata)}`);
    process.stdout.write("Response: ");

    let chunkCount = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        process.stdout.write(delta);
        chunkCount++;
      }
    }

    console.log(`\nChunks received: ${chunkCount}`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
  }
};

// ─────────────────────────────────────────────────────────────────
// Test 4: OpenAI-Compatible Streaming
// ─────────────────────────────────────────────────────────────────

const testOpenAICompatibleStreaming = async (router: Router) => {
  log("📌 Test 4: OpenAI-Compatible Streaming");
  divider();
  console.log("Using router.chat.completions.create({ stream: true })\n");

  try {
    const stream = await router.chat.completions.create({
      model: "llama-3.1-8b",
      messages: [{ role: "user", content: "Say hello in 3 languages." }],
      max_tokens: 100,
      stream: true,
    });

    process.stdout.write("Response: ");

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        process.stdout.write(delta);
      }
    }
    console.log();
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
  }
};

// ─────────────────────────────────────────────────────────────────
// Test 5: Generic Model Aliases
// ─────────────────────────────────────────────────────────────────

const testGenericAliases = async (router: Router) => {
  log("📌 Test 5: Generic Model Aliases");
  divider();
  console.log("Using generic aliases like 'fast', 'best', 'reasoning'\n");

  const aliases = ["fast", "best", "reasoning"];

  for (const alias of aliases) {
    const isAvailable = router.isModelAvailable(alias);
    console.log(`  ${alias}: ${isAvailable ? "✅ available" : "❌ not available"}`);
  }

  // Try using the 'fast' alias
  if (router.isModelAvailable("fast")) {
    console.log("\nTrying 'fast' alias:");
    try {
      const { response, metadata } = await router.createCompletion({
        model: "fast",
        messages: [{ role: "user", content: "Say hi!" }],
        max_tokens: 20,
      });

      console.log(`  Response: ${response.choices[0]?.message?.content ?? "(no content)"}`);
      console.log(`  Routed to: ${metadata.provider}/${metadata.model}`);
    } catch (error) {
      console.error(`  Error: ${error instanceof Error ? error.message : error}`);
    }
  }
};

// ─────────────────────────────────────────────────────────────────
// Test 6: List Available Models
// ─────────────────────────────────────────────────────────────────

const testListModels = (router: Router) => {
  log("📌 Test 6: List Available Models");
  divider();
  console.log("Using router.listModels() - see all available models\n");

  const models = router.listModels();

  console.log(`Total models: ${models.length}\n`);

  // Group by quality tier
  const tiers: Record<number, string[]> = {};
  for (const model of models) {
    const tier = model.qualityTier;
    if (!tiers[tier]) {
      tiers[tier] = [];
    }
    tiers[tier].push(model.id);
  }

  for (const tier of [5, 4, 3, 2, 1]) {
    if (tiers[tier]) {
      console.log(`Tier ${tier}:`);
      for (const modelId of tiers[tier]) {
        console.log(`  - ${modelId}`);
      }
    }
  }
};

// ─────────────────────────────────────────────────────────────────
// Test 7: Quota Status
// ─────────────────────────────────────────────────────────────────

const testQuotaStatus = async (router: Router) => {
  log("📌 Test 7: Quota Status");
  divider();
  console.log("Using router.getQuotaStatus() - check rate limit status\n");

  const status = await router.getQuotaStatus();

  for (const { provider, model, quota } of status.slice(0, 5)) {
    console.log(`${provider}/${model}:`);
    const reqMin = quota.requestsRemaining.minute;
    const tokMin = quota.tokensRemaining.minute;
    console.log(`  Requests/min remaining: ${reqMin ?? "∞"}`);
    console.log(`  Tokens/min remaining: ${tokMin ?? "∞"}`);
    if (quota.cooldownUntil) {
      console.log(`  Cooldown until: ${quota.cooldownUntil.toISOString()}`);
    }
  }

  if (status.length > 5) {
    console.log(`\n... and ${status.length - 5} more provider/model combinations`);
  }
};

// ─────────────────────────────────────────────────────────────────
// Test 8: Custom Model Aliases
// ─────────────────────────────────────────────────────────────────

const testCustomAliases = async () => {
  log("📌 Test 8: Custom Model Aliases");
  divider();
  console.log("Creating router with custom modelAliases config\n");

  const providers: ProviderConfig[] = [];
  if (GROQ_API_KEY) providers.push({ type: "groq", apiKey: GROQ_API_KEY });
  if (CEREBRAS_API_KEY) providers.push({ type: "cerebras", apiKey: CEREBRAS_API_KEY });

  if (providers.length === 0) {
    console.log("⚠️  No API keys available");
    return;
  }

  const router = createRouter({
    providers,
    strategy: "priority",
    modelAliases: {
      "my-favorite-model": "llama-3.1-8b",
      "gpt-4": "llama-3.3-70b", // Alias GPT-4 to best available
    },
  });

  try {
    console.log("Using custom alias 'my-favorite-model' -> 'llama-3.1-8b':");
    const { response, metadata } = await router.createCompletion({
      model: "my-favorite-model",
      messages: [{ role: "user", content: "Hi!" }],
      max_tokens: 20,
    });

    console.log(`  Response: ${response.choices[0]?.message?.content ?? "(no content)"}`);
    console.log(`  Routed to: ${metadata.provider}/${metadata.model}`);
  } catch (error) {
    console.error(`  Error: ${error instanceof Error ? error.message : error}`);
  }

  await router.close();
};

// ─────────────────────────────────────────────────────────────────
// Test 9: Different Strategies
// ─────────────────────────────────────────────────────────────────

const testStrategies = async () => {
  log("📌 Test 9: Routing Strategies");
  divider();
  console.log("Testing different routing strategies\n");

  const providers: ProviderConfig[] = [];
  if (GROQ_API_KEY) providers.push({ type: "groq", apiKey: GROQ_API_KEY, priority: 1 });
  if (CEREBRAS_API_KEY) providers.push({ type: "cerebras", apiKey: CEREBRAS_API_KEY, priority: 2 });

  if (providers.length < 2) {
    console.log("⚠️  Need at least 2 providers to test strategies");
    return;
  }

  const strategies: RoutingStrategyType[] = ["priority", "least-used"];

  for (const strategy of strategies) {
    console.log(`\nStrategy: ${strategy}`);
    const router = createRouter({ providers, strategy });

    try {
      // Make 3 requests to see the routing pattern
      for (let i = 0; i < 3; i++) {
        const { metadata } = await router.createCompletion({
          model: "llama-3.1-8b",
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 5,
        });
        console.log(`  Request ${i + 1}: ${metadata.provider}`);
      }
    } catch (error) {
      console.error(`  Error: ${error instanceof Error ? error.message : error}`);
    }

    await router.close();
  }
};

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

const main = async () => {
  console.log("🚀 Free Tier Router - Ergonomics Playground\n");
  console.log("This playground demonstrates the router's API patterns.\n");

  // Check for API keys
  const providers: ProviderConfig[] = [];
  if (GROQ_API_KEY) {
    providers.push({ type: "groq", apiKey: GROQ_API_KEY });
    console.log("✅ GROQ_API_KEY found");
  } else {
    console.log("⚠️  GROQ_API_KEY not set");
  }

  if (CEREBRAS_API_KEY) {
    providers.push({ type: "cerebras", apiKey: CEREBRAS_API_KEY });
    console.log("✅ CEREBRAS_API_KEY found");
  } else {
    console.log("⚠️  CEREBRAS_API_KEY not set");
  }

  if (providers.length === 0) {
    console.log("\n💡 To run tests, set your API keys:");
    console.log("   export GROQ_API_KEY=your-key-here");
    console.log("   export CEREBRAS_API_KEY=your-key-here");
    console.log("\n   Or copy playground/.env.example to playground/.env");
    return;
  }

  // Create router with default settings
  const router = createRouter({
    providers,
    strategy: "least-used",
  });

  try {
    // Run all tests
    await testOpenAICompatible(router);
    await testCompletionWithMetadata(router);
    await testStreamingCompletion(router);
    await testOpenAICompatibleStreaming(router);
    await testGenericAliases(router);
    testListModels(router);
    await testQuotaStatus(router);
    await testCustomAliases();
    await testStrategies();

    log("✅ All tests completed!");
  } finally {
    await router.close();
  }
};

main().catch(console.error);
