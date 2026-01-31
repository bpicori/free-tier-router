import { describe, it, expect, beforeEach } from "vitest";
import { createRateLimitTracker, type RateLimitTracker } from "./tracker.js";
import { createMemoryStore } from "../state/memory.js";
import type { StateStore } from "../types/state.js";
import type { RateLimits } from "../types/models.js";

describe("RateLimitTracker", () => {
  let store: StateStore;
  let tracker: RateLimitTracker;

  beforeEach(() => {
    store = createMemoryStore();
    tracker = createRateLimitTracker({ store });
  });

  // ─────────────────────────────────────────────────────────────────
  // Recording Usage
  // ─────────────────────────────────────────────────────────────────

  describe("recordUsage", () => {
    it("tracks requests and tokens across all time windows", async () => {
      const limits: RateLimits = {
        requestsPerMinute: 100,
        requestsPerHour: 1000,
        tokensPerMinute: 10000,
      };

      // Make a request that used 500 tokens
      await tracker.recordUsage("groq", "llama-3.3-70b", 500);

      const quota = await tracker.getQuotaStatus(
        "groq",
        "llama-3.3-70b",
        limits
      );

      // Should have used 1 request and 500 tokens
      expect(quota.requestsRemaining.minute).toBe(99);
      expect(quota.requestsRemaining.hour).toBe(999);
      expect(quota.tokensRemaining.minute).toBe(9500);
    });

    it("accumulates multiple requests", async () => {
      const limits: RateLimits = { requestsPerMinute: 10 };

      await tracker.recordUsage("groq", "llama-3.3-70b", 100);
      await tracker.recordUsage("groq", "llama-3.3-70b", 200);
      await tracker.recordUsage("groq", "llama-3.3-70b", 300);

      const quota = await tracker.getQuotaStatus(
        "groq",
        "llama-3.3-70b",
        limits
      );

      // 3 requests used
      expect(quota.requestsRemaining.minute).toBe(7);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Quota Status
  // ─────────────────────────────────────────────────────────────────

  describe("getQuotaStatus", () => {
    it("returns null for windows without limits", async () => {
      // Only minute limit defined
      const limits: RateLimits = { requestsPerMinute: 100 };

      const quota = await tracker.getQuotaStatus(
        "groq",
        "llama-3.3-70b",
        limits
      );

      expect(quota.requestsRemaining.minute).toBe(100);
      expect(quota.requestsRemaining.hour).toBeNull(); // No hourly limit
      expect(quota.requestsRemaining.day).toBeNull(); // No daily limit
    });

    it("provides reset times for each window", async () => {
      const limits: RateLimits = {
        requestsPerMinute: 100,
        requestsPerHour: 1000,
      };

      const quota = await tracker.getQuotaStatus(
        "groq",
        "llama-3.3-70b",
        limits
      );

      // Reset times should be in the future
      expect(quota.resetTimes.minute).toBeInstanceOf(Date);
      expect(quota.resetTimes.minute!.getTime()).toBeGreaterThan(Date.now());
      expect(quota.resetTimes.hour).toBeInstanceOf(Date);
    });

    it("tracks different providers/models independently", async () => {
      const limits: RateLimits = { requestsPerMinute: 10 };

      await tracker.recordUsage("groq", "llama-3.3-70b", 100);
      await tracker.recordUsage("groq", "llama-3.3-70b", 100);
      await tracker.recordUsage("cerebras", "llama-3.3-70b", 100);

      const groqQuota = await tracker.getQuotaStatus(
        "groq",
        "llama-3.3-70b",
        limits
      );
      const cerebrasQuota = await tracker.getQuotaStatus(
        "cerebras",
        "llama-3.3-70b",
        limits
      );

      expect(groqQuota.requestsRemaining.minute).toBe(8); // 2 requests
      expect(cerebrasQuota.requestsRemaining.minute).toBe(9); // 1 request
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Pre-request Checks
  // ─────────────────────────────────────────────────────────────────

  describe("canMakeRequest", () => {
    it("returns true when under all limits", async () => {
      const limits: RateLimits = {
        requestsPerMinute: 10,
        tokensPerMinute: 1000,
      };

      const canMake = await tracker.canMakeRequest(
        "groq",
        "llama-3.3-70b",
        limits,
        100 // estimated tokens
      );

      expect(canMake).toBe(true);
    });

    it("returns false when request limit exhausted", async () => {
      const limits: RateLimits = { requestsPerMinute: 2 };

      await tracker.recordUsage("groq", "llama-3.3-70b", 100);
      await tracker.recordUsage("groq", "llama-3.3-70b", 100);

      const canMake = await tracker.canMakeRequest(
        "groq",
        "llama-3.3-70b",
        limits
      );

      expect(canMake).toBe(false);
    });

    it("returns false when token limit would be exceeded", async () => {
      const limits: RateLimits = { tokensPerMinute: 1000 };

      await tracker.recordUsage("groq", "llama-3.3-70b", 800);

      // Try to make a 300-token request (would exceed 1000)
      const canMake = await tracker.canMakeRequest(
        "groq",
        "llama-3.3-70b",
        limits,
        300
      );

      expect(canMake).toBe(false);
    });

    it("returns false when in cooldown", async () => {
      const limits: RateLimits = { requestsPerMinute: 100 };

      await tracker.markRateLimited("groq", "llama-3.3-70b");

      const canMake = await tracker.canMakeRequest(
        "groq",
        "llama-3.3-70b",
        limits
      );

      expect(canMake).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Cooldown Management (429 Handling)
  // ─────────────────────────────────────────────────────────────────

  describe("cooldown", () => {
    it("marks provider as rate limited", async () => {
      await tracker.markRateLimited("groq", "llama-3.3-70b");

      const inCooldown = await tracker.isInCooldown("groq", "llama-3.3-70b");

      expect(inCooldown).toBe(true);
    });

    it("uses custom reset time from Retry-After header", async () => {
      const resetAt = new Date(Date.now() + 30_000); // 30 seconds

      await tracker.markRateLimited("groq", "llama-3.3-70b", resetAt);

      const cooldownUntil = await tracker.getCooldownUntil(
        "groq",
        "llama-3.3-70b"
      );

      expect(cooldownUntil?.getTime()).toBe(resetAt.getTime());
    });

    it("uses default cooldown when no reset time provided", async () => {
      const trackerWithCustomDefault = createRateLimitTracker({
        store,
        defaultCooldownMs: 120_000, // 2 minutes
      });

      const before = Date.now();
      await trackerWithCustomDefault.markRateLimited("groq", "llama-3.3-70b");
      const after = Date.now();

      const cooldownUntil = await trackerWithCustomDefault.getCooldownUntil(
        "groq",
        "llama-3.3-70b"
      );

      // Should be ~2 minutes from now
      expect(cooldownUntil!.getTime()).toBeGreaterThanOrEqual(before + 120_000);
      expect(cooldownUntil!.getTime()).toBeLessThanOrEqual(after + 120_000);
    });

    it("can clear cooldown manually", async () => {
      await tracker.markRateLimited("groq", "llama-3.3-70b");
      expect(await tracker.isInCooldown("groq", "llama-3.3-70b")).toBe(true);

      await tracker.clearCooldown("groq", "llama-3.3-70b");

      expect(await tracker.isInCooldown("groq", "llama-3.3-70b")).toBe(false);
    });

    it("cooldown affects only the specific provider/model", async () => {
      await tracker.markRateLimited("groq", "llama-3.3-70b");

      // Same provider, different model
      expect(await tracker.isInCooldown("groq", "llama-3.1-8b")).toBe(false);

      // Different provider, same model
      expect(await tracker.isInCooldown("cerebras", "llama-3.3-70b")).toBe(
        false
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────
  // Quota Status with Cooldown
  // ─────────────────────────────────────────────────────────────────

  describe("quota status includes cooldown", () => {
    it("includes cooldownUntil in quota status", async () => {
      const limits: RateLimits = { requestsPerMinute: 100 };
      const resetAt = new Date(Date.now() + 60_000);

      await tracker.markRateLimited("groq", "llama-3.3-70b", resetAt);

      const quota = await tracker.getQuotaStatus(
        "groq",
        "llama-3.3-70b",
        limits
      );

      expect(quota.cooldownUntil?.getTime()).toBe(resetAt.getTime());
    });

    it("cooldownUntil is undefined when not rate limited", async () => {
      const limits: RateLimits = { requestsPerMinute: 100 };

      const quota = await tracker.getQuotaStatus(
        "groq",
        "llama-3.3-70b",
        limits
      );

      expect(quota.cooldownUntil).toBeUndefined();
    });
  });
});
