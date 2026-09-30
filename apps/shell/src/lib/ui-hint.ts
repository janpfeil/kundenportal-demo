/**
 * The signed-in hint for prerendered pages. The session cookie is httpOnly and encrypted,
 * so a page that is the same for every visitor cannot read it. At sign-in the shell
 * therefore also sets `kp_ui`, a readable cookie that only says "signed in" (and whether
 * the user holds a demo pass or owns the portal, for the cockpit link), with the session's
 * lifetime. It carries no identity and
 * grants nothing: it only decides which navigation entries the browser shows; every page
 * behind them checks the real session.
 */
export const UI_HINT_COOKIE = "kp_ui";

export type UiHint = "user" | "pass" | "owner";

export function isUiHint(value: unknown): value is UiHint {
  return value === "user" || value === "pass" || value === "owner";
}

/** Reads a cookie from a `document.cookie` string. */
export function cookieValue(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
