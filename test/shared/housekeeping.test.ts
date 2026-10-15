// SPDX-License-Identifier: MIT
import { describe, expect, it } from "vitest";
import { parseConfig } from "../../src/shared/config/schema";
import { housekeepingDue, today } from "../../src/shared/housekeeping";
import { testConfig } from "../fixtures";

const NOW = Date.parse("2026-10-15T12:00:00Z");
const config = (security: Record<string, unknown>) => parseConfig({ ...testConfig, security });

describe("housekeeping reminders", () => {
  it("reminds when no rotation is recorded", () => {
    expect(housekeepingDue(config({}), NOW).map((d) => d.item)).toEqual(["session_keys", "github_secrets"]);
  });

  it("is quiet until the reminder interval has passed", () => {
    const c = config({ session_keys_rotated: "2026-05-01", github_secrets_rotated: "2026-10-01" });
    expect(housekeepingDue(c, NOW)).toEqual([]);
  });

  it("reminds once the interval has passed", () => {
    const c = config({ session_keys_rotated: "2026-04-18", github_secrets_rotated: "2026-04-19", rotation_reminder_days: 180 });
    expect(housekeepingDue(c, NOW)).toEqual([{ item: "session_keys", lastRotated: "2026-04-18", ageDays: 180 }]);
  });

  it("validates the dates", () => {
    expect(() => config({ session_keys_rotated: "15.10.2026" })).toThrow(/YYYY-MM-DD/);
    expect(() => config({ session_keys_rotated: "2026-13-40" })).toThrow(/valid date/);
    expect(() => config({ rotation_reminder_days: 7 })).toThrow();
  });

  it("formats today as YYYY-MM-DD", () => {
    expect(today(NOW)).toBe("2026-10-15");
  });
});
