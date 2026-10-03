import { describe, expect, it } from "vitest";
import {
  formatCent,
  formatDataVolume,
  formatDate,
  formatDateTime,
  formatEuro,
  formatFileSize,
  formatNumber,
  formatQuantity,
  formatUnitPrice,
  percent,
} from "./format.js";
import { fill } from "./i18n/index.js";

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

  it("formats unit prices in cents as the tariffs show them", () => {
    expect(formatCent(32, "de")).toBe("32 ct");
    expect(formatCent(32.4, "de")).toBe("32,4 ct");
    expect(formatCent(32.456, "de")).toBe("32,46 ct");
    expect(formatCent(1234.5, "de")).toBe("1.234,5 ct");
    expect(formatCent(32.4, "en")).toBe("32.4 ct");
  });

  it("formats calendar dates without shifting them across time zones", () => {
    expect(formatDate("2026-12-31", "de")).toBe("31.12.2026");
    expect(formatDate("2026-06-01", "de")).toBe("01.06.2026");
    expect(formatDate("2026-12-31", "en")).toBe("Dec 31, 2026");
    expect(formatDate("kaputt", "de")).toBe("kaputt");
  });

  it("formats points in time in German time, with seconds on request", () => {
    expect(formatDateTime("2026-09-30T10:00:00.000Z", "de")).toBe("30.09.2026, 12:00");
    expect(formatDateTime("2026-09-30T10:00:00.000Z", "de", "medium")).toContain("12:00:00");
    expect(formatDateTime("kaputt", "en")).toBe("kaputt");
  });

  it("formats sizes, quantities, data volumes and plain numbers", () => {
    expect(plain(formatFileSize(2_500_000, "de"))).toBe("2,4 MB");
    expect(plain(formatFileSize(1000, "en"))).toBe("1 kB");
    expect(plain(formatFileSize(5 * 1024 * 1024, "de"))).toBe("5 MB");
    expect(plain(formatQuantity(3500.5, "kWh", "de"))).toBe("3.500,5 kWh");
    expect(plain(formatQuantity(12345.678, "kWh", "de"))).toBe("12.345,678 kWh");
    expect(plain(formatQuantity(12, "m3", "en"))).toBe("12 m³");
    expect(plain(formatDataVolume(20480, "de"))).toBe("20 GB");
    expect(plain(formatDataVolume(10240 * 0.83, "en"))).toBe("8.3 GB");
    expect(plain(formatDataVolume(512, "en"))).toBe("512 MB");
    expect(formatNumber(5000, "de")).toBe("5.000");
    expect(formatNumber(5000, "en")).toBe("5,000");
  });

  it("computes shares in whole percent", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, undefined)).toBe(0);
    expect(percent(7, 5)).toBe(100);
  });
});

describe("fill", () => {
  it("replaces known placeholders and keeps unknown ones visible", () => {
    expect(fill("{min} bis {max}", { min: "1 €", max: 2 })).toBe("1 € bis 2");
    expect(fill("{unknown}", {})).toBe("{unknown}");
  });
});
