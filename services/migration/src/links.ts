import {
  AccountsLinked,
  deterministicUuid,
  DuplicateCandidateFound,
  type LegacyAccountMigratedDetail,
  type LegacyAccountRef,
  type LegacyProfile,
  type MatchCriterion,
} from "@kundenportal/events";
import { addressKey, fold, formatAddress, type MappedAccount } from "@kundenportal/legacy";
import {
  type Caller,
  forbidden,
  HttpError,
  log,
  notFound,
  OWNER_TENANT,
} from "@kundenportal/service-kit";
import { type MigrationContext, readExport, readRecord } from "./context.js";
import { type LinkOffer, refString } from "./model.js";

/** Why two accounts are believed to be the same person, and how sure that is. */
export function matchAccounts(
  profile: LegacyProfile,
  email: string,
  candidate: MappedAccount,
): { matchedOn: MatchCriterion[]; score: number } | undefined {
  const sameName =
    fold(profile.firstName) === fold(candidate.profile.firstName) &&
    fold(profile.lastName) === fold(candidate.profile.lastName);
  const sameAddress = addressKey(profile.address) === addressKey(candidate.profile.address);
  const sameBirthDate =
    profile.birthDate !== undefined && profile.birthDate === candidate.profile.birthDate;
  const sameEmail = email.toLowerCase() === candidate.email.toLowerCase();
  // Name alone is too weak (namesakes); it needs the address, the birth date or the email.
  if (!sameName || !(sameAddress || sameBirthDate || sameEmail)) return undefined;
  const matchedOn: MatchCriterion[] = [
    "name",
    ...(sameAddress ? (["address"] as const) : []),
    ...(sameBirthDate ? (["birthDate"] as const) : []),
    ...(sameEmail ? (["email"] as const) : []),
  ];
  const score = Math.min(1, 0.5 + 0.25 * (matchedOn.length - 1));
  return { matchedOn, score };
}

export const LinkRequest = {
  parse(body: unknown): { account: LegacyAccountRef; password: string } {
    const value = body as { system?: unknown; customerNumber?: unknown; password?: unknown };
    if (
      (value?.system !== "utility" && value?.system !== "telco") ||
      typeof value.customerNumber !== "string" ||
      !value.customerNumber ||
      typeof value.password !== "string" ||
      !value.password ||
      value.password.length > 200
    ) {
      throw new HttpError(400, "Bad Request", "system, customerNumber and password are required");
    }
    return {
      account: { system: value.system, customerNumber: value.customerNumber },
      password: value.password,
    };
  },
};

/**
 * Duplicate detection and account linking (journey J3). After a migration the other
 * legacy system is searched for the same person (name plus address, birth date or email;
 * addresses normalised, "Hauptstr. 5" = "Hauptstraße 5"). A hit becomes an offer in the
 * customer's mailbox; linking needs the other account's password as proof of ownership.
 */
export class Linking {
  constructor(private readonly ctx: MigrationContext) {}

  /** `LegacyAccountMigrated`: record the migration and look for a duplicate. */
  async onMigrated(event: LegacyAccountMigratedDetail): Promise<void> {
    const { repository, events } = this.ctx;
    const { tenantId, payload, correlationId, occurredAt } = event;
    const existing = await repository.getRecord(tenantId, payload.account);
    await repository.putRecord(
      tenantId,
      {
        account: payload.account,
        displayName: payload.displayName,
        status: "migrated",
        mode: payload.mode,
        customerId: payload.customerId,
        subject: payload.subject,
        attempts: existing?.attempts ?? 0,
        updatedAt: occurredAt,
        ...(existing?.lastSignInAt ? { lastSignInAt: existing.lastSignInAt } : {}),
        ...(existing?.runId ? { runId: existing.runId } : {}),
        // The cockpit's trends still count a redriven record that then migrated.
        ...(existing?.failedAt ? { failedAt: existing.failedAt } : {}),
        ...(existing?.redrivenAt ? { redrivenAt: existing.redrivenAt } : {}),
      },
      true,
    );

    const other = payload.account.system === "utility" ? "telco" : "utility";
    const candidates = await readExport(await this.ctx.legacy(), tenantId, other);
    for (const candidate of candidates) {
      if (!candidate.ok) continue;
      const match = matchAccounts(payload.profile, payload.email, candidate);
      if (!match) continue;
      const tracked = await repository.getRecord(tenantId, candidate.account);
      if (tracked?.status === "migrated" || tracked?.status === "linked") continue;
      const offer: LinkOffer = {
        customerId: payload.customerId,
        account: payload.account,
        candidate: candidate.account,
        displayName: candidate.displayName,
        address: formatAddress(candidate.profile.address),
        ...match,
        status: "offered",
        offeredAt: occurredAt,
      };
      await repository.putOffer(tenantId, payload.subject, offer);
      // Published on every delivery with the same id; consumers deduplicate.
      await events.publish(DuplicateCandidateFound, {
        eventId: deterministicUuid(
          tenantId,
          "DuplicateCandidateFound",
          payload.subject,
          refString(candidate.account),
        ),
        tenantId,
        occurredAt,
        correlationId,
        payload: {
          customerId: payload.customerId,
          subject: payload.subject,
          account: payload.account,
          candidate: candidate.account,
          candidateSummary: { displayName: offer.displayName, address: offer.address },
          ...match,
        },
      });
      log("info", "Duplicate candidate found", {
        tenantId,
        account: refString(payload.account),
        candidate: refString(candidate.account),
        matchedOn: match.matchedOn,
      });
    }
  }

  /** `GET /me/links`: offers and links of the signed-in customer. */
  async list(caller: Caller): Promise<LinkOffer[]> {
    return this.ctx.repository.listOffers(caller.tenantId, caller.subject);
  }

  /** `POST /me/links`: confirm an offer with the other account's password. */
  async confirm(caller: Caller, body: unknown, correlationId: string): Promise<LinkOffer> {
    const { repository, events } = this.ctx;
    const { account: candidate, password } = LinkRequest.parse(body);
    const { tenantId, subject } = caller;
    const offer = await repository.getOffer(tenantId, subject, candidate);
    if (!offer) throw notFound("No link offer for this account");
    if (offer.status === "linked") return offer;

    const legacy = await this.ctx.legacy();
    const mapped = await readRecord(legacy, tenantId, candidate);
    if (!mapped?.ok) throw new HttpError(409, "Conflict", "The account cannot be taken over");
    const proven =
      candidate.system === "utility"
        ? (await legacy.utility.verifyLogin(tenantId, mapped.email, password)) ===
          candidate.customerNumber
        : tenantId === OWNER_TENANT
          ? Boolean(await legacy.keycloak.verify(mapped.email, password))
          : // The Keycloak realm is the owner's; a pass tenant's telco checks itself.
            (await legacy.telco.checkLogin(tenantId, mapped.email, password)) ===
            candidate.customerNumber;
    if (!proven) throw forbidden("The password of the other account does not match");

    const now = this.ctx.now().toISOString();
    if (await repository.markOfferLinked(tenantId, subject, candidate, now)) {
      await repository.putRecord(
        tenantId,
        {
          account: candidate,
          displayName: mapped.displayName,
          status: "linked",
          customerId: offer.customerId,
          subject,
          lastSignInAt: mapped.lastSignInAt,
          attempts: 0,
          updatedAt: now,
        },
        true,
      );
      await events.publish(AccountsLinked, {
        eventId: deterministicUuid(tenantId, "AccountsLinked", subject, refString(candidate)),
        tenantId,
        occurredAt: now,
        correlationId,
        payload: {
          customerId: offer.customerId,
          subject,
          account: offer.account,
          linked: candidate,
          contracts: mapped.contracts,
        },
      });
      log("info", "Accounts linked", { tenantId, linked: refString(candidate) });
    }
    return { ...offer, status: "linked", linkedAt: now };
  }
}
