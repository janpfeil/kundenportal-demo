import { expect, type Page, test } from "@playwright/test";
import { openSignedIn, signIn } from "./sign-in.js";
import {
  addToGroup,
  completePasswordReset,
  createTestUser,
  deleteUserIfExists,
  type TestUser,
  userPoolId,
} from "./test-user.js";

/**
 * Phase 3 journeys against the live portal and the two legacy systems:
 * J2 (lazy migration: Anna with her utility password, Carla checked against the telco's
 * Keycloak), J7 (bulk import of the inactive telco accounts: Carla without password and
 * with a reset request, Helga as clarification case, Rainer into the DLQ and back by a
 * redrive with the missing postal code), J3 (Bernd links his telco account) and J8
 * (cockpit: Emil as clarification case, timeline). A throw-away owner resets the demo
 * before and after, so every run starts from the same state.
 *
 * Needs LEGACY_DEMO_PASSWORD (the demo persons' password in both legacy systems).
 */
const DEMO_PASSWORD = process.env.LEGACY_DEMO_PASSWORD ?? "";
const ANNA = "anna.becker@example.org";
const BERND = "bernd.yilmaz@example.org";
const CARLA = "carla.schulz@example.net";
const EVENTUALLY = { timeout: 60_000, intervals: [2_000, 3_000, 5_000] };

let poolId: string;
let owner: TestUser;

test.use({ locale: "de-DE" });
test.describe.configure({ mode: "serial" });
test.skip(!DEMO_PASSWORD, "LEGACY_DEMO_PASSWORD is not set");

test.beforeAll(async () => {
  poolId = await userPoolId();
  owner = await createTestUser(poolId);
  await addToGroup(poolId, owner.email, "owner");
});

test.afterAll(async ({ browser }) => {
  if (!owner) return;
  const page = await browser.newPage({ locale: "de-DE" });
  await resetDemo(page).catch(() => undefined);
  await page.close();
  await owner.remove();
});

async function openCockpit(page: Page) {
  await openSignedIn(page, "/cockpit/migration", owner.email, owner.password);
  await expect(page.getByTestId("progress")).toBeVisible();
  // Wait for hydration: the buttons are client components.
  await page.waitForLoadState("networkidle");
}

async function resetDemo(page: Page) {
  await openCockpit(page);
  const reset = page.getByTestId("demo-reset");
  await reset.getByRole("button", { name: "Demo zurücksetzen …" }).click();
  await reset.getByRole("button", { name: "Ja, zurücksetzen" }).click();
  // Removing the accounts takes a while, more so right after a deploy (cold functions);
  // a failure shows as an alert, never as this status.
  await expect(reset.getByRole("status")).toContainText("Zurückgesetzt", { timeout: 30_000 });
}

/** Signs a demo person in with the legacy password (first sign-in: lazy migration). */
async function signInLegacy(page: Page, email: string) {
  await page.goto("/konto");
  await signIn(page, email, DEMO_PASSWORD);
  await page.waitForURL(/\/konto$/);
}

async function expectAccountOrigin(page: Page, origin: RegExp) {
  await expect(async () => {
    await page.goto("/konto");
    await expect(page.getByTestId("account")).toContainText(origin);
  }).toPass(EVENTUALLY);
}

async function expectContracts(page: Page, divisions: string[]) {
  await expect(async () => {
    await page.goto("/vertraege");
    for (const division of divisions) {
      await expect(page.getByTestId("contracts")).toContainText(division);
    }
  }).toPass(EVENTUALLY);
}

test("the owner resets the demo", async ({ page }) => {
  await resetDemo(page);
});

test("J2: Anna signs in with her utility password and is taken over with her contracts", async ({
  page,
}) => {
  await deleteUserIfExists(poolId, ANNA);
  await signInLegacy(page, ANNA);
  await expectAccountOrigin(page, /Versorger-Altsystem/);
  await expect(page.getByTestId("account")).toContainText("Lindenweg 12, 04109 Leipzig");
  await expectContracts(page, ["Strom", "Gas"]);
  // The installment stays as the legacy system billed it.
  await expect(page.getByTestId("contracts")).toContainText(/87,00/);
});

test("J2: a telco sign-in is checked against the own Keycloak", async ({ page }) => {
  await deleteUserIfExists(poolId, CARLA);
  await signInLegacy(page, CARLA);
  await expectAccountOrigin(page, /Telko-Altsystem/);
  await expectContracts(page, ["Mobilfunk"]);
});

test("a wrong legacy password is rejected", async ({ page }) => {
  await page.goto("/konto");
  await signIn(page, BERND, `${DEMO_PASSWORD}-falsch`);
  await expect(page.getByText(/incorrect|falsch|ungültig/i).first()).toBeVisible();
});

test("the owner resets the demo again before the bulk import", async ({ page }) => {
  await resetDemo(page);
});

test("J7: the bulk import takes over inactive telco accounts, one record ends in the DLQ", async ({
  page,
}) => {
  await openCockpit(page);
  await page
    .getByTestId("bulk-start")
    .getByRole("button", { name: "Import Telko starten" })
    .click();
  await expect(page.getByTestId("bulk-start").getByRole("status")).toBeVisible();

  await expect(async () => {
    // The cockpit shows five clarification cases; "alle" lists every one.
    await page.goto("/cockpit/migration?klaerfaelle=alle");
    await expect(page.getByTestId("clarifications")).toContainText("T/88-4713");
    await expect(page.getByTestId("dead-letters")).toContainText("T/88-4714");
    await expect(page.getByTestId("runs")).toContainText("abgeschlossen");
  }).toPass(EVENTUALLY);
  const telco = page.getByTestId("progress").locator('[data-system="telco"]');
  await expect(telco).not.toHaveAttribute("data-done", "0");

  // Redrive with the missing postal code: the record leaves the DLQ and is taken over.
  await page.waitForLoadState("networkidle");
  // Only the first dead letter starts with its correction row open.
  const deadLetters = page.getByTestId("dead-letters");
  const row = deadLetters.getByRole("row", { name: /T\/88-4714/ });
  const postalCode = row.getByLabel("Postleitzahl (Korrektur)");
  if (!(await postalCode.isVisible())) {
    await deadLetters.getByRole("button", { name: /T\/88-4714 korrigieren/ }).click();
  }
  await postalCode.fill("04229");
  await row.getByRole("button", { name: "Erneut verarbeiten" }).click();
  // The page reloads after the redrive; the record leaves the DLQ and is taken over.
  await expect(async () => {
    await page.goto("/cockpit/migration");
    await expect(page.getByTestId("dead-letters")).not.toContainText("T/88-4714");
    await expect(page.getByTestId("timeline")).toContainText("telco:T/88-4714 bulk");
  }).toPass(EVENTUALLY);
});

test("J7: Carla finds the request to choose a new password in her mailbox", async ({ page }) => {
  // Carla has no real mailbox: completing "forgot password" is simulated.
  await completePasswordReset(poolId, CARLA, DEMO_PASSWORD);
  await openSignedIn(page, "/postfach", CARLA, DEMO_PASSWORD);
  await expect(async () => {
    await page.goto("/postfach");
    await expect(page.getByTestId("mailbox")).toContainText("Bitte neues Passwort vergeben");
  }).toPass(EVENTUALLY);
});

test("J3: Bernd is offered his telco account and links it with its password", async ({ page }) => {
  await deleteUserIfExists(poolId, BERND);
  await signInLegacy(page, BERND);
  await expect(async () => {
    await page.goto("/konto");
    await expect(page.getByTestId("link-offers")).toContainText("T/88-4711");
  }).toPass(EVENTUALLY);
  await page.waitForLoadState("networkidle");
  const offer = page.getByTestId("link-offer").filter({ hasText: "T/88-4711" });
  await offer.getByLabel("Passwort des anderen Kontos").fill(DEMO_PASSWORD);
  await offer.getByRole("button", { name: "Verknüpfen" }).click();
  // The page reloads after the link; the offer then shows as linked.
  await expect(page.getByTestId("link-offer").filter({ hasText: "T/88-4711" })).toHaveAttribute(
    "data-status",
    "linked",
    { timeout: 15_000 },
  );
  await expectContracts(page, ["Strom", "Internet", "Mobilfunk"]);
});

test("J8: the cockpit shows Emil as clarification case and the event timeline", async ({
  page,
}) => {
  await openCockpit(page);
  await page
    .getByTestId("bulk-start")
    .getByRole("button", { name: "Import Versorger starten" })
    .click();
  await expect(async () => {
    await page.goto("/cockpit/migration?klaerfaelle=alle");
    await expect(page.getByTestId("clarifications")).toContainText("V-1000125");
    await expect(page.getByTestId("timeline")).toContainText("AccountsLinked");
    await expect(page.getByTestId("timeline")).toContainText("BulkMigrationCompleted");
  }).toPass(EVENTUALLY);
});
