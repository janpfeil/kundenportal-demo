# kundenportal-demo — Konzept für ein AWS-Fullstack-Referenzprojekt

Stand: 2026-09-30 · Phase 1 (Fundament und Durchstich) abgeschlossen: live unter https://kundenportal-demo.rypox.com, Release v0.1.0

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
  Ablauf nach 7 Tagen und Bot-Prüfung schützen vor Missbrauch. Details in
  [Demo-Pass](demo-pass.md).

## Nächste Schritte nach der Entscheidung

1. Fachkonzept: Personas, Journeys, Domänen-Events, Datenmodell (Single Table).
2. Repository-Struktur (Monorepo: `apps/`, `packages/ui`, `services/`, `infra/cdk`, `infra/terraform`).
3. Fundament per Terraform (GitLab CI, State im GitLab-managed Terraform State — kein State-Bucket):
   OIDC-Vertrauensstellungen für GitHub Actions und GitLab CI, Budget mit
   SNS-Grundlage für den Kill-Switch, SSM-Grundwerte.
4. Durchstich: Login über Cognito → geschützter API-Call → Event → SNS-Mail,
   deployt per GitHub Actions (CDK inklusive Cognito User Pool).
5. Ab Phase 3: Anbindung der Altsysteme — Migrate-User-Trigger gegen Keycloak
   (Telko) und die REST-Schnittstelle des Versorger-Altsystems; Keycloak-Konfiguration
   per Terraform.

Für den Durchstich (Phase 1) beschreiben die [Anleitung Fundament](anleitung-fundament.md)
(Kapitel 4–5) und die [Anleitung Anwendung](anleitung-anwendung.md)
(Kapitel 6–10) alle Handgriffe des Kontoinhabers; den gebauten Stand zeigt
[Architektur Phase 1](architektur.md).

## Offene Folgefragen aus Entscheidung Nr. 10

- **Bulk-Import mit Passwort-Hashes:** Cognito kann inzwischen bcrypt-Hashes
  per CSV übernehmen, aber nicht in jedem User Pool
  ([Machbarkeit & Kosten](machbarkeit-kosten.md) §2). Offen: Versorger-Inaktive
  mit Hash übernehmen statt Reset, falls der User Pool das anbietet? Das
  Telko-Verfahren wird nicht unterstützt, dort bleibt der Reset.
- **DynamoDB provisioned 5 RCU/5 WCU je Tabelle:** Die 25 kostenlosen
  Einheiten reichen ohne Guthaben nur für die Plattform-Tabelle und wenige
  Mandanten-Tabellen gleichzeitig ([Demo-Pass](demo-pass.md) §5). Offen:
  Obergrenze gleichzeitiger Mandanten.
