import test from "node:test";
import assert from "node:assert/strict";
import { estimateEta } from "./eta.js";

const startAt = "2026-10-21T08:00:00.000Z";

test("does not invent an ETA without remaining distance", () => {
  assert.deepEqual(estimateEta({ startAt }), {
    status: "unknown",
    reason: "remaining_miles_required"
  });
});

test("estimates a same-day arrival for 250 remaining miles", () => {
  const result = estimateEta({ remainingMiles: 250, startAt });
  assert.equal(result.status, "estimated");
  assert.equal(result.drivingHours, 5);
  assert.equal(result.restPeriods, 0);
  assert.equal(result.estimatedArrival, "2026-10-21T13:00:00.000Z");
});

test("adds one rest period when more than one driving day is needed", () => {
  const result = estimateEta({ remainingMiles: 600, startAt });
  assert.equal(result.drivingHours, 12);
  assert.equal(result.restPeriods, 1);
  assert.equal(result.totalElapsedHours, 22);
  assert.equal(result.estimatedArrival, "2026-10-22T06:00:00.000Z");
});

test("flags an appointment that the estimate misses", () => {
  const result = estimateEta({
    remainingMiles: 600,
    startAt,
    deliveryAppointmentAt: "2026-10-21T23:00:00.000Z"
  });
  assert.equal(result.appointmentStatus, "late_estimate");
});

test("rejects negative remaining miles", () => {
  assert.throws(() => estimateEta({ remainingMiles: -1, startAt }), /remainingMiles/);
});
