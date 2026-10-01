import { isIP } from "node:net";
import {
  type ApiEvent,
  type ApiHandler,
  badRequest,
  type Caller,
  callerFrom,
  forbidden,
  HttpError,
  json,
  noContent,
  parseBody,
  router,
} from "@kundenportal/service-kit";
import type { Altcha } from "./altcha.js";
import type { Repository } from "./context.js";
import { OWNER_GROUP, OWNER_TENANT, PASS_GROUP, type TenancyConfig } from "./model.js";
import { InvitationRequest, type Passes, RedeemRequest } from "./passes.js";
import { sha256 } from "./secrets.js";
import { PlatformSettings, SettingsRequest } from "./settings.js";

/**
 * Groups from the access token. The HTTP API's JWT authorizer passes array claims as a
 * string like `[owner other]`.
 */
export function groupsOf(event: ApiEvent): string[] {
  const claim = event.requestContext.authorizer?.jwt?.claims?.["cognito:groups"];
  if (Array.isArray(claim)) return claim.map(String);
  if (typeof claim !== "string") return [];
  return claim
    .replace(/^\[|\]$/g, "")
    .split(/[\s,]+/)
    .filter(Boolean);
}

function owner(event: ApiEvent): Caller {
  const caller = callerFrom(event);
  if (!groupsOf(event).includes(OWNER_GROUP)) throw forbidden("Only the owner may do this");
  return caller;
}

/** Routes behind the JWT authorizer. */
export function createApi(passes: Passes, settings: PlatformSettings): ApiHandler {
  return router(
    {
      "GET /tenancy/settings": async (event) => {
        owner(event);
        return json(200, await settings.get());
      },
      "PUT /tenancy/settings": async (event) => {
        owner(event);
        return json(200, await settings.update(parseBody(event, SettingsRequest)));
      },
      "POST /tenancy/invitations": async (event) =>
        json(
          201,
          await passes.invite(
            owner(event),
            parseBody(event, InvitationRequest),
            event.requestContext.requestId,
          ),
        ),
      "GET /tenancy/passes": async (event) => {
        owner(event);
        return json(200, { passes: await passes.list() });
      },
      "GET /tenancy/overview": async (event) => {
        owner(event);
        return json(200, await passes.overview());
      },
      "POST /tenancy/passes/{passId}/revoke": async (event) => {
        owner(event);
        const passId = event.pathParameters?.passId;
        if (!passId) throw badRequest("passId is missing");
        return json(202, await passes.revoke(passId, event.requestContext.requestId));
      },
      "GET /tenancy/pass": async (event) => {
        const caller = callerFrom(event);
        const groups = groupsOf(event);
        const privileged = groups.includes(PASS_GROUP) || groups.includes(OWNER_GROUP);
        return json(200, await passes.own(caller, privileged));
      },
      // The portal calls this after every sign-in; only the holder's first one counts.
      "POST /tenancy/pass/activate": async (event) => {
        const caller = callerFrom(event);
        if (!groupsOf(event).includes(PASS_GROUP) || caller.tenantId === OWNER_TENANT) {
          return noContent();
        }
        return json(200, await passes.activate(caller));
      },
    },
    // Pass holders must see their pass in every state (being set up, quota used up), so
    // these routes are neither counted nor refused by the API quota guard.
    { tenantGuard: false },
  );
}

/** Header in which the portal's server passes the visitor's address (see `clientKey`). */
export const CLIENT_IP_HEADER = "x-kp-client-ip";

/**
 * The portal shell calls the API from its own server, so the network source address is
 * the shell's for every visitor; it passes the visitor's address in a header. Anyone can
 * set that header, so a second, coarser limit applies per source address.
 */
function clientAddresses(event: ApiEvent) {
  const source = event.requestContext.http.sourceIp;
  const header = event.headers?.[CLIENT_IP_HEADER]?.trim();
  return { source, client: header && isIP(header) ? header : source };
}

const tooManyRequests = () =>
  new HttpError(429, "Too Many Requests", "Too many attempts. Please try again in an hour.");

/** How long browsers and the CDN may reuse the public offer. */
export const OFFER_MAX_AGE_SECONDS = 60;

/** Routes without JWT: the offer, the ALTCHA challenge and redeeming an invitation link. */
export function createPublicApi(
  passes: Passes,
  altcha: Altcha,
  repository: Repository,
  config: TenancyConfig,
  now: () => Date = () => new Date(),
): ApiHandler {
  const settings = new PlatformSettings(repository, config, now);
  return router(
    {
      "GET /tenancy/offer": async () => {
        const result = json(200, await settings.offer());
        // Same for every visitor and without personal data, so shared caches may keep it.
        return {
          ...result,
          headers: {
            ...result.headers,
            "cache-control": `public, max-age=${OFFER_MAX_AGE_SECONDS}`,
          },
        };
      },
      "GET /tenancy/challenge": async () => json(200, await altcha.challenge()),
      "POST /tenancy/redeem": async (event) => {
        const { client, source } = clientAddresses(event);
        const at = now();
        if (!(await repository.countAttempt(sha256(client), config.redeemPerClient, at))) {
          throw tooManyRequests();
        }
        if (
          !(await repository.countAttempt(sha256(`source:${source}`), config.redeemPerSource, at))
        ) {
          throw tooManyRequests();
        }
        const body = parseBody(event, RedeemRequest);
        const check = await altcha.verify(body.altcha);
        if (!check.ok) throw badRequest(check.reason);
        if (!(await repository.useChallenge(check.signature, check.expiresAt))) {
          throw badRequest("ALTCHA challenge was already used");
        }
        return json(202, await passes.redeem(body.token, event.requestContext.requestId));
      },
    },
    // Pass holders must see their pass in every state (being set up, quota used up), so
    // these routes are neither counted nor refused by the API quota guard.
    { tenantGuard: false },
  );
}
