/**
 * Playground: Test all providers
 *
 * Usage:
 *   1. Copy .env.example to .env and add your API keys
 *   2. Run: npx tsx playground/test-providers.ts
 *
 * Or run with inline env vars:
 *   GROQ_API_KEY=xxx CEREBRAS_API_KEY=xxx npx tsx playground/test-providers.ts
 */

import OpenAI from "openai";
import {
  GROQ_PROVIDER,
  CEREBRAS_PROVIDER,
  OPENROUTER_PROVIDER,
  NVIDIA_NIM_PROVIDER,
} from "../src/providers/index.js";
import type { ProviderDefinition } from "../src/types/provider.js";

// ─────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const NVIDIA_NIM_API_KEY = process.env.NVIDIA_NIM_API_KEY;

const TEST_MESSAGE = "What is 2 + 2? Answer in one word.";

// ─────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────

const log = (message: string) => console.log(`\n${message}`);
const divider = () => console.log("─".repeat(60));

/**
 * Create an OpenAI client configured for a provider
 */
const createClient = (provider: ProviderDefinition, apiKey: string): OpenAI => {
  return new OpenAI({
    apiKey,
    baseURL: provider.baseUrl,
  });
};

// ─────────────────────────────────────────────────────────────────
// Test Non-Streaming Completion
// ─────────────────────────────────────────────────────────────────

const testCompletion = async (
  providerName: string,
  client: OpenAI,
  model: string
) => {
  log(`Testing ${providerName} (${model}) - Non-Streaming`);
  divider();

  const start = Date.now();

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: TEST_MESSAGE }],
      max_tokens: 50,
    });

    const elapsed = Date.now() - start;
    const content = response.choices[0]?.message?.content ?? "(no content)";

    console.log(`Response: ${content}`);
    console.log(`Tokens: ${response.usage?.total_tokens ?? "N/A"}`);
    console.log(`Latency: ${elapsed}ms`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
  }
};

// ─────────────────────────────────────────────────────────────────
// Test Streaming Completion
// ─────────────────────────────────────────────────────────────────

const testStreamingCompletion = async (
  providerName: string,
  client: OpenAI,
  model: string
) => {
  log(`Testing ${providerName} (${model}) - Streaming`);
  divider();

  const start = Date.now();

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: TEST_MESSAGE }],
      max_tokens: 50,
      stream: true,
    });

    process.stdout.write("Response: ");

    let chunkCount = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        process.stdout.write(delta);
        chunkCount++;
      }
    }

    const elapsed = Date.now() - start;
    console.log(`\nChunks: ${chunkCount}`);
    console.log(`Latency: ${elapsed}ms`);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
  }
};

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

const main = async () => {
  console.log("🚀 Free Tier Router - Provider Playground\n");

  // Test Groq
  if (GROQ_API_KEY) {
    const groqClient = createClient(GROQ_PROVIDER, GROQ_API_KEY);
    const groqModel = GROQ_PROVIDER.models[0]?.id ?? "llama-3.1-8b-instant";

    await testCompletion("Groq", groqClient, groqModel);
    await testStreamingCompletion("Groq", groqClient, groqModel);
  } else {
    log("⚠️  GROQ_API_KEY not set - skipping Groq tests");
  }

  // Test Cerebras
  if (CEREBRAS_API_KEY) {
    const cerebrasClient = createClient(CEREBRAS_PROVIDER, CEREBRAS_API_KEY);
    const cerebrasModel = CEREBRAS_PROVIDER.models[0]?.id ?? "llama-3.1-8b";

    await testCompletion("Cerebras", cerebrasClient, cerebrasModel);
    await testStreamingCompletion("Cerebras", cerebrasClient, cerebrasModel);
  } else {
    log("⚠️  CEREBRAS_API_KEY not set - skipping Cerebras tests");
  }

  // Test OpenRouter
  if (OPENROUTER_API_KEY) {
    const openrouterClient = createClient(
      OPENROUTER_PROVIDER,
      OPENROUTER_API_KEY
    );
    const openrouterModel =
      OPENROUTER_PROVIDER.models[0]?.id ?? "openai/gpt-oss-120b:free";

    await testCompletion("OpenRouter", openrouterClient, openrouterModel);
    await testStreamingCompletion(
      "OpenRouter",
      openrouterClient,
      openrouterModel
    );
  } else {
    log("⚠️  OPENROUTER_API_KEY not set - skipping OpenRouter tests");
  }

  // Test NVIDIA NIM
  if (NVIDIA_NIM_API_KEY) {
    const nvidiaNimClient = createClient(
      NVIDIA_NIM_PROVIDER,
      NVIDIA_NIM_API_KEY
    );
    const nvidiaNimModel =
      NVIDIA_NIM_PROVIDER.models[0]?.id ?? "openai/gpt-oss-120b";

    await testCompletion("NVIDIA NIM", nvidiaNimClient, nvidiaNimModel);
    await testStreamingCompletion(
      "NVIDIA NIM",
      nvidiaNimClient,
      nvidiaNimModel
    );
  } else {
    log("⚠️  NVIDIA_NIM_API_KEY not set - skipping NVIDIA NIM tests");
  }

  if (
    !GROQ_API_KEY &&
    !CEREBRAS_API_KEY &&
    !OPENROUTER_API_KEY &&
    !NVIDIA_NIM_API_KEY
  ) {
    console.log("\n💡 To run tests, set your API keys:");
    console.log("   export GROQ_API_KEY=your-key-here");
    console.log("   export CEREBRAS_API_KEY=your-key-here");
    console.log("   export OPENROUTER_API_KEY=your-key-here");
    console.log("   export NVIDIA_NIM_API_KEY=your-key-here");
    console.log("\n   Or copy playground/.env.example to playground/.env");
  }

  log("✅ Done!");
};

main().catch(console.error);
