import { type LinkProps, createZoneLink } from "@kundenportal/ui";
import Link from "next/link";
import type { ComponentType } from "react";
import { BASE_PATH } from "./zone";

/**
 * Link component for the UI library: next/link within this zone, a full page load for the
 * shell and other zones. (next/link declares its event handlers without `| undefined`; the
 * values are identical.)
 */
export const ZoneLink = createZoneLink(BASE_PATH, Link as ComponentType<LinkProps>);
