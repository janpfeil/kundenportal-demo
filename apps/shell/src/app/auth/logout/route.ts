import { redirect } from "next/navigation";
import { logoutUrl } from "@/lib/oidc";
import { clearSession } from "@/lib/session";

/** Ends the local session and the provider session. */
export async function GET() {
  await clearSession();
  redirect(await logoutUrl());
}
