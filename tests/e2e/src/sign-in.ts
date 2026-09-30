import type { Page } from "@playwright/test";

/** Fills Cognito managed login; copes with one-step and two-step (username first) forms. */
export async function signIn(page: Page, email: string, password: string) {
  await page.waitForURL(/amazoncognito\.com/);
  await page.getByRole("textbox", { name: /e-?mail|username|benutzername/i }).fill(email);
  const passwordField = page.getByLabel(/^(password|passwort|kennwort)/i);
  if (!(await passwordField.isVisible())) {
    await page.getByRole("button", { name: /^(next|weiter)$/i }).click();
  }
  await passwordField.fill(password);
  await page.getByRole("button", { name: /^(sign in|anmelden|continue|weiter)$/i }).click();
}
