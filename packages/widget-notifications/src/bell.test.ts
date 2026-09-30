import { afterEach, describe, expect, it, vi } from "vitest";
import "./bell.js";
import { fetchUnread } from "./bell.js";

const respond = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response);

function part(selector: string): HTMLElement {
  const element = document
    .querySelector("kp-bell")
    ?.shadowRoot?.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`${selector} not rendered`);
  return element;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("fetchUnread", () => {
  it("reads the unread count", async () => {
    vi.stubGlobal("fetch", respond({ unread: 3 }));
    expect(await fetchUnread("/postfach/anzahl")).toBe(3);
  });

  it("returns nothing when signed out, on errors or on odd data", async () => {
    vi.stubGlobal("fetch", respond({}, false));
    expect(await fetchUnread("/x")).toBeUndefined();
    vi.stubGlobal("fetch", respond({ unread: -1 }));
    expect(await fetchUnread("/x")).toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("offline"))),
    );
    expect(await fetchUnread("/x")).toBeUndefined();
  });
});

describe("<kp-bell>", () => {
  it("shows the count and names the link after the mailbox", async () => {
    vi.stubGlobal("fetch", respond({ unread: 2 }));
    document.body.innerHTML = '<kp-bell label="Postfach" interval="0"></kp-bell>';
    await vi.waitFor(() => expect(part(".badge").textContent).toBe("2"));
    const link = part("a");
    expect(link.getAttribute("aria-label")).toBe("Postfach: 2");
    expect(link.getAttribute("href")).toBe("/postfach");
  });

  it("hides the badge when nothing is unread", async () => {
    vi.stubGlobal("fetch", respond({ unread: 0 }));
    document.body.innerHTML = '<kp-bell interval="0"></kp-bell>';
    await vi.waitFor(() => expect(part(".badge").hidden).toBe(true));
  });
});
