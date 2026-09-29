import { type NextRequest, NextResponse } from "next/server";
import { config as shellConfig } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/cookie-names";

/**
 * Guards the signed-in area before any page renders. The cookie is fully verified
 * (decrypted, expiry checked) by the pages; here a missing cookie is enough to send
 * the visitor to the sign-in.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  // Build the redirect on the public URL: inside Lambda the request host is the function URL.
  const login = new URL("/auth/login", shellConfig().appUrl);
  login.searchParams.set("returnTo", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/konto/:path*", "/postfach/:path*"] };
