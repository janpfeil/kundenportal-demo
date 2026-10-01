import { type Division, METERED_DIVISIONS } from "@kundenportal/events";

/** Divisions with a meter: the installment follows the consumption and may be adjusted. */
export function isMetered(division: Division): boolean {
  return METERED_DIVISIONS.includes(division);
}
