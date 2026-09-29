type Level = "debug" | "info" | "warn" | "error";

/**
 * Structured JSON logging to stdout, which Lambda forwards to CloudWatch Logs.
 * Never pass tokens or complete request bodies here.
 */
export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, message, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}
