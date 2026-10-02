import { existsSync } from "node:fs";
import path from "node:path";
import { APP_ICONS } from "@kundenportal/ui/theme";
import { describe, expect, it } from "vitest";
import manifest from "../app/manifest";

const APP_DIR = path.join(import.meta.dirname, "..", "app");

/** The shell serves every metadata file of its app directory at the same path. */
const served = (url: string) => {
  const file = url.split("?")[0]?.slice(1) ?? "";
  return file === "manifest.webmanifest"
    ? existsSync(path.join(APP_DIR, "manifest.ts"))
    : existsSync(path.join(APP_DIR, file));
};

describe("app icons", () => {
  it("links only files the shell serves (the zones use the same paths)", () => {
    const urls = [
      ...APP_ICONS.icons.icon.map((icon) => icon.url),
      APP_ICONS.icons.apple,
      APP_ICONS.manifest,
    ];
    for (const url of urls) expect(served(url), url).toBe(true);
  });

  it("lists home-screen icons of 192 and 512 px that exist", () => {
    const icons = manifest().icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of icons) expect(served(icon.src), icon.src).toBe(true);
  });
});
