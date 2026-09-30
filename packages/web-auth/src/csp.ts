/**
 * Content Security Policy of the portal's Next.js apps (shell and zones), applied by each
 * app's `src/proxy.ts`.
 *
 * Next.js renders inline scripts (the React Server Components payload) into every page, so
 * `script-src` cannot be `'self'` alone:
 * - Pages rendered per request get a fresh nonce; Next.js reads it from the request's CSP
 *   header and puts it on its own scripts.
 * - Pages prerendered at build time (and cacheable at the edge) cannot carry a nonce. Their
 *   HTML is fixed per build, so the proxy allows exactly their inline scripts by SHA-256
 *   hash, computed from the prerendered file.
 * Script files come from the portal's own origin only (`'self'`: `/_next/static`,
 * `/widgets/bell.js`); no third-party script host is allowed.
 */
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server.js";

/** Host of presigned upload URLs (virtual-hosted S3 in the portal's region). */
export const S3_UPLOAD_ORIGIN = "https://*.s3.eu-central-1.amazonaws.com";

export interface CspOptions {
  /** Nonce of this response (pages rendered per request). */
  nonce?: string;
  /** `'sha256-…'` sources of the inline scripts of a prerendered page. */
  scriptHashes?: readonly string[];
  /** `next dev` needs eval for its debugging aids. */
  dev?: boolean;
  /** Additional targets of fetch/XHR, e.g. the upload bucket for presigned PUTs. */
  connectSrc?: readonly string[];
  /** Additional form and redirect targets, e.g. the sign-in domain. */
  formAction?: readonly string[];
  /** Sources for web workers, e.g. `blob:` for the ALTCHA widget's proof-of-work worker. */
  workerSrc?: readonly string[];
  /** Adds `upgrade-insecure-requests` (only meaningful behind HTTPS). */
  upgradeInsecureRequests?: boolean;
}

const list = (...sources: (string | false | undefined)[]) =>
  sources.filter((source): source is string => Boolean(source)).join(" ");

/** The policy as a header value. */
export function contentSecurityPolicy(options: CspOptions = {}): string {
  const scriptSources = list(
    "'self'",
    options.nonce !== undefined && `'nonce-${options.nonce}'`,
    ...(options.scriptHashes ?? []),
    options.dev && "'unsafe-eval'",
  );
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    // React sets style attributes and some libraries (ALTCHA) add <style> elements; styles
    // cannot run code, so inline styles stay allowed while scripts are locked down.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${list("'self'", ...(options.connectSrc ?? []))}`,
    `worker-src ${list("'self'", ...(options.workerSrc ?? []))}`,
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action ${list("'self'", ...(options.formAction ?? []))}`,
    "frame-ancestors 'none'",
    options.upgradeInsecureRequests && "upgrade-insecure-requests",
  ];
  return directives.filter(Boolean).join("; ");
}

/** A fresh, unguessable nonce (128 bit, base64). */
export function createNonce(): string {
  return randomBytes(16).toString("base64");
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

/** `'sha256-…'` sources for every inline script (one without `src`) of an HTML document. */
export function inlineScriptHashes(html: string): string[] {
  const hashes = new Set<string>();
  for (const match of html.matchAll(INLINE_SCRIPT)) {
    const body = match[1] ?? "";
    hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
  return [...hashes];
}

const hashCache = new Map<string, Promise<string[] | undefined>>();

/**
 * Hashes of a page Next.js prerendered at build time, read once from
 * `.next/server/app/<file>` (present in `next start` and in the standalone output).
 * `undefined` if the file does not exist, e.g. in `next dev`.
 */
export function prerenderedScriptHashes(
  file: string,
  root: string = process.cwd(),
): Promise<string[] | undefined> {
  const location = path.join(root, ".next", "server", "app", file);
  let cached = hashCache.get(location);
  if (!cached) {
    cached = readFile(location, "utf8").then(inlineScriptHashes, () => undefined);
    hashCache.set(location, cached);
  }
  return cached;
}

/**
 * Continues the request with the policy: on the request (so Next.js applies the nonce while
 * rendering) and on the response (so the browser enforces it).
 */
export function withPolicy(request: NextRequest, policy: string, response?: NextResponse) {
  if (response) {
    response.headers.set("content-security-policy", policy);
    return response;
  }
  const headers = new Headers(request.headers);
  headers.set("content-security-policy", policy);
  const next = NextResponse.next({ request: { headers } });
  next.headers.set("content-security-policy", policy);
  return next;
}

/** Sources an app adds to the common policy; read per request (they may come from env). */
export type AppSources = Pick<CspOptions, "connectSrc" | "formAction" | "workerSrc">;

export interface CspProxyOptions {
  /** Sources this app needs beyond `'self'`. */
  sources?: () => AppSources;
  /** Prerendered pages: path (without basePath) → file below `.next/server/app`. */
  prerendered?: Readonly<Record<string, string>>;
  /** Prerendered pages that may answer any path, e.g. a global 404. */
  anyPath?: readonly string[];
  /** Runs first and may answer instead, e.g. a redirect to the sign-in. */
  guard?: (request: NextRequest) => NextResponse | undefined;
}

/**
 * The `proxy` of a portal app: every page and route handler gets the Content Security
 * Policy — with the hashes of its prerendered HTML for prerendered pages, with a fresh nonce
 * for everything rendered per request.
 */
export function createCspProxy(options: CspProxyOptions = {}) {
  return async function proxy(request: NextRequest): Promise<NextResponse> {
    const dev = process.env.NODE_ENV === "development";
    const common: CspOptions = {
      ...options.sources?.(),
      dev,
      upgradeInsecureRequests: (process.env.APP_URL ?? "").startsWith("https:"),
    };
    const anyPath = (
      await Promise.all((options.anyPath ?? []).map((file) => prerenderedScriptHashes(file)))
    ).flatMap((hashes) => hashes ?? []);
    const file = options.prerendered?.[request.nextUrl.pathname];
    const hashes = file && !dev ? await prerenderedScriptHashes(file) : undefined;
    const policy = hashes
      ? contentSecurityPolicy({ ...common, scriptHashes: unique([...hashes, ...anyPath]) })
      : contentSecurityPolicy({ ...common, nonce: createNonce(), scriptHashes: anyPath });
    const guarded = options.guard?.(request);
    const response = withPolicy(request, policy, guarded);
    // Same HTML for everyone: the edge may keep it briefly (the deploy invalidates it).
    if (hashes && !guarded) response.headers.set("cache-control", PRERENDERED_CACHE_CONTROL);
    return response;
  };
}

/**
 * Caching of prerendered pages: browsers revalidate every time (ETag), the edge keeps a
 * copy for 5 minutes. Replaces Next.js's default `s-maxage=31536000`, which would keep a
 * page with outdated asset names for a year if an invalidation were missed.
 */
export const PRERENDERED_CACHE_CONTROL = "public, max-age=0, s-maxage=300";

const unique = (values: readonly string[]) => [...new Set(values)];
