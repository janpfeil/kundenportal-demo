import { describe, expect, it } from "vitest";
import { checkFile, parseUploadRequest, uploadFileName, uploadRequest } from "./upload.js";

describe("upload", () => {
  it("checks type and size before announcing a file", () => {
    expect(checkFile(undefined)).toBe("missing");
    expect(checkFile({ type: "image/gif", size: 10 })).toBe("type");
    expect(checkFile({ type: "image/heic", size: 1000 })).toBe("type");
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
