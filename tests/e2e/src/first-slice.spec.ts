import { expect, type Page, test } from "@playwright/test";
import { createTestUser, type TestUser, userPoolId } from "./test-user.js";

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUser(await userPoolId());
});

test.afterAll(async () => {
  await user?.remove();
});

/** Fills Cognito managed login; copes with one-step and two-step (username first) forms. */
async function signIn(page: Page, email: string, password: string) {
  await page.waitForURL(/amazoncognito\.com/);
  await page.getByRole("textbox", { name: /e-?mail|username|benutzername/i }).fill(email);
  const passwordField = page.getByLabel(/^(password|passwort|kennwort)/i);
  if (!(await passwordField.isVisible())) {
    await page.getByRole("button", { name: /^(next|weiter)$/i }).click();
  }
  await passwordField.fill(password);
  await page.getByRole("button", { name: /^(sign in|anmelden|continue|weiter)$/i }).click();
}

test("start page speaks German and English", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "accept-language": "de-DE" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("alles in einem Konto");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("all in one account");
});

test("first sign-in shows the account and a welcome message within seconds", async ({ page }) => {
  await page.goto("/konto");
  await signIn(page, user.email, user.password);

  await page.waitForURL(/\/konto$/);
  const account = page.getByTestId("account");
  await expect(account).toContainText(user.email);
  const signedInAt = Date.now();

  let welcomeAfterMs = -1;
  await expect(async () => {
    await page.goto("/postfach");
    await expect(page.getByTestId("mailbox")).toContainText(/Willkommen|Welcome/);
    welcomeAfterMs = Date.now() - signedInAt;
  }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 3_000] });

  test.info().annotations.push({ type: "welcome-after-ms", description: String(welcomeAfterMs) });
  console.log(`Welcome message visible ${welcomeAfterMs} ms after the account page`);

  await page.getByRole("link", { name: /Abmelden|Sign out/ }).click();
  await page.goto("/konto");
  await page.waitForURL(/amazoncognito\.com|\/auth\/login/);
});

test("the API rejects calls without a token", async ({ request }) => {
  const response = await request.get("/api/me");
  expect(response.status()).toBe(401);
});
