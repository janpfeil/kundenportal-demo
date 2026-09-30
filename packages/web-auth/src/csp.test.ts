import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server.js";
import { describe, expect, it } from "vitest";
import {
  PRERENDERED_CACHE_CONTROL,
  S3_UPLOAD_ORIGIN,
  contentSecurityPolicy,
  createCspProxy,
  createNonce,
  inlineScriptHashes,
  prerenderedScriptHashes,
} from "./csp.js";

const directive = (policy: string, name: string) =>
  policy
    .split("; ")
    .find((part) => part.startsWith(`${name} `))
    ?.slice(name.length + 1);

const sha = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

describe("contentSecurityPolicy", () => {
  it("locks scripts to the own origin plus the nonce and forbids framing and plugins", () => {
    const policy = contentSecurityPolicy({ nonce: "abc" });
    expect(directive(policy, "script-src")).toBe("'self' 'nonce-abc'");
    expect(directive(policy, "default-src")).toBe("'self'");
    expect(directive(policy, "object-src")).toBe("'none'");
    expect(directive(policy, "base-uri")).toBe("'self'");
    expect(directive(policy, "frame-ancestors")).toBe("'none'");
    expect(directive(policy, "connect-src")).toBe("'self'");
    expect(directive(policy, "form-action")).toBe("'self'");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("adds hashes, upload bucket, sign-in domain, workers and dev allowances on request", () => {
    const policy = contentSecurityPolicy({
      scriptHashes: ["'sha256-x'"],
      connectSrc: [S3_UPLOAD_ORIGIN],
      formAction: ["https://auth.example"],
      workerSrc: ["blob:"],
      dev: true,
      upgradeInsecureRequests: true,
    });
    expect(directive(policy, "script-src")).toBe("'self' 'sha256-x' 'unsafe-eval'");
    expect(directive(policy, "connect-src")).toBe("'self' https://*.s3.eu-central-1.amazonaws.com");
    expect(directive(policy, "form-action")).toBe("'self' https://auth.example");
    expect(directive(policy, "worker-src")).toBe("'self' blob:");
    expect(policy.endsWith("upgrade-insecure-requests")).toBe(true);
  });

  it("creates distinct 128-bit nonces", () => {
    const nonce = createNonce();
    expect(Buffer.from(nonce, "base64")).toHaveLength(16);
    expect(createNonce()).not.toBe(nonce);
  });
});

describe("script hashes of prerendered pages", () => {
  const html =
    '<html><head><script src="/_next/static/a.js" async=""></script></head><body>' +
    "<script>self.__next_f=self.__next_f||[]</script>" +
    '<script type="text/javascript">self.__next_f.push([1,"x"])</script>' +
    "<script>self.__next_f=self.__next_f||[]</script></body></html>";

  it("hashes each distinct inline script and ignores external ones", () => {
    expect(inlineScriptHashes(html)).toEqual([
      sha("self.__next_f=self.__next_f||[]"),
      sha('self.__next_f.push([1,"x"])'),
    ]);
  });

  it("serves prerendered pages with their hashes and a short edge cache, others with a nonce", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csp-proxy-"));
    await mkdir(path.join(root, ".next", "server", "app"), { recursive: true });
    await writeFile(path.join(root, ".next", "server", "app", "index.html"), html);
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const proxy = createCspProxy({
        prerendered: { "/": "index.html" },
        sources: () => ({ workerSrc: ["blob:"] }),
        guard: (request) =>
          request.nextUrl.pathname === "/konto"
            ? NextResponse.redirect("https://portal.example/auth/login")
            : undefined,
      });
      const start = await proxy(new NextRequest("https://portal.example/"));
      const startPolicy = start.headers.get("content-security-policy") ?? "";
      expect(directive(startPolicy, "script-src")).toBe(
        `'self' ${inlineScriptHashes(html).join(" ")}`,
      );
      expect(directive(startPolicy, "worker-src")).toBe("'self' blob:");
      expect(start.headers.get("cache-control")).toBe(PRERENDERED_CACHE_CONTROL);

      const page = await proxy(new NextRequest("https://portal.example/postfach"));
      const pagePolicy = page.headers.get("content-security-policy") ?? "";
      expect(directive(pagePolicy, "script-src")).toMatch(/^'self' 'nonce-[A-Za-z0-9+/=]{24}'$/);
      // Next.js reads the nonce from the request's policy while rendering.
      expect(page.headers.get("x-middleware-request-content-security-policy")).toBe(pagePolicy);
      expect(page.headers.get("cache-control")).toBeNull();

      const guarded = await proxy(new NextRequest("https://portal.example/konto"));
      expect(guarded.status).toBe(307);
      expect(guarded.headers.get("content-security-policy")).toContain("'nonce-");
    } finally {
      process.chdir(cwd);
    }
  });

  it("reads the prerendered file once and reports missing files as undefined", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "csp-"));
    await mkdir(path.join(root, ".next", "server", "app"), { recursive: true });
    await writeFile(path.join(root, ".next", "server", "app", "index.html"), html);
    expect(await prerenderedScriptHashes("index.html", root)).toHaveLength(2);
    expect(await prerenderedScriptHashes("missing.html", root)).toBeUndefined();
  });
});
