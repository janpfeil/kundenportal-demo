import { expect, type Page, test } from "@playwright/test";
import { openSignedIn } from "./sign-in.js";
import { createTestUser, type TestUser, userPoolId } from "./test-user.js";

/**
 * Phase 7 against the live portal, customer side: J10 (order a product from the catalogue,
 * confirmed in the mailbox, then withdraw it) and J11 (give notice to the earliest date and
 * take it back). A fresh user per run; its contracts stay out of the operator's lists.
 */
const EVENTUALLY = { timeout: 45_000, intervals: [2_000, 3_000, 5_000] };

let user: TestUser;

test.use({ locale: "de-DE" });
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  user = await createTestUser(await userPoolId());
});

test.afterAll(async () => {
  await user?.remove();
});

async function expectMailboxMessage(page: Page, text: RegExp) {
  await expect(async () => {
    await page.goto("/postfach");
    await expect(page.getByTestId("mailbox")).toContainText(text);
  }).toPass(EVENTUALLY);
}

test("J10: a customer orders internet from the catalogue and withdraws it", async ({ page }) => {
  await openSignedIn(page, "/konto", user.email, user.password);
  // The demo contracts (and the identity link an order needs) follow the registration.
  await expect(async () => {
    await page.goto("/vertraege");
    await expect(page.getByTestId("contracts")).toContainText("Strom");
  }).toPass(EVENTUALLY);

  await page.goto("/vertraege/neu");
  const catalogue = page.getByTestId("product-catalogue");
  await expect(catalogue).toContainText("Internet");
  await page.goto("/vertraege/neu/internet-zuhause?option=250");
  const order = page.getByTestId("order-form");
  await expect(order).toBeVisible();
  await page.waitForLoadState("networkidle");
  await order.getByRole("checkbox").check();
  await order.getByRole("button", { name: "Kostenpflichtig bestellen" }).click();
  const confirmation = page.getByTestId("order-confirmation");
  await expect(confirmation).toContainText("Widerruf bis");
  await expectMailboxMessage(page, /Vertrag abgeschlossen/);

  // Withdrawal within 14 days ends it at once and is confirmed as well.
  await page.goto("/vertraege");
  await page
    .getByTestId("contracts")
    .getByRole("link", { name: /Internet/ })
    .first()
    .click();
  const withdrawal = page.getByTestId("withdrawal-form");
  await expect(withdrawal).toBeVisible();
  await page.waitForLoadState("networkidle");
  await withdrawal.getByRole("button", { name: "Vertrag widerrufen …" }).click();
  await page.getByRole("button", { name: "Ja, widerrufen" }).click();
  await expect(page.getByText("Sie haben den Vertrag widerrufen").first()).toBeVisible();
  await expectMailboxMessage(page, /Widerruf bestätigt/);
  await page.goto("/vertraege");
  await expect(page.getByTestId("contracts")).toContainText("widerrufen");
});

test("J11: a customer gives notice to the earliest date and takes it back", async ({ page }) => {
  await openSignedIn(page, "/vertraege", user.email, user.password);
  await page.getByTestId("contracts").getByRole("link", { name: /Gas/ }).first().click();
  await page.waitForURL(/\/vertraege\/[0-9a-f-]{36}$/);
  const contractUrl = page.url();
  const termination = page.getByTestId("termination-form");
  await expect(termination).toBeVisible();
  await page.waitForLoadState("networkidle");
  await termination.getByRole("button", { name: "Kündigen …" }).click();
  await page.getByRole("button", { name: "Ja, kündigen" }).click();
  const status = page.getByTestId("termination-status");
  await expect(status).toContainText("Gekündigt zum");
  await expectMailboxMessage(page, /Kündigung bestätigt/);

  await page.goto(contractUrl);
  await page.waitForLoadState("networkidle");
  await page
    .getByTestId("termination-status")
    .getByRole("button", { name: "Kündigung zurücknehmen" })
    .click();
  await expect(page.getByText("Die Kündigung ist zurückgenommen")).toBeVisible();
  await expectMailboxMessage(page, /Kündigung zurückgenommen/);
});
