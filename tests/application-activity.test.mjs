import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationActivity } from "../lib/application-activity.ts";

test("30-day activity includes today, groups applications by applied date, and ignores dates outside the range", () => {
  const days = applicationActivity([
    { appliedDate: "2026-08-31" }, { appliedDate: "2026-09-01" },
    { appliedDate: "2026-09-29" }, { appliedDate: "2026-09-29" },
    { appliedDate: "2026-09-30" }, { appliedDate: "2026-10-01" }, { appliedDate: "" },
  ], "2026-09-30");
  assert.equal(days.length, 30);
  assert.deepEqual(days[0], { date: "2026-09-01", count: 1 });
  assert.deepEqual(days[28], { date: "2026-09-29", count: 2 });
  assert.deepEqual(days[29], { date: "2026-09-30", count: 1 });
  assert.equal(days.reduce((sum, day) => sum + day.count, 0), 4);
  assert.equal(days[15].count, 0);
});

test("empty activity uses consecutive calendar dates across years, leap days, and daylight saving changes", () => {
  for (const [today, start] of [["2027-01-10", "2026-12-12"], ["2024-03-10", "2024-02-10"], ["2026-11-10", "2026-10-12"]]) {
    const days = applicationActivity([], today);
    assert.equal(days[0].date, start);
    assert.equal(days.at(-1).date, today);
    assert.equal(new Set(days.map((day) => day.date)).size, 30);
    assert.ok(days.every((day) => day.count === 0));
  }
  assert.ok(applicationActivity([], "2024-03-10").some((day) => day.date === "2024-02-29"));
});
