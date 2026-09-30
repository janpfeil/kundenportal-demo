import type { ComponentType } from "react";
import type { LinkProps } from "./link.js";

/**
 * Builds the link component of a zone: client-side navigation with the framework's link
 * (e.g. next/link, which adds the basePath itself) for paths of this zone, a plain <a> and
 * thus a full page load for the shell and other zones.
 *
 * @param basePath the zone's URL prefix, e.g. "/vertraege"
 * @param FrameworkLink link component that takes paths relative to the basePath
 */
export function createZoneLink(
  basePath: string,
  FrameworkLink: ComponentType<LinkProps>,
): ComponentType<LinkProps> {
  function ZoneLink({ href, ...rest }: LinkProps) {
    if (href === basePath || href.startsWith(`${basePath}/`) || href.startsWith(`${basePath}?`)) {
      const inner = href.slice(basePath.length);
      const target = inner === "" || inner.startsWith("?") ? `/${inner}` : inner;
      return <FrameworkLink href={target} {...rest} />;
    }
    return <a href={href} {...rest} />;
  }
  return ZoneLink;
}
