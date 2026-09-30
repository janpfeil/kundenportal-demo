import { randomBytes } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { openSignedIn, signIn } from "./sign-in.js";
import {
  addToGroup,
  createTestUser,
  deleteUserIfExists,
  setPassword,
  type TestUser,
  userPoolId,
} from "./test-user.js";

/**
 * Phase 4 journey: demo pass from invitation to deletion, against the live portal.
 * A throw-away owner invites a throw-away address with a short test duration (3 minutes);
 * a fresh browser redeems the link (the ALTCHA puzzle is solved by the browser, there is
 * no bypass); the pass holder signs in, sees the pass status, quota, demo persons and the
 * tenant's demo password; the tenant's Anna is migrated inside the tenant; the cockpits
 * of owner and pass holder stay apart; after the test duration the tenant is deleted.
 *
 * Test passes suppress the Cognito mail, so the pass holder's password is set through the
 * admin API. Needs no LEGACY_DEMO_PASSWORD: the tenant's demo password is shown on the
 * pass page.
 */
const EVENTUALLY = { timeout: 90_000, intervals: [2_000, 3_000, 5_000] };
const TEST_MINUTES = 3;

let poolId: string;
let owner: TestUser;
const guest = `e2e-pass-${randomBytes(6).toString("hex")}@example.org`;
const guestPassword = `E2e-${randomBytes(12).toString("base64url")}!9a`;
let link = "";
let tenant = "";
let demoPassword = "";
let anna = "";

test.use({ locale: "de-DE" });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  poolId = await userPoolId();
  owner = await createTestUser(poolId);
  await addToGroup(poolId, owner.email, "owner");
});

test.afterAll(async ({ browser }) => {
  if (!owner) return;
  const page = await browser.newPage({ locale: "de-DE" });
  await revokeIfRunning(page).catch(() => undefined);
  await page.close();
  await owner.remove();
  // The teardown deletes the pass holder; this only covers a run that stopped early.
  await deleteUserIfExists(poolId, guest).catch(() => undefined);
});

async function openPasses(page: Page) {
  await openSignedIn(page, "/cockpit/paesse", owner.email, owner.password);
  await expect(page.getByTestId("invitation-form")).toBeVisible();
  // Wait for hydration: the form and the revoke buttons are client components.
  await page.waitForLoadState("networkidle");
}

function passRow(page: Page) {
  return page.getByTestId("passes").getByRole("row", { name: new RegExp(guest) });
}

async function revokeIfRunning(page: Page) {
  await openPasses(page);
  const revoke = passRow(page).getByTestId("revoke");
  if ((await revoke.count()) === 0) return;
  await revoke.getByRole("button", { name: "Widerrufen …" }).click();
  await revoke.getByRole("button", { name: "Ja, widerrufen" }).click();
  await expect(revoke.getByRole("status")).toContainText("Widerrufen");
}

async function freshPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "de-DE" });
  return context.newPage();
}

test("the owner creates an invitation and sees the link once", async ({ page }) => {
  await openPasses(page);
  const form = page.getByTestId("invitation-form");
  await form.getByLabel("E-Mail-Adresse der eingeladenen Person").fill(guest);
  await form.getByLabel(/Kurze Testlaufzeit/).fill(String(TEST_MINUTES));
  await form.getByRole("button", { name: "Einladung erstellen" }).click();
  const shown = page.getByTestId("invitation-link");
  await expect(shown).toContainText("/pass/einloesen#");
  link = (await shown.textContent())?.trim() ?? "";
  expect(link).toMatch(/^https:\/\/.+\/pass\/einloesen#[A-Za-z0-9_-]{16,}$/);
});

test("a visitor redeems the link after the browser solved the ALTCHA puzzle", async ({
  browser,
}) => {
  const page = await freshPage(browser);
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Demo-Pass einlösen");
  await expect(page.getByTestId("redeem-privacy")).toContainText("gelöscht");
  await page.waitForLoadState("networkidle");
  // The widget solves the puzzle by itself (auto on load) in the browser.
  await expect(page.getByTestId("redeem-form")).toHaveAttribute("data-verified", "true", {
    timeout: 60_000,
  });
  await page.getByTestId("redeem-submit").click();
  await expect(page.getByTestId("redeem-done")).toContainText("Ihre Instanz wird eingerichtet");
  // The used token is removed from the address bar.
  expect(new URL(page.url()).hash).toBe("");
  await page.context().close();
});

test("the pass holder signs in and sees status, quota, demo persons and password", async ({
  browser,
}) => {
  await setPassword(poolId, guest, guestPassword);
  const page = await freshPage(browser);
  await openSignedIn(page, "/pass", guest, guestPassword);
  await expect(async () => {
    await page.goto("/pass");
    await expect(page.getByTestId("pass-status")).toHaveAttribute("data-status", "active");
  }).toPass(EVENTUALLY);
  tenant = (await page.getByTestId("pass-tenant").textContent())?.trim() ?? "";
  expect(tenant).toMatch(/^p[a-z0-9]{7}$/);
  const quotas = page.getByTestId("pass-quotas");
  await expect(quotas.getByRole("meter", { name: "API-Aufrufe" })).toBeVisible();
  await expect(quotas).toContainText(/Kontingent: .* übrig · gültig bis/);
  const persons = page.getByTestId("demo-persons");
  await expect(persons).toContainText(`anna.becker+${tenant}@example.org`);
  anna = `anna.becker+${tenant}@example.org`;
  demoPassword = (await page.getByTestId("demo-password").textContent())?.trim() ?? "";
  expect(demoPassword.length).toBeGreaterThanOrEqual(8);
  await expect(page.getByTestId("pass-deletion")).toContainText("automatisch gelöscht");
  await page.context().close();
});

test("the tenant's Anna is taken over inside the tenant with her contracts", async ({
  browser,
}) => {
  const page = await freshPage(browser);
  await page.goto("/konto");
  await signIn(page, anna, demoPassword);
  await page.waitForURL(/\/konto$/);
  await expect(async () => {
    await page.goto("/konto");
    await expect(page.getByTestId("account")).toContainText(/Versorger-Altsystem/);
  }).toPass(EVENTUALLY);
  await expect(async () => {
    await page.goto("/vertraege");
    await expect(page.getByTestId("contracts")).toContainText("Strom");
    await expect(page.getByTestId("contracts")).toContainText("Gas");
  }).toPass(EVENTUALLY);
  await page.context().close();
});

test("owner and pass holder see only their own tenant in the cockpit", async ({
  page,
  browser,
}) => {
  // Pass holder: own tenant, no pass administration.
  const holder = await freshPage(browser);
  await openSignedIn(holder, "/cockpit", guest, guestPassword);
  await expect(holder.getByTestId("cockpit-tenant")).toHaveAttribute("data-tenant", tenant);
  await expect(holder.getByTestId("to-passes")).toHaveCount(0);
  await expect(async () => {
    await holder.goto("/cockpit");
    await expect(holder.getByTestId("timeline")).toContainText("lazy");
  }).toPass(EVENTUALLY);
  await holder.goto("/cockpit/paesse");
  await expect(holder.getByTestId("passes-forbidden")).toBeVisible();
  await holder.context().close();

  // Owner: the owner tenant, whose timeline carries nothing of the pass tenant.
  await openSignedIn(page, "/cockpit", owner.email, owner.password);
  await expect(page.getByTestId("progress")).toBeVisible();
  await expect(page.getByTestId("cockpit-tenant")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(tenant);
  await expect(page.locator("main")).not.toContainText(`+${tenant}@`);
});

test("after the test duration the tenant is deleted and the holder cannot sign in", async ({
  page,
  browser,
}) => {
  test.setTimeout(9 * 60_000);
  await openPasses(page);
  await expect(async () => {
    await page.goto("/cockpit/paesse");
    await expect(passRow(page).getByTestId("pass-status")).toHaveAttribute(
      "data-status",
      "deleted",
    );
  }).toPass({ timeout: 7 * 60_000, intervals: [10_000, 15_000, 20_000] });

  const holder = await freshPage(browser);
  await holder.goto("/konto");
  await signIn(holder, guest, guestPassword);
  await expect(
    holder.getByText(/incorrect|falsch|ungültig|existiert nicht|not exist/i).first(),
  ).toBeVisible();
  await holder.context().close();
});
