# Architektur: Zonen und Frontend

Stand: 2026-09-30 · Beschreibt den **Ist-Stand** des Codes (Phase 2 abgeschlossen; Seiten für Mandanten und Demo-Pass aus Phase 4 in Abschnitt 8; gemeinsame Bausteine, Content Security Policy und cachebare Startseite in Abschnitt 9–11), nicht die Zielarchitektur. Kennzeichnung: **[B]** belegt (offizielle Quelle oder Messung), **[A]** Annahme, **[E]** Einschätzung.

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
| Shell | `/` (alles, was keine Zone ist) | `apps/shell` | Startseite, Anmeldung, Konto mit Profil-Bearbeitung, Demo-Postfach mit „als gelesen markieren", Glocke; seit Phase 4 Demo-Pass einlösen und Pass-Status (Abschnitt 8). Startseite und Einlöseseite sind vorgerendert und für alle gleich (Abschnitt 11) |
| `contracts` | `/vertraege` | `apps/contracts` | Vertragsübersicht, Detailseite mit Abschlag und Tarifoption (J6), Dokumente mit Upload per Presigned URL |
| `consumption` | `/verbrauch` | `apps/consumption` | Zählerstand-Verlauf und -Erfassung mit Plausibilitätsprüfung (J4), Zählerfoto, Datenvolumen Mobilfunk |
| `cockpit` | `/cockpit` | `apps/cockpit` | Migrations-Cockpit (Phase 3, [Altsysteme & Migration](architektur-migration.md)); seit Phase 4 Pass-Verwaltung unter `/cockpit/paesse`, dort auch die Einstellungen (Einlösen offen/gesperrt, Höchstzahl) |

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
| Proxy | `src/proxy.ts` mit `createCspProxy` aus `@kundenportal/web-auth/csp`: setzt die [Content Security Policy](glossar.md#csp) jeder Antwort (Abschnitt 10) |
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
| `currentSession()`, `requireSession(path)` | aus `@kundenportal/web-auth/pages`: Sitzung einmal je Anfrage lesen bzw. ohne Sitzung zur Anmeldung weiterleiten. Eigener Einstiegspunkt, weil er `next/navigation` nutzt, das Route Handler nicht laden dürfen |

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
| Komponenten | `AppShell`/`TopBar` (mit Platz für die Glocke), `Page`, `Card`, `Facts`, `DataTable`, `Button`/`ButtonLink`, `TextField`, `NumberField`, `Select`, `Notice`, `Badge`, `EmptyState`, `Footer`, `Meter`: reines React ohne Client-Zustand, daher als [Server Components](glossar.md#server-components) nutzbar. Dazu `UploadForm` ([Client-Komponente](glossar.md#client-komponente), Abschnitt 9) |
| Navigation | `portalNavigation(texte, {signedIn, current, roles})` baut die Hauptnavigation für Shell und Zonen; der Eintrag des aktuellen Bereichs trägt `aria-current="page"` und ist fett mit dicker Unterstreichung in Akzentfarbe (auch im Kontrastmodus sichtbar). Die Shell leitet den Bereich aus dem Pfad im Browser ab, jede Zone markiert ihren eigenen Eintrag. `roles` (aus den Cognito-Gruppen des Tokens, `rolesOf` in `web-auth`; auf vorgerenderten Seiten aus dem Hinweis-Cookie `kp_ui`): Inhaber und Pass-Inhaber sehen „Cockpit“, Pass-Inhaber zusätzlich „Demo-Pass“ — in Shell und allen Zonen gleich |
| Version in der Kopfzeile | `TopBar` zeigt neben der Marke die ausgerollte Version, z. B. `v0.4.1 · 1a2b3c4`: `next.config.ts` setzt `NEXT_PUBLIC_APP_VERSION` beim Build aus der Version in der Wurzel-`package.json` und dem Commit (`GITHUB_SHA`, lokal `git`; `scripts/app-version.mjs`) |
| Hilfsfunktionen | Formatierung (`formatEuro`, `formatDate`, `formatDateTime`, `formatFileSize`, `formatQuantity`, `formatDataVolume`, `formatNumber`, `percent`), `fill` für Platzhalter in Texten, `createZoneLink(basePath, Link)` |
| [Design-Tokens](glossar.md#design-token) | CSS-Variablen `--kp-*` für hell und dunkel; folgt `prefers-color-scheme`, `data-theme` erzwingt eine Variante |
| Übersetzungen | gemeinsame Texte DE/EN (Navigation, An-/Abmelden, Sprachwechsel, Fußzeile) und Sprachauswahl aus Cookie und `Accept-Language`; zonenspezifische Texte bleiben in den Zonen |
| Tests | 37 (Vitest, Testing Library) |
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

## 8. Seiten für Mandanten und Demo-Pass (Phase 4)

Die Architektur dahinter steht in
[Architektur: Mandanten und Demo-Pass](architektur-mandanten.md).

| Route | Zone | Art | Wer | Zweck |
|---|---|---|---|---|
| `/pass/einloesen` | Shell | Seite | öffentlich | Einladungslink einlösen: Token nur im URL-Fragment (`#…`), [ALTCHA](glossar.md#altcha)-Widget, danach Hinweis auf das Einmal-Passwort |
| `/pass/einloesen/challenge` | Shell | [Route Handler](glossar.md#route-handler), GET | öffentlich | holt das Rätsel von `GET /api/tenancy/challenge` |
| `/pass/einloesen/api` | Shell | Route Handler, POST | öffentlich | prüft den [Origin-Header](glossar.md#origin-header) (sonst 403), gibt die IP des Besuchers als `x-kp-client-ip` weiter, ruft `POST /api/tenancy/redeem` |
| `/pass` | Shell | Seite | Gruppe `pass` | Status des eigenen Passes: Einrichtung, gültig bis, Kontingente als `Meter` (neu in `packages/ui`), Demo-Personen mit Anmeldenamen und Demo-Passwort |
| `/cockpit/paesse` | Cockpit | Seite | Gruppe `owner` | Einladungen erzeugen (Link wird genau einmal angezeigt), Pässe mit Status und Kontingent, Widerruf |
| `/cockpit/api/invitations` | Cockpit | Route Handler, POST | Gruppe `owner` | `POST /api/tenancy/invitations` |
| `/cockpit/api/passes/<id>/revoke` | Cockpit | Route Handler, POST | Gruppe `owner` | `POST /api/tenancy/passes/{id}/revoke` |
| `/cockpit/api/settings` | Cockpit | Route Handler, PUT | Gruppe `owner` | `PUT /api/tenancy/settings`: Einlösen öffnen/sperren, Höchstzahl 1–4 |
| `/api/tenancy/offer` | API | GET, vom Browser | öffentlich | aktuelles Angebot für `/pass/einloesen` (Laufzeit, Kontingente, Upload-Größe, Einlösen offen) |
| `/cockpit` | Cockpit | Seite | Gruppe `pass` | Migrationsansichten **des eigenen** Mandanten (Mandant aus dem Token) |

Die Navigation der Shell hat dafür den Eintrag „Demo-Pass". Die beiden
öffentlichen Route Handler brauchen keine Sitzung; sie laufen wie alle
schreibenden Aufrufe über `sendJson` mit Payload-Hash (Abschnitt 4).
Die Zahlen auf `/pass/einloesen` (Laufzeit, Kontingente, höchste
Upload-Größe) holt der Browser von `GET /api/tenancy/offer`: gleiche
Herkunft, ohne Token, ohne Umweg über die Shell-Lambda. Solange die Antwort
fehlt, steht „Wird geladen …“ da, bei einem Fehler „nicht abrufbar“; das
Formular bleibt dann nutzbar. Meldet die API `redemptionOpen: false`
(Kill-Switch zu oder alle Plätze belegt), erscheint statt des Formulars der
Hinweis „Einlösen ist gerade pausiert“.

Auf `/cockpit/paesse` sieht der Inhaber die **Einstellungen**: Einlösen
offen oder gesperrt (mit Zeitpunkt und Grund, z. B. vom Budget-Alarm),
Schaltfläche zum Sperren bzw. Wiederöffnen, die Zahl der aktiven
Pass-Mandanten und die Höchstzahl 1–4 mit Begründung: Jeder Mandant hat eine
Tabelle mit 5/5 Kapazitätseinheiten, frei sind 25/25 je Konto, die Basis
belegt 5/5 ([Mandanten](architektur-mandanten.md) §6). Ein erschöpftes
Upload-Kontingent (429 vom Documents-Service) meldet das Upload-Formular mit
eigenem Text.

## 9. Gemeinsame Bausteine der Zonen

Was jede Zone gleich braucht, liegt in den Paketen; in der Zone bleiben nur
`basePath`, Texte und Seiten.

| Baustein | Paket | Zweck |
|---|---|---|
| `forwardWrite(request, parse, call)` | `@kundenportal/web-auth` | Schreibweg (Abschnitt 4): Origin prüfen (403), Sitzung (401), Body validieren (400), API mit dem Token der Sitzung aufrufen; Status und Problem Details der API gehen unverändert zurück, 204 ohne Body. `writePath(deps)` baut dieselbe Funktion mit austauschbaren Abhängigkeiten für Tests |
| `problem(status, title, detail?)` | `@kundenportal/web-auth` | Fehlerantwort der Zone als RFC 9457 `application/problem+json` |
| `currentSession`, `requireSession` | `@kundenportal/web-auth/pages` | Abschnitt 3 |
| Upload-Regeln | `@kundenportal/web-auth/upload` | erlaubte Typen und Größe, Dateiname bereinigen, Ankündigung im Browser bauen und im Route Handler prüfen; ohne Server-APIs, also auch im Browser nutzbar |
| `UploadForm` | `@kundenportal/ui` | Upload in zwei Schritten (Ankündigung an die Zone, dann `PUT` direkt an die [Presigned URL](glossar.md#presigned-url)); Texte je Zone, nach dem Upload ruft die Zone `router.refresh()` |
| Formatierung, `fill`, Navigation, `createZoneLink` | `@kundenportal/ui` | Abschnitt 6 |

## 10. Content Security Policy

Shell und Zonen senden eine [Content Security Policy](glossar.md#csp)
(CSP). Gesetzt wird sie im `proxy` jeder App (`src/proxy.ts`, ab Next.js 16
der Nachfolger von `middleware.ts`) über `createCspProxy` aus
`@kundenportal/web-auth/csp`.

| Direktive | Wert | Grund |
|---|---|---|
| `default-src` | `'self'` | alles Übrige nur von der Portal-Domain |
| `script-src` | `'self'` + [Nonce](glossar.md#nonce) bzw. Hashes | Skriptdateien nur von der eigenen Domain (`/_next/static`, `/widgets/bell.js`); Next.js schreibt zusätzlich Inline-Skripte in jede Seite, die nur mit Nonce oder Hash laufen |
| `style-src` | `'self' 'unsafe-inline'` | React setzt Style-Attribute (z. B. `Meter`), ALTCHA fügt ein `<style>` ein; Styles führen keinen Code aus [E] |
| `img-src` | `'self' data: blob:` | eigene Bilder, eingebettete Grafiken |
| `connect-src` | `'self'`, in Verträge und Verbrauch zusätzlich `https://*.s3.eu-central-1.amazonaws.com` | `fetch` nur zur eigenen Domain (Route Handler, `/api/*`); der Upload geht per `PUT` an die Presigned URL des Upload-Buckets |
| `worker-src` | `'self'`, in der Shell zusätzlich `blob:` | das ALTCHA-Widget rechnet in einem Web Worker aus einem Blob |
| `form-action` | `'self'`, in der Shell zusätzlich die Cognito-Domain (Herkunft von `OIDC_LOGOUT_URL`) | Anmelden und Abmelden leiten zur Cognito-Anmeldeseite weiter |
| `frame-ancestors` | `'none'` | keine Einbettung in fremde Seiten ([Clickjacking](glossar.md#clickjacking)) |
| `base-uri`, `object-src`, `manifest-src` | `'self'`, `'none'`, `'self'` | kein fremdes `<base>`, keine Plugins |
| `upgrade-insecure-requests` | nur hinter HTTPS (`APP_URL`) | lokal über `http://localhost` nicht |

**Zwei Arten von Seiten:**

- Seiten, die je Anfrage entstehen (alle Zonen, Konto, Postfach, Pass), bekommen
  je Antwort eine neue Nonce (128 bit). Der Proxy setzt die Policy auch in den
  Request-Header; Next.js liest die Nonce dort und hängt sie an seine Skripte.
- [Vorgerenderte Seiten](glossar.md#prerendering) (`/`, `/pass/einloesen`, die
  404-Seite) entstehen beim Build und können keine Nonce tragen. Ihr HTML ist je
  Build fest; der Proxy liest die Datei aus `.next/server/app` einmal je
  Lambda-Instanz und erlaubt genau ihre Inline-Skripte per SHA-256-Hash. Die
  Hashes der 404-Seite stehen in jeder Policy der Shell, weil jeder Pfad mit
  ihr antworten kann.

`'strict-dynamic'` ist nicht gesetzt: Alle Skripte kommen ohnehin von der
eigenen Domain, und ohne `'strict-dynamic'` funktionieren Nonce und Hash
gleich. In `next dev` kommt `'unsafe-eval'` hinzu (Fehleranzeige von React).

**Lokal belegt [B: Produktionsbuild, headless Chromium, 30.09.2026]:** keine
Verletzung und vollständige Hydration auf Startseite (deutsch, englisch per
Cookie und per Browsersprache), Einlöseseite (Angebot geladen, ALTCHA im
Worker gelöst; zweiter Lauf mit pausiertem Einlösen), Konto, Postfach,
Verträge mit Upload bis zum `PUT` an eine S3-Adresse, Verbrauch,
Cockpit-Einstellungen (sperren, öffnen, Höchstzahl ändern) und 404-Seite.
Gegenprobe: ein eingeschleustes Inline-Skript und ein `fetch` an eine fremde
Domain werden blockiert.

## 11. Cachebare Startseite

Bis 30.09.2026 las das gemeinsame Layout der Shell Cookies (Sitzung für die
Navigation, Sprache); damit war jede Shell-Seite dynamisch und `/` kam mit
`private, no-store`. Jetzt hat die Shell zwei Root-Layouts
([Route Groups](glossar.md#route-group)):

| Gruppe | Seiten | Layout |
|---|---|---|
| `(public)` | `/`, `/pass/einloesen` | liest weder Cookies noch Header; Next.js rendert die Seiten beim Build vor, das HTML ist für alle Besucher gleich |
| `(app)` | `/konto`, `/postfach`, `/pass` | je Anfrage: Sitzung und Sprache vom Server, Rahmen ab dem ersten Byte richtig |

Die 404-Seite liefert `app/global-not-found.tsx` (zweisprachig), weil es
kein gemeinsames Layout mehr gibt. Ein Wechsel zwischen den Gruppen ist ein
voller Seitenwechsel, wie zwischen Zonen.

**Wie die vorgerenderten Seiten den Besucher erkennen:**

- **Sprache:** im Browser aus dem Cookie `kp_locale` (Sprachwechsel), sonst
  aus der Browsersprache — dieselbe Regel wie auf dem Server. Das HTML ist
  deutsch; wer Englisch bevorzugt, sieht nach der
  [Hydration](glossar.md#hydration) kurz den Wechsel [E]. Pfade mit Sprache
  (`/en/…`) hätten das vermieden, aber jede Seite, jeden Link und die Zonen
  verdoppelt.
- **Angemeldet:** Die Anmeldung setzt neben dem verschlüsselten
  `kp_session` (httpOnly) das lesbare Cookie `kp_ui` mit derselben Laufzeit
  (`user` oder `pass`); die Abmeldung löscht beide. Es enthält keine
  Identität und öffnet nichts — es entscheidet nur, welche
  Navigationseinträge der Browser zeigt; jede Seite dahinter prüft die echte
  Sitzung. Gewählt statt eines Aufrufs `/auth/state`, weil es ohne Anfrage an
  die Lambda auskommt. Folge: Sitzungen von vor dieser Änderung zeigen auf `/`
  bis zur nächsten Anmeldung „Anmelden“ [E].

**Antwort-Header:** `Cache-Control: public, max-age=0, s-maxage=300` (setzt der
Proxy statt Next.js' `s-maxage=31536000`, damit eine vergessene Invalidierung
höchstens fünf Minuten alte Asset-Namen ausliefert), `ETag`, dazu
`Vary: rsc, next-router-state-tree, next-router-prefetch,
next-router-segment-prefetch`. Browser fragen jedes Mal nach, CloudFront darf
fünf Minuten halten.

**Was der Edge-Stack dafür braucht** (Stand dieser Seite: noch nicht gebaut):
eigene Cache-Behaviors für `/` und `/pass/einloesen` zum Shell-Ursprung mit
einer Cache Policy, die den Origin-Header `Cache-Control` achtet (Min-TTL 0,
Default-TTL 0, Max-TTL 300 s), **keine** Cookies und **keine** Header im
Cache-Schlüssel, aber **alle Query-Strings** (Next.js unterscheidet die
RSC-Anfragen beim Seitenwechsel über `?_rsc=…`), GET/HEAD; dazu eine
Invalidierung von `/` und `/pass/einloesen` bei jedem Deploy.

## Quellen

- CloudFront OAC für Lambda Function URLs (Payload-Hash bei PUT/POST): https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html
- Next.js Multi-Zones: https://nextjs.org/docs/app/guides/multi-zones
- Next.js `basePath`: https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath
- Next.js Content Security Policy (Nonce über Proxy, statische Seiten): https://nextjs.org/docs/app/guides/content-security-policy
- Next.js `global-not-found.js` bei mehreren Root-Layouts: https://nextjs.org/docs/app/api-reference/file-conventions/not-found
- CSP Level 3 (Nonce, Hash-Quellen): https://www.w3.org/TR/CSP3/
- CloudFront: Caching und Origin-Header `Cache-Control`: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html
- Custom Elements (MDN): https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_custom_elements
- Cookie-Attribut SameSite (MDN): https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie#samesitesamesite-value
