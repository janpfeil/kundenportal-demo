import { expect, type Page, test } from "@playwright/test";
import { openSignedIn, signIn } from "./sign-in.js";
import { createTestUser, type TestUser, userPoolId } from "./test-user.js";

/**
 * Phase 2 journeys against the live portal: the zones "Verträge & Rechnungen" (J6: change
 * the installment) and "Verbrauch" (J4: submit a meter reading), each confirmed by a
 * message in the demo mailbox. A fresh user per run gets demo contracts on registration.
 */
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
  }).toPass({ timeout: 45_000, intervals: [2_000, 3_000, 5_000] });
}

test("zones share the shell's session and show the demo contracts", async ({ page }) => {
  await page.goto("/konto");
  await signIn(page, user.email, user.password);
  await page.waitForURL(/\/konto$/);

  // The first visit to /konto registers the customer; the demo contracts follow by event.
  await expect(async () => {
    await page.goto("/vertraege");
    await expect(page.getByTestId("contracts")).toContainText(/Strom|Electricity/);
  }).toPass({ timeout: 45_000, intervals: [2_000, 3_000, 5_000] });
  await expect(page.locator("kp-bell")).toHaveCount(1);
});

test("the theme chosen in the user menu applies at once and in every zone", async ({ page }) => {
  await openSignedIn(page, "/konto", user.email, user.password);
  const html = page.locator("html");
  // Customer default: "Klar", colour mode from the system.
  await expect(html).toHaveAttribute("data-theme-preset", "klar");
  await expect(html).toHaveAttribute("data-color-mode", "system");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Benutzermenü/ }).click();
  await page.getByRole("menuitemradio", { name: "Vertrauen" }).click();
  await page.getByRole("menuitemradio", { name: "Dunkel" }).click();
  // Applied without a reload.
  await expect(html).toHaveAttribute("data-theme-preset", "vertrauen");
  await expect(html).toHaveAttribute("data-color-mode", "dark");
  await expect(page.getByRole("menuitemradio", { name: "Vertrauen" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  // Another zone renders the choice on the server from the shared cookies.
  await page.goto("/vertraege");
  await expect(
    page.locator('html[data-theme-preset="vertrauen"][data-color-mode="dark"]'),
  ).toHaveCount(1);
  // A prerendered shell page gets it from /theme-init.js before the first paint.
  await page.goto("/");
  await expect(
    page.locator('html[data-theme-preset="vertrauen"][data-color-mode="dark"]'),
  ).toHaveCount(1);
});

test("J6: changing the installment is confirmed in the mailbox", async ({ page }) => {
  // Every test has its own browser context, so it signs in again.
  await openSignedIn(page, "/vertraege", user.email, user.password);
  await page.getByTestId("contracts").getByRole("link").first().click();
  const form = page.getByTestId("contract-installment-form");
  await expect(form).toBeVisible();
  // Wait for hydration: before it, a click submits the form natively (a GET reload).
  await page.waitForLoadState("networkidle");
  const amount = form.getByRole("spinbutton").first();
  const current = Number((await amount.inputValue()).replace(",", "."));
  await amount.fill(String(Math.round(current) + 1));
  await form.getByRole("button").first().click();
  await expect(page.getByRole("status")).toBeVisible();
  await expectMailboxMessage(page, /Abschlag|installment|Vertrag|contract/i);
});

test("J4: a meter reading is stored and confirmed in the mailbox", async ({ page }) => {
  await openSignedIn(page, "/verbrauch", user.email, user.password);
  const form = page.getByTestId("reading-form").first();
  await expect(form).toBeVisible();
  await page.waitForLoadState("networkidle");
  const readings = page.getByTestId("readings").first();
  // The history streams in; wait until the latest value is there before computing a new one.
  // Right after a rebuild every function starts cold, so allow more than the default 5 s.
  await expect(readings).toHaveAttribute("data-latest-value", /\d/, { timeout: 30_000 });
  const latest = Number(await readings.getAttribute("data-latest-value"));
  await form
    .getByRole("spinbutton")
    .first()
    .fill(String(Math.floor(latest) + 150));
  await form.getByRole("button").first().click();
  await expect(form.getByRole("status")).toBeVisible();
  await expectMailboxMessage(page, /Zählerstand|meter reading/i);
});

/** Smallest valid PNG (1×1 pixel), enough for the upload path. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a meter photo goes straight to the upload bucket and is confirmed", async ({ page }) => {
  await openSignedIn(page, "/verbrauch", user.email, user.password);
  const form = page.getByTestId("meter-photo-upload").first();
  await expect(form).toBeVisible();
  await page.waitForLoadState("networkidle");
  const s3Put = page.waitForResponse(
    (response) => /\.s3[.-]/.test(response.url()) && response.request().method() === "PUT",
  );
  await form.locator('input[type="file"]').setInputFiles({
    name: "zaehler.png",
    mimeType: "image/png",
    buffer: PNG_1X1,
  });
  // Chromium exposes the file input as a button too, so name the submit button.
  await form.getByRole("button", { name: /hochladen|upload/i }).click();
  expect((await s3Put).status()).toBe(200);
  await expect(form.getByRole("status")).toContainText("zaehler.png");
  await expectMailboxMessage(page, /zaehler\.png|Dokument|document|Foto|photo/i);
});
