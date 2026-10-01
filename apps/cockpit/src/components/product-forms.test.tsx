// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { product } from "@/test-fixtures";
import { PriceVersionForm } from "./price-version-form";
import { ProductForm } from "./product-form";
import { ProductEditForm, ProductStatusMoves } from "./product-manage";

const sendJson = vi.fn();
const refresh = vi.fn();
const push = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({
  sendJson: (...args: unknown[]) => sendJson(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

beforeEach(() => {
  vi.clearAllMocks();
  sendJson.mockResolvedValue({ ok: true, status: 201, data: { version: 3 } });
});

const type = (label: string | RegExp, value: string, scope: HTMLElement = document.body) =>
  fireEvent.change(within(scope).getByLabelText(label), { target: { value } });

describe("product form", () => {
  it("shows the fields of the division and the problems per field", () => {
    render(
      <ProductForm texts={de.products} divisions={de.operator.divisions} today="2026-10-02" />,
    );
    const row = () => screen.getAllByTestId("option-row")[0] as HTMLElement;
    expect(within(row()).queryByLabelText(/Arbeitspreis/)).toBeNull();
    type("Sparte", "gas");
    expect(within(row()).getByLabelText("Arbeitspreis (ct/m³)")).toBeDefined();
    type(
      "Kennung",
      "Gas!",
      screen.getByTestId("product-form").querySelector(".cockpit-form-grid") as HTMLElement,
    );
    fireEvent.click(screen.getByRole("button", { name: "Produkt anlegen" }));
    expect(screen.getByTestId("product-form-problem")).toHaveTextContent("markierten Felder");
    expect(screen.getAllByLabelText("Kennung")[0]).toHaveAccessibleDescription(
      /Nur Kleinbuchstaben/,
    );
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Bitte ausfüllen.");
    expect(within(row()).getByLabelText("Bezeichnung")).toHaveAttribute("aria-invalid", "true");
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("adds and removes option rows, at most six", () => {
    render(
      <ProductForm texts={de.products} divisions={de.operator.divisions} today="2026-10-02" />,
    );
    const add = () => screen.getByRole("button", { name: "Option hinzufügen" });
    for (let i = 0; i < 5; i++) fireEvent.click(add());
    expect(screen.getAllByTestId("option-row")).toHaveLength(6);
    expect(screen.queryByRole("button", { name: "Option hinzufügen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Option 6 entfernen" }));
    expect(screen.getAllByTestId("option-row")).toHaveLength(5);
  });

  it("creates a mobile product in cents and MB and opens it", async () => {
    render(
      <ProductForm texts={de.products} divisions={de.operator.divisions} today="2026-10-02" />,
    );
    const head = screen
      .getByTestId("product-form")
      .querySelector(".cockpit-form-grid") as HTMLElement;
    type("Kennung", "mobil-max", head);
    type("Sparte", "mobile");
    type("Name", "Mobil Max");
    const row = screen.getAllByTestId("option-row")[0] as HTMLElement;
    type("Kennung", "50gb", row);
    type("Bezeichnung", "50 GB", row);
    type("Grund-/Monatspreis (€)", "34,99", row);
    type("Datenvolumen (GB)", "50", row);
    fireEvent.click(screen.getByRole("button", { name: "Produkt anlegen" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/produkte/mobil-max"));
    expect(sendJson).toHaveBeenCalledWith("POST", "/cockpit/api/products", {
      productId: "mobil-max",
      division: "mobile",
      name: "Mobil Max",
      description: "",
      minimumTermMonths: 12,
      noticePeriodMonths: 1,
      options: [{ optionId: "50gb", label: "50 GB", monthlyPriceCent: 3499, dataVolumeMb: 51200 }],
    });
  });

  it("says why the API refused", async () => {
    sendJson.mockResolvedValue({ ok: false, status: 409 });
    render(
      <ProductForm texts={de.products} divisions={de.operator.divisions} today="2026-10-02" />,
    );
    const head = screen
      .getByTestId("product-form")
      .querySelector(".cockpit-form-grid") as HTMLElement;
    type("Kennung", "wasser-basis", head);
    type("Sparte", "water");
    type("Name", "Wasser Basis");
    const row = screen.getAllByTestId("option-row")[0] as HTMLElement;
    type("Kennung", "standard", row);
    type("Bezeichnung", "Standard", row);
    type("Grund-/Monatspreis (€)", "8", row);
    type("Arbeitspreis (ct/m³)", "250", row);
    fireEvent.click(screen.getByRole("button", { name: "Produkt anlegen" }));
    expect(await screen.findByTestId("product-form-problem")).toHaveTextContent("Kennung vergeben");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("price version form", () => {
  it("is prefilled with the current prices and sends every option from today on", async () => {
    const strom = product();
    render(<PriceVersionForm product={strom} texts={de.products} today="2026-10-02" locale="de" />);
    const rows = screen.getAllByTestId("price-row");
    expect(within(rows[0] as HTMLElement).getByLabelText("Grund-/Monatspreis (€)")).toHaveValue(
      "12,00",
    );
    expect(within(rows[1] as HTMLElement).getByLabelText("Arbeitspreis (ct/kWh)")).toHaveValue(
      "34,5",
    );
    type("Gültig ab", "2026-09-01");
    fireEvent.click(screen.getByRole("button", { name: "Preisversion anlegen" }));
    expect(screen.getByLabelText("Gültig ab")).toHaveAccessibleDescription(/ab heute/);
    type("Gültig ab", "2026-11-01");
    type("Arbeitspreis (ct/kWh)", "35,9", rows[1] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Preisversion anlegen" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sendJson).toHaveBeenCalledWith("POST", "/cockpit/api/products/strom-klassik/versions", {
      validFrom: "2026-11-01",
      options: [
        { optionId: "standard", label: "Standard", monthlyPriceCent: 1200, workPriceCent: 32 },
        { optionId: "oeko", label: "Öko", monthlyPriceCent: 1200, workPriceCent: 35.9 },
      ],
    });
    expect(screen.getByTestId("price-version-feedback")).toHaveTextContent(
      "Preisversion 3 angelegt.",
    );
  });
});

describe("product management", () => {
  it("moves the status and asks before archiving", async () => {
    sendJson.mockResolvedValue({ ok: true, status: 200, data: {} });
    const { rerender } = render(
      <ProductStatusMoves
        productId="strom-klassik"
        moves={[{ action: "reactivate" }, { action: "archive" }]}
        texts={de.products}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Archivieren" }));
    expect(sendJson).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ja, archivieren" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(sendJson).toHaveBeenCalledWith("PATCH", "/cockpit/api/products/strom-klassik", {
      status: "archived",
    });
    rerender(
      <ProductStatusMoves
        productId="strom-klassik"
        moves={[{ action: "reactivate" }, { action: "archive", blocked: "contracts" }]}
        texts={de.products}
      />,
    );
    expect(screen.getByRole("button", { name: "Archivieren" })).toBeDisabled();
    expect(screen.getByTestId("product-status-moves")).toHaveTextContent("kein Vertrag mehr");
  });

  it("sends only what changed of texts and terms", async () => {
    sendJson.mockResolvedValue({ ok: true, status: 200, data: {} });
    render(
      <ProductEditForm
        product={{
          productId: "strom-klassik",
          name: "Strom Klassik",
          description: "Ökostrom",
          minimumTermMonths: 12,
          noticePeriodMonths: 1,
        }}
        texts={de.products}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(screen.getByTestId("product-edit")).toHaveTextContent("keine Änderung");
    type("Mindestlaufzeit (Monate)", "24");
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(sendJson).toHaveBeenCalled());
    expect(sendJson).toHaveBeenCalledWith("PATCH", "/cockpit/api/products/strom-klassik", {
      minimumTermMonths: 24,
    });
  });
});
