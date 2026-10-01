import { expect, test } from "@playwright/test";
import { openSignedIn } from "./sign-in.js";
import { addToGroup, createTestUser, type TestUser, userPoolId } from "./test-user.js";

/**
 * Phase 6 against the live portal: the pages carry the mockup's building blocks with data
 * from the API — overview cards, consumption chart and tabs, the marked demo values, and
 * in the cockpit the key figures, the search behind "/" and the shortcut "g p".
 */
const EVENTUALLY = { timeout: 45_000, intervals: [2_000, 3_000, 5_000] };

let customer: TestUser;
let owner: TestUser;

test.use({ locale: "de-DE" });
test.describe.configure({ mode: "serial" });

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

test("the overview greets the customer and shows contract cards and the mailbox", async ({
  page,
}) => {
  await openSignedIn(page, "/konto", customer.email, customer.password);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Guten Tag");
  // The demo contracts follow the registration by event.
  await expect(async () => {
    await page.goto("/konto");
    const main = page.locator("main");
    await expect(main).toContainText("Ihre Verträge");
    await expect(main).toContainText(/Strom/);
    await expect(main).toContainText(/Mobil/);
    // The mobile data volume is simulated and says so; it shows once the consumption
    // domain knows the contract (another event after the contract itself).
    await expect(page.locator('[data-fake="true"]').first()).toBeVisible();
  }).toPass(EVENTUALLY);
  await expect(page.getByTestId("account")).toContainText(customer.email);
});

test("consumption shows tabs, the 12-month chart and the marked data volume", async ({ page }) => {
  await openSignedIn(page, "/verbrauch", customer.email, customer.password);
  const tabs = page.getByRole("tablist");
  await expect(tabs.getByRole("tab", { name: /Strom/ })).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel").first();
  await expect(panel.locator("svg.kp-bar-chart-svg")).toBeVisible();
  await expect(panel).toContainText("Letzte 12 Monate");
  await expect(panel).toContainText("Ø pro Monat");
  // The chart can be read as a table, too.
  await panel.locator(".kp-chart-details summary").click();
  await expect(panel.locator(".kp-chart-details table tbody tr")).toHaveCount(12);

  await page.waitForLoadState("networkidle");
  await tabs.getByRole("tab", { name: /Mobilfunk/ }).click();
  const mobile = page.getByRole("tabpanel", { name: /Mobilfunk/ });
  await expect(mobile.locator('[data-fake="true"]').first()).toBeVisible();
  await expect(mobile.getByRole("button", { name: /1 GB nachbuchen/ })).toBeDisabled();
});

test("the cockpit shows the key figures, searches behind '/' and jumps with 'g p'", async ({
  page,
}) => {
  await openSignedIn(page, "/cockpit", owner.email, owner.password);
  const main = page.locator("main");
  await expect(main.getByRole("img", { name: /Versorger/ }).first()).toBeVisible();
  await expect(main.getByRole("img", { name: /Telko/ }).first()).toBeVisible();
  await expect(main).toContainText("Offene Klärfälle");
  await expect(main).toContainText("Dead-Letter-Queue");
  await expect(main).toContainText("Aktualisiert sich alle 10 Sekunden");
  await page.waitForLoadState("networkidle");

  // The sidebar's anchors bring their heading just below the sticky top bar — or, where the
  // page ends too early to scroll that far, at least fully below it.
  const position = (id: string) =>
    page.evaluate(
      `(() => { const bar = document.querySelector(".kp-topbar").getBoundingClientRect();` +
        ` const top = document.querySelector("#${id} h2").getBoundingClientRect().top;` +
        ` const end = document.documentElement.scrollHeight - window.innerHeight;` +
        ` return { gap: Math.round(top - bar.bottom), atEnd: window.scrollY >= end - 1 }; })()`,
    ) as Promise<{ gap: number; atEnd: boolean }>;
  // A low window makes even the short page of a fresh owner scroll.
  await page.setViewportSize({ width: 1280, height: 400 });
  for (const [entry, id] of [
    [/^DLQ/, "dlq"],
    [/^Ereignisse/, "ereignisse"],
  ] as const) {
    await page.locator(".kp-sidenav").getByRole("link", { name: entry }).click();
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    await expect.poll(async () => (await position(id)).gap).toBeGreaterThanOrEqual(0);
    const { gap, atEnd } = await position(id);
    if (!atEnd) expect(gap, `heading of #${id} below the top bar`).toBeLessThanOrEqual(48);
  }
  // "Übersicht" points to the open page: it goes back to the top and drops the anchor.
  await page
    .locator(".kp-sidenav")
    .getByRole("link", { name: /^Übersicht/ })
    .click();
  await expect(page).toHaveURL(/\/cockpit$/);
  await expect.poll(() => page.evaluate("window.scrollY")).toBe(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/cockpit");
  await page.waitForLoadState("networkidle");

  await page.keyboard.press("/");
  // The top bar's field listens to "/"; the copy on the page is for phones only.
  const search = page
    .locator(".kp-topbar")
    .getByRole("searchbox", { name: "Konto, Mandant oder Ereignis suchen" });
  await expect(search).toBeFocused();
  await page.keyboard.type("telco");
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/cockpit\/suche\?q=telco/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Suche");
  await expect(search).toHaveValue("telco");

  await page.waitForLoadState("networkidle");
  await search.blur();
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await page.waitForURL(/\/cockpit\/paesse$/);
  const passes = page.locator("main");
  await expect(passes).toContainText("Aktive Pass-Mandanten");
  await expect(passes).toContainText("Offene Einladungen");
  await expect(passes).toContainText("Nie angemeldet");
  await expect(passes).toContainText("API-Aufrufe heute");
});
