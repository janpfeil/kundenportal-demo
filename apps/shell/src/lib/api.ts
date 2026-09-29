import { createApiClient } from "@kundenportal/api-contract";
import { redirect } from "next/navigation";
import { config } from "./config";
import { readSession } from "./session";

/** Typed API client that calls the portal API with the access token of the current session. */
export async function api() {
  const session = await readSession();
  if (!session) redirect("/auth/login");
  return createApiClient(config().apiUrl, async () => session.accessToken);
}
