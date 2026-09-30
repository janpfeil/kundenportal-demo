import type { Page } from "@playwright/test";

/** Fills Cognito managed login; copes with one-step and two-step (username first) forms. */
export async function signIn(page: Page, email: string, password: string) {
  await page.waitForURL(/amazoncognito\.com/);
  await page.getByRole("textbox", { name: /e-?mail|username|benutzername/i }).fill(email);
  // The German page also labels a "Passwort anzeigen" checkbox, so target the field itself.
  const passwordField = page.locator('input[type="password"]').first();
  if (!(await passwordField.isVisible())) {
    await page.getByRole("button", { name: /^(next|weiter)$/i }).click();
  }
  await passwordField.fill(password);
  await page.getByRole("button", { name: /^(sign in|anmelden|continue|weiter)$/i }).click();
}

/** Opens a portal path and signs in first if the portal sends the browser to Cognito. */
export async function openSignedIn(page: Page, path: string, email: string, password: string) {
  await page.goto(path);
  if (/amazoncognito\.com/.test(page.url())) {
    await signIn(page, email, password);
    await page.waitForURL((url) => url.pathname.startsWith(path));
  }
}
