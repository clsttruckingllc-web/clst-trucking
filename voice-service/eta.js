/**
 * Free, deterministic ETA estimate for CLST Trucking.
 *
 * IMPORTANT: remainingMiles must come from a known current truck location or
 * a dispatcher-confirmed remaining distance. Do not pass the total miles from
 * a rate confirmation as if it were the remaining distance.
 * This is a planning estimate, not live GPS/traffic data or a guaranteed ETA.
 */
export function estimateEta({
  remainingMiles,
  startAt = new Date(),
  averageSpeedMph = 50,
  drivingHoursPerDay = 10,
  restHoursBetweenDrivingDays = 10,
  deliveryAppointmentAt = null,
} = {}) {
  const miles = Number(remainingMiles);
  const speed = Number(averageSpeedMph);
  const dailyHours = Number(drivingHoursPerDay);
  const restHours = Number(restHoursBetweenDrivingDays);
  const start = startAt instanceof Date ? new Date(startAt.getTime()) : new Date(startAt);

  if (remainingMiles === undefined || remainingMiles === null || remainingMiles === "") {
    return { status: "unknown", reason: "remaining_miles_required" };
  }
  if (!Number.isFinite(miles) || miles < 0) {
    throw new TypeError("remainingMiles must be a finite number greater than or equal to 0");
  }
  if (!Number.isFinite(speed) || speed <= 0) {
    throw new TypeError("averageSpeedMph must be a finite number greater than 0");
  }
  if (!Number.isFinite(dailyHours) || dailyHours <= 0) {
    throw new TypeError("drivingHoursPerDay must be a finite number greater than 0");
  }
  if (!Number.isFinite(restHours) || restHours < 0) {
    throw new TypeError("restHoursBetweenDrivingDays must be a finite number greater than or equal to 0");
  }
  if (Number.isNaN(start.getTime())) {
    throw new TypeError("startAt must be a valid date or ISO timestamp");
  }

  const drivingHours = miles / speed;
  // Add a rest period only when another driving day is needed.
  const restPeriods = miles === 0 ? 0 : Math.max(0, Math.ceil(drivingHours / dailyHours) - 1);
  const totalHours = drivingHours + restPeriods * restHours;
  const arrival = new Date(start.getTime() + totalHours * 60 * 60 * 1000);

  let appointmentStatus = "not_provided";
  let appointmentIso = null;
  if (deliveryAppointmentAt !== null && deliveryAppointmentAt !== undefined && deliveryAppointmentAt !== "") {
    const appointment = new Date(deliveryAppointmentAt);
    if (Number.isNaN(appointment.getTime())) {
      throw new TypeError("deliveryAppointmentAt must be a valid date or ISO timestamp");
    }
    appointmentIso = appointment.toISOString();
    appointmentStatus = arrival.getTime() <= appointment.getTime() ? "on_time_estimate" : "late_estimate";
  }

  return {
    status: "estimated",
    estimatedArrival: arrival.toISOString(),
    remainingMiles: miles,
    averageSpeedMph: speed,
    drivingHours: Number(drivingHours.toFixed(2)),
    restPeriods,
    restHoursBetweenDrivingDays: restHours,
    totalElapsedHours: Number(totalHours.toFixed(2)),
    deliveryAppointmentAt: appointmentIso,
    appointmentStatus,
    assumptions: [
      "Uses the supplied remaining distance, not the rate confirmation's total route miles.",
      "Uses a fixed average speed and configurable rest periods.",
      "Does not include live GPS, traffic, weather, loading delays, or driver-specific hours-of-service status.",
      "Not a guaranteed arrival time; verify with dispatch and the driver."
    ]
  };
}
