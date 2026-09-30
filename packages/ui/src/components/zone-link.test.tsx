import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LinkProps } from "./link.js";
import { createZoneLink } from "./zone-link.js";

/** Stands in for next/link: marks itself and shows the href it received. */
function FrameworkLink({ href, ...rest }: LinkProps) {
  return <a href={`framework:${href}`} data-framework="" {...rest} />;
}

const ZoneLink = createZoneLink("/vertraege", FrameworkLink);

describe("createZoneLink", () => {
  it("navigates within the zone with the framework link, relative to the basePath", () => {
    render(
      <>
        <ZoneLink href="/vertraege">Übersicht</ZoneLink>
        <ZoneLink href="/vertraege/123">Detail</ZoneLink>
        <ZoneLink href="/vertraege?tab=docs">Dokumente</ZoneLink>
      </>,
    );
    expect(screen.getByRole("link", { name: "Übersicht" })).toHaveAttribute("href", "framework:/");
    expect(screen.getByRole("link", { name: "Detail" })).toHaveAttribute("href", "framework:/123");
    expect(screen.getByRole("link", { name: "Dokumente" })).toHaveAttribute(
      "href",
      "framework:/?tab=docs",
    );
  });

  it("leaves the shell and other zones with a full page load", () => {
    render(
      <>
        <ZoneLink href="/konto">Konto</ZoneLink>
        <ZoneLink href="/vertraegeX">Andere</ZoneLink>
      </>,
    );
    for (const name of ["Konto", "Andere"]) {
      expect(screen.getByRole("link", { name })).not.toHaveAttribute("data-framework");
    }
    expect(screen.getByRole("link", { name: "Konto" })).toHaveAttribute("href", "/konto");
  });
});
