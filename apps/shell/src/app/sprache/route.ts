import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { LOCALE_COOKIE } from "@/i18n";

/** Stores the chosen UI language and returns to the previous page of the portal. */
export async function GET(request: NextRequest) {
  const to = request.nextUrl.searchParams.get("to");
  if (to === "de" || to === "en") {
    (await cookies()).set(LOCALE_COOKIE, to, {
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  const referer = request.headers.get("referer");
  const back = referer ? new URL(referer).pathname : "/";
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/");
}
