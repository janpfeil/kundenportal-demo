import { randomUUID } from "node:crypto";
import { readFileSync, rmSync } from "node:fs";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

/** The own event bus (infra/cdk/lib/events.ts) and the event's size limit per announcement. */
const BUS = "kundenportal";
const MAX_PER_EVENT = 100;
/** Time for the last registrations' events (demo contracts, welcome note) to land first. */
const SETTLE_MS = 15_000;

/**
 * Cleanup after the run: the tests delete their Cognito users, but every domain keeps the
 * customers' data. The run therefore announces its identities in one
 * `MigratedAccountsRemoved` (reason `test-run`, only the subjects): each domain finds the
 * customer through its own identity link and deletes its data, as after the demo reset.
 * One event per run is enough.
 * Identities of a pass tenant are not found in the owner's data and are skipped; the pass
 * tenant's table goes with the pass.
 */
export default async function globalTeardown() {
  const file = process.env.E2E_IDENTITIES_FILE;
  if (!file) return;
  const subjects = [...new Set(readFileSync(file, "utf8").split("\n").filter(Boolean))];
  rmSync(file, { force: true });
  if (subjects.length === 0) return;
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

  const events = new EventBridgeClient({ region: process.env.AWS_REGION ?? "eu-central-1" });
  for (let i = 0; i < subjects.length; i += MAX_PER_EVENT) {
    const accounts = subjects.slice(i, i + MAX_PER_EVENT).map((subject) => ({ subject }));
    const result = await events.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: BUS,
            Source: "kundenportal.migration",
            DetailType: "MigratedAccountsRemoved",
            Detail: JSON.stringify({
              eventId: randomUUID(),
              tenantId: "owner",
              occurredAt: new Date().toISOString(),
              correlationId: `e2e-cleanup-${randomUUID()}`,
              payload: { reason: "test-run", accounts },
            }),
          },
        ],
      }),
    );
    if (result.FailedEntryCount) {
      throw new Error(`Cleanup event rejected: ${JSON.stringify(result.Entries)}`);
    }
  }
  console.log(`Cleanup: ${subjects.length} test identities announced for removal`);
}
