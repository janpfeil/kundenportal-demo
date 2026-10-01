import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { epochSeconds, Invitation, InvitationIndexEntry } from "./model.js";
import { SettingsRepository } from "./settings-repository.js";

/** `INVITE#<sha256(token)>` / `META` — the invitation, found only by its token's hash. */
export const inviteKey = (tokenHash: string) => ({ PK: `INVITE#${tokenHash}`, SK: "META" });
/** `PLATFORM` / `INVITE#<invitationId>` — index entry of an invitation not redeemed yet. */
export const inviteIndexKey = (invitationId: string) => ({
  PK: "PLATFORM",
  SK: `INVITE#${invitationId}`,
});

/**
 * Invitations in the base table (architektur-mandanten §1) and their index for the
 * owner's overview. The redeem (`TenancyRepository.issuePass`) marks the invitation and
 * deletes its index entry in its own transaction.
 */
export class InvitationRepository extends SettingsRepository {
  /**
   * Stores an invitation and its index entry for the overview. Two plain puts of small
   * items cost 2 write units; a transaction would cost 4 of the table's 5 per second.
   * The invitation goes first: if the entry then fails, the owner gets an error and no
   * link, and the unused invitation just expires — the overview never shows an
   * invitation that does not exist.
   */
  async putInvitation(tokenHash: string, invitation: Invitation): Promise<void> {
    const ttl = epochSeconds(new Date(invitation.expiresAt));
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...inviteKey(tokenHash), ...invitation, ttl },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    const entry: InvitationIndexEntry = {
      invitationId: invitation.invitationId,
      email: invitation.email,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
      shortLived: invitation.shortLived === true,
    };
    await this.db.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...inviteIndexKey(invitation.invitationId), ...entry, ttl },
      }),
    );
  }

  async getInvitation(tokenHash: string): Promise<Invitation | undefined> {
    const result = await this.db.send(
      new GetCommand({ TableName: this.table, Key: inviteKey(tokenHash), ConsistentRead: true }),
    );
    return result.Item ? Invitation.parse(result.Item) : undefined;
  }

  /**
   * Invitations not redeemed and not expired at `now`, newest first. Expired entries
   * may linger until DynamoDB's TTL removes them (up to a few days), so they are
   * filtered here.
   */
  async listOpenInvitations(now: Date): Promise<InvitationIndexEntry[]> {
    const entries: InvitationIndexEntry[] = [];
    let start: Record<string, unknown> | undefined;
    do {
      const page = await this.db.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          ExpressionAttributeValues: { ":pk": "PLATFORM", ":prefix": "INVITE#" },
          ExclusiveStartKey: start,
        }),
      );
      entries.push(...(page.Items ?? []).map((item) => InvitationIndexEntry.parse(item)));
      start = page.LastEvaluatedKey;
    } while (start);
    return entries
      .filter((entry) => Date.parse(entry.expiresAt) > now.getTime())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
