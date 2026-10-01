import { type BrowserContext, expect, type Page, test, type TestInfo } from "@playwright/test";
import { openSignedIn } from "./sign-in.js";
import { addToGroup, createTestUser, type TestUser, userPoolId } from "./test-user.js";

/**
 * Visual check of every phase 6 screen against the live portal, only with E2E_SCREENS=1:
 * the default presets ("Klar" for customers, "Dicht" in the cockpit) light and dark on a
 * desktop and a 375 px phone, plus samples of the other presets. Each screenshot is
 * attached to the HTML report; every page must fit the width without scrolling sideways.
 */
const EVENTUALLY = { timeout: 45_000, intervals: [2_000, 3_000, 5_000] };

interface Variant {
  preset: string;
  mode: "light" | "dark";
  width: number;
}

const both = (preset: string, desktop: number): Variant[] =>
  (["light", "dark"] as const).flatMap((mode) =>
    [desktop, 375].map((width) => ({ preset, mode, width })),
  );

let customer: TestUser;
let owner: TestUser;

test.use({ locale: "de-DE" });
test.describe.configure({ mode: "serial" });
test.skip(process.env.E2E_SCREENS !== "1", "E2E_SCREENS is not set");

test.beforeAll(async () => {
  const poolId = await userPoolId();
  customer = await createTestUser(poolId);
  owner = await createTestUser(poolId);
  await addToGroup(poolId, owner.email, "owner");
});

test.afterAll(async () => {
  await customer?.remove();
  await owner?.remove();
});

async function applyTheme(context: BrowserContext, audience: string, variant: Variant) {
  const url = test.info().project.use.baseURL ?? "https://kundenportal-demo.rypox.com";
  await context.addCookies([
    { name: `kp_theme_${audience}`, value: variant.preset, url },
    { name: "kp_color_mode", value: variant.mode, url },
  ]);
}

async function capture(page: Page, info: TestInfo, path: string, variant: Variant) {
  await page.setViewportSize({ width: variant.width, height: 900 });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("html")).toHaveAttribute("data-theme-preset", variant.preset);
  const overflow = Number(
    await page.evaluate("document.documentElement.scrollWidth - window.innerWidth"),
  );
  const name = `${path} · ${variant.preset} ${variant.mode} ${variant.width}px`;
  expect.soft(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
  // No navigation entry may hide in the scroll row of the top bar. An entry is at least
  // 40 px wide; a few pixels of the row's padding may stick out without hiding anything.
  const hidden = Number(
    await page.evaluate(
      "(() => { const ul = document.querySelector('.kp-nav ul'); return ul && ul.offsetParent ? ul.scrollWidth - ul.clientWidth : 0; })()",
    ),
  );
  expect.soft(hidden, `${name} hides navigation entries`).toBeLessThanOrEqual(8);
  await info.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
}

test("customer screens", async ({ page, context }, info) => {
  test.setTimeout(900_000);
  await openSignedIn(page, "/konto", customer.email, customer.password);
  // The demo contracts follow the registration by event.
  await expect(async () => {
    await page.goto("/vertraege");
    await expect(page.getByTestId("contracts")).toContainText("Mobilfunk");
  }).toPass(EVENTUALLY);
  const detail = await page.getByTestId("contracts").getByRole("link").first().getAttribute("href");
  const screens = [
    "/",
    "/pass/einloesen",
    "/konto",
    "/vertraege",
    detail?.startsWith("/vertraege/") ? detail : `/vertraege${detail ?? ""}`,
    "/verbrauch",
    "/postfach",
  ];
  const variants: Variant[] = [
    ...both("klar", 1280),
    { preset: "vertrauen", mode: "dark", width: 1280 },
    { preset: "warm", mode: "light", width: 375 },
    { preset: "klassisch", mode: "dark", width: 1280 },
  ];
  for (const variant of variants) {
    await applyTheme(context, "kunde", variant);
    const sample = variant.preset !== "klar";
    for (const path of sample ? ["/konto", "/verbrauch"] : screens) {
      await capture(page, info, path, variant);
    }
  }
  // The mobile tab of the consumption page in the default preset.
  for (const variant of both("klar", 1280)) {
    await applyTheme(context, "kunde", variant);
    await capture(page, info, "/verbrauch", variant);
    await page.getByRole("tab", { name: /Mobilfunk/ }).click();
    await info.attach(`/verbrauch Mobilfunk · klar ${variant.mode} ${variant.width}px`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }
});

test("cockpit screens", async ({ page, context }, info) => {
  test.setTimeout(600_000);
  await openSignedIn(page, "/cockpit", owner.email, owner.password);
  const variants: Variant[] = [
    ...both("dicht", 1440),
    { preset: "uebersicht", mode: "light", width: 1280 },
    { preset: "kontrast", mode: "dark", width: 1440 },
  ];
  for (const variant of variants) {
    await applyTheme(context, "cockpit", variant);
    const sample = variant.preset !== "dicht";
    for (const path of sample
      ? ["/cockpit", "/cockpit/paesse"]
      : ["/cockpit", "/cockpit/paesse", "/cockpit/suche?q=telco"]) {
      await capture(page, info, path, variant);
    }
  }
});
