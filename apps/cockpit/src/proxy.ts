import { createCspProxy } from "@kundenportal/web-auth/csp";

/** Content Security Policy for every page and route handler of the zone (@kundenportal/web-auth/csp). */
export const proxy = createCspProxy();

export const config = {
  // Paths are relative to the basePath; hashed assets never need a policy.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
