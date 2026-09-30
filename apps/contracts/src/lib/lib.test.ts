import { describe, expect, it } from "vitest";
import { commonTexts } from "@kundenportal/ui/i18n";
import {
  contractProblem,
  isContractId,
  parseContractUpdate,
  parseInstallmentEuros,
} from "./contract-update";
import {
  formatDataVolume,
  formatDate,
  formatEuro,
  formatFileSize,
  formatQuantity,
  formatUnitPrice,
} from "./format";
import { checkFile, parseUploadRequest, uploadFileName, uploadRequest } from "./upload";
import { BASE_PATH, fill, navigation, zonePath } from "./zone";

// Intl uses narrow no-break spaces in some locales; compare with plain spaces.
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, " ");

describe("formatting", () => {
  it("formats cents as euros per locale", () => {
    expect(plain(formatEuro(8500, "de"))).toBe("85,00 €");
    expect(plain(formatEuro(123456, "de"))).toBe("1.234,56 €");
    expect(formatEuro(8500, "en")).toBe("€85.00");
    expect(plain(formatUnitPrice(32, "de"))).toBe("0,32 €");
    expect(plain(formatUnitPrice(113.5, "de"))).toBe("1,135 €");
  });

  it("formats calendar dates without shifting them across time zones", () => {
    expect(formatDate("2026-12-31", "de")).toBe("31.12.2026");
    expect(formatDate("2026-12-31", "en")).toBe("Dec 31, 2026");
    expect(formatDate("kaputt", "de")).toBe("kaputt");
  });

  it("formats sizes, quantities and data volumes", () => {
    expect(plain(formatFileSize(2_500_000, "de"))).toBe("2,4 MB");
    expect(plain(formatFileSize(1000, "en"))).toBe("1 kB");
    expect(plain(formatQuantity(3500.5, "kWh", "de"))).toBe("3.500,5 kWh");
    expect(plain(formatQuantity(12, "m3", "en"))).toBe("12 m³");
    expect(plain(formatDataVolume(20480, "de"))).toBe("20 GB");
    expect(plain(formatDataVolume(512, "en"))).toBe("512 MB");
  });
});

describe("installment input", () => {
  it("accepts whole euros within the range", () => {
    expect(parseInstallmentEuros("85", 6000, 12000)).toEqual({ ok: true, cents: 8500 });
    expect(parseInstallmentEuros(" 60,00 ", 6000, 12000)).toEqual({ ok: true, cents: 6000 });
  });

  it("explains what is wrong", () => {
    expect(parseInstallmentEuros("", 6000, 12000)).toEqual({ ok: false, reason: "empty" });
    expect(parseInstallmentEuros("85,50", 6000, 12000)).toEqual({ ok: false, reason: "whole" });
    expect(parseInstallmentEuros("abc", 6000, 12000)).toEqual({ ok: false, reason: "whole" });
    expect(parseInstallmentEuros("0", undefined, undefined)).toEqual({
      ok: false,
      reason: "whole",
    });
    expect(parseInstallmentEuros("59", 6000, 12000)).toEqual({ ok: false, reason: "range" });
    expect(parseInstallmentEuros("121", 6000, 12000)).toEqual({ ok: false, reason: "range" });
  });
});

describe("contract update body", () => {
  it("accepts installment and/or tariff option only", () => {
    expect(parseContractUpdate({ monthlyInstallmentCent: 9000 })).toEqual({
      monthlyInstallmentCent: 9000,
    });
    expect(parseContractUpdate({ tariffOption: "oeko", monthlyInstallmentCent: 100 })).toEqual({
      tariffOption: "oeko",
      monthlyInstallmentCent: 100,
    });
    for (const body of [
      null,
      [],
      {},
      { tariffOption: "" },
      { monthlyInstallmentCent: "90" },
      { x: 1 },
    ])
      expect(parseContractUpdate(body)).toBeUndefined();
  });

  it("recognises contract ids", () => {
    expect(isContractId("6f1c1f64-8a4c-4c55-9a39-5d8a4a0f2c11")).toBe(true);
    expect(isContractId("../me")).toBe(false);
  });

  it("maps the API's answers to messages", () => {
    expect(contractProblem(401, undefined)).toBe("session");
    expect(contractProblem(409, "changed concurrently")).toBe("conflict");
    expect(contractProblem(422, "The installment must be between 60.00 and 120.00 EUR")).toBe(
      "range",
    );
    expect(contractProblem(422, "The installment must be whole euros")).toBe("whole");
    expect(contractProblem(422, "The monthly price of this contract is fixed")).toBe("fixed");
    expect(contractProblem(422, "Unknown tariff option x")).toBe("option");
    expect(contractProblem(500, undefined)).toBe("generic");
  });
});

describe("upload", () => {
  it("checks type and size before announcing a file", () => {
    expect(checkFile(undefined)).toBe("missing");
    expect(checkFile({ type: "image/gif", size: 10 })).toBe("type");
    expect(checkFile({ type: "image/png", size: 0 })).toBe("empty");
    expect(checkFile({ type: "application/pdf", size: 5 * 1024 * 1024 + 1 })).toBe("size");
    expect(checkFile({ type: "image/jpeg", size: 5 * 1024 * 1024 })).toBeUndefined();
  });

  it("cleans file names the way the documents service accepts them", () => {
    expect(uploadFileName("zähler foto.jpg")).toBe("zähler foto.jpg");
    expect(uploadFileName("a/b\\c\u0001.pdf")).toBe("a_b_c_.pdf");
    const long = uploadFileName(`${"x".repeat(200)}.pdf`);
    expect(long).toHaveLength(120);
    expect(long.endsWith(".pdf")).toBe(true);
    expect(uploadRequest({ name: "a.png", type: "image/png", size: 3 }, "meter-photo")).toEqual({
      fileName: "a.png",
      contentType: "image/png",
      sizeBytes: 3,
      category: "meter-photo",
    });
  });

  it("validates the announcement at the zone's boundary", () => {
    const valid = { fileName: "a.pdf", contentType: "application/pdf", sizeBytes: 1 };
    expect(parseUploadRequest(valid)).toEqual(valid);
    expect(parseUploadRequest({ ...valid, category: "meter-photo" })).toMatchObject({
      category: "meter-photo",
    });
    for (const body of [
      null,
      { ...valid, contentType: "text/html" },
      { ...valid, sizeBytes: 0 },
      { ...valid, sizeBytes: 5 * 1024 * 1024 + 1 },
      { ...valid, fileName: " " },
      { ...valid, category: "invoice" },
      { ...valid, key: "uploads/other" },
    ])
      expect(parseUploadRequest(body)).toBeUndefined();
  });
});

describe("zone", () => {
  it("builds paths below the basePath", () => {
    expect(BASE_PATH).toBe("/vertraege");
    expect(zonePath()).toBe("/vertraege");
    expect(zonePath("/api/documents/upload-url")).toBe("/vertraege/api/documents/upload-url");
  });

  it("shows the shell's navigation with this zone active", () => {
    const nav = navigation(commonTexts.de, true);
    expect(nav.map((item) => item.href)).toEqual([
      "/",
      "/konto",
      "/postfach",
      "/vertraege",
      "/verbrauch",
    ]);
    expect(nav.filter((item) => item.active).map((item) => item.href)).toEqual(["/vertraege"]);
    expect(navigation(commonTexts.en, false)).toEqual([{ href: "/", label: "Home" }]);
  });

  it("fills placeholders", () => {
    expect(fill("{min} bis {max}", { min: "1 €", max: 2 })).toBe("1 € bis 2");
    expect(fill("{unknown}", {})).toBe("{unknown}");
  });
});
