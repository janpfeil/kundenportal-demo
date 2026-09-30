/** Corrections the cockpit may send with a redrive; mirrors `MigrationCorrections`. */
export interface RedriveBody {
  corrections: { postalCode?: string; email?: string };
}

/** Validates a redrive body from the browser; undefined if it is not acceptable. */
export function parseRedrive(body: unknown): RedriveBody | undefined {
  const raw = (body as { corrections?: unknown } | null)?.corrections ?? {};
  if (typeof raw !== "object" || raw === null) return undefined;
  const { postalCode, email, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) return undefined;
  const corrections: RedriveBody["corrections"] = {};
  if (postalCode !== undefined) {
    if (typeof postalCode !== "string" || !/^\d{5}$/.test(postalCode)) return undefined;
    corrections.postalCode = postalCode;
  }
  if (email !== undefined) {
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
    corrections.email = email;
  }
  return { corrections };
}
