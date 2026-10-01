# kundenportal-demo — Konzept für ein AWS-Fullstack-Referenzprojekt

Stand: 2026-10-01 · Phase 1 (Fundament und Durchstich) abgeschlossen: live unter https://kundenportal-demo.rypox.com, Release v0.1.0 · Phase 2 (Zonen und Component Library) abgeschlossen, Release v0.2.0; Storybook: https://janpfeil.github.io/kundenportal-demo/storybook/ · Phase 3 (Altsysteme und Migration) abgeschlossen, Release v0.3.0 · Phase 4 (Mandanten und Demo-Pass) abgeschlossen, Release v0.4.4 (zuvor v0.4.0–v0.4.3) · Phase 5 (Design und Theme) abgeschlossen, Release v0.5.0 · Phase 6 (Oberflächen wie im Mockup) abgeschlossen, Release v0.6.0

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

Ziel ist ein öffentliches Referenzprojekt für die Modernisierung von
Kundenportalen mit Übernahme bestehender Kundenkonten (AWS Serverless,
TypeScript, React/Next.js, Micro-Frontends, OAuth2/OIDC, CDK und
Terraform). Alle eingesetzten Techniken sollen eine echte Aufgabe im System
haben. Die Muster (Login per OIDC, Lazy Migration, Bulk-Import)
funktionieren mit jedem Standard-OIDC-Anbieter; das Demo nutzt
**Amazon Cognito** und einen selbst betriebenen **Keycloak** als
Anmeldung des Telko-Altsystems (Entscheidung Nr. 10), Auth0 wäre
austauschbar.

```chart
{"type": "stats", "items": [["18", "Bausteine eingeplant"], ["≈ 0 $", "AWS-Kosten: nur Freikontingent, Rest gedeckelt"], ["5", "Sparten: Strom, Gas, Wasser, Internet, Mobil"]]}
```

## Ergebnis Machbarkeit

- Alle Techniken lassen sich **ohne Fixkostentreiber** (VPC/NAT, ALB, RDS,
  Pay-as-you-go-WAF) einsetzen; Details in [Machbarkeit & Kosten](machbarkeit-kosten.md).
- **AWS-Konto:** am 29.09.2026 **neu angelegt** im **Free Plan** mit 100 $
  Guthaben (gültig bis 29.09.2027), Root-MFA aktiv. Der Free Plan endet
  spätestens ca. 29.03.2027; danach Paid Plan mit Restguthaben oder Always
  Free + Deckel.
- **Keine AWS-Kosten (Vorgabe):** bis auf API Gateway, EventBridge-Events und
  S3 ist alles dauerhaft kostenlos; diese drei kosten bei Demo-Traffic
  Bruchteile eines Cents und werden gedeckelt oder nur auf Abruf betrieben.
  Details in [Kostenfreier Betrieb](kostenfrei.md).
- Kostenschutz in Schichten: Budgets als Alarm, harte Grenzen über Reserved
  Concurrency, API-Throttling und provisionierte DynamoDB, dazu ein
  Kill-Switch und ein Teardown-Workflow.
- Amazon Cognito (Plan Essentials: 10.000 aktive Nutzer im Monat frei, ohne
  Ablauf) und GitHub Actions (öffentliches Repo) kosten nichts; Keycloak,
  Altsysteme, Terraform-State und GitLab-Pipeline laufen auf eigener
  Infrastruktur (Grundsatz „möglichst self-hosted").

## Themenwahl

- Bestehende Demos decken jeweils nur Ausschnitte ab (MFE ohne Auth,
  Auth0-Snippets ohne Portal, Event-Backends ohne Frontend); eine
  End-to-End-Demo mit **Account-Migration** wurde nicht gefunden.
- **Gewählt:** Kundenportal eines fiktiven **Multi-Sparten-Versorgers**
  (Strom, Gas, Wasser, Internet, Mobilfunk), der die Kunden eines
  übernommenen Internet-/Mobilfunkanbieters migriert — mit Migrations-Cockpit
  als Alleinstellungsmerkmal.
- Micro-Frontends als **Multi-Zones** statt Module Federation (Next.js-Plugin
  ohne App-Router-Unterstützung, Ende 2026 eingestellt); Details in
  [Next.js-Betrieb](nextjs-betrieb.md).

## Entscheidungen

| Nr. | Frage | Stand |
|---|---|---|
| 1 | Thema | **entschieden (29.09.2026):** Kundenportal eines Multi-Sparten-Versorgers mit Übernahme eines Internet-/Mobilfunkanbieters |
| 2 | Markenname | **entfällt:** Demo mit neutralem Arbeitstitel „Kundenportal" |
| 3 | GitHub | **entschieden:** öffentliches Repository unter https://github.com/janpfeil |
| 4 | AWS-Konto | **erledigt (29.09.2026):** neues Konto im **Free Plan** angelegt (altes Konto von 2021 wird nicht weiter verfolgt); 100 $ Guthaben bis 29.09.2027, Root-MFA aktiv; Free Plan endet spätestens ca. 29.03.2027 — [Anleitung Kontoinhaber](anleitung-kontoinhaber.md) Kapitel 1–2 |
| 5 | Next.js-Betrieb | **entschieden:** SSR per Standalone-Build + Lambda Web Adapter, ohne OpenNext ([Next.js-Betrieb](nextjs-betrieb.md)) |
| 6 | Domain | **entschieden:** `kundenportal-demo.rypox.com` |
| 7 | Kosten / Zugang | **entschieden:** eigene Instanz je Besucher über **Einladungslinks** und Inhaber-Zugang; Mandanten im **Bridge-Modell** (entschieden); **keine Bezahlung** vorerst — [Demo-Pass](demo-pass.md) |
| 8 | Pipelines | **entschieden:** kein GitLab-Token in GitHub; Anwendung per GitHub Actions; Terraform-Code öffentlich auf GitHub, deployt von GitLab CI (klont ohne Token); Altsysteme privat in GitLab, deployt auf den eigenen Server — [Kostenfreier Betrieb](kostenfrei.md) §3.1 |
| 9 | Dokumentation | **Vorgabe:** jede AWS-Handlung des Kontoinhabers Schritt für Schritt, ohne Vorkenntnisse nachvollziehbar → [Anleitung Kontoinhaber](anleitung-kontoinhaber.md) |
| 10 | Identitätsdienst | **entschieden (29.09.2026):** Portal-Login über **Amazon Cognito** (User Pool, Plan Essentials, Managed Login mit Cognito-Präfix-Domain); die Shell meldet serverseitig per `openid-client` an (Authorization Code + PKCE, BFF). Der eigene **Keycloak** unter `id.rypox.net` ist die Anmeldung des Telko-Altsystems; ab Phase 3 übernimmt Cognito Altkunden per **Migrate-User-Trigger** (Lazy Migration). **Auth0 wird nicht verwendet**, bleibt über Standard-OIDC austauschbar. Cognito entsteht per CDK, das Fundament (OIDC-Rollen, Budget, SSM) per Terraform — [Machbarkeit & Kosten](machbarkeit-kosten.md) §1 |

## Ergebnis Demo-Pass

- Eigene Instanz je Besucher ist machbar und kostet im Leerlauf nichts;
  empfohlen als **Mandant im Bridge-Modell** (geteilte Lambdas, eigene
  Tabelle, eigene Ereignis-Regeln, eigener Altsystem-Datenstand; Start in
  Sekunden).
- Zugang über **Einladungslinks** und den Inhaber-Zugang; Kontingent,
  Ablauf nach 48 Stunden (ab der ersten Anmeldung, Erinnerung nach 24
  Stunden ohne Anmeldung) und Bot-Prüfung schützen vor Missbrauch. Details in
  [Demo-Pass](demo-pass.md).
- **Gebaut in Phase 4 (v0.4.0):** Ein eingelöster Link ergibt in ≈ 10 s
  einen eigenen Mandanten; nach Ablauf baut das System ihn in ≈ 10 s
  vollständig zurück ([Mandanten & Demo-Pass](architektur-mandanten.md)).

## Roadmap

Jede Phase endet mit einem lauffähigen, deployten Stand.

| Phase | Inhalt | Stand |
|---|---|---|
| **1 – Fundament und Durchstich** | Monorepo, CI/CD, Fundament per Terraform (OIDC-Vertrauensstellungen, Budget), Identität mit Amazon Cognito, Shell-Zone mit Login (Deutsch/Englisch), Services `customer` und `notification`, Ereignisfluss über EventBridge und SQS, unbeaufsichtigter Auf- und Abbau | **abgeschlossen (30.09.2026)** — Release v0.1.0, live unter https://kundenportal-demo.rypox.com; Aufbau in [Architektur](architektur.md) |
| **2 – Zonen und Component Library** | Zonen „Verträge & Rechnungen" und „Verbrauch", Laufzeit-Widget „Glocke", Component Library mit Storybook, Uploads (S3) | **abgeschlossen (30.09.2026)** — Release v0.2.0: Zonen `/vertraege` (Verträge, Abschlag ändern, Dokumente mit Upload) und `/verbrauch` (Zählerstände, Zählerfoto, Datenvolumen), Schreibweg aus dem Browser, Services `contract`, `consumption`, `documents` mit Ereignissen und täglichem Zeitplan, Glocke `<kp-bell>`, Component Library mit [Storybook](https://janpfeil.github.io/kundenportal-demo/storybook/); live per E2E geprüft. Aufbau in [Architektur](architektur.md) und [Zonen & Frontend](architektur-zonen.md) |
| **3 – Altsysteme und Migration** | zwei simulierte Altsysteme auf eigenem Server, Telko-Anmeldung über den eigenen Keycloak, Lazy Migration per Cognito-Migrate-User-Trigger, Bulk-Import, Dublettenerkennung, Migrations-Cockpit | **abgeschlossen (30.09.2026)** — Release v0.3.0, live per E2E geprüft (J2 für beide Altsysteme, J3, J7 mit Redrive, J8): Altsysteme `legacy-versorger` und `legacy-telko` (privat, OpenAPI öffentlich), Migrate-User- und Post-Authentication-Trigger, Service `migration` (Bulk-Import mit DLQ und Redrive, Dubletten, Account-Linking, Demo-Reset), Zone `/cockpit`, Keycloak-Realm `telko` per automatischem Import im Deploy des Telko-Altsystems ([Anleitung Altsysteme](anleitung-altsysteme.md)); Aufbau in [Altsysteme & Migration](architektur-migration.md) |
| **4 – Mandanten und Demo-Pass** | Einladungslinks, eigener Mandant je Besucher im Bridge-Modell, Kontingente, automatischer Ablauf ([Demo-Pass](demo-pass.md)) | **abgeschlossen (30.09.2026)** — Release v0.4.0, Nacharbeiten v0.4.1 (atomare Obergrenze, Upload-Kontingent, Cockpit-Einstellungen, Inhaber-Hinweise, Aufräumen beim Demo-Reset, CSP, cachebare Startseite, Pausenseite, Version und Cockpit-Link in der Kopfzeile), live per E2E geprüft (25/25; v0.4.0: 23/23, J2/J3/J4/J6 im Pass-Mandanten, Ablauf und Löschung): Service `tenancy` (Einladungen, Einlösen mit ALTCHA, Einrichtung in ≈ 10 s, Ablauf per Einmal-Zeitplan, täglicher Abgleich, Kill-Switch), eigene Tabelle je Mandant mit Token Vending, Kontingent-Wächter im Router, Demo-Personen per Plus-Adresse, Altsystem-Datenstand je Mandant, Seiten `/pass/einloesen` und `/pass` in der Shell, Pass-Verwaltung unter `/cockpit/paesse`, Aufräumen beim Vollabbau per Custom Resource; Aufbau in [Mandanten & Demo-Pass](architektur-mandanten.md) |
| **5 – Design und Theme** | Gestaltung für zwei Zielgruppen: Endkunden (Shell, Verträge, Verbrauch, Postfach, Demo-Pass) und Power-User im Cockpit; Varianten als interaktive Mockups mit Werkzeugleiste (Hell/Dunkel, Akzent, Schrift, Dichte, Navigation), Entscheidung des Inhabers, Umsetzung in den Design-Tokens von `packages/ui` | **abgeschlossen (01.10.2026)** — Release v0.5.0: Endkunde „Klar“, Cockpit „Dicht“ als Standard, sieben Presets je Hell/Dunkel, umschaltbar im Benutzermenü; [Design und Theme](design.md) |
| **6 – Oberflächen wie im Mockup** | Migrations-Cockpit, Demo-Pässe und Endkunden-Ansichten in Aufbau, Bausteinen und Inhalten wie im [Mockup](https://janpfeil.github.io/kundenportal-demo/design/mockups.html): Kennzahlen-Kacheln, Fortschrittsringe, Diagramme, Sparklines, Timeline, Suche und Tastenkürzel; fehlende Daten als neue API-Operationen, Nicht-Umsetzbares als markierter Demo-Wert | **abgeschlossen (01.10.2026)** — Release v0.6.0: drei neue API-Operationen (Migrationssuche, Pass-Übersicht, Verbrauchshistorie) und erweiterte Cockpit-Kennzahlen, Bausteine in `packages/ui`, alle Endkunden- und Cockpit-Seiten nach dem Mockup, Suche und Tastenkürzel im Cockpit; zwei markierte Demo-Werte; live per E2E geprüft (29/29) und per Screenshot-Lauf in allen Presets; Lückenanalyse, Fake-Liste und Abweichungen in [Design und Theme](design.md), Seiten in [Zonen & Frontend](architektur-zonen.md) |
| 7 – Betreiber-Cockpit, Produkte und Verträge | Das Cockpit wird zum Arbeitsplatz des Betreibers: Kunden- und Vertragslisten mit Filtern und Detail, Steuerung der Verträge (Produktwechsel, Preisversion, Kündigung), Produktkatalog mit Preisversionen und Freigabe; Kunden wählen Produkte, schließen Verträge ab und verwalten sie bis zur Kündigung (mit Widerruf) | geplant — Auftrag des Inhabers vom 01.10.2026 |
| 8 – Feinschliff | 5-Minuten-Demo, Video, Messungen, Abschluss der Dokumentation | geplant |

Die Component Library ist mit Storybook öffentlich einsehbar:
https://janpfeil.github.io/kundenportal-demo/storybook/ (veröffentlicht
zusammen mit diesen Berichten über GitHub Pages).

Alle Handgriffe des Kontoinhabers für Phase 1 beschreiben die
[Anleitung Fundament](anleitung-fundament.md) (Kapitel 4–5) und die
[Anleitung Anwendung](anleitung-anwendung.md) (Kapitel 6–10).

## Offene Folgefragen aus Entscheidung Nr. 10

- **Bulk-Import mit Passwort-Hashes:** Cognito kann inzwischen bcrypt-Hashes
  per CSV übernehmen, aber nicht in jedem User Pool
  ([Machbarkeit & Kosten](machbarkeit-kosten.md) §2). Stand Phase 3: Der
  Bulk-Import setzt für beide Altsysteme auf die Reset-Aufforderung; ein
  CSV-Importauftrag bräuchte eine eigene IAM-Rolle, eine Datei über S3 und
  einen asynchronen Auftrag je Lauf
  ([Altsysteme & Migration](architektur-migration.md) §2). Offen bleibt, ob
  Versorger-Inaktive später mit Hash übernommen werden sollen. Das
  Telko-Verfahren (geheimer Pepper) ist grundsätzlich nicht übertragbar.
- **DynamoDB provisioned 5 RCU/5 WCU je Tabelle:** Die 25 kostenlosen
  Einheiten reichen ohne Guthaben nur für die Plattform-Tabelle und wenige
  Mandanten-Tabellen gleichzeitig ([Demo-Pass](demo-pass.md) §5).
  **Beantwortet (30.09.2026):** höchstens **3** gleichzeitige
  Pass-Mandanten (Base 5 + 3 × 5 = 20 von 25 Einheiten), änderbar in den
  Plattform-Einstellungen ([Mandanten & Demo-Pass](architektur-mandanten.md) §6).
