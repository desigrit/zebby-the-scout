import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationActivity } from "../lib/application-activity.ts";
import { APPLICATION_STATUSES } from "../lib/application-types.ts";

const emptyStatuses = () => ({ Applied: 0, "Heard back": 0, "Interview scheduled": 0, Rejected: 0 });

test("30-day activity includes today, groups applications by applied date, and ignores dates outside the range", () => {
  const days = applicationActivity([
    { appliedDate: "2026-08-31" }, { appliedDate: "2026-09-01" },
    { appliedDate: "2026-09-29" }, { appliedDate: "2026-09-29" },
    { appliedDate: "2026-09-30" }, { appliedDate: "2026-10-01" }, { appliedDate: "" },
  ].map((item) => ({ ...item, status: "Applied" })), "2026-09-30");
  assert.equal(days.length, 30);
  assert.deepEqual(days[0], { date: "2026-09-01", count: 1, statuses: { ...emptyStatuses(), Applied: 1 } });
  assert.deepEqual(days[28], { date: "2026-09-29", count: 2, statuses: { ...emptyStatuses(), Applied: 2 } });
  assert.deepEqual(days[29], { date: "2026-09-30", count: 1, statuses: { ...emptyStatuses(), Applied: 1 } });
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
    assert.ok(days.every((day) => APPLICATION_STATUSES.every((status) => day.statuses[status] === 0)));
  }
  assert.ok(applicationActivity([], "2024-03-10").some((day) => day.date === "2024-02-29"));
});

test("each day's stack contains the current statuses of roles applied on that date", () => {
  const days = applicationActivity([
    ...APPLICATION_STATUSES.map((status) => ({ appliedDate: "2026-10-09", status })),
    { appliedDate: "2026-10-09", status: "Rejected" },
    { appliedDate: "2026-10-10", status: "Interview scheduled" },
    { appliedDate: "2026-09-10", status: "Rejected" },
    { appliedDate: "2026-10-11", status: "Heard back" },
    { appliedDate: "", status: "Applied" },
  ], "2026-10-10");
  assert.deepEqual(days.at(-2), { date: "2026-10-09", count: 5,
    statuses: { Applied: 1, "Heard back": 1, "Interview scheduled": 1, Rejected: 2 } });
  assert.deepEqual(days.at(-1), { date: "2026-10-10", count: 1,
    statuses: { ...emptyStatuses(), "Interview scheduled": 1 } });
  assert.equal(days.reduce((sum, day) => sum + day.count, 0), 6);
  assert.ok(days.every((day) => Object.values(day.statuses).reduce((sum, count) => sum + count, 0) === day.count));
});

test("changing a status updates its original applied day without moving the application to today", () => {
  const applications = [{ appliedDate: "2026-09-15", status: "Applied" },
    { appliedDate: "2026-09-15", status: "Applied" }];
  const before = applicationActivity(applications, "2026-10-10");
  for (const status of APPLICATION_STATUSES.slice(1)) {
    applications[0].status = status;
    const after = applicationActivity(applications, "2026-10-10");
    const applied = after.find((day) => day.date === "2026-09-15");
    assert.equal(applied.count, 2);
    assert.deepEqual(applied.statuses, { ...emptyStatuses(), Applied: 1, [status]: 1 });
    assert.equal(after.at(-1).count, 0);
  }
  assert.deepEqual(before.find((day) => day.date === "2026-09-15").statuses, { ...emptyStatuses(), Applied: 2 });
  assert.equal(applications[0].appliedDate, "2026-09-15");
});
