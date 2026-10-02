import {
  ConditionalCheckFailedException,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  type BatchWriteCommandInput,
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { AwsClientStub } from "aws-sdk-client-mock";

type Item = Record<string, unknown>;
type Values = Record<string, unknown> | undefined;
type Names = Record<string, string> | undefined;

const keyOf = (item: Item) => `${String(item.PK)}\u0000${String(item.SK)}`;
const clone = <T>(value: T): T => structuredClone(value);

/**
 * Evaluates the few condition expressions the contract domain writes:
 * `attribute_not_exists(PK)` and `#name = :value` (tests only).
 */
function holds(
  item: Item | undefined,
  expression: string | undefined,
  names: Names,
  values: Values,
) {
  if (!expression) return true;
  if (expression === "attribute_not_exists(PK)") return item === undefined;
  const match = /^(#\w+) = (:\w+)$/.exec(expression);
  if (!match) throw new Error(`Unsupported condition ${expression}`);
  const attribute = names?.[match[1] ?? ""] ?? "";
  return item !== undefined && item[attribute] === values?.[match[2] ?? ""];
}

/**
 * A single table in memory behind a mocked DynamoDB document client, for tests that walk
 * through several requests: Get, Put, Update (`SET a = :v`), Query (`PK = :pk` with an
 * optional `begins_with(SK, :p)`), Scan (`begins_with(PK, :prefix)`, paged by `Limit`),
 * TransactWrite (puts) and BatchWrite (deletes).
 */
export class MemoryTable {
  readonly items = new Map<string, Item>();

  constructor(mock: AwsClientStub<DynamoDBDocumentClient>) {
    mock.on(GetCommand).callsFake((input) => {
      const item = this.items.get(keyOf(input.Key));
      return { Item: item ? clone(item) : undefined };
    });
    mock.on(PutCommand).callsFake((input) => {
      const current = this.items.get(keyOf(input.Item));
      if (
        !holds(
          current,
          input.ConditionExpression,
          input.ExpressionAttributeNames,
          input.ExpressionAttributeValues,
        )
      ) {
        throw new ConditionalCheckFailedException({ message: "condition", $metadata: {} });
      }
      this.items.set(keyOf(input.Item), clone(input.Item));
      return {};
    });
    mock.on(UpdateCommand).callsFake((input) => {
      const current = this.items.get(keyOf(input.Key));
      const values = input.ExpressionAttributeValues;
      if (
        !holds(current, input.ConditionExpression, input.ExpressionAttributeNames, values) ||
        !current
      ) {
        throw new ConditionalCheckFailedException({ message: "condition", $metadata: {} });
      }
      const assignments = (input.UpdateExpression ?? "").replace(/^SET /, "").split(", ");
      for (const assignment of assignments) {
        const set = /^(\w+) = (:\w+)$/.exec(assignment);
        if (!set) throw new Error(`Unsupported update ${input.UpdateExpression}`);
        current[set[1] ?? ""] = values?.[set[2] ?? ""];
      }
      return {};
    });
    mock.on(QueryCommand).callsFake((input) => {
      const values = input.ExpressionAttributeValues ?? {};
      const prefixName = /begins_with\(SK, (:\w+)\)/.exec(input.KeyConditionExpression ?? "")?.[1];
      const prefix = prefixName ? String(values[prefixName]) : "";
      const items = [...this.items.values()]
        .filter((item) => item.PK === values[":pk"] && String(item.SK).startsWith(prefix))
        .sort((a, b) => (String(a.SK) < String(b.SK) ? -1 : 1));
      if (input.ScanIndexForward === false) items.reverse();
      return { Items: items.map(clone) };
    });
    mock.on(ScanCommand).callsFake((input) => {
      // Pages of `Limit` items in key order; the filter applies after the page is read.
      const ordered = [...this.items.values()].sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
      const start = input.ExclusiveStartKey ? keyOf(input.ExclusiveStartKey) : "";
      const rest = ordered.filter((item) => keyOf(item) > start);
      const page = rest.slice(0, input.Limit ?? rest.length);
      const prefix = String(input.ExpressionAttributeValues?.[":prefix"] ?? "");
      const last = page.at(-1);
      return {
        Items: page.filter((item) => String(item.PK).startsWith(prefix)).map(clone),
        ...(last && rest.length > page.length
          ? { LastEvaluatedKey: { PK: last.PK, SK: last.SK } }
          : {}),
      };
    });
    mock.on(TransactWriteCommand).callsFake((input: TransactWriteCommandInput) => {
      const puts = (input.TransactItems ?? []).map((entry) => {
        if (!entry.Put) throw new Error("Only puts in transactions");
        return entry.Put;
      });
      const reasons = puts.map((put) =>
        holds(
          this.items.get(keyOf(put.Item ?? {})),
          put.ConditionExpression,
          put.ExpressionAttributeNames,
          put.ExpressionAttributeValues,
        )
          ? { Code: "None" }
          : { Code: "ConditionalCheckFailed" },
      );
      if (reasons.some((r) => r.Code !== "None")) {
        throw new TransactionCanceledException({
          message: "cancelled",
          $metadata: {},
          CancellationReasons: reasons,
        });
      }
      for (const put of puts) this.items.set(keyOf(put.Item ?? {}), clone(put.Item ?? {}));
      return {};
    });
    mock.on(BatchWriteCommand).callsFake((input: BatchWriteCommandInput) => {
      for (const requests of Object.values(input.RequestItems ?? {})) {
        for (const request of requests) {
          if (request.DeleteRequest?.Key) this.items.delete(keyOf(request.DeleteRequest.Key));
        }
      }
      return { UnprocessedItems: {} };
    });
  }

  put(...items: Item[]): void {
    for (const item of items) this.items.set(keyOf(item), clone(item));
  }

  get(pk: string, sk: string): Item | undefined {
    return this.items.get(`${pk}\u0000${sk}`);
  }

  /** Items of a partition, sorted by sort key. */
  partition(pk: string, prefix = ""): Item[] {
    return [...this.items.values()]
      .filter((item) => item.PK === pk && String(item.SK).startsWith(prefix))
      .sort((a, b) => (String(a.SK) < String(b.SK) ? -1 : 1));
  }
}
