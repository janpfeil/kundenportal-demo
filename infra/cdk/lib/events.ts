import { Duration } from "aws-cdk-lib";
import { Alarm, ComparisonOperator, TreatMissingData } from "aws-cdk-lib/aws-cloudwatch";
import { SnsAction } from "aws-cdk-lib/aws-cloudwatch-actions";
import { EventBus, Rule } from "aws-cdk-lib/aws-events";
import { SqsQueue } from "aws-cdk-lib/aws-events-targets";
import type { ITopic } from "aws-cdk-lib/aws-sns";
import { Queue, QueueEncryption } from "aws-cdk-lib/aws-sqs";
import {
  AccountsLinked,
  ContractChanged,
  DataVolumeThresholdReached,
  DocumentUploaded,
  DuplicateCandidateFound,
  InstallmentAdjusted,
  MeterReadingSubmitted,
  PasswordResetRequired,
} from "@kundenportal/events";
import { Construct } from "constructs";

/**
 * Own EventBridge bus and the notification service's inbox: rule → SQS (with DLQ) → Lambda.
 * An alarm tells the owner as soon as anything lands in a dead-letter queue.
 */
export class Events extends Construct {
  readonly bus: EventBus;
  readonly notificationQueue: Queue;
  readonly deadLetterQueue: Queue;

  constructor(
    scope: Construct,
    id: string,
    props: { ownerTopic: ITopic; consumerTimeout: Duration },
  ) {
    super(scope, id);

    this.bus = new EventBus(this, "Bus", { eventBusName: "kundenportal" });

    this.deadLetterQueue = new Queue(this, "NotificationDlq", {
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });
    this.notificationQueue = new Queue(this, "NotificationQueue", {
      // AWS recommends at least six times the function timeout for SQS event sources.
      visibilityTimeout: Duration.seconds(props.consumerTimeout.toSeconds() * 6),
      retentionPeriod: Duration.days(4),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      deadLetterQueue: { queue: this.deadLetterQueue, maxReceiveCount: 3 },
    });

    new Rule(this, "CustomerRegisteredToNotification", {
      eventBus: this.bus,
      description: "CustomerRegistered → notification (welcome message)",
      eventPattern: { source: ["kundenportal.customer"], detailType: ["CustomerRegistered"] },
      // Events EventBridge itself cannot deliver go to the same DLQ.
      targets: [
        new SqsQueue(this.notificationQueue, {
          deadLetterQueue: this.deadLetterQueue,
          retryAttempts: 8,
        }),
      ],
    });

    // Events of the other domains that leave a message in the customer's mailbox.
    for (const event of [
      MeterReadingSubmitted,
      InstallmentAdjusted,
      ContractChanged,
      DataVolumeThresholdReached,
      DocumentUploaded,
      // Phase 3: reset request, link offer, link confirmation.
      PasswordResetRequired,
      DuplicateCandidateFound,
      AccountsLinked,
    ]) {
      new Rule(this, `${event.detailType}ToNotification`, {
        eventBus: this.bus,
        description: `${event.detailType} → notification (mailbox)`,
        eventPattern: { source: [event.source], detailType: [event.detailType] },
        targets: [
          new SqsQueue(this.notificationQueue, {
            deadLetterQueue: this.deadLetterQueue,
            retryAttempts: 8,
          }),
        ],
      });
    }

    new Alarm(this, "DlqNotEmpty", {
      alarmDescription: "A domain event could not be processed and waits in the notification DLQ",
      metric: this.deadLetterQueue.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
      }),
      threshold: 0,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new SnsAction(props.ownerTopic));
  }
}
