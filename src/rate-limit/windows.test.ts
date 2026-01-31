import { describe, it, expect } from "vitest";
import {
  getWindowStart,
  getWindowEnd,
  getTimeUntilReset,
  makeUsageKey,
  WINDOW_DURATION_MS,
} from "./windows.js";

describe("windows", () => {
  describe("getWindowStart", () => {
    it("aligns minute windows to :00 seconds", () => {
      // 2024-01-15 10:30:45.123 UTC
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 45, 123);

      const windowStart = getWindowStart("minute", timestamp);

      // Should align to 10:30:00.000
      expect(new Date(windowStart).toISOString()).toBe(
        "2024-01-15T10:30:00.000Z"
      );
    });

    it("aligns hour windows to :00:00", () => {
      // 2024-01-15 10:30:45.123 UTC
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 45, 123);

      const windowStart = getWindowStart("hour", timestamp);

      // Should align to 10:00:00.000
      expect(new Date(windowStart).toISOString()).toBe(
        "2024-01-15T10:00:00.000Z"
      );
    });

    it("aligns day windows to 00:00:00 UTC", () => {
      // 2024-01-15 10:30:45.123 UTC
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 45, 123);

      const windowStart = getWindowStart("day", timestamp);

      // Should align to 00:00:00.000
      expect(new Date(windowStart).toISOString()).toBe(
        "2024-01-15T00:00:00.000Z"
      );
    });
  });

  describe("getWindowEnd", () => {
    it("returns start + duration", () => {
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 45);

      const minuteEnd = getWindowEnd("minute", timestamp);
      const hourEnd = getWindowEnd("hour", timestamp);

      expect(new Date(minuteEnd).toISOString()).toBe(
        "2024-01-15T10:31:00.000Z"
      );
      expect(new Date(hourEnd).toISOString()).toBe("2024-01-15T11:00:00.000Z");
    });
  });

  describe("getTimeUntilReset", () => {
    it("calculates remaining time in current window", () => {
      // 30 seconds into a minute window
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 30);

      const remaining = getTimeUntilReset("minute", timestamp);

      // 30 seconds remaining
      expect(remaining).toBe(30_000);
    });

    it("returns full duration at window start", () => {
      // Exactly at minute boundary
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 0);

      const remaining = getTimeUntilReset("minute", timestamp);

      expect(remaining).toBe(WINDOW_DURATION_MS.minute);
    });
  });

  describe("makeUsageKey", () => {
    it("creates composite key from provider, model, and window", () => {
      const key = makeUsageKey("groq", "llama-3.3-70b", "minute");

      expect(key).toBe("groq:llama-3.3-70b:minute");
    });
  });
});
