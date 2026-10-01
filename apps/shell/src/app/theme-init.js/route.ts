import { themeInitScript } from "@kundenportal/ui/theme";

/** Built once: the script is the same for every visitor (it only reads the visitor's cookies). */
export const dynamic = "force-static";

const SCRIPT = themeInitScript();

/**
 * `/theme-init.js`: applies the theme cookies before the first paint. Prerendered pages load
 * it synchronously in <head> (they cannot read cookies on the server); the edge routes this
 * path to the shell (default behaviour), so it is the same file for every zone. An external
 * script, so the CSP allows it through `'self'` and needs no hash.
 */
export function GET(): Response {
  return new Response(SCRIPT, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      // Browsers and the edge keep it 5 minutes; it changes only with the list of presets.
      "cache-control": "public, max-age=300, s-maxage=300",
      "x-content-type-options": "nosniff",
    },
  });
}
