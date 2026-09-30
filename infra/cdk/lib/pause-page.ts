/**
 * What visitors see while the application stack is paused (teardown.sh without --all):
 * the edge answers every request itself with 503, so nobody gets a bare 403 from a
 * deleted function URL. The page is small and self-contained because it lives inside a
 * CloudFront Function (at most 10 KB of code, no external resources).
 */
export const PAUSE_HTML = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Kundenportal (Demo) pausiert</title>
<style>
:root{color-scheme:light dark;--bg:#f6f7f8;--card:#fff;--ink:#1c2024;--muted:#5b636b;--accent:#1f6f4a}
@media (prefers-color-scheme:dark){:root{--bg:#15181b;--card:#1e2226;--ink:#e8eaec;--muted:#a3abb3;--accent:#6fcf9f}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,sans-serif}
main{max-width:40rem;margin:0 auto;padding:3rem 1rem}
section{background:var(--card);border-radius:.5rem;padding:1.25rem 1.5rem;margin-top:1rem}
h1{font-size:1.6rem;margin:0 0 .5rem}p{margin:.5rem 0}.muted{color:var(--muted)}a{color:var(--accent)}
</style>
</head>
<body>
<main>
<h1>Die Demo pausiert gerade</h1>
<p>Dieses Kundenportal ist ein Demo-Projekt. Zwischen Vorführungen ist der Anwendungsteil abgebaut, damit er nichts kostet. Er wird bei Bedarf in wenigen Minuten neu aufgebaut, unter derselben Adresse.</p>
<p>Konten, Daten und laufende Demo-Pässe bleiben dabei erhalten.</p>
<section lang="en">
<h2>The demo is paused</h2>
<p class="muted">This customer portal is a demo project. Between showings its application part is removed so it costs nothing; it is rebuilt within minutes under the same address. Accounts, data and running demo passes are kept.</p>
</section>
<section>
<p><a href="https://janpfeil.github.io/kundenportal-demo/">Architektur und Berichte</a> · <a href="https://github.com/janpfeil/kundenportal-demo">Quellcode auf GitHub</a></p>
</section>
</main>
</body>
</html>
`;

/** Problem details for API calls during a pause (the API itself is gone). */
const PAUSE_PROBLEM = JSON.stringify({
  title: "Service Unavailable",
  status: 503,
  detail: "The demo is paused; it is rebuilt on demand.",
});

/**
 * Code of the viewer-request CloudFront Function that answers every request during a
 * pause: HTML for pages, problem details for `/api/*`. `Retry-After` hints at a rebuild
 * in minutes; nothing is cached, so the portal is back as soon as the edge is re-pointed.
 */
export function pauseFunctionCode(): string {
  return `function handler(event) {
  var api = event.request.uri.indexOf("/api/") === 0;
  return {
    statusCode: 503,
    statusDescription: "Service Unavailable",
    headers: {
      "content-type": { value: api ? "application/problem+json" : "text/html; charset=utf-8" },
      "cache-control": { value: "no-store" },
      "retry-after": { value: "600" }
    },
    body: { encoding: "text", data: api ? ${JSON.stringify(PAUSE_PROBLEM)} : ${JSON.stringify(PAUSE_HTML)} }
  };
}
`;
}
