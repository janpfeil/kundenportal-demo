import { S3_UPLOAD_ORIGIN, createCspProxy } from "@kundenportal/web-auth/csp";

/**
 * Content Security Policy for every page and route handler of the zone
 * (@kundenportal/web-auth/csp); the browser may also PUT uploads to the presigned S3 URL.
 */
export const proxy = createCspProxy({ sources: () => ({ connectSrc: [S3_UPLOAD_ORIGIN] }) });

export const config = {
  // Paths are relative to the basePath; hashed assets never need a policy.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
