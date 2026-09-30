import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in.js";
import { createTestUser, type TestUser, userPoolId } from "./test-user.js";

let user: TestUser;

test.beforeAll(async () => {
  user = await createTestUser(await userPoolId());
});

test.afterAll(async () => {
  await user?.remove();
});

test.describe("with a German browser", () => {
  // The browser's own language setting; an extra Accept-Language header is overridden by Chromium.
  test.use({ locale: "de-DE" });

  test("start page speaks German and English", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("alles in einem Konto");
    // The deployed version stands in the header of every page.
    await expect(page.getByTestId("app-version")).toHaveText(/^v\d+\.\d+\.\d+ · [0-9a-f]{7}$/);
    await page.getByRole("link", { name: "English" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("all in one account");
  });
});

test("first sign-in shows the account and a welcome message within seconds", async ({
  page,
  baseURL,
}) => {
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
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/logout"));
  // Signed out means the portal's session cookie is gone (Cognito may keep its own session).
  const cookies = await page.context().cookies(baseURL);
  expect(cookies.map((cookie) => cookie.name)).not.toContain("kp_session");
});

test("the API rejects calls without a token", async ({ request }) => {
  const response = await request.get("/api/me");
  expect(response.status()).toBe(401);
});
