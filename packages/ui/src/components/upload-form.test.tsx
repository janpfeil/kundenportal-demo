import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UploadForm, type UploadTexts } from "./upload-form.js";

const texts: UploadTexts = {
  file: "Datei",
  hint: "PDF, JPEG oder PNG",
  category: "Art",
  submit: "Hochladen",
  busy: "Lädt …",
  success: "„{name}“ hochgeladen",
  errorMissing: "Datei fehlt",
  errorType: "Falscher Typ",
  errorSize: "Zu groß",
  errorEmpty: "Leer",
  errorSetup: "Konto wird eingerichtet",
  errorSession: "Sitzung abgelaufen",
  errorGeneric: "Fehlgeschlagen",
  login: "Erneut anmelden",
};

const ticket = {
  documentId: "d-1",
  uploadUrl: "https://bucket.s3.eu-central-1.amazonaws.com/uploads/t/c/d-1?X-Amz-Signature=x",
  method: "PUT" as const,
  headers: { "content-type": "image/png" },
  expiresAt: "2026-09-30T12:05:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

function setup(announce = vi.fn()) {
  const onUploaded = vi.fn();
  render(
    <UploadForm
      texts={texts}
      endpoint="/zone/api/documents/upload-url"
      loginHref="/auth/login?returnTo=/zone"
      categories={[{ value: "meter-photo", label: "Zählerfoto" }]}
      accept={["image/png"]}
      announce={announce}
      onUploaded={onUploaded}
    />,
  );
  const input = screen.getByLabelText("Datei") as HTMLInputElement;
  const choose = (file: File) => fireEvent.change(input, { target: { files: [file] } });
  const submit = () => fireEvent.click(screen.getByRole("button", { name: "Hochladen" }));
  return { input, choose, submit, onUploaded };
}

describe("UploadForm", () => {
  it("hides the category choice for a single category and checks the accepted types", () => {
    const announce = vi.fn();
    const { input, choose, submit } = setup(announce);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    submit();
    expect(input).toHaveAccessibleDescription(/Datei fehlt/);
    choose(new File(["%PDF"], "a.pdf", { type: "application/pdf" }));
    submit();
    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription(/Falscher Typ/);
    expect(announce).not.toHaveBeenCalled();
  });

  it("announces, uploads with the signed headers and reports success", async () => {
    const put = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", put);
    const announce = vi.fn().mockResolvedValue({ ok: true, status: 201, data: ticket });
    const { choose, submit, onUploaded } = setup(announce);
    const file = new File(["png"], "zaehler.png", { type: "image/png" });
    choose(file);
    submit();
    expect(await screen.findByRole("status")).toHaveTextContent("„zaehler.png“ hochgeladen");
    expect(announce).toHaveBeenCalledWith({
      fileName: "zaehler.png",
      contentType: "image/png",
      sizeBytes: file.size,
      category: "meter-photo",
    });
    expect(put).toHaveBeenCalledWith(ticket.uploadUrl, {
      method: "PUT",
      headers: ticket.headers,
      body: file,
    });
    expect(onUploaded).toHaveBeenCalled();
  });

  it("offers a new sign-in when the session has expired", async () => {
    const { choose, submit } = setup(vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    choose(new File(["png"], "a.png", { type: "image/png" }));
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Sitzung abgelaufen");
    expect(screen.getByRole("link", { name: "Erneut anmelden" })).toHaveAttribute(
      "href",
      "/auth/login?returnTo=/zone",
    );
  });
});
