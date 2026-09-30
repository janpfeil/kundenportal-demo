// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { de } from "@/i18n/de";
import { ReadingForm } from "./reading-form";
import { UploadForm } from "./upload-form";

const sendJson = vi.fn();
const refresh = vi.fn();
vi.mock("@kundenportal/web-auth/browser", () => ({
  sendJson: (...args: unknown[]) => sendJson(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const CONTRACT_ID = "6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11";
const plain = (text: string | null) => (text ?? "").replace(/[\u00a0\u202f]/g, " ");

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

function renderForm(latest?: { value: number; readAt: string }) {
  render(
    <ReadingForm
      contractId={CONTRACT_ID}
      unit="kWh"
      latest={latest}
      today="2026-09-30"
      locale="de"
      texts={de.reading}
      loginHref="/auth/login?returnTo=%2Fverbrauch"
    />,
  );
  const form = screen.getByTestId("reading-form");
  return {
    value: within(form).getAllByRole("spinbutton")[0] as HTMLElement,
    date: within(form).getByLabelText("Ablesedatum"),
    submit: within(form).getAllByRole("button")[0] as HTMLElement,
  };
}

describe("ReadingForm (J4)", () => {
  it("has the value first, the date defaulting to today and the latest reading as hint", () => {
    const { value, date } = renderForm({ value: 2000, readAt: "2026-06-01" });
    expect(value).toHaveAccessibleName("Zählerstand");
    expect(value).toHaveAccessibleDescription(/Letzter Stand: 2\.000 kWh am 01\.06\.2026/);
    expect(date).toHaveValue("2026-09-30");
    expect(date).toHaveAttribute("max", "2026-09-30");
  });

  it("checks plausibility before sending", () => {
    const { value, submit } = renderForm({ value: 2000, readAt: "2026-06-01" });
    fireEvent.change(value, { target: { value: "1500" } });
    fireEvent.click(submit);
    expect(value).toBeInvalid();
    expect(value).toHaveAccessibleDescription(/nicht unter dem letzten Stand von 2\.000 kWh/);
    expect(sendJson).not.toHaveBeenCalled();
  });

  it("sends the reading through the zone's route and confirms with a hint to the mailbox", async () => {
    sendJson.mockResolvedValue({
      ok: true,
      status: 201,
      data: {
        readingId: "r-1",
        value: 2100,
        unit: "kWh",
        readAt: "2026-09-30",
        source: "customer",
        submittedAt: "2026-09-30T10:00:00Z",
      },
    });
    const { value, submit } = renderForm({ value: 2000, readAt: "2026-06-01" });
    fireEvent.change(value, { target: { value: "2100" } });
    fireEvent.click(submit);
    const status = await screen.findByRole("status");
    expect(plain(status.textContent)).toBe(
      "Zählerstand 2.100 kWh gespeichert. Die Bestätigung folgt im Postfach.",
    );
    expect(sendJson).toHaveBeenCalledWith(
      "POST",
      `/verbrauch/api/contracts/${CONTRACT_ID}/readings`,
      { value: 2100, readAt: "2026-09-30" },
    );
    expect(refresh).toHaveBeenCalled();
    expect(value).toHaveValue(null);
  });

  it("explains a 422 from the API in the user's language", async () => {
    sendJson.mockResolvedValue({
      ok: false,
      status: 422,
      data: {
        title: "Unprocessable Content",
        status: 422,
        detail: "The date is before the latest reading of 2026-09-15",
      },
    });
    const { value, submit } = renderForm();
    fireEvent.change(value, { target: { value: "10" } });
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Das Ablesedatum darf nicht vor der letzten Ablesung am 15.09.2026 liegen.",
    );
  });

  it("offers a new sign-in when the session has expired", async () => {
    sendJson.mockResolvedValue({ ok: false, status: 401 });
    const { value, submit } = renderForm();
    fireEvent.change(value, { target: { value: "10" } });
    fireEvent.click(submit);
    expect(await screen.findByRole("link", { name: "Erneut anmelden" })).toHaveAttribute(
      "href",
      "/auth/login?returnTo=%2Fverbrauch",
    );
  });
});

describe("meter photo upload", () => {
  it("uploads an image as meter-photo and accepts images only", async () => {
    const ticket = {
      documentId: "d",
      uploadUrl: "https://b.s3.eu-central-1.amazonaws.com/uploads/x",
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      expiresAt: "2026-09-30T12:05:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    sendJson.mockResolvedValue({ ok: true, status: 201, data: ticket });
    render(
      <UploadForm
        texts={de.upload}
        endpoint="/verbrauch/api/documents/upload-url"
        loginHref="/auth/login"
        categories={[{ value: "meter-photo", label: "Zählerfoto" }]}
        accept={["image/jpeg", "image/png"]}
        fileLabel="Foto des Zählers"
      />,
    );
    const input = screen.getByLabelText("Foto des Zählers") as HTMLInputElement;
    expect(input).toHaveAttribute("accept", "image/jpeg,image/png");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    fireEvent.change(input, {
      target: { files: [new File(["%PDF"], "a.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Foto hochladen" }));
    expect(input).toBeInvalid();

    const photo = new File(["jpeg"], "zaehler.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [photo] } });
    fireEvent.click(screen.getByRole("button", { name: "Foto hochladen" }));
    expect(await screen.findByRole("status")).toHaveTextContent("zaehler.jpg");
    expect(sendJson).toHaveBeenCalledWith("POST", "/verbrauch/api/documents/upload-url", {
      fileName: "zaehler.jpg",
      contentType: "image/jpeg",
      sizeBytes: photo.size,
      category: "meter-photo",
    });
    expect(fetchMock).toHaveBeenCalledWith(ticket.uploadUrl, {
      method: "PUT",
      headers: ticket.headers,
      body: photo,
    });
  });
});
