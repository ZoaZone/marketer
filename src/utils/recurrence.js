/**
 * Helpers for the Studio's recurring-schedule option (Timeline step).
 * A campaign can repeat weekly / every 2 weeks / monthly for 3, 6, or 12 months.
 */

export const CADENCES = [
  { id: "weekly", label: "Weekly" },
  { id: "biweekly", label: "Every 2 Weeks" },
  { id: "monthly", label: "Monthly" },
];

export const DURATIONS_MONTHS = [3, 6, 12];

const OCCURRENCES_PER_MONTH = { weekly: 4.345, biweekly: 2.17, monthly: 1 };

export function occurrenceCount(cadence, months) {
  return Math.max(1, Math.round((OCCURRENCES_PER_MONTH[cadence] || 1) * months));
}

/** Returns an array of Date objects, one per occurrence, starting at `anchor`. */
export function computeOccurrenceDates(anchor, cadence, months) {
  const count = occurrenceCount(cadence, months);
  const dates = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(anchor);
    if (cadence === "weekly") d.setDate(d.getDate() + i * 7);
    else if (cadence === "biweekly") d.setDate(d.getDate() + i * 14);
    else d.setMonth(d.getMonth() + i);
    dates.push(d);
  }
  return dates;
}
