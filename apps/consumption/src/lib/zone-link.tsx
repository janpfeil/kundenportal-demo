import type { LinkProps } from "@kundenportal/ui";
import Link from "next/link";
import type { ComponentProps } from "react";
import { BASE_PATH } from "./zone";

type NextLinkRest = Omit<ComponentProps<typeof Link>, "href">;

/**
 * Link component for the UI library: client-side navigation within this zone (next/link
 * adds the basePath itself), a full page load for the shell and other zones.
 */
export function ZoneLink({ href, ...rest }: LinkProps) {
  if (href === BASE_PATH || href.startsWith(`${BASE_PATH}/`) || href.startsWith(`${BASE_PATH}?`)) {
    const inner = href.slice(BASE_PATH.length);
    const target = inner === "" || inner.startsWith("?") ? `/${inner}` : inner;
    // next/link declares its event handlers without `| undefined`; the values are identical.
    return <Link href={target} {...(rest as NextLinkRest)} />;
  }
  return <a href={href} {...rest} />;
}
