// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import type { Product } from "@/lib/products";
import { OrderForm } from "./order-form";
import { ProductCatalogue } from "./product-catalogue";

const sendJson = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({
  sendJson: (...args: unknown[]) => sendJson(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, ...rest }: { href: string }) => <a href={`/vertraege${href}`} {...rest} />,
}));

const plain = (text: string | null | undefined) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");
const TODAY = "2026-10-02";

const electricity: Product = {
  productId: "strom-oeko",
  division: "electricity",
  name: "Öko-Strom",
  description: "Ökostrom aus der Region",
  status: "active",
  unit: "kWh",
  minimumTermMonths: 12,
  noticePeriodMonths: 1,
  version: 1,
  options: [
    { optionId: "standard", label: "Standard", monthlyPriceCent: 1200, workPriceCent: 32.4 },
    { optionId: "plus", label: "Plus", monthlyPriceCent: 1500, workPriceCent: 30.9 },
  ],
  updatedAt: "2026-10-01T08:00:00.000Z",
};
const mobile: Product = {
  ...electricity,
  productId: "mobil-flex",
  division: "mobile",
  name: "Mobil Flex",
  minimumTermMonths: 0,
  options: [
    { optionId: "10gb", label: "10 GB", monthlyPriceCent: 999, dataVolumeMb: 10240 },
    { optionId: "20gb", label: "20 GB", monthlyPriceCent: 1499, dataVolumeMb: 20480 },
  ],
};
const internet: Product = {
  ...mobile,
  productId: "glasfaser",
  division: "internet",
  name: "Glasfaser",
  options: [{ optionId: "250", label: "250 Mbit/s", monthlyPriceCent: 3999, bandwidthMbit: 250 }],
};

beforeEach(() => vi.clearAllMocks());

describe("ProductCatalogue", () => {
  it("groups the products by division with headings in the fixed order", () => {
    render(<ProductCatalogue products={[mobile, internet, electricity]} locale="de" t={de} />);
    const catalogue = screen.getByTestId("product-catalogue");
    expect(
      within(catalogue)
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual(["Strom", "Internet", "Mobilfunk"]);
    const strom = screen.getByRole("region", { name: "Strom" });
    const product = within(strom).getByRole("article", { name: "Öko-Strom" });
    expect(product).toHaveTextContent("Ökostrom aus der Region");
    expect(product).toHaveTextContent("Mindestlaufzeit12 Monate");
    expect(product).toHaveTextContent("Kündigungsfrist1 Monat");
    expect(plain(product.textContent)).toContain("12,00 € Grundpreis / Monat");
    expect(product).toHaveTextContent("Arbeitspreis 32,4 ct/kWh");
    expect(
      within(product).getByRole("link", { name: "Auswählen: Öko-Strom, Option Plus" }),
    ).toHaveAttribute("href", "/vertraege/neu/strom-oeko?option=plus");
    const mobil = screen.getByRole("article", { name: "Mobil Flex" });
    expect(mobil).toHaveTextContent("Mindestlaufzeitkeine");
    expect(plain(mobil.textContent)).toContain("Datenvolumen 20 GB");
    expect(screen.getByRole("article", { name: "Glasfaser" })).toHaveTextContent(
      "Bandbreite 250 Mbit/s",
    );
  });
});

function renderOrder(product: Product = electricity, initialOption = "standard") {
  render(
    <OrderForm
      product={product}
      initialOption={initialOption}
      today={TODAY}
      locale="de"
      t={de}
      loginHref="/auth/login"
    />,
  );
  const form = screen.getByTestId("order-form");
  return {
    form,
    submit: () =>
      fireEvent.click(within(form).getByRole("button", { name: "Kostenpflichtig bestellen" })),
  };
}

describe("OrderForm", () => {
  it("preselects the option, starts today and asks for the meter of a metered product", () => {
    const { form } = renderOrder(electricity, "plus");
    expect(within(form).getByRole("radio", { name: /Plus/ })).toBeChecked();
    const start = within(form).getByLabelText("Vertragsbeginn");
    expect(start).toHaveValue(TODAY);
    expect(start).toHaveAttribute("min", TODAY);
    expect(start).toHaveAttribute("max", "2026-12-31");
    expect(start).toHaveAccessibleDescription("Zwischen 02.10.2026 und 31.12.2026");
    expect(within(form).getByLabelText("Zählernummer")).toBeRequired();
    const reading = within(form).getByRole("spinbutton", {
      name: "Zählerstand zum Vertragsbeginn",
    });
    expect(reading).toHaveAccessibleDescription(/kWh/);
    // The summary follows the chosen option.
    const summary = screen.getByRole("region", { name: "Ihre Bestellung" });
    expect(summary).toHaveTextContent("OptionPlus");
    fireEvent.click(within(form).getByRole("radio", { name: /Standard/ }));
    expect(summary).toHaveTextContent("Arbeitspreis32,4 ct/kWh");
    expect(summary).toHaveTextContent("Mindestlaufzeit 12 Monate, Kündigungsfrist 1 Monat");
  });

  it("shows every problem at its field and sends nothing", () => {
    const { form, submit } = renderOrder();
    fireEvent.change(within(form).getByLabelText("Vertragsbeginn"), {
      target: { value: "2027-02-01" },
    });
    fireEvent.change(within(form).getByLabelText("Zählernummer"), { target: { value: "12" } });
    submit();
    expect(within(form).getByLabelText("Vertragsbeginn")).toHaveAccessibleDescription(
      /Der Vertragsbeginn muss zwischen 02\.10\.2026 und 31\.12\.2026 liegen/,
    );
    expect(within(form).getByLabelText("Zählernummer")).toBeInvalid();
    expect(within(form).getByLabelText("Vertragsbeginn")).toHaveFocus();
    expect(
      within(form).getByRole("spinbutton", { name: "Zählerstand zum Vertragsbeginn" }),
    ).toHaveAccessibleDescription(/Bitte geben Sie den Zählerstand an/);
    const consent = within(form).getByRole("checkbox", { name: /kostenpflichtig/ });
    expect(consent).toBeInvalid();
    expect(consent).toHaveAccessibleDescription(
      "Bitte bestätigen Sie die kostenpflichtige Bestellung.",
    );
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("orders a metered product and confirms with a link to the new contract", async () => {
    sendJson.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        contractId: "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
        tariffName: "Öko-Strom",
        tariffOption: "standard",
        startDate: "2026-11-01",
        withdrawableUntil: "2026-10-16",
      },
    });
    const { form, submit } = renderOrder();
    fireEvent.change(within(form).getByLabelText("Vertragsbeginn"), {
      target: { value: "2026-11-01" },
    });
    fireEvent.change(within(form).getByLabelText("Zählernummer"), {
      target: { value: "1EMH0012345678" },
    });
    fireEvent.change(within(form).getByRole("spinbutton"), { target: { value: "4711.5" } });
    fireEvent.click(within(form).getByRole("checkbox"));
    submit();
    const done = await screen.findByTestId("order-confirmation");
    expect(sendJson).toHaveBeenCalledWith("POST", "/vertraege/api/contracts", {
      productId: "strom-oeko",
      optionId: "standard",
      startDate: "2026-11-01",
      meterNumber: "1EMH0012345678",
      startReading: 4711.5,
      consent: true,
    });
    expect(done).toHaveAttribute("role", "status");
    expect(done).toHaveTextContent("Öko-Strom (Standard) beginnt am 01.11.2026.");
    expect(done).toHaveTextContent("Widerruf bis 16.10.2026 möglich.");
    expect(within(done).getByRole("link", { name: "Zum neuen Vertrag" })).toHaveAttribute(
      "href",
      "/vertraege/6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11",
    );
    expect(screen.queryByTestId("order-form")).not.toBeInTheDocument();
  });

  it("orders mobile without meter fields", async () => {
    sendJson.mockResolvedValue({
      ok: false,
      status: 404,
      data: { title: "Not Found", status: 404 },
    });
    const { form, submit } = renderOrder(mobile, "20gb");
    expect(within(form).queryByLabelText("Zählernummer")).not.toBeInTheDocument();
    expect(within(form).queryByRole("spinbutton")).not.toBeInTheDocument();
    fireEvent.click(within(form).getByRole("checkbox"));
    submit();
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Dieser Tarif oder diese Option ist nicht mehr bestellbar.",
    );
    expect(sendJson).toHaveBeenCalledWith("POST", "/vertraege/api/contracts", {
      productId: "mobil-flex",
      optionId: "20gb",
      startDate: TODAY,
      consent: true,
    });
  });

  it("offers to sign in again when the session expired", async () => {
    sendJson.mockResolvedValue({ ok: false, status: 401 });
    const { form, submit } = renderOrder(internet, "250");
    fireEvent.click(within(form).getByRole("checkbox"));
    submit();
    expect(await within(form).findByRole("link", { name: "Erneut anmelden" })).toHaveAttribute(
      "href",
      "/auth/login",
    );
  });
});
