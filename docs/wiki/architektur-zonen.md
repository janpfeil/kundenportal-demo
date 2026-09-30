# Architektur: Zonen und Frontend

Stand: 2026-09-30 · Beschreibt den **Ist-Stand** des Codes (Phase 2 abgeschlossen), nicht die Zielarchitektur. Kennzeichnung: **[B]** belegt (offizielle Quelle oder Messung), **[A]** Annahme, **[E]** Einschätzung.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

Diese Seite ergänzt die [Architektur](architektur.md) um die Oberfläche:
wie das Portal in mehrere Next.js-Apps zerfällt, wie der Browser schreibt,
wie das Laufzeit-Widget „Glocke" eingebunden ist und was die Component
Library liefert. Warum [Multi-Zones](glossar.md#multi-zones) statt Module
Federation, steht in [Next.js-Betrieb](nextjs-betrieb.md).

## 1. Zonen im Überblick

Das Portal besteht aus der **Shell** und weiteren **Zonen**: je eine eigene
Next.js-App mit eigenem [basePath](glossar.md#basepath), eigener Lambda und
eigenem Pfadbereich unter derselben Domain. Welche Zonen es gibt, steht an
genau einer Stelle, der Registry `infra/cdk/lib/zones.ts`; App-Stack und
Edge-Stack lesen sie beide.

| Zone | Pfad | App | Stand 30.09.2026 |
|---|---|---|---|
| Shell | `/` (alles, was keine Zone ist) | `apps/shell` | Startseite, Anmeldung, Konto mit Profil-Bearbeitung, Demo-Postfach mit „als gelesen markieren", Glocke |
| `contracts` | `/vertraege` | `apps/contracts` | Vertragsübersicht, Detailseite mit Abschlag und Tarifoption (J6), Dokumente mit Upload per Presigned URL |
| `consumption` | `/verbrauch` | `apps/consumption` | Zählerstand-Verlauf und -Erfassung mit Plausibilitätsprüfung (J4), Zählerfoto, Datenvolumen Mobilfunk |
| `cockpit` | `/cockpit` | — | kommt in Phase 3 (Migrations-Cockpit) |

```chart
{"type": "flow", "title": "Zonen: eine Domain, mehrere Next.js-Apps", "gap": 40,
 "layers": [
  {"title": "Nutzer", "nodes": [["Browser", "Session-Cookie, <kp-bell>"]]},
  {"title": "Rand", "accent": true, "nodes": [["CloudFront", "eine Lambda-OAC für alle Zonen"]]},
  {"title": "Zonen", "nodes": [["Shell-Lambda", "/ — Anmeldung, Konto, Postfach"], ["Zone Verträge", "/vertraege/*"], ["Zone Verbrauch", "/verbrauch/*"], ["S3 (Assets)", "/_next/static/*, /widgets/*"]]},
  {"title": "Dienste", "accent": true, "nodes": [["HTTP API", "/api/* mit Access Token aus der Sitzung"]]}
 ],
 "edges": [["Browser", "CloudFront"], ["CloudFront", "Shell-Lambda"], ["CloudFront", "Zone Verträge"], ["CloudFront", "Zone Verbrauch"], ["CloudFront", "S3 (Assets)"],
           ["Shell-Lambda", "HTTP API"], ["Zone Verträge", "HTTP API"], ["Zone Verbrauch", "HTTP API"]]}
```

Ein Wechsel zwischen Zonen ist ein **voller Seitenwechsel** (gewöhnlicher
Link, kein clientseitiges Routing): Jede Zone hat ihr eigenes
JavaScript-Bundle, und nur innerhalb einer Zone navigiert Next.js ohne
Neuladen [E].

## 2. Aufbau einer Zone

Eine Zone hinzuzufügen heißt: eine App unter `apps/` mit `basePath` und
`output: "standalone"` und ein Eintrag in `zones.ts`. Den Rest leiten die
Stacks aus der Registry ab:

| Baustein | Umsetzung |
|---|---|
| Paket | `scripts/package-next-lambda.mjs <app>`: [Standalone-Build](glossar.md#standalone-build) als Zip (mit den pnpm-Symlinks); die statischen Dateien (`.next/static`) lädt der Edge-Stack je Zone in den Asset-Bucket unter `<basePath>/_next/static/` |
| Lambda | Construct `NextLambda` (`infra/cdk/lib/next-lambda.ts`), dasselbe wie für die Shell: [Lambda Web Adapter](glossar.md#lambda-web-adapter), Response Streaming, 1024 MB, 15 s, [Function URL](glossar.md#function-url) mit `AWS_IAM`; Bereitschaftsprüfung unter `<basePath>/healthz` |
| Übergabe an den Edge | SSM `/kundenportal/app/zones/<id>/function-arn` und `/kundenportal/app/zones/<id>/origin-domain` |
| CloudFront | je Zone **drei** [Cache-Behaviors](glossar.md#cache-behavior): `<basePath>` und `<basePath>/*` (alle HTTP-Methoden, kein Cache) sowie `<basePath>/_next/static/*` aus S3 (gecacht; jede neue Fassung einer Datei bekommt einen neuen Namen) |
| Signatur | **eine** gemeinsame [OAC](glossar.md#oac) vom Typ `lambda` für Shell und alle Zonen (`originAccessControlId` am Ursprung) |
| Aufrufrechte | je Zone `lambda:InvokeFunctionUrl` und `lambda:InvokeFunction` nur für diese Distribution, wie bei der Shell |
| Umgebung | `API_URL`, `OIDC_CLIENT_ID`, `COGNITO_USER_POOL_ID`, `APP_URL`; die Zone darf wie die Shell `DescribeUserPoolClient` aufrufen (Schlüssel der Sitzung, siehe Abschnitt 3) |

Statische Dateien kommen für Shell **und** Zonen aus dem S3-Bucket des
Edge-Stacks. Anfangs lieferten die Zonen sie selbst aus; der erste
Live-Test brach dann mit `ReservedFunctionConcurrentInvocationLimitExceeded`
ab: ein erster Seitenaufruf lädt viele Chunks gleichzeitig, mehr als eine
Reserved Concurrency von 2 zulässt [B: Live-Test 30.09.2026]. Seither laufen
nur Seiten und Route Handler über die Lambda; die Next.js-Funktionen (Shell,
Zonen) haben eine Reserved Concurrency von **5** (CDK-Kontext
`webReservedConcurrency`), die Services weiterhin 2.

## 3. Anmeldung in den Zonen

Die Anmeldung bleibt **in der Shell**; Zonen haben keinen eigenen
OIDC-Ablauf. Das gemeinsame Paket `@kundenportal/web-auth` gibt jeder Zone
dieselben Werkzeuge:

| Funktion | Zweck |
|---|---|
| `readSession()` | liest und entschlüsselt das [Cookie](glossar.md#cookie) `kp_session` der Shell ([JWE](glossar.md#jwe), Schlüssel per [HKDF](glossar.md#hkdf) aus dem Client-Secret, das die Zone wie die Shell aus dem User Pool liest); abgelaufene Sitzungen gelten als fehlend |
| `apiFor(session)` | typisierter API-Client mit dem Access Token aus der Sitzung, serverseitig |
| `loginUrl(returnTo)` | **absolute** Adresse `https://<Domain>/auth/login?returnTo=…` der Shell. Absolut, weil Next.js relative Weiterleitungsziele innerhalb einer Zone mit dem `basePath` präfixt — aus `/auth/login` würde sonst `/vertraege/auth/login` |
| `isSameOrigin(headers, appUrl)` | [CSRF](glossar.md#csrf)-Prüfung für schreibende Anfragen (Abschnitt 4) |

Ohne Sitzung leitet eine Zone zur Shell-Anmeldung weiter und kommt danach
über `returnTo` zurück. Der Browser hält weiterhin nur Cookies, nie Tokens
([BFF](glossar.md#bff)).

## 4. Schreibweg aus dem Browser

**Problem:** CloudFront signiert Anfragen an die Function URLs per
[OAC](glossar.md#oac) mit [SigV4](glossar.md#sigv4). Für Anfragen **mit
Body** (POST, PUT, PATCH) signiert CloudFront den Inhalt nicht selbst;
der Absender muss den SHA-256 des Bodys im Header `x-amz-content-sha256`
mitschicken [B: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html].
Ein gewöhnliches HTML-Formular kann das nicht.

**Lösung:** Alle schreibenden Aufrufe aus dem Browser laufen über
`sendJson(method, url, body)` aus `@kundenportal/web-auth/browser`. Die
Funktion serialisiert den Body, berechnet den
[Payload-Hash](glossar.md#payload-hash) mit [WebCrypto](glossar.md#webcrypto)
und sendet beides per `fetch` (nur gleiche Herkunft, mit Cookie).

- **Live belegt [B]:** POST an die Shell ohne Payload-Hash → 403 von
  CloudFront; mit Payload-Hash → die Anfrage erreicht die App.
- **Function URLs bleiben `AWS_IAM`** mit OAC. Die Alternativen wären eine
  öffentliche Function URL (Schutz nur noch über ein Geheimnis im Header,
  das dann im CloudFront-Template stünde) — beides verworfen [E].
- **Folge:** Formulare **ohne JavaScript** werden nicht unterstützt [E].
  Das betrifft nur schreibende Aktionen; Seiten und Links funktionieren
  auch ohne JavaScript.

**CSRF-Schutz** in zwei Schichten:

1. Das Sitzungs-Cookie ist [SameSite](glossar.md#samesite)`=Lax`; fremde
   Seiten können damit keine POST-Anfragen mit Sitzung auslösen.
2. Jeder Route Handler, der schreibt, prüft den
   [Origin-Header](glossar.md#origin-header): nur die Portal-Domain, sonst
   **403**; danach die Sitzung, sonst **401** (`guardWrite` in der Shell).
   Fehlt `Origin`, gilt die Anfrage als fremd — `fetch` sendet ihn bei
   allen Nicht-GET-Anfragen.

Schreibende [Route Handler](glossar.md#route-handler) der Shell (Stand
30.09.2026):

| Route (Shell) | Methode | ruft die API | Zweck |
|---|---|---|---|
| `/konto/profil` | PATCH | `PATCH /api/me` | Anzeigename und Sprache ändern |
| `/postfach/<id>/gelesen` | POST | `PATCH /api/notifications/<id>` | Nachricht als gelesen markieren |
| `/postfach/anzahl` | GET | `GET /api/notifications` | Zahl der ungelesenen Nachrichten für die Glocke (401 ohne Sitzung) |

Das Verhalten der Shell in CloudFront erlaubt dafür jetzt alle
[HTTP-Methoden](glossar.md#http-methoden) (Phase 1: nur GET, HEAD,
OPTIONS).

## 5. Laufzeit-Widget „Glocke"

`<kp-bell>` (`packages/widget-notifications`) zeigt die Zahl der
ungelesenen Nachrichten und verlinkt aufs Postfach. Es ist die zweite
Integrationsart neben Multi-Zones: eine
[Laufzeit-Integration](glossar.md#laufzeit-integration) im Browser, die
jede Zone unabhängig von ihrem eigenen Stack einbinden kann.

- **Technik:** ein [Custom Element](glossar.md#custom-element) mit
  [Shadow DOM](glossar.md#shadow-dom), ohne Framework, gebaut mit
  [Vite](glossar.md#vite); **2,3 kB**. Farben kommen über die
  Design-Tokens der Component Library (`--kp-accent`), mit Ersatzwerten.
- **Einbinden:** `<script type="module" src="/widgets/bell.js">` und
  `<kp-bell>`; Attribute `label`, `href` (Standard `/postfach`), `src`
  (Standard `/postfach/anzahl`), `interval` (Sekunden, Standard 30).
- **Auslieferung:** Der Edge-Stack legt `bell.js` in den Asset-Bucket unter
  `/widgets/`; ein eigenes Verhalten `/widgets/*` liefert es gecacht aus.
  Weil der Dateiname gleich bleibt, [invalidiert](glossar.md#invalidierung)
  jeder Deploy `/widgets/*`.
- **Daten:** GET `/postfach/anzahl` der Shell mit dem Session-Cookie (gleiche
  Herkunft, kein Token im Browser). Ohne Sitzung antwortet die Route mit
  401, das Widget bleibt dann still.

## 6. Component Library und Storybook

`packages/ui` ist die gemeinsame [Component Library](glossar.md#component-library)
aller Zonen; die Shell baut bereits vollständig darauf auf.

| Teil | Inhalt |
|---|---|
| Komponenten | 13: `AppShell`/`TopBar` (mit Platz für die Glocke), `Page`, `Card`, `Facts`, `DataTable`, `Button`/`ButtonLink`, `TextField`, `NumberField`, `Select`, `Notice`, `Badge`, `EmptyState`, `Footer`; reines React ohne Client-Zustand, daher alle als [Server Components](glossar.md#server-components) nutzbar |
| [Design-Tokens](glossar.md#design-token) | CSS-Variablen `--kp-*` für hell und dunkel; folgt `prefers-color-scheme`, `data-theme` erzwingt eine Variante |
| Übersetzungen | gemeinsame Texte DE/EN (Navigation, An-/Abmelden, Sprachwechsel, Fußzeile) und Sprachauswahl aus Cookie und `Accept-Language`; zonenspezifische Texte bleiben in den Zonen |
| Tests | 20 (Vitest, Testing Library) |
| [Storybook](glossar.md#storybook) | Version 10.6, statisch gebaut; Umschalter für Sprache und Hell/Dunkel, 360-px-Ansicht voreingestellt |

Der Workflow `Pages` veröffentlicht Storybook zusammen mit diesen Berichten
auf [GitHub Pages](glossar.md#github-pages):
https://janpfeil.github.io/kundenportal-demo/storybook/ — kostenlos und
ohne S3 oder CloudFront ([Kostenfreier Betrieb](kostenfrei.md) §3).

## 7. Messwerte

| Messgröße | Wert | Gemessen am | Anmerkung |
|---|---|---|---|
| Deploy nur der Zonen (lokal) | 212 s | 30.09.2026 | Build, App- und Edge-Stack |
| Größe `bell.js` | 2,3 kB | 30.09.2026 | Vite-Build |
| POST ohne `x-amz-content-sha256` | 403 | 30.09.2026 | CloudFront, live |

Weitere Messwerte, auch der Deploy mit allen Services, stehen in
[Architektur](architektur.md) §9.

## Quellen

- CloudFront OAC für Lambda Function URLs (Payload-Hash bei PUT/POST): https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
- Next.js Multi-Zones: https://nextjs.org/docs/app/guides/multi-zones
- Next.js `basePath`: https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath
- Custom Elements (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements
- Cookie-Attribut SameSite (MDN): https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value
