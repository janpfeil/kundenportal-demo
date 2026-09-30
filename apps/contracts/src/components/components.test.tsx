// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { ContractForm } from "./contract-form";
import { UploadForm } from "./upload-form";

const sendJson = vi.fn();
const refresh = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({
  sendJson: (...args: unknown[]) => sendJson(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const CONTRACT_ID = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";
const contract = {
  contractId: CONTRACT_ID,
  tariffOption: "standard",
  tariffOptions: ["standard", "oeko"],
  monthlyInstallmentCent: 8500,
  installmentAdjustable: true,
  installmentMinCent: 6000,
  installmentMaxCent: 12000,
};
const plain = (text: string | null) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

function renderContractForm(overrides: Partial<typeof contract> = {}) {
  render(
    <ContractForm
      contract={{ ...contract, ...overrides }}
      locale="de"
      texts={de.form}
      optionLabels={de.options}
      amountLabel={de.detail.installment}
      loginHref="/auth/login?returnTo=%2Fvertraege"
    />,
  );
  const form = screen.getByTestId("contract-installment-form");
  return {
    form,
    installment: within(form).queryAllByRole("spinbutton")[0] as HTMLElement,
    submit: within(form).getAllByRole("button")[0] as HTMLElement,
  };
}

describe("ContractForm (J6)", () => {
  it("offers the installment first, in euros with its range, and the tariff options", () => {
    const { installment } = renderContractForm();
    expect(installment).toHaveAccessibleName("Neuer monatlicher Abschlag");
    expect(installment).toHaveValue(85);
    expect(installment).toHaveAccessibleDescription(/ganze Euro/);
    expect(plain(screen.getByText(/ganze Euro/).textContent)).toBe(
      "Zwischen 60,00 € und 120,00 €, ganze Euro",
    );
    expect(screen.getByRole("combobox", { name: "Tarifoption" })).toHaveValue("standard");
  });

  it("validates the amount before sending", async () => {
    const { installment, submit } = renderContractForm();
    fireEvent.change(installment, { target: { value: "130" } });
    fireEvent.click(submit);
    expect(installment).toBeInvalid();
    expect(plain(installment.closest(".kp-field")?.textContent ?? "")).toContain(
      "Der Abschlag muss zwischen 60,00 € und 120,00 € liegen.",
    );
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("says so when nothing changed", async () => {
    const { submit } = renderContractForm();
    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent("Sie haben nichts geändert.");
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("sends only the changes in cents through the zone's route and confirms", async () => {
    sendJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: { ...contract, monthlyInstallmentCent: 9000, tariffOption: "oeko" },
    });
    const { installment, submit } = renderContractForm();
    fireEvent.change(installment, { target: { value: "90" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "oeko" } });
    fireEvent.click(submit);
    const status = await screen.findByRole("status");
    expect(plain(status.textContent)).toContain("Tarifoption Öko, Monatlicher Abschlag 90,00 €");
    expect(sendJson).toHaveBeenCalledWith("PATCH", `/vertraege/api/contracts/${CONTRACT_ID}`, {
      monthlyInstallmentCent: 9000,
      tariffOption: "oeko",
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the API's range error and a sign-in link for an expired session", async () => {
    sendJson.mockResolvedValueOnce({
      ok: false,
      status: 422,
      data: {
        title: "Unprocessable",
        status: 422,
        detail: "The installment must be between 60.00 and 120.00 EUR",
      },
    });
    const { installment, submit } = renderContractForm();
    fireEvent.change(installment, { target: { value: "100" } });
    fireEvent.click(submit);
    expect(plain((await screen.findByRole("alert")).textContent)).toContain(
      "zwischen 60,00 € und 120,00 €",
    );

    sendJson.mockResolvedValueOnce({ ok: false, status: 401 });
    fireEvent.click(submit);
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Erneut anmelden" })).toHaveAttribute(
        "href",
        "/auth/login?returnTo=%2Fvertraege",
      ),
    );
  });

  it("offers only the tariff option for contracts with a fixed price", () => {
    renderContractForm({
      installmentAdjustable: false,
      tariffOptions: ["10gb", "20gb"],
      tariffOption: "10gb",
    });
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "20 GB" })).toBeInTheDocument();
  });
});

describe("UploadForm", () => {
  const ticket = {
    documentId: "d-1",
    uploadUrl: "https://bucket.s3.eu-central-1.amazonaws.com/uploads/t/c/d-1?X-Amz-Signature=x",
    method: "PUT",
    headers: { "content-type": "application/pdf" },
    expiresAt: "2026-09-30T12:05:00.000Z",
  };

  function renderUpload() {
    render(
      <UploadForm
        texts={de.upload}
        endpoint="/vertraege/api/documents/upload-url"
        loginHref="/auth/login"
        categories={[
          { value: "other", label: "Sonstiges" },
          { value: "meter-photo", label: "Zählerfoto" },
        ]}
        data-testid="document-upload"
      />,
    );
    return {
      input: screen.getByLabelText("Datei") as HTMLInputElement,
      submit: screen.getByRole("button", { name: "Hochladen" }),
    };
  }

  const choose = (input: HTMLInputElement, file: File) =>
    fireEvent.change(input, { target: { files: [file] } });

  it("asks for a file of an allowed type", () => {
    const { input, submit } = renderUpload();
    fireEvent.click(submit);
    expect(input).toHaveAccessibleDescription(/Bitte wählen Sie eine Datei aus/);
    choose(input, new File(["gif"], "a.gif", { type: "image/gif" }));
    fireEvent.click(submit);
    expect(input).toBeInvalid();
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("announces the file, then PUTs it to S3 with exactly the returned headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    sendJson.mockResolvedValue({ ok: true, status: 201, data: ticket });
    const { input, submit } = renderUpload();
    const file = new File(["%PDF-1.7"], "rechnung.pdf", { type: "application/pdf" });
    choose(input, file);
    fireEvent.click(submit);

    expect(await screen.findByRole("status")).toHaveTextContent(
      "„rechnung.pdf“ wurde hochgeladen.",
    );
    expect(sendJson).toHaveBeenCalledWith("POST", "/vertraege/api/documents/upload-url", {
      fileName: "rechnung.pdf",
      contentType: "application/pdf",
      sizeBytes: file.size,
      category: "other",
    });
    expect(fetchMock).toHaveBeenCalledWith(ticket.uploadUrl, {
      method: "PUT",
      headers: ticket.headers,
      body: file,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it("reports a failed upload as an alert", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    sendJson.mockResolvedValue({ ok: true, status: 201, data: ticket });
    const { input, submit } = renderUpload();
    choose(input, new File(["x"], "a.pdf", { type: "application/pdf" }));
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(de.upload.errorGeneric);
  });

  it("explains a 409 while the account is being set up", async () => {
    sendJson.mockResolvedValue({
      ok: false,
      status: 409,
      data: { title: "Conflict", status: 409 },
    });
    const { input, submit } = renderUpload();
    choose(input, new File(["x"], "a.png", { type: "image/png" }));
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(de.upload.errorSetup);
  });
});
