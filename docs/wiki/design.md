# Design und Theme (Phase 5)

Stand: 2026-10-01 · entschieden und umgesetzt · Kennzeichnung: **[E]** Einschätzung, **[B]** belegt.

**Mockup:** https://janpfeil.github.io/kundenportal-demo/design/mockups.html
(eine einzelne HTML-Datei, `docs/design/mockups.html`; läuft auch lokal per
Doppelklick, ohne Build und ohne Internet).

## Ziel

Phase 5 legt das Aussehen des Portals fest. Heute gibt es genau ein Theme:
die Design-Tokens `--kp-*` in `packages/ui/src/styles.css` (grüner Akzent
`#0b6e4f`, Systemschrift, hell und dunkel nach Betriebssystem). Das Mockup
zeigt echte Seiten des Portals mit erfundenen Daten in mehreren Varianten.
Der Inhaber wählt je Zielgruppe eine Variante; ihre Werte wandern danach als
Tokens in die Component Library. Am Code der Seiten ändert sich dafür wenig,
weil alle Komponenten ihre Farben, Abstände und Schriften aus den Tokens
lesen.

## Zwei Zielgruppen

| Zielgruppe | Seiten | Was sie braucht |
|---|---|---|
| Endkunden eines Mehrsparten-Versorgers (Strom, Gas, Wasser, Internet, Mobilfunk) | `/`, `/konto`, `/postfach`, `/vertraege`, `/verbrauch`, `/pass` | ruhig, vertrauenswürdig, freundlich; gut lesbar nach WCAG 2.2 AA (Kontrastverhältnis mindestens 4,5:1 für Text); große Touch-Ziele (44 px); klare Hierarchie; zuerst für das Smartphone gedacht |
| Inhaber im Migrations-Cockpit (Power-User) | `/cockpit`, `/cockpit/paesse` | dicht und schnell erfassbar; per Tastatur bedienbar; Tabellen, Kennzahlen, Timeline, Status-Badges; Seitenleiste; ein guter Dunkelmodus für lange Sitzungen |

Beide Zielgruppen nutzen dieselben Token-Namen und dieselbe Component
Library; sie unterscheiden sich nur in den Werten.

## Die Varianten im Mockup

Jede Variante ist ein **Preset**: es setzt mehrere Parameter auf einmal
(Farbe, Schrift, Dichte, Ecken, Schatten, Rahmen, Navigation). Jede Variante
funktioniert hell und dunkel; im Dunkelmodus wird der Akzent automatisch so
weit aufgehellt, dass er 4,5:1 erreicht.

**Endkunden**

| Preset | Absicht |
|---|---|
| Vertrauen | ruhiges Blau, kühle Grautöne, Karten mit feinem Schatten, Top-Bar. Seriös, ohne kühl zu wirken. |
| Warm | Terrakotta, warme Neutraltöne, gerundete Schrift, große Radien, viel Luft; mobil eine Bottom-Nav. Nahbar, für Familien und ältere Kunden. |
| Klar | monochrom mit dem grünen Bestandsakzent, fast keine Radien, Linien statt Schatten. Sachlich und sehr ruhig; am nächsten am heutigen Stand. |
| Klassisch | Petrol, Serifen-Überschriften, Seitenleiste. Wirkt wie ein etabliertes Stadtwerk. |

**Cockpit**

| Preset | Absicht |
|---|---|
| Dicht | kompakt, 14 px, Seitenleiste mit Sektionen und Tastaturkürzeln, Linien statt Schatten. Viele Zeilen auf einen Blick. |
| Übersicht | Karten mit Schatten, Top-Bar, mehr Weißraum. Für den Überblick und für Vorführungen. |
| Kontrast | dunkel zuerst, aufgehellter Cyan-Akzent, kräftigere Ränder. Für lange Sitzungen und große Bildschirme. |

Gezeigte Seiten: Startseite (öffentlich), Übersicht mit Konto und geöffnetem
Benutzermenü, Verträge mit Änderungsformular, Verbrauch mit Monatsdiagramm,
Postfach, Demo-Pass mit Kontingenten; im Cockpit die Übersicht (Fortschritt
Versorger/Telko, Klärfälle, Dead-Letter-Queue mit Redrive, Ereignis-Timeline)
und die Demo-Pässe (Tabelle, Einladung, Einstellungen). Kopfzeile mit Marke,
Versions-Chip, Navigation, Glocke mit Zähler und Benutzermenü sowie Fußzeile
sind überall gleich aufgebaut.

## Die Werkzeugleiste

Die Leiste links (auf schmalen Bildschirmen oben) lässt sich einklappen und
ist vollständig per Tastatur bedienbar.

1. **Zielgruppe und Screen** wählen; „Mobil-Rahmen" zeigt die Seite in
   375 px Breite mit dem echten mobilen Layout.
2. **Preset** wählen. Danach lassen sich einzelne Parameter übersteuern:
   Farbmodus (Hell, Dunkel, System), Akzentfarbe (frei oder aus acht
   Vorschlägen), Neutralton (kühl, neutral, warm), Schrift, Grundgröße
   (14–18 px), Zeilenhöhe, Typo-Skala, Dichte, Eckenradius (0–20 px),
   Schatten, Kartenrahmen, Navigation (Top-Bar, Seitenleiste, Bottom-Nav)
   und deren Markierung.
3. Die **Kontrastprüfung** zeigt live die Kontrastverhältnisse für Text,
   Sekundärtext, Links, Button-Text und Akzent gegen die Seite, jeweils mit
   „AA ✓" oder „AA ✗". So fällt eine Akzentfarbe, die nicht lesbar ist,
   sofort auf.
4. **Parameter kopieren** legt die Einstellung als JSON und als fertigen
   CSS-Block (`:root` hell, Dunkelmodus per `prefers-color-scheme`) in die
   Zwischenablage; der Block lässt sich so in `packages/ui/src/styles.css`
   übernehmen. **Link kopieren** teilt die Variante: alle Abweichungen
   vom Preset stehen im Link hinter dem `#`.

Die Mockups sind klickbar: Navigation, Benutzermenü (Escape schließt),
Reiter im Verbrauch, der Schalter „Einlösen" und die Redrive-Zeile reagieren.
Das Ende der Seite erklärt jedes Token und enthält eine Empfehlung.

## Empfehlung [E]

- **Endkunden: „Vertrauen"**, ergänzt um die Bottom-Nav aus „Warm" auf dem
  Smartphone. „Warm" ist die Alternative, wenn die Marke nahbarer wirken
  soll; „Klar", wenn der grüne Bestandsakzent bleiben soll.
- **Cockpit: „Dicht"**, im Dunkelmodus mit den Werten von „Kontrast".

## Entscheidung des Inhabers

> „Endkunde Klar, Cockpit Dicht als Default, aber über das Usermenü möchte
> ich zwischen den Themes umschalten können.“ (01.10.2026)

- **Endkunden:** Standard „Klar“ (grüner Bestandsakzent `#0b6e4f` bleibt);
  wählbar „Vertrauen“, „Warm“, „Klassisch“.
- **Cockpit:** Standard „Dicht“ mit Seitenleiste; wählbar „Übersicht“,
  „Kontrast“.
- **Farbmodus:** Standard „System“ (folgt dem Betriebssystem), wählbar
  „Hell“ und „Dunkel“.
- **Umschalten:** im Benutzermenü, Abschnitt „Darstellung“. Abgemeldete
  Besucher finden dieselbe Auswahl als kleines Menü „Darstellung“ neben dem
  Sprachlink; sie sollen Farbmodus und Lesbarkeit nicht erst nach der
  Anmeldung einstellen können.
- **Mobil:** Bottom-Nav nur in „Warm“ (wie im Mockup), sonst scrollbare
  Navigationszeile unter der Kopfzeile.

## Wie die Themes gebaut sind

| Teil | Ort | Aufgabe |
|---|---|---|
| Presets und Tokens | `packages/ui/src/themes.ts` | einzige Quelle: die Parameter aller sieben Presets aus dem Mockup und die Rechnung daraus (`themeTokens`), dieselben Formeln wie im Mockup |
| Stylesheet | `scripts/build-css.mjs` → `dist/styles.css` | der UI-Build schreibt `themesCss()` vor die handgeschriebenen Stile (`src/styles.css`, `src/layout.css`); Storybook holt die Tokens direkt aus `themes.ts` |
| Auswahl | `packages/ui/src/theme-runtime.ts` | Attribute an `<html>` (`data-audience`, `data-theme-preset`, `data-color-mode`, abgeleitet `data-nav`, `data-nav-marker`), Cookies `kp_theme_kunde`, `kp_theme_cockpit`, `kp_color_mode`, Prüfung der Werte, `applyTheme` für den Umschalter |
| Init-Skript | `/theme-init.js` (Shell) | setzt auf vorgerenderten Seiten die Attribute aus den Cookies vor dem ersten Zeichnen |
| Umschalter | `AppearanceItems` im `UserMenu`, `AppearanceMenu` für Abgemeldete | `menuitemradio` mit `aria-checked`; Wahl wirkt sofort und gilt in allen Zonen |

Wie die Attribute in Shell und Zonen gesetzt werden, welche Seiten das
Init-Skript laden und wie es ausgeliefert wird, steht in
[Architektur: Zonen und Frontend](architektur-zonen.md) §12.

**Neue Tokens** (zusätzlich zu den bisherigen Farben): `--kp-surface-2`,
`--kp-border-strong`, `--kp-accent-text` (Links, aktive Einträge),
`--kp-accent-soft`, `--kp-focus`, `--kp-track`, `--kp-badge`,
`--kp-row-hover`, `--kp-input-bg`, `--kp-header-bg`, `--kp-side-bg`,
`--kp-*-text` je Status; Schrift (`--kp-font`, `--kp-font-heading`,
`--kp-heading-weight`, `--kp-heading-tracking`), Größen (`--kp-font-size`,
`--kp-line-height`, `--kp-small`, `--kp-h1` bis `--kp-h3`), Dichte
(`--kp-space`, `--kp-control`, `--kp-cell-y`), Form (`--kp-radius`,
`--kp-radius-large`, `--kp-btn-radius`, `--kp-shadow`,
`--kp-shadow-raised`, `--kp-card-border`) und `--kp-content-width`. Das
alte Attribut `data-theme="light|dark"` entfällt; an seine Stelle tritt
`data-color-mode`.

**Abweichung vom Mockup:** Das Mockup passte die Link-Farbe nur gegen die
Fläche an; der aktive Navigationseintrag auf der getönten Akzentfläche kam im
Dunkelmodus nur auf rund 3,6:1. `--kp-accent-text` wird jetzt gegen
`--kp-accent-soft` (den schwierigsten Hintergrund) auf 4,5:1 gebracht.

## Kontrastprüfung

`packages/ui/src/themes.test.ts` rechnet für jedes Preset hell und dunkel
die Kontrastverhältnisse aus den Token-Werten (WCAG 2.x, relative Luminanz)
und verlangt mindestens 4,5:1 für Text / Fläche und Seite, Sekundärtext,
Links, aktiven Navigationseintrag, Button-Text auf Akzent, Text im
Eingabefeld, Statustexte und Text auf Statusflächen sowie 3:1 für Fokusring,
Akzent und Feldrahmen. **[B]** 14 Kombinationen aus Preset und Modus mit je 25 Paaren, alle bestanden. Weitere
Tests prüfen Cookies, Init-Skript, Umschalter und dass Kundenseiten
Bedienelemente von mindestens 44 px haben.

**[E]** „Kontrast“ ist im Mockup „dunkel zuerst“; hier folgt auch dieses
Preset dem gewählten Farbmodus (Standard System), damit der Modus überall
dieselbe Bedeutung hat.

## Phase 6: Oberflächen wie im Mockup

Stand: 2026-10-01 · in Arbeit. Ziel: Cockpit, Demo-Pässe und die
Endkunden-Ansichten zeigen **denselben Aufbau, dieselben Bausteine und
dieselben Inhalte** wie das Mockup — mit echten Daten aus dem API. Was nicht
in vertretbarer Zeit echt umsetzbar ist, zeigt einen plausiblen Wert mit dem
Marker „Demo-Wert“ (siehe [Gefakte Elemente](#gefakte-elemente)).

### Lückenanalyse: Mockup ↔ API

**[B]** Erhoben am Code von v0.5.0 (`packages/api-contract/openapi.yaml`,
Services, Seiten). „vorhanden“ heißt: die Daten liefert schon eine
Operation, es fehlt nur die Darstellung.

**Migrations-Cockpit (`/cockpit`)**

| Baustein im Mockup | Daten heute | Lücke | Lösung in Phase 6 |
|---|---|---|---|
| Kopf: Titel, Unterzeile, „Aktualisiert alle 10 Sekunden · hh:mm:ss“, „Aktualisieren“ | Seite lädt alle 10 s neu (`AutoRefresh`) | Zeitstempel | Zeit des Seitenaufbaus (Server), keine API nötig |
| Fortschrittsringe Versorger/Telko: Anteil, übernommen / gesamt | `GET /migration/status` → `systems[].counts`, `total` | — | vorhanden |
| „+n heute“ je Altsystem | — | Zähler fehlt | `systems[].migratedToday`: Datensätze `migrated`/`linked` mit `updatedAt` seit 00:00 Uhr deutscher Zeit |
| Kachel „Offene Klärfälle“: Zahl, „+n seit gestern“, Sparkline 7 Tage | Zahl aus `clarifications` | Veränderung, Verlauf | `trends.newClarifications` (Klärfälle der letzten 24 h) und `trends.clarifications[7]` (offene Fälle am Ende jedes Tages), berechnet aus den Datensätzen |
| Kachel „Dead-Letter-Queue“: Zahl, „−n nach Redrive“, Sparkline | Zahl aus `deadLetters` | Redrive-Zähler, Verlauf | Datensatz merkt sich `failedAt` und `redrivenAt`; `trends.redriven` (letzte 24 h) und `trends.deadLetters[7]` |
| Bulk-Import: Knöpfe je Altsystem, Läufe mit Status-Badge, Fortschrittsbalken, Zählern | `runs[]` mit `dispatched`, `processed`, `counts` | — | vorhanden |
| Klärfälle-Tabelle (Konto, Name + Altsystem, Problem-Badge, Stand), „Alle anzeigen“ | `clarifications[]` | — | vorhanden; die Seite zeigt fünf, „Alle anzeigen“ alle |
| Ereignis-Timeline mit Icon, deutschem Text, Code, Kennungen, „7 Tage“ | `timeline[]` (`detailType`, `summary`, TTL 7 Tage) | — | vorhanden; Icon und Text je `detailType` in der Oberfläche |
| DLQ mit Redrive | `deadLetters[]`, `POST /migration/dlq/{id}/redrive` | — | vorhanden, aufklappbare Korrekturzeile |
| „Demo zurücksetzen“ | `POST /migration/reset` | — | vorhanden, als Gefahrenkarte |
| Suchfeld „Konto, Mandant, Ereignis …“ mit `/` | — | Suche fehlt | **neu** `GET /migration/search?q=` (Konten und Ereignisse des eigenen Mandanten); Mandanten sucht die Cockpit-Seite des Inhabers zusätzlich in `GET /tenancy/passes` |
| Seitenleiste mit Abschnitten, Zählern, Tastenkürzeln `g c`, `g p` | Zähler aus `/migration/status` | — | Oberfläche (`packages/ui`) |
| Glocke „n neue Klärfälle“ | — | Zähler | `trends.newClarifications` |

**Demo-Pässe (`/cockpit/paesse`)**

| Baustein im Mockup | Daten heute | Lücke | Lösung in Phase 6 |
|---|---|---|---|
| „Aktive Pass-Mandanten n / max“ mit Balken | `GET /tenancy/settings` (`activeTenants`, `maxTenants`) | — | vorhanden |
| „Offene Einladungen“ (gültig 14 Tage) | — | Einladungen sind nur über den Token-Hash auffindbar | **neu** `GET /tenancy/overview`: Index-Eintrag `PLATFORM` / `INVITE#<id>` je Einladung (beim Anlegen, beim Einlösen markiert, TTL wie die Einladung) |
| „Nie angemeldet“ mit „Erinnerung nach 24 Std.“ | `PassSummary.activatedAt` | Zahl, Erinnerungsfrist | `overview.neverSignedIn`, `overview.reminderHours` |
| „API-Aufrufe heute“ mit Sparkline | nur Gesamtzähler `QUOTA#api.used` | Tageszähler | Kontingent-Wächter zählt im **selben Update** zusätzlich das Tagesattribut `d<JJJJMMTT>` (keine zusätzliche Schreibkapazität); `overview.apiCalls.today` und `.days[7]` über alle Pass-Mandanten |
| Tabelle: E-Mail, Mandant, Status-Badge, Erste Anmeldung, Letzte Aktivität, Kontingent als Mini-Balken, Gültig bis, Widerrufen | `GET /tenancy/passes` (`activatedAt`, `lastActiveAt`, `quota`) | offene Einladungen als Zeilen | `overview.invitations[]` |
| Karten „Einladung erstellen“ und „Einstellungen“ | `POST /tenancy/invitations`, `GET/PUT /tenancy/settings` | — | vorhanden |

**Endkunden-Ansichten**

| Baustein im Mockup | Daten heute | Lücke | Lösung in Phase 6 |
|---|---|---|---|
| Übersicht: Datum, „Guten Tag, …“ | `GET /me` (`displayName`) | — | vorhanden |
| Hinweis-Banner „Zählerstand Strom fällig … bis TT.MM.“ | — | Fälligkeit | **neu** `GET /contracts/{id}/consumption` → `nextReadingDue`, `readingDue` (vierteljährliche Ablesung: letzter Stand + 3 Monate; überfällig → heute + 14 Tage) |
| Vertragskarten: Sparten-Icon, Betrag, Status, „Details“ | `GET /contracts` | — | vorhanden |
| Sparkline (Strom) bzw. „Geschätzt n kWh im Jahr“ | `estimatedAnnualConsumption` | Monatswerte | `consumption.months[]` |
| Datenvolumen-Balken (Mobilfunk) | `GET /contracts/{id}/usage` (Demo-Modell im API) | kein Mobilfunknetz | vorhanden, als Demo-Wert markiert |
| Karte „Mein Konto“ | `GET /me` | — | vorhanden |
| Karte „Postfach“ mit Vorschau und „n neu“ | `GET /notifications` | — | vorhanden |
| „Weitere Kundenkonten“ (Verknüpfen) | `GET /me/links`, `POST /me/links` | — | vorhanden |
| Verträge: Tabelle mit Icons, Detailkarte, „Vertrag ändern“ mit Schieberegler und Optionskarten | `GET/PATCH /contracts/{id}` | — | vorhanden |
| Verbrauch: Reiter je Vertrag | `GET /contracts` | — | vorhanden |
| Kennzahlen: Letzter Stand; Letzte 12 Monate mit Veränderung zum Vorjahr; Ø pro Monat mit Kosten | Zählerstände, `workPriceCent` | Aggregation | `consumption.total`, `.previousTotal`, `.changePercent`, `.averagePerMonth`; Kosten = Ø × Arbeitspreis in der Oberfläche |
| Balkendiagramm 12 Monate mit Vorjahreslinie, „Als Tabelle anzeigen“ | — | Monatswerte | `consumption.months[]` mit `value`, `previousYear` und `basis` (siehe unten) |
| „Zählerstand erfassen“ mit Plausibilitätsmeldung | `POST …/readings` (422 bei kleinerem Wert/Datum) | erwarteter Bereich | `consumption.plausibleRange` für heute; die Oberfläche warnt vorab, der Server bleibt maßgeblich |
| Mobilfunk-Reiter: Ring Datenvolumen, „1 GB nachbuchen“ | Demo-Nutzung | keine Buchung | Ring mit Demo-Wert; „1 GB nachbuchen“ als markierter Demo-Knopf |
| Postfach: Liste (ungelesen hervorgehoben, Zeit, Vorschau) und geöffnete Nachricht | `GET /notifications`, `PATCH /notifications/{id}` (gelesen) | — | vorhanden; Auswahl per `?n=<id>` |
| Demo-Pass: Ring Restlaufzeit, Status, Kontingent, Demo-Personen, Passwort | `GET /tenancy/pass` | — | vorhanden |
| Start: Hero mit Illustration, fünf Sparten, drei Karten | statische Texte | — | Oberfläche |

**Wie die Monatswerte entstehen.** Ein Zählerstand misst nur die Summe
zwischen zwei Ablesungen. Der Verbrauchsdienst verteilt jede Spanne zwischen
zwei Ständen tageweise nach einem **Standardlastprofil** der Sparte (Strom:
Haushaltsprofil H0, Gas: Heizprofil, Wasser: fast gleichmäßig) auf die Monate
— so wie Versorger Jahresverbräuche abgrenzen. Monate, die kein Paar von
Ständen abdeckt (z. B. nach dem letzten Stand), schätzt er aus dem
geschätzten Jahresverbrauch des Vertrags mit demselben Profil und kennzeichnet
sie mit `basis: "estimate"`; die Oberfläche zeigt sie heller und mit
Legende „geschätzt“. Das ist eine echte Berechnung, kein Demo-Wert. Den
Jahresverbrauch übernimmt der Verbrauchsdienst aus `ContractChanged`
(`ContractSnapshot.estimatedAnnualConsumption`, neu und optional).

### Neue und erweiterte Operationen

| Operation | Scope | Service (CDK) | Zweck |
|---|---|---|---|
| `GET /migration/status` (erweitert) | `migration.read` | `migration.api` | `systems[].migratedToday`, `trends` |
| `GET /migration/search?q=` — `searchMigration` | `migration.read` | `migration.api` | Konten und Ereignisse des eigenen Mandanten |
| `GET /tenancy/overview` — `getPassOverview` | `tenancy.admin` | `tenancy.api` | Kennzahlen und offene Einladungen der Pass-Verwaltung |
| `GET /contracts/{id}/consumption` — `getConsumptionHistory` | `readings.read` | `domains.consumptionApi` | Monatswerte, Kennzahlen, Fälligkeit, Plausibilität |

**Kosten:** keine neuen Bausteine; vier Routen im bestehenden HTTP API. Der
Tageszähler der API-Aufrufe steckt im bestehenden Update des
Kontingent-Wächters, der Einladungs-Index ist ein zweiter Schreibvorgang nur
beim Anlegen und Einlösen einer Einladung. DynamoDB bleibt bei 5/5.

### Gefakte Elemente

Einheitlicher Marker: Baustein `FakeMarker` in `packages/ui` — kleines
Abzeichen „Demo-Wert“ mit Tooltip „simuliert — noch nicht aus dem System“,
maschinenlesbar per `data-fake="true"`, für Screenreader beschriftet.

| Element | Wo | Grund | Was für eine echte Umsetzung fehlt |
|---|---|---|---|
| Datenvolumen (verbraucht) | Übersicht (Mobilfunk-Karte), Verbrauch (Reiter Mobilfunk) | Es gibt kein Mobilfunknetz; das API rechnet ein Demo-Modell (`demoUsage`: 40 % am Monatsanfang, 100 % am Monatsende) | Nutzungsdaten aus einem Netz-/Abrechnungssystem (CDR-Import) |
| „1 GB nachbuchen“ | Verbrauch (Reiter Mobilfunk) | keine Buchung von Zusatzvolumen im Vertragsdienst | Operation „Zusatzoption buchen“ im Vertragsdienst samt Abrechnung |
