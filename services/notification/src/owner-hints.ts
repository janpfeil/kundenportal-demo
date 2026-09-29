import { PublishCommand, type SNSClient } from "@aws-sdk/client-sns";

/** Short operational hints to the project owner (SNS topic with an e-mail subscription). */
export class OwnerHints {
  constructor(
    private readonly sns: SNSClient,
    private readonly topicArn: string,
  ) {}

  async send(subject: string, message: string): Promise<void> {
    await this.sns.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: subject.slice(0, 100),
        Message: message,
      }),
    );
  }
}
