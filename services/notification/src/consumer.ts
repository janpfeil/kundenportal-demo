import {
  AccountsLinked,
  ContractChanged,
  CustomerRegistered,
  DataVolumeThresholdReached,
  DocumentUploaded,
  DuplicateCandidateFound,
  EventBridgeEnvelope,
  type EventMetadata,
  InstallmentAdjusted,
  type Locale,
  MeterReadingSubmitted,
  PasswordResetRequired,
} from "@kundenportal/events";
import { log } from "@kundenportal/service-kit";
import type { SQSBatchResponse, SQSEvent, SQSRecord } from "aws-lambda";
import type { z } from "zod";
import { type Mailbox, type Notification, notificationId } from "./mailbox.js";
import type { OwnerHints } from "./owner-hints.js";
import {
  accountsLinkedText,
  contractChangedText,
  dataVolumeText,
  documentText,
  duplicateCandidateText,
  installmentText,
  meterReadingText,
  migratedWelcomeText,
  passwordResetText,
  welcomeText,
} from "./texts.js";

export class UnprocessableEventError extends Error {
  override name = "UnprocessableEventError";
}

type Detail = EventMetadata & { payload: { customerId: string } };

/**
 * A domain event that becomes one mailbox entry of its customer. `text` returns
 * `undefined` for events that deliberately produce no entry.
 */
interface NoteRule<D extends Detail> {
  event: { source: string; detailType: string; detail: z.ZodType<D> };
  kind: Notification["kind"];
  text: (locale: Locale, detail: D) => { title: string; body: string } | undefined;
}

const rule = <D extends Detail>(r: NoteRule<D>) => r as unknown as NoteRule<Detail>;

/** Events of the other domains and the entry each one leaves in the mailbox. */
const NOTE_RULES: NoteRule<Detail>[] = [
  rule({ event: MeterReadingSubmitted, kind: "info", text: meterReadingText }),
  rule({ event: InstallmentAdjusted, kind: "info", text: installmentText }),
  rule({
    event: {
      ...ContractChanged,
      detail: ContractChanged.detail.transform((d) => ({
        ...d,
        payload: { ...d.payload, customerId: d.payload.contract.customerId },
      })),
    },
    kind: "info",
    // Demo contracts created at registration need no message besides the welcome.
    text: (locale, detail) =>
      detail.payload.changeType === "updated" ? contractChangedText(locale, detail) : undefined,
  }),
  rule({ event: DataVolumeThresholdReached, kind: "warning", text: dataVolumeText }),
  rule({ event: DocumentUploaded, kind: "info", text: documentText }),
  // Migration (phase 3): reset request after a bulk import, link offer, link confirmation.
  rule({ event: PasswordResetRequired, kind: "warning", text: passwordResetText }),
  rule({ event: DuplicateCandidateFound, kind: "info", text: duplicateCandidateText }),
  rule({ event: AccountsLinked, kind: "info", text: accountsLinkedText }),
];

export function createConsumer(mailbox: Mailbox, ownerHints: OwnerHints) {
  async function customerRegistered(detail: unknown): Promise<void> {
    const parsed = CustomerRegistered.detail.safeParse(detail);
    if (!parsed.success)
      throw new UnprocessableEventError(`Invalid CustomerRegistered: ${parsed.error.message}`);
    const { tenantId, eventId, occurredAt, payload } = parsed.data;

    await mailbox.linkSubject(tenantId, payload.subject, payload.customerId);
    await mailbox.rememberLocale(tenantId, payload.customerId, payload.locale);
    const created = await mailbox.add(tenantId, payload.customerId, {
      notificationId: notificationId(occurredAt, eventId),
      kind: "welcome",
      ...(payload.origin === "registration"
        ? welcomeText[payload.locale](payload.displayName)
        : migratedWelcomeText[payload.locale](payload.displayName, payload.origin)),
      createdAt: occurredAt,
      read: false,
    });
    if (created) {
      await ownerHints.send(
        "Kundenportal: neue Registrierung",
        `Mandant ${tenantId}: Kunde ${payload.customerId} hat sich registriert (${occurredAt}).`,
      );
    }
  }

  /** Stores the rule's note once per event (the id contains the event id). */
  async function note(noteRule: NoteRule<Detail>, detail: unknown): Promise<void> {
    const parsed = noteRule.event.detail.safeParse(detail);
    if (!parsed.success) {
      throw new UnprocessableEventError(
        `Invalid ${noteRule.event.detailType}: ${parsed.error.message}`,
      );
    }
    const { tenantId, eventId, occurredAt, payload } = parsed.data;
    const locale = await mailbox.localeOf(tenantId, payload.customerId);
    const text = noteRule.text(locale, parsed.data);
    if (!text) return;
    await mailbox.add(tenantId, payload.customerId, {
      notificationId: notificationId(occurredAt, eventId),
      kind: noteRule.kind,
      ...text,
      createdAt: occurredAt,
      read: false,
    });
  }

  async function handle(record: SQSRecord): Promise<void> {
    let body: unknown;
    try {
      body = JSON.parse(record.body);
    } catch {
      throw new UnprocessableEventError("Message body is not JSON");
    }
    const envelope = EventBridgeEnvelope.safeParse(body);
    if (!envelope.success) throw new UnprocessableEventError("Message is not an EventBridge event");
    const { source, "detail-type": detailType, detail } = envelope.data;
    if (source === CustomerRegistered.source && detailType === CustomerRegistered.detailType) {
      return customerRegistered(detail);
    }
    const noteRule = NOTE_RULES.find(
      (r) => r.event.source === source && r.event.detailType === detailType,
    );
    if (noteRule) return note(noteRule, detail);
    throw new UnprocessableEventError(`No handler for ${source}/${detailType}`);
  }

  /**
   * Processes each message independently and reports failed ones back to SQS
   * (partial batch response). Failed messages are retried and end up in the DLQ
   * after the queue's maxReceiveCount.
   */
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const failures: SQSBatchResponse["batchItemFailures"] = [];
    for (const record of event.Records) {
      try {
        await handle(record);
      } catch (error) {
        log(error instanceof UnprocessableEventError ? "warn" : "error", "Message failed", {
          messageId: record.messageId,
          receiveCount: record.attributes.ApproximateReceiveCount,
          error: error instanceof Error ? error.message : String(error),
        });
        failures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures: failures };
  };
}
