/**
 * Playground: Test Groq and Cerebras providers
 *
 * Usage:
 *   1. Copy .env.example to .env and add your API keys
 *   2. Run: npx tsx playground/test-providers.ts
 *
 * Or run with inline env vars:
 *   GROQ_API_KEY=xxx CEREBRAS_API_KEY=xxx npx tsx playground/test-providers.ts
 */

import { createGroqProvider, createCerebrasProvider } from "../src/providers/index.js";

// ─────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

const TEST_MESSAGE = "What is 2 + 2? Answer in one word.";

// ─────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────

const log = (message: string) => console.log(`\n${message}`);
const divider = () => console.log("─".repeat(60));

// ─────────────────────────────────────────────────────────────────
// Test Non-Streaming Completion
// ─────────────────────────────────────────────────────────────────

const testCompletion = async (
  providerName: string,
  createFn: () => ReturnType<typeof createGroqProvider>,
  model: string
) => {
  log(`Testing ${providerName} (${model}) - Non-Streaming`);
  divider();

  const provider = createFn();
  const start = Date.now();

  try {
    const response = await provider.createCompletion({
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
  createFn: () => ReturnType<typeof createGroqProvider>,
  model: string
) => {
  log(`Testing ${providerName} (${model}) - Streaming`);
  divider();

  const provider = createFn();
  const start = Date.now();

  try {
    const stream = provider.createCompletionStream({
      model,
      messages: [{ role: "user", content: TEST_MESSAGE }],
      max_tokens: 50,
    });

    process.stdout.write("Response: ");

    let tokenCount = 0;
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        process.stdout.write(delta);
        tokenCount++;
      }
    }

    const elapsed = Date.now() - start;
    console.log(`\nChunks: ${tokenCount}`);
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
    const createGroq = () => createGroqProvider({ apiKey: GROQ_API_KEY });

    await testCompletion("Groq", createGroq, "llama-3.1-8b");
    await testStreamingCompletion("Groq", createGroq, "llama-3.1-8b");
  } else {
    log("⚠️  GROQ_API_KEY not set - skipping Groq tests");
  }

  // Test Cerebras
  if (CEREBRAS_API_KEY) {
    const createCerebras = () => createCerebrasProvider({ apiKey: CEREBRAS_API_KEY });

    await testCompletion("Cerebras", createCerebras, "llama-3.1-8b");
    await testStreamingCompletion("Cerebras", createCerebras, "llama-3.1-8b");
  } else {
    log("⚠️  CEREBRAS_API_KEY not set - skipping Cerebras tests");
  }

  if (!GROQ_API_KEY && !CEREBRAS_API_KEY) {
    console.log("\n💡 To run tests, set your API keys:");
    console.log("   export GROQ_API_KEY=your-key-here");
    console.log("   export CEREBRAS_API_KEY=your-key-here");
    console.log("\n   Or copy playground/.env.example to playground/.env");
  }

  log("✅ Done!");
};

main().catch(console.error);
