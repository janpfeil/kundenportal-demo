import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { openSignedIn } from "./sign-in.js";
import {
  addToGroup,
  createTestUser,
  deleteUserIfExists,
  type TestUser,
  userPoolId,
} from "./test-user.js";

/**
 * Recording of the 5-minute demo (docs/wiki/demo.md), only with DEMO_VIDEO=1 — run by
 * scripts/demo-video.py, which cuts the scenes out of the recordings and joins them with
 * the narration. Each scene lasts at least its target length: the narration's length from
 * tests/e2e/demo/durations.json if present, else the script's time window. Scene starts
 * and ends go to demo-output/scenes.json. Nothing is published; the output stays local.
 *
 * Needs AWS access (test users) and LEGACY_DEMO_PASSWORD (Anna's legacy password).
 */
const OUT = path.resolve(import.meta.dirname, "..", "..", "..", "demo-output");
const VIDEOS = path.join(OUT, "videos");
const SIZE = { width: 1920, height: 1080 };
const DEMO_PASSWORD = process.env.LEGACY_DEMO_PASSWORD ?? "";
const ANNA = "anna.becker@example.org";
const EVENTUALLY = { timeout: 90_000, intervals: [2_000, 3_000, 5_000] };
const REPORT = "https://janpfeil.github.io/kundenportal-demo/architektur.html";

/** Target length per scene in seconds (the script's time windows). */
const DEFAULT_SECONDS = [20, 25, 30, 50, 25, 25, 35, 60, 30];

function targets(): number[] {
  const file = path.resolve(import.meta.dirname, "..", "demo", "durations.json");
  if (!existsSync(file)) return DEFAULT_SECONDS;
  const seconds = JSON.parse(readFileSync(file, "utf8")) as number[];
  return DEFAULT_SECONDS.map((fallback, i) => seconds[i] ?? fallback);
}

interface SceneMark {
  scene: number;
  title: string;
  video: string;
  start: number;
  end: number;
}

const marks: SceneMark[] = [];
const seconds = targets();
let lena: TestUser;
let owner: TestUser;
let poolId: string;

test.use({ locale: "de-DE" });
test.describe.configure({ mode: "serial" });
test.skip(process.env.DEMO_VIDEO !== "1", "DEMO_VIDEO is not set");
test.skip(!DEMO_PASSWORD, "LEGACY_DEMO_PASSWORD is not set");

/** A visible mouse pointer (headless recordings show none) with a pulse on click. */
const POINTER = `
  window.addEventListener("DOMContentLoaded", () => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;" +
      "border-radius:50%;background:rgba(20,20,20,.35);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.4);" +
      "pointer-events:none;transition:transform .15s ease;left:-50px;top:-50px";
    document.body.appendChild(dot);
    document.addEventListener("mousemove", (e) => { dot.style.left = e.clientX + "px"; dot.style.top = e.clientY + "px"; }, true);
    document.addEventListener("mousedown", () => { dot.style.transform = "scale(.7)"; }, true);
    document.addEventListener("mouseup", () => { dot.style.transform = "scale(1)"; }, true);
  });`;

interface Recording {
  context: BrowserContext;
  page: Page;
  startedAt: number;
}

async function record(browser: Browser): Promise<Recording> {
  const context = await browser.newContext({
    locale: "de-DE",
    viewport: SIZE,
    colorScheme: "light",
    recordVideo: { dir: VIDEOS, size: SIZE },
  });
  await context.addInitScript(POINTER);
  const page = await context.newPage();
  return { context, page, startedAt: Date.now() };
}

/** Runs a scene and holds it until it reached its target length. */
async function scene(rec: Recording, index: number, title: string, act: () => Promise<void>) {
  const start = Date.now();
  await act();
  const rest = (seconds[index - 1] ?? 0) * 1000 - (Date.now() - start);
  if (rest > 0) await rec.page.waitForTimeout(rest);
  marks.push({
    scene: index,
    title,
    video: "",
    start: (start - rec.startedAt) / 1000,
    end: (Date.now() - rec.startedAt) / 1000,
  });
}

/** Closes the recording and notes its video file in the scenes it holds. */
async function finish(rec: Recording, scenes: number[]) {
  const video = rec.page.video();
  await rec.context.close();
  const file = video ? path.basename(await video.path()) : "";
  for (const mark of marks) if (scenes.includes(mark.scene)) mark.video = file;
}

async function typeSlowly(page: Page, selector: ReturnType<Page["locator"]>, text: string) {
  await selector.click();
  await selector.pressSequentially(text, { delay: 70 });
  await page.waitForTimeout(300);
}

async function glide(page: Page, distance: number, steps = 12) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, distance / steps);
    await page.waitForTimeout(120);
  }
}

async function slowSignIn(page: Page, email: string, password: string) {
  await page.waitForURL(/amazoncognito\.com/);
  await page.waitForTimeout(1200);
  await typeSlowly(
    page,
    page.getByRole("textbox", { name: /e-?mail|username|benutzername/i }),
    email,
  );
  const passwordField = page.locator('input[type="password"]').first();
  if (!(await passwordField.isVisible())) {
    await page.getByRole("button", { name: /^(next|weiter)$/i }).click();
  }
  await typeSlowly(page, passwordField, password);
  await page.getByRole("button", { name: /^(sign in|anmelden|continue|weiter)$/i }).click();
}

async function openCockpit(page: Page, pathname: string) {
  await openSignedIn(page, pathname, owner.email, owner.password);
  await page.waitForLoadState("networkidle");
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  mkdirSync(VIDEOS, { recursive: true });
  poolId = await userPoolId();
  lena = await createTestUser(poolId, { name: "Lena Wagner" });
  owner = await createTestUser(poolId, { name: "Petra Schulz" });
  await addToGroup(poolId, owner.email, "owner");
  await deleteUserIfExists(poolId, ANNA);

  // Unrecorded preparation: a clean migration demo with a finished bulk import, and Lena's
  // first sign-in, so her demo contracts and welcome note are there when the camera runs.
  const prep = await browser.newPage({ locale: "de-DE" });
  await openCockpit(prep, "/cockpit/migration");
  const reset = prep.getByTestId("demo-reset");
  await reset.getByRole("button", { name: "Demo zurücksetzen …" }).click();
  await reset.getByRole("button", { name: "Ja, zurücksetzen" }).click();
  await expect(reset.getByRole("status")).toContainText("Zurückgesetzt", { timeout: 60_000 });
  for (const system of ["Telko", "Versorger"]) {
    await prep.reload();
    await prep.waitForLoadState("networkidle");
    await prep
      .getByTestId("bulk-start")
      .getByRole("button", { name: `Import ${system} starten` })
      .click();
    await expect(async () => {
      await prep.reload();
      await expect(prep.getByTestId("runs")).toContainText(system);
      await expect(prep.getByTestId("runs")).not.toContainText("läuft");
    }).toPass(EVENTUALLY);
  }
  await prep.context().close();
  const first = await browser.newPage({ locale: "de-DE" });
  await openSignedIn(first, "/konto", lena.email, lena.password);
  await expect(async () => {
    await first.goto("/vertraege");
    await expect(first.getByTestId("contracts")).toContainText("Mobilfunk");
  }).toPass(EVENTUALLY);
  await first.context().close();
});

test.afterAll(async () => {
  if (marks.length > 0)
    writeFileSync(path.join(OUT, "scenes.json"), JSON.stringify(marks, null, 2));
  await lena?.remove();
  await owner?.remove();
});

test("records the customer's part (scenes 1–6)", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const rec = await record(browser);
  const { page } = rec;

  await scene(rec, 1, "Einstieg: das Portal", async () => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await glide(page, 900);
    await page.waitForTimeout(1500);
    await glide(page, -900);
    await page.getByRole("link", { name: "Anmelden" }).first().hover();
  });

  await scene(rec, 2, "Anmeldung", async () => {
    await page.getByRole("link", { name: "Anmelden" }).first().click();
    await slowSignIn(page, lena.email, lena.password);
    await page.waitForURL(/\/konto$/);
    await page.waitForLoadState("networkidle");
  });

  await scene(rec, 3, "Konto und Postfach", async () => {
    await page.waitForTimeout(2500);
    await page.getByTestId("account").scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
    await page.goto("/postfach");
    await expect(page.getByTestId("mailbox")).toContainText(/Willkommen/);
    await page
      .getByTestId("mailbox")
      .getByText(/Willkommen/)
      .first()
      .hover();
  });

  await scene(rec, 4, "Verträge und Bestellung", async () => {
    await page.goto("/vertraege");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2500);
    await page.getByTestId("contracts").getByRole("link", { name: /Strom/ }).first().click();
    const form = page.getByTestId("contract-installment-form");
    await expect(form).toBeVisible();
    await page.waitForLoadState("networkidle");
    const slider = form.getByRole("slider").first();
    await slider.focus();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(250);
    }
    await form.getByRole("button").first().click();
    await expect(page.getByRole("status").first()).toBeVisible();
    await page.waitForTimeout(2000);
    await page.goto("/vertraege/neu");
    await expect(page.getByTestId("product-catalogue")).toContainText("Wasser");
    await page.waitForTimeout(2000);
    await page.goto("/vertraege/neu/wasser-basis?option=standard");
    const order = page.getByTestId("order-form");
    await expect(order).toBeVisible();
    await page.waitForLoadState("networkidle");
    await typeSlowly(page, order.getByLabel("Zählernummer"), "WZ-4711-2026");
    await typeSlowly(page, order.getByLabel("Zählerstand zum Vertragsbeginn"), "184");
    await order.getByRole("checkbox").check();
    await page.waitForTimeout(800);
    await order.getByRole("button", { name: "Kostenpflichtig bestellen" }).click();
    await expect(page.getByTestId("order-confirmation")).toContainText("Widerruf bis");
  });

  await scene(rec, 5, "Verbrauch", async () => {
    await page.goto("/verbrauch");
    const form = page.getByTestId("reading-form").first();
    await expect(form).toBeVisible();
    await page.waitForLoadState("networkidle");
    const readings = page.getByTestId("readings").first();
    await expect(readings).toHaveAttribute("data-latest-value", /\d/, { timeout: 30_000 });
    const latest = Number(await readings.getAttribute("data-latest-value"));
    await typeSlowly(page, form.getByRole("spinbutton").first(), String(Math.floor(latest) + 150));
    await form.getByRole("button").first().click();
    await expect(form.getByRole("status")).toBeVisible();
    await page.waitForTimeout(1500);
    await glide(page, 600);
  });

  await scene(rec, 6, "Kündigung und Widerruf", async () => {
    await page.goto("/vertraege");
    await page
      .getByTestId("contracts")
      .getByRole("link", { name: /Wasser/ })
      .first()
      .click();
    const withdrawal = page.getByTestId("withdrawal-form");
    await expect(withdrawal).toBeVisible();
    await page.waitForLoadState("networkidle");
    await withdrawal.getByRole("button", { name: "Vertrag widerrufen …" }).click();
    await page.waitForTimeout(1200);
    await page.getByRole("button", { name: "Ja, widerrufen" }).click();
    await expect(page.getByText("Sie haben den Vertrag widerrufen").first()).toBeVisible();
    await page.waitForTimeout(2000);
    await page.goto("/vertraege");
    await page
      .getByTestId("contracts")
      .getByRole("link", { name: /Mobilfunk/ })
      .first()
      .click();
    const termination = page.getByTestId("termination-form");
    await expect(termination).toBeVisible();
    await page.waitForLoadState("networkidle");
    await termination.scrollIntoViewIfNeeded();
    await termination.getByRole("button", { name: "Kündigen …" }).click();
  });

  await finish(rec, [1, 2, 3, 4, 5, 6]);
});

test("records the legacy customer's part (scene 7)", async ({ browser }) => {
  test.setTimeout(5 * 60_000);
  const rec = await record(browser);
  const { page } = rec;
  await scene(rec, 7, "Altkunde: Übernahme beim Anmelden", async () => {
    await page.goto("/konto");
    await slowSignIn(page, ANNA, DEMO_PASSWORD);
    await page.waitForURL(/\/konto$/);
    await expect(async () => {
      await page.goto("/konto");
      await expect(page.getByTestId("account")).toContainText(/Versorger-Altsystem/);
    }).toPass(EVENTUALLY);
    await page.waitForTimeout(3000);
    await expect(async () => {
      await page.goto("/vertraege");
      await expect(page.getByTestId("contracts")).toContainText("Strom");
    }).toPass(EVENTUALLY);
  });
  await finish(rec, [7]);
});

test("records the operator's part and the close (scenes 8–9)", async ({ browser }) => {
  test.setTimeout(8 * 60_000);
  // Signed in before the camera runs: the operator's scene starts in the cockpit.
  const rec = await record(browser);
  const { page } = rec;
  await openCockpit(page, "/cockpit");
  await page.waitForTimeout(1500);

  await scene(rec, 8, "Betreiber-Cockpit", async () => {
    await page.waitForTimeout(3000);
    await page.goto("/cockpit/kunden");
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Sparte").selectOption({ label: "Strom" });
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "Anwenden" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2500);
    await page.goto("/cockpit/kunden?q=anna");
    await page.getByTestId("customer-table").getByRole("link", { name: /Anna/ }).first().click();
    await page.getByTestId("customer-contracts").getByRole("link").first().click();
    const actions = page.getByTestId("contract-actions");
    await expect(actions).toBeVisible();
    await page.waitForLoadState("networkidle");
    await actions.getByTestId("action-type").selectOption("setInstallment");
    await typeSlowly(page, actions.getByLabel("Neuer Abschlag"), "95");
    await typeSlowly(page, actions.getByLabel("Begründung"), "Abschlag an den Verbrauch angepasst");
    await actions.getByRole("button", { name: "Abschlag festsetzen" }).click();
    await page.waitForTimeout(2000);
    await page.goto("/cockpit/produkte/neu");
    const form = page.getByTestId("product-form");
    await expect(form).toBeVisible();
    await page.waitForLoadState("networkidle");
    const id = `strom-natur-${Date.now().toString(36)}`;
    await form.getByLabel("Kennung").first().fill(id);
    await form.getByLabel("Sparte").selectOption("electricity");
    await typeSlowly(page, form.getByLabel("Name", { exact: true }), "Strom Natur");
    await form.getByLabel("Beschreibung").fill("Ökostrom aus der Region");
    await form.getByLabel("Mindestlaufzeit (Monate)").fill("12");
    await form.getByLabel("Kündigungsfrist (Monate)").fill("1");
    const option = form.getByTestId("option-row").first();
    await option.getByLabel("Kennung").fill("standard");
    await option.getByLabel("Bezeichnung").fill("Standard");
    await option.getByLabel("Grund-/Monatspreis (€)").fill("11");
    await form.getByRole("button", { name: "Produkt anlegen" }).click();
    await expect(page.getByTestId("product-detail")).toHaveAttribute("data-product", id);
    await page.waitForLoadState("networkidle");
    await page
      .getByTestId("product-status-moves")
      .getByRole("button", { name: "Freigeben" })
      .click();
    await page.waitForTimeout(1500);
    await page.goto("/cockpit/migration?klaerfaelle=alle");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.getByTestId("timeline").scrollIntoViewIfNeeded();
  });

  await scene(rec, 9, "Demo-Pass, Themes, Architektur", async () => {
    await page.goto("/konto");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /^Benutzermenü/ }).click();
    await page.waitForTimeout(800);
    await page.getByRole("menuitemradio", { name: "Vertrauen" }).click();
    await page.waitForTimeout(600);
    await page.getByRole("menuitemradio", { name: "Dunkel" }).click();
    await page.waitForTimeout(2500);
    await page.keyboard.press("Escape");
    await page.goto("/pass/einloesen");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3500);
    await page.goto(REPORT);
    await page.locator('h2[id="7a-stacks-und-lebensdauer-deployment"]').scrollIntoViewIfNeeded();
    await glide(page, 500);
  });

  await finish(rec, [8, 9]);
});
