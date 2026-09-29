import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./generated/schema.js";

export type { components, paths };
export type Customer = components["schemas"]["Customer"];
export type CustomerUpdate = components["schemas"]["CustomerUpdate"];
export type Notification = components["schemas"]["Notification"];
export type Problem = components["schemas"]["Problem"];

/**
 * Typed client for the portal API. `getAccessToken` is called per request so that
 * server components can pass the token of the current session.
 */
export function createApiClient(baseUrl: string, getAccessToken: () => Promise<string>) {
  const client = createClient<paths>({ baseUrl });
  const auth: Middleware = {
    async onRequest({ request }) {
      request.headers.set("Authorization", `Bearer ${await getAccessToken()}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}
