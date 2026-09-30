import { InvokeCommand, type LambdaClient } from "@aws-sdk/client-lambda";
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";
import type { LegacyAccountRef } from "@kundenportal/events";
import { type RecordTask, refString } from "./model.js";

/** Hands a record to the processor function (asynchronous invocation). */
export interface RecordDispatcher {
  dispatch(task: RecordTask): Promise<void>;
}

export class LambdaDispatcher implements RecordDispatcher {
  constructor(
    private readonly lambda: LambdaClient,
    private readonly functionName: string,
  ) {}

  async dispatch(task: RecordTask): Promise<void> {
    await this.lambda.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: "Event",
        Payload: new TextEncoder().encode(JSON.stringify(task)),
      }),
    );
  }
}

/** The migration dead-letter queue as far as a redrive needs it. */
export interface DeadLetters {
  /** Removes the failed task of this account from the queue; false if it is not there. */
  remove(tenantId: string, account: LegacyAccountRef): Promise<boolean>;
}

/**
 * SQS queue that receives Lambda's on-failure records of the processor
 * (`requestPayload` = the task). Nothing polls it (an event source would poll around the
 * clock and leave the free tier); a redrive looks for the task with a few long polls.
 */
export class SqsDeadLetters implements DeadLetters {
  constructor(
    private readonly sqs: SQSClient,
    private readonly queueUrl: string,
  ) {}

  async remove(tenantId: string, account: LegacyAccountRef): Promise<boolean> {
    const wanted = refString(account);
    for (let round = 0; round < 5; round++) {
      const result = await this.sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 1,
          VisibilityTimeout: 10,
        }),
      );
      const messages = result.Messages ?? [];
      if (messages.length === 0) return false;
      let found = false;
      for (const message of messages) {
        const task = taskOf(message.Body);
        const match =
          !found &&
          task?.tenantId === tenantId &&
          task.account &&
          refString(task.account) === wanted;
        if (match) {
          found = true;
          await this.sqs.send(
            new DeleteMessageCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
            }),
          );
        } else {
          // Put the others back at once.
          await this.sqs.send(
            new ChangeMessageVisibilityCommand({
              QueueUrl: this.queueUrl,
              ReceiptHandle: message.ReceiptHandle,
              VisibilityTimeout: 0,
            }),
          );
        }
      }
      if (found) return true;
    }
    return false;
  }
}

function taskOf(body: string | undefined): Partial<RecordTask> | undefined {
  try {
    const record = JSON.parse(body ?? "") as { requestPayload?: Partial<RecordTask> };
    return record.requestPayload;
  } catch {
    return undefined;
  }
}
