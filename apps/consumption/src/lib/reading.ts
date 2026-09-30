import type { NewMeterReading } from "@kundenportal/api-contract";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Upper bound of a reading in the API contract (NewMeterReading.value). */
export const MAX_READING = 1_000_000_000;

/** Contract ids are UUIDs; anything else never reaches the API. */
export function isContractId(value: string): boolean {
  return UUID.test(value);
}

/** Today's date in Germany (`YYYY-MM-DD`); the API checks "not in the future" in German time. */
export function todayInGermany(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

export type ReadingField = "value" | "readAt";
export type ReadingCheck =
  | { ok: true; reading: NewMeterReading }
  | {
      ok: false;
      field: ReadingField;
      reason:
        "valueEmpty" | "valueInvalid" | "valueBelow" | "dateEmpty" | "dateFuture" | "dateBefore";
    };

/**
 * Checks a reading in the browser before it is sent, with the same rules the API applies:
 * a number from 0, a date not in the future and neither below the latest reading.
 */
export function checkReading(
  valueInput: string,
  readAt: string,
  today: string,
  latest?: { value: number; readAt: string },
): ReadingCheck {
  const text = valueInput.trim().replace(",", ".");
  if (text === "") return { ok: false, field: "value", reason: "valueEmpty" };
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > MAX_READING)
    return { ok: false, field: "value", reason: "valueInvalid" };
  if (readAt.trim() === "" || !isCalendarDate(readAt))
    return { ok: false, field: "readAt", reason: "dateEmpty" };
  if (readAt > today) return { ok: false, field: "readAt", reason: "dateFuture" };
  if (latest && readAt < latest.readAt) return { ok: false, field: "readAt", reason: "dateBefore" };
  if (latest && value < latest.value) return { ok: false, field: "value", reason: "valueBelow" };
  return { ok: true, reading: { value, readAt } };
}

const isRecord = (body: unknown): body is Record<string, unknown> =>
  typeof body === "object" && body !== null && !Array.isArray(body);

/** Validates the body the browser sends to the zone's readings route; `undefined` if invalid. */
export function parseNewReading(body: unknown): NewMeterReading | undefined {
  if (!isRecord(body)) return undefined;
  if (Object.keys(body).some((key) => key !== "value" && key !== "readAt")) return undefined;
  const { value, readAt } = body;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_READING)
    return undefined;
  if (typeof readAt !== "string" || !isCalendarDate(readAt)) return undefined;
  return { value, readAt };
}

export type ReadingProblem =
  | { kind: "session" | "future" | "noMeter" | "inactive" | "implausible" | "generic" }
  | { kind: "dateBefore"; date: string }
  | { kind: "valueBelow"; value: number };

/**
 * Maps an error answer of `POST /contracts/{id}/readings` to a message. The API's
 * plausibility details (422) are English sentences; the known ones get a translated text.
 */
export function readingProblem(status: number, detail: string | undefined): ReadingProblem {
  if (status === 401) return { kind: "session" };
  if (status !== 422) return { kind: "generic" };
  const text = detail ?? "";
  const before = /date is before the latest reading of (\d{4}-\d{2}-\d{2})/i.exec(text);
  if (before?.[1]) return { kind: "dateBefore", date: before[1] };
  const below = /value is below the latest reading of ([\d.]+)/i.exec(text);
  if (below?.[1]) return { kind: "valueBelow", value: Number(below[1]) };
  if (/in the future/i.test(text)) return { kind: "future" };
  if (/no meter/i.test(text)) return { kind: "noMeter" };
  if (/not active/i.test(text)) return { kind: "inactive" };
  return { kind: "implausible" };
}
