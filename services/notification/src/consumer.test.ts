import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { fixedTenantData } from "@kundenportal/service-kit/testing";
import type { SQSEvent, SQSRecord } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createConsumer } from "./consumer.js";
import { Mailbox, notificationId } from "./mailbox.js";
import { OwnerHints } from "./owner-hints.js";

const dbMock = mockClient(DynamoDBDocumentClient);
const snsMock = mockClient(SNSClient);

const consumer = createConsumer(
  new Mailbox(fixedTenantData()),
  new OwnerHints(new SNSClient({}), "arn:aws:sns:eu-central-1:123456789012:hints"),
);

const detail = {
  eventId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
  tenantId: "owner",
  occurredAt: "2026-09-29T12:00:00.000Z",
  correlationId: "req-1",
  payload: {
    customerId: "c-1",
    subject: "sub-1",
    email: "david@example.org",
    displayName: "David",
    locale: "en",
    origin: "registration",
  },
};

function record(messageId: string, body: unknown): SQSRecord {
  return {
    messageId,
    receiptHandle: "rh",
    body: typeof body === "string" ? body : JSON.stringify(body),
    attributes: {
      ApproximateReceiveCount: "1",
      SentTimestamp: "0",
      SenderId: "events",
      ApproximateFirstReceiveTimestamp: "0",
    },
    messageAttributes: {},
    md5OfBody: "",
    eventSource: "aws:sqs",
    eventSourceARN: "arn:aws:sqs:eu-central-1:123456789012:events",
    awsRegion: "eu-central-1",
  };
}

const event = (...records: SQSRecord[]): SQSEvent => ({ Records: records });
const registered = (d: unknown = detail) => ({
  source: "kundenportal.customer",
  "detail-type": "CustomerRegistered",
  detail: d,
});
const domainEvent = (source: string, detailType: string, payload: unknown) => ({
  source,
  "detail-type": detailType,
  detail: {
    eventId: "7a2d2e75-9b5d-4d66-8b4a-6e9b5b1f3d22",
    tenantId: "owner",
    occurredAt: "2026-09-30T12:30:00.000Z",
    correlationId: "req-2",
    payload,
  },
});
const contractId = "0b6f3f7e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const contract = {
  contractId,
  customerId: "c-1",
  division: "electricity",
  tariffName: "Strom Klassik",
  tariffOption: "oeko",
  monthlyInstallmentCent: 9000,
  meterNumber: "1EMH0012345678",
  unit: "kWh",
  startDate: "2026-04-03",
  status: "active",
  version: 2,
};

beforeEach(() => {
  dbMock.reset();
  snsMock.reset();
  dbMock.on(PutCommand).resolves({});
  dbMock.on(GetCommand).resolves({});
  snsMock.on(PublishCommand).resolves({});
});

describe("notes from other domains", () => {
  const notes = () =>
    dbMock
      .commandCalls(PutCommand)
      .map((call) => call.args[0].input)
      .filter((input) => String(input.Item?.SK).startsWith("NOTE#"));

  it.each([
    [
      "MeterReadingSubmitted",
      domainEvent("kundenportal.consumption", "MeterReadingSubmitted", {
        customerId: "c-1",
        contractId,
        division: "electricity",
        meterNumber: "1EMH0012345678",
        readingId: "r-1",
        value: 19800.5,
        unit: "kWh",
        readAt: "2026-09-30",
      }),
      "info",
      ["Zählerstand bestätigt", "19.800,5 kWh vom 30.09.2026 für Strom"],
      ["Meter reading confirmed", "electricity meter reading of 19,800.5 kWh from 30 Sep"],
    ],
    [
      "InstallmentAdjusted",
      domainEvent("kundenportal.contract", "InstallmentAdjusted", {
        customerId: "c-1",
        contractId,
        division: "gas",
        previousInstallmentCent: 12700,
        newInstallmentCent: 13500,
        estimatedAnnualConsumption: 1290,
        unit: "m3",
        reason: "meter-reading",
        causationId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
      }),
      "info",
      ["Abschlag angepasst", "Gas auf 1.290 m³. Ihr monatlicher Abschlag ändert sich von 127,00"],
      [
        "Installment adjusted",
        "gas consumption at 1,290 m³. Your monthly installment changes from €127.00 to €135.00",
      ],
    ],
    [
      "ContractChanged",
      domainEvent("kundenportal.contract", "ContractChanged", {
        changeType: "updated",
        changes: ["installment", "tariffOption"],
        previous: { monthlyInstallmentCent: 8700, tariffOption: "standard" },
        contract,
      }),
      "info",
      ["Vertrag geändert", "Strom Klassik (Strom) wurde geändert: monatlicher Betrag jetzt 90,00"],
      ["Contract changed", 'monthly amount now €90.00, tariff option now "oeko"'],
    ],
    [
      "DataVolumeThresholdReached",
      domainEvent("kundenportal.consumption", "DataVolumeThresholdReached", {
        customerId: "c-1",
        contractId,
        month: "2026-09",
        usedMb: 16500,
        includedMb: 20480,
        thresholdPercent: 80,
      }),
      "warning",
      ["Datenvolumen zu 80 % verbraucht", "Im September 2026 haben Sie 16,1 von 20 GB"],
      ["80 % of your data volume used", "In September 2026 you have used 16.1 of 20 GB"],
    ],
    [
      "DocumentUploaded",
      domainEvent("kundenportal.documents", "DocumentUploaded", {
        customerId: "c-1",
        documentId: "mg6b0k000-6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
        fileName: "zaehler.jpg",
        contentType: "image/jpeg",
        category: "meter-photo",
        sizeBytes: 1000,
      }),
      "info",
      ["Dokument hochgeladen", "„zaehler.jpg“"],
      ["Document uploaded", '"zaehler.jpg"'],
    ],
    [
      "PasswordResetRequired",
      domainEvent("kundenportal.migration", "PasswordResetRequired", {
        customerId: "c-1",
        subject: "sub-1",
        email: "carla.schulz@example.net",
        account: { system: "telco", customerNumber: "T/88-4712" },
        reason: "hash-not-transferable",
      }),
      "warning",
      ["Bitte neues Passwort vergeben", "„Passwort vergessen?“"],
      ["Please choose a new password", '"Forgot password?"'],
    ],
    [
      "DuplicateCandidateFound",
      domainEvent("kundenportal.migration", "DuplicateCandidateFound", {
        customerId: "c-1",
        subject: "sub-1",
        account: { system: "utility", customerNumber: "V-1000124" },
        candidate: { system: "telco", customerNumber: "T/88-4711" },
        candidateSummary: { displayName: "Bernd Yilmaz", address: "Hauptstraße 5, 04103 Leipzig" },
        matchedOn: ["name", "address"],
        score: 0.9,
      }),
      "info",
      ["Weiteres Kundenkonto gefunden", "bei der Telko ein Kundenkonto auf Ihren Namen"],
      ["Another customer account found", "with the telco (Hauptstraße 5, 04103 Leipzig"],
    ],
    [
      "AccountsLinked",
      domainEvent("kundenportal.migration", "AccountsLinked", {
        customerId: "c-1",
        subject: "sub-1",
        account: { system: "utility", customerNumber: "V-1000124" },
        linked: { system: "telco", customerNumber: "T/88-4711" },
        contracts: [
          {
            legacyContractId: "DSL-300455",
            division: "internet",
            tariffOption: "250",
            monthlyInstallmentCent: 4499,
            startDate: "2020-03-01",
          },
        ],
      }),
      "info",
      ["Konten verknüpft", "Übernommene Verträge: Internet."],
      ["Accounts linked", "Contracts taken over: internet."],
    ],
  ])("turns %s into a note in the customer's language", async (_name, body, kind, de, en) => {
    await consumer(event(record("m-de", body)));
    dbMock
      .on(GetCommand, { Key: { PK: "TENANT#owner#CUST#c-1", SK: "MAILBOX" } })
      .resolves({ Item: { locale: "en" } });
    await consumer(event(record("m-en", body)));

    const [german, english] = notes();
    const id = notificationId("2026-09-30T12:30:00.000Z", "7a2d2e75-9b5d-4d66-8b4a-6e9b5b1f3d22");
    expect(german).toMatchObject({
      Item: { PK: "TENANT#owner#CUST#c-1", SK: `NOTE#${id}`, kind, title: de[0], read: false },
      ConditionExpression: "attribute_not_exists(PK)",
    });
    expect(german?.Item?.body.replaceAll(" ", " ")).toContain(de[1]);
    expect(english?.Item?.title).toBe(en[0]);
    expect(english?.Item?.body.replaceAll(" ", " ")).toContain(en[1]);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it("leaves no note for contracts created at registration", async () => {
    const created = domainEvent("kundenportal.contract", "ContractChanged", {
      changeType: "created",
      changes: [],
      contract: { ...contract, version: 1 },
    });
    const result = await consumer(event(record("m-1", created)));
    expect(result.batchItemFailures).toEqual([]);
    expect(notes()).toEqual([]);
  });

  it("confirms an order and warns about the operator's termination, without owner mails", async () => {
    const ordered = domainEvent("kundenportal.contract", "ContractChanged", {
      changeType: "created",
      changes: [],
      initiatedBy: "customer",
      contract: { ...contract, version: 1 },
    });
    const terminated = domainEvent("kundenportal.contract", "ContractChanged", {
      changeType: "updated",
      changes: ["termination"],
      initiatedBy: "operator",
      reason: "Umzug ins Ausland",
      contract: {
        ...contract,
        version: 3,
        termination: {
          kind: "termination",
          effectiveDate: "2026-12-31",
          requestedAt: "2026-09-30T12:30:00.000Z",
          by: "operator",
        },
      },
    });
    const result = await consumer(event(record("m-1", ordered), record("m-2", terminated)));

    expect(result.batchItemFailures).toEqual([]);
    expect(notes().map((n) => [n.Item?.kind, n.Item?.title])).toEqual([
      ["info", "Vertrag abgeschlossen"],
      ["warning", "Vertrag gekündigt"],
    ]);
    expect(notes()[1]?.Item?.body).toContain("Begründung: Umzug ins Ausland");
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it("is idempotent: a redelivered event does not duplicate the note", async () => {
    dbMock
      .on(PutCommand)
      .rejects(new ConditionalCheckFailedException({ message: "exists", $metadata: {} }));
    const body = domainEvent("kundenportal.documents", "DocumentUploaded", {
      customerId: "c-1",
      documentId: "d-1",
      fileName: "a.pdf",
      contentType: "application/pdf",
      category: "other",
      sizeBytes: 1,
    });
    expect((await consumer(event(record("m-1", body)))).batchItemFailures).toEqual([]);
  });
});

describe("notification consumer", () => {
  it("links the mailbox, stores a welcome note in the customer's language and hints the owner", async () => {
    const result = await consumer(event(record("m-1", registered())));

    expect(result.batchItemFailures).toEqual([]);
    const items = dbMock.commandCalls(PutCommand).map((call) => call.args[0].input.Item);
    expect(items[0]).toEqual({ PK: "TENANT#owner#SUBJ#sub-1", SK: "MAILBOX", customerId: "c-1" });
    expect(items[1]).toEqual({ PK: "TENANT#owner#CUST#c-1", SK: "MAILBOX", locale: "en" });
    expect(items[2]).toMatchObject({
      PK: "TENANT#owner#CUST#c-1",
      SK: `NOTE#${notificationId(detail.occurredAt, detail.eventId)}`,
      kind: "welcome",
      title: "Welcome to the customer portal",
      read: false,
    });
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(1);
    expect(snsMock.commandCalls(PublishCommand)[0]?.args[0].input.Message).not.toContain(
      "david@example.org",
    );
  });

  it.each([
    ["a migrated customer", { origin: "legacy-telco" }, "owner"],
    [
      "a test user at the reserved .invalid domain",
      { email: "e2e-1@kundenportal.invalid" },
      "owner",
    ],
    ["a customer of a pass tenant", {}, "p4k7x2qa"],
  ])("welcomes %s without a mail to the owner", async (_, change, tenantId) => {
    const quiet = { ...detail, tenantId, payload: { ...detail.payload, ...change } };
    const result = await consumer(event(record("m-1", registered(quiet))));

    expect(result.batchItemFailures).toEqual([]);
    expect(dbMock.commandCalls(PutCommand)[2]?.args[0].input.Item).toMatchObject({
      kind: "welcome",
    });
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it("welcomes a migrated customer with a note about the takeover", async () => {
    const migrated = {
      ...detail,
      payload: { ...detail.payload, locale: "de", origin: "legacy-telco" },
    };
    await consumer(event(record("m-1", registered(migrated))));
    const note = dbMock.commandCalls(PutCommand)[2]?.args[0].input.Item;
    expect(note).toMatchObject({ kind: "welcome", title: "Willkommen im neuen Kundenportal" });
    expect(note?.body).toContain("der Telko");
  });

  it("is idempotent: a redelivered event neither duplicates the note nor re-notifies the owner", async () => {
    dbMock
      .on(PutCommand, { Item: { SK: "MAILBOX" } }, false)
      .resolves({})
      .on(PutCommand, { ConditionExpression: "attribute_not_exists(PK)" }, false)
      .rejects(new ConditionalCheckFailedException({ message: "exists", $metadata: {} }));

    const result = await consumer(event(record("m-1", registered())));

    expect(result.batchItemFailures).toEqual([]);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it.each([
    ["non-JSON body", "{oops"],
    ["no EventBridge envelope", { hello: "world" }],
    [
      "unknown event type",
      { source: "kundenportal.customer", "detail-type": "Unknown", detail: {} },
    ],
    ["missing tenant", registered({ ...detail, tenantId: undefined })],
    ["invalid e-mail", registered({ ...detail, payload: { ...detail.payload, email: "nope" } })],
  ])("reports a message with %s as failed so it ends up in the DLQ", async (_case, body) => {
    const result = await consumer(event(record("bad", body), record("good", registered())));
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "bad" }]);
  });

  it("reports an invalid domain event as failed so it ends up in the DLQ", async () => {
    const broken = domainEvent("kundenportal.consumption", "MeterReadingSubmitted", {});
    const result = await consumer(event(record("bad", broken)));
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "bad" }]);
  });

  it("reports infrastructure errors as failed for a retry", async () => {
    dbMock.on(PutCommand).rejects(new Error("throttled"));
    const result = await consumer(event(record("m-1", registered())));
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "m-1" }]);
  });
});

describe("MigratedAccountsRemoved", () => {
  const removed = domainEvent("kundenportal.migration", "MigratedAccountsRemoved", {
    reason: "demo-reset",
    accounts: [{ subject: "sub-1", customerId: "c-1" }],
  });
  const deletedKeys = () =>
    dbMock
      .commandCalls(BatchWriteCommand)
      .flatMap((call) => call.args[0].input.RequestItems?.table ?? [])
      .map((r) => r.DeleteRequest?.Key);

  it("deletes the removed customer's entries, language and identity link, also when redelivered", async () => {
    dbMock
      .on(QueryCommand)
      .resolvesOnce({
        Items: [
          { PK: "TENANT#owner#CUST#c-1", SK: "NOTE#a" },
          { PK: "TENANT#owner#CUST#c-1", SK: "NOTE#b" },
        ],
      })
      .resolves({ Items: [] });
    dbMock.on(BatchWriteCommand).resolves({});

    const first = await consumer(event(record("m-1", removed)));
    expect(first.batchItemFailures).toEqual([]);
    expect(dbMock.commandCalls(QueryCommand)[0]?.args[0].input.ExpressionAttributeValues).toEqual({
      ":pk": "TENANT#owner#CUST#c-1",
      ":prefix": "NOTE#",
    });
    const mailboxKeys = [
      { PK: "TENANT#owner#CUST#c-1", SK: "MAILBOX" },
      { PK: "TENANT#owner#SUBJ#sub-1", SK: "MAILBOX" },
    ];
    expect(deletedKeys()).toEqual([
      { PK: "TENANT#owner#CUST#c-1", SK: "NOTE#a" },
      { PK: "TENANT#owner#CUST#c-1", SK: "NOTE#b" },
      ...mailboxKeys,
    ]);

    const again = await consumer(event(record("m-1", removed)));
    expect(again.batchItemFailures).toEqual([]);
    expect(deletedKeys().slice(4)).toEqual(mailboxKeys);
    expect(snsMock.commandCalls(PublishCommand)).toHaveLength(0);
  });

  it("reports an invalid removal as failed so it ends up in the DLQ", async () => {
    const broken = domainEvent("kundenportal.migration", "MigratedAccountsRemoved", {
      reason: "demo-reset",
      accounts: [],
    });
    const result = await consumer(event(record("bad", broken)));
    expect(result.batchItemFailures).toEqual([{ itemIdentifier: "bad" }]);
    expect(dbMock.commandCalls(BatchWriteCommand)).toHaveLength(0);
  });
});
