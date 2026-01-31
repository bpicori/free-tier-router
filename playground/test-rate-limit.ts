/**
 * Playground: Test Rate Limit Tracker
 *
 * Usage:
 *   npx tsx playground/test-rate-limit.ts
 *
 * This demonstrates the rate limit tracking system without making real API calls.
 */

import { createRateLimitTracker } from "../src/rate-limit/index.js";
import { createMemoryStore } from "../src/state/index.js";
import type { RateLimits } from "../src/types/models.js";

// ─────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────

const log = (message: string) => console.log(`\n${message}`);
const divider = () => console.log("─".repeat(60));

const formatQuota = (quota: Awaited<ReturnType<ReturnType<typeof createRateLimitTracker>["getQuotaStatus"]>>) => {
  console.log("  Requests remaining:");
  console.log(`    Minute: ${quota.requestsRemaining.minute ?? "unlimited"}`);
  console.log(`    Hour:   ${quota.requestsRemaining.hour ?? "unlimited"}`);
  console.log(`    Day:    ${quota.requestsRemaining.day ?? "unlimited"}`);
  console.log("  Tokens remaining:");
  console.log(`    Minute: ${quota.tokensRemaining.minute ?? "unlimited"}`);
  console.log(`    Day:    ${quota.tokensRemaining.day ?? "unlimited"}`);
  if (quota.cooldownUntil) {
    console.log(`  ⚠️  In cooldown until: ${quota.cooldownUntil.toISOString()}`);
  }
};

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

const main = async () => {
  console.log("🚀 Free Tier Router - Rate Limit Tracker Playground\n");

  // Create tracker with memory store
  const store = createMemoryStore();
  const tracker = createRateLimitTracker({ store });

  // Define test limits (similar to Groq free tier)
  const limits: RateLimits = {
    requestsPerMinute: 30,
    requestsPerDay: 14400,
    tokensPerMinute: 6000,
    tokensPerDay: 500000,
  };

  const provider = "groq";
  const model = "llama-3.1-8b";

  // ─────────────────────────────────────────────────────────────────
  // Initial State
  // ─────────────────────────────────────────────────────────────────

  log("📊 Initial quota status:");
  divider();
  let quota = await tracker.getQuotaStatus(provider, model, limits);
  formatQuota(quota);

  // ─────────────────────────────────────────────────────────────────
  // Record Some Usage
  // ─────────────────────────────────────────────────────────────────

  log("📝 Recording 5 requests with 500 tokens each...");
  divider();

  for (let i = 0; i < 5; i++) {
    await tracker.recordUsage(provider, model, 500);
  }

  quota = await tracker.getQuotaStatus(provider, model, limits);
  formatQuota(quota);

  // ─────────────────────────────────────────────────────────────────
  // Check Availability
  // ─────────────────────────────────────────────────────────────────

  log("🔍 Checking availability...");
  divider();

  const canMakeSmallRequest = await tracker.canMakeRequest(provider, model, limits, 100);
  const canMakeLargeRequest = await tracker.canMakeRequest(provider, model, limits, 10000);

  console.log(`  Can make small request (100 tokens): ${canMakeSmallRequest}`);
  console.log(`  Can make large request (10000 tokens): ${canMakeLargeRequest}`);

  // ─────────────────────────────────────────────────────────────────
  // Simulate Rate Limit Hit
  // ─────────────────────────────────────────────────────────────────

  log("⚠️  Simulating 429 rate limit response...");
  divider();

  const cooldownUntil = new Date(Date.now() + 60_000); // 1 minute from now
  await tracker.markRateLimited(provider, model, cooldownUntil);

  const isInCooldown = await tracker.isInCooldown(provider, model);
  console.log(`  Is in cooldown: ${isInCooldown}`);

  quota = await tracker.getQuotaStatus(provider, model, limits);
  formatQuota(quota);

  // ─────────────────────────────────────────────────────────────────
  // Clear Cooldown
  // ─────────────────────────────────────────────────────────────────

  log("🔄 Clearing cooldown...");
  divider();

  await tracker.clearCooldown(provider, model);

  const isInCooldownAfterClear = await tracker.isInCooldown(provider, model);
  console.log(`  Is in cooldown after clear: ${isInCooldownAfterClear}`);

  log("✅ Done!");
};

main().catch(console.error);
