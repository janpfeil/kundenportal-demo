import { createCspProxy } from "@kundenportal/web-auth/csp";
import { type NextRequest, NextResponse } from "next/server";
import { config as shellConfig } from "@/lib/config";
import { SESSION_COOKIE } from "@/lib/cookie-names";

/** Signed-in area: without a session cookie the visitor goes to the sign-in first. */
function needsSession(path: string): boolean {
  return (
    path === "/pass" ||
    path === "/konto" ||
    path.startsWith("/konto/") ||
    path === "/postfach" ||
    path.startsWith("/postfach/")
  );
}

/**
 * Runs before every page and route handler of the shell: sets the Content Security Policy
 * (@kundenportal/web-auth/csp) and guards the signed-in area. The session cookie is fully
 * verified (decrypted, expiry checked) by the pages; here a missing cookie is enough to
 * send the visitor to the sign-in.
 */
export const proxy = createCspProxy({
  sources: () => {
    const logout = shellConfig().logoutUrl;
    return {
      // Sign-in and sign-out redirect to Cognito's hosted domain.
      formAction: logout ? [logout.origin] : [],
      // The ALTCHA widget solves its proof of work in a web worker built from a blob.
      workerSrc: ["blob:"],
    };
  },
  // Prerendered pages: no nonce possible, their inline scripts are allowed by hash.
  prerendered: { "/": "index.html", "/pass/einloesen": "pass/einloesen.html" },
  // The 404 for unknown paths (app/global-not-found.tsx) and Next.js's global error page.
  anyPath: ["_not-found.html", "_global-error.html"],
  guard: (request: NextRequest) => {
    const path = request.nextUrl.pathname;
    if (!needsSession(path) || request.cookies.has(SESSION_COOKIE)) return undefined;
    // Build the redirect on the public URL: inside Lambda the request host is the function URL.
    const login = new URL("/auth/login", shellConfig().appUrl);
    login.searchParams.set("returnTo", path);
    return NextResponse.redirect(login);
  },
});

export const config = {
  // Everything except files that are never HTML (hashed assets, the widget, the icon).
  matcher: ["/((?!_next/static|_next/image|widgets/|favicon.ico).*)"],
};
