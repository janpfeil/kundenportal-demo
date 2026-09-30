import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./generated/schema.js";

export type { components, paths };
export type Customer = components["schemas"]["Customer"];
export type CustomerUpdate = components["schemas"]["CustomerUpdate"];
export type Notification = components["schemas"]["Notification"];
export type Problem = components["schemas"]["Problem"];
export type Division = components["schemas"]["Division"];
export type MeterUnit = components["schemas"]["MeterUnit"];
export type Contract = components["schemas"]["Contract"];
export type ContractUpdate = components["schemas"]["ContractUpdate"];
export type MeterReading = components["schemas"]["MeterReading"];
export type NewMeterReading = components["schemas"]["NewMeterReading"];
export type DataUsage = components["schemas"]["DataUsage"];
export type Document = components["schemas"]["Document"];
export type DocumentCategory = components["schemas"]["DocumentCategory"];
export type UploadContentType = components["schemas"]["UploadContentType"];
export type UploadUrlRequest = components["schemas"]["UploadUrlRequest"];
export type UploadTicket = components["schemas"]["UploadTicket"];

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
export type LinkOffer = components["schemas"]["LinkOffer"];
export type MigrationStatus = components["schemas"]["MigrationStatus"];
export type MigrationRecord = components["schemas"]["MigrationRecord"];
export type MigrationRun = components["schemas"]["MigrationRun"];
