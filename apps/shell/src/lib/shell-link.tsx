import type { LinkProps } from "@kundenportal/ui";
import Link from "next/link";
import type { ComponentProps } from "react";

/** Pages rendered by this zone; everything else belongs to another zone. */
const SHELL_PAGES = new Set(["/", "/konto", "/postfach"]);

type NextLinkRest = Omit<ComponentProps<typeof Link>, "href">;

/**
 * Link component for the UI library: client-side navigation within the shell, a full page
 * load for other zones (multi-zones: each zone is its own Next.js app behind CloudFront).
 */
export function ShellLink({ href, ...rest }: LinkProps) {
  const path = href.split(/[?#]/)[0] ?? href;
  // next/link declares its event handlers without `| undefined`; the values are identical.
  if (SHELL_PAGES.has(path)) return <Link href={href} {...(rest as NextLinkRest)} />;
  return <a href={href} {...rest} />;
}
