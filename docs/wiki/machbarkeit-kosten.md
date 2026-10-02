# Machbarkeit & Kosten — Kundenportal-Demo

Stand: 2026-09-29 · Kennzeichnung: **[B]** belegt (offizielle Quelle), **[D]** Drittquelle, **[A]** Annahme/Schätzung

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

## 1. Anforderung → Umsetzung im Demo

Jede eingesetzte Technik soll eine **echte Aufgabe** im System
haben, nicht nur „auch mal verwendet" sein.

| Technik | Rolle im Demo |
|---|---|
| TypeScript | durchgängig: Frontend, Lambdas, CDK, gemeinsame Typen/Schemas im Monorepo |
| React / Next.js | Shell-App (App Router) mit Registrierung, Onboarding, LoggedIn-Bereich |
| Micro-Frontends | fachliche Bereiche (Verträge & Rechnungen, Zählerstände, Migrations-Cockpit) als eigenständig gebaute & deployte Next.js-Apps (Multi-Zones) plus ein Laufzeit-Widget; Details in [Next.js-Betrieb](nextjs-betrieb.md) |
| Component Library | eigenes Paket (`packages/ui`), Storybook als statische Seite auf GitHub Pages, von allen Zonen genutzt |
| REST APIs | API Gateway + Lambda, OpenAPI-Spezifikation als Vertrag, generierter TS-Client |
| Identität / OAuth2 | **Amazon Cognito** User Pool (Plan Essentials) mit Managed Login auf Cognito-Präfix-Domain; Shell meldet per Authorization Code + PKCE als vertraulicher App-Client an, serverseitig mit `openid-client` (BFF); JWT-Authorizer am API Gateway; Lambda-Trigger für Onboarding-Status. Die Muster funktionieren mit jedem Standard-OIDC-Anbieter; das Demo nutzt Cognito, Auth0 oder Keycloak wären austauschbar, der Code bindet sich an keinen Anbieter [E] |
| Account-Migration | ab Phase 3: Cognito-**Migrate-User-Trigger** (Lazy Migration) gegen zwei simulierte Altsysteme auf eigener Infrastruktur — Telko über den eigenen Keycloak (`id.rypox.net`), Versorger über dessen REST-Schnittstelle — **plus** Bulk-Import der Inaktiven (Passwörter nicht übernehmbar → Reset) |
| Lambda | REST-Handler, Event-Konsumenten, Migrations-Endpunkt |
| DynamoDB | Single-Table-Design für Kundenprofil, Onboarding-Status, Domänendaten; DynamoDB Streams → Events |
| API Gateway | HTTP API mit JWT-Authorizer und Throttling (günstiger als REST API, siehe 3.2) |
| S3 | statische Assets der MFEs, Dokument-Uploads per Presigned URL |
| CloudFront | ein Einstiegspunkt: Next.js-Zonen, statische Dateien, `/api/*` → API Gateway |
| EventBridge | Domänen-Events (`CustomerRegistered`, `AccountMigrated`, `OnboardingCompleted`) |
| SQS | entkoppelte Konsumenten mit DLQ und Retry (z. B. Willkommens-Workflow) |
| SNS | Fan-out für Benachrichtigungen (E-Mail-Topic, In-App-Feed) |
| CDK | Anwendungs-Stacks (Lambdas, API, Tabellen, Events) **inklusive Cognito User Pool** — dort, wo Code und Infrastruktur eng gekoppelt sind (Cognito-Trigger sind Anwendungscode) |
| Terraform | Fundament-Schicht: OIDC-Vertrauensstellungen (GitHub Actions, GitLab CI), Budget + SNS-Grundlage des Kill-Switch, SSM-Grundwerte; ab Phase 3 die Zugangsdaten der Altsysteme als SSM-Parameter (den Keycloak-Realm der Telko importiert das Deploy des Telko-Altsystems per `kcadm.sh`); State im GitLab-managed Terraform State |
| GitHub Actions | CI (Lint, Test, Build, Storybook), CD per OIDC ohne Access Keys, Preview/Teardown-Workflow |

**CDK und Terraform gemeinsam** ist in vielen Unternehmen Realität und im Demo
begründbar: Terraform verwaltet das, was *unter* bzw. *neben* der Anwendung
liegt (Konto-Guardrails, CI-Vertrauensstellungen, später den selbst
betriebenen Keycloak), CDK die Anwendung selbst einschließlich Cognito,
weil dessen Lambda-Trigger Anwendungscode sind. Die Grenze wird über
SSM-Parameter übergeben (Terraform schreibt, CDK liest). Grundsatz
„möglichst self-hosted": Was nicht AWS-Kern der Demo ist (Keycloak,
Altsysteme, Terraform-State, GitLab-Pipeline), läuft auf eigener
Infrastruktur.

## 2. Architekturskizze

Datenfluss von links nach rechts; alle Bausteine nutzungsbasiert, ohne VPC.

```chart
{"type": "flow", "title": "Zielarchitektur Consumer-Portal-Demo", "gap": 56,
 "layers": [
  {"title": "Nutzer & Identität", "nodes": [["Browser", "Shell + Micro-Frontends"], ["Cognito", "User Pool, Managed Login", "cognito"], ["Altsysteme (eigener Server)", "Versorger-REST, Telko per Keycloak"]]},
  {"title": "Edge", "accent": true, "nodes": [["CloudFront", "ein Einstiegspunkt, CloudFront Functions", "cloudfront"], ["identity-Lambda", "Cognito-Trigger, Migrate User", "lambda"], ["Migrations-Lambda", "Bulk-Import, Abgleich, Dubletten", "lambda"]]},
  {"title": "Anwendung", "nodes": [["Next.js-Shell (SSR-Lambda)", "Standalone-Server + Lambda Web Adapter, Assets auf S3", "lambda"], ["S3", "statische Zonen, Uploads, CDK-Artefakte", "s3"], ["API Gateway (HTTP API)", "JWT-Authorizer, Throttling", "apigateway"]]},
  {"title": "Services & Daten", "accent": true, "nodes": [["Lambda (REST)", "OpenAPI-Vertrag", "lambda"], ["DynamoDB", "Single-Table, Streams", "dynamodb"], ["EventBridge", "Domänen-Events", "eventbridge"]]},
  {"title": "Konsumenten", "nodes": [["SQS + Lambda", "Workflows, DLQ, Redrive", "sqs"], ["SNS", "E-Mail, In-App-Feed, Kill-Switch", "sns"]]}
 ],
 "edges": [["Browser", "CloudFront"], ["Cognito", "identity-Lambda"], ["Altsysteme (eigener Server)", "identity-Lambda"], ["Altsysteme (eigener Server)", "Migrations-Lambda"], ["CloudFront", "Next.js-Shell (SSR-Lambda)"], ["CloudFront", "S3"], ["CloudFront", "API Gateway (HTTP API)"], ["API Gateway (HTTP API)", "Lambda (REST)"], ["Next.js-Shell (SSR-Lambda)", "Lambda (REST)"], ["DynamoDB", "SQS + Lambda"], ["EventBridge", "SQS + Lambda"], ["EventBridge", "SNS"]]}
```

Ablauf in Worten: Der Browser spricht nur mit CloudFront. CloudFront
verteilt nach Pfad auf die Next.js-Zonen (SSR-Lambda bzw. statisch aus S3) und
`/api/*` an das API Gateway, das Cognito-JWTs prüft. REST-Lambdas schreiben
in DynamoDB; Änderungen werden über DynamoDB Streams bzw. `PutEvents` zu
EventBridge-Domänen-Events (`CustomerRegistered`, `AccountMigrated`,
`OnboardingCompleted`). Regeln leiten sie an SQS-Queues (mit DLQ) und
SNS-Topics weiter. Ab Phase 3 ruft Cognito beim ersten Login eines
unbekannten Altkunden den **Migrate-User-Trigger** (`identity`-Lambda) auf;
dieser prüft Benutzername und Passwort beim Altsystem auf dem eigenen Server
— Telko-Kunden über den eigenen Keycloak unter `id.rypox.net`,
Versorger-Kunden über dessen REST-Schnittstelle „Anmeldung prüfen" — und
Cognito legt den Nutzer danach mit demselben Passwort selbst an (Lazy
Migration) [B: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html].
Die Migrations-Lambda übernimmt den Bulk-Import der Inaktiven (Cognito
`AdminCreateUser` bzw. CSV-Import; im Demo ohne Passwörter → Reset) und die
Dublettenauflösung. Importierte Nutzer zählen erst mit Anmeldung oder
Passwort-Reset als aktive Nutzer. Cognito kann inzwischen auch Hashes
(bcrypt, scrypt, Argon2id, PBKDF2-SHA256) per CSV übernehmen, aber noch nicht in
jedem User Pool [B: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html];
das Telko-Verfahren gehört nicht dazu. Auf eigener Infrastruktur laufen nur
Komponenten, die sonst Kosten verursachen würden oder fachlich ohnehin
„im eigenen Rechenzentrum" stehen — siehe [Kostenfreier Betrieb](kostenfrei.md).

Leitentscheidungen:

- **Kein VPC, kein NAT Gateway, kein ALB, kein RDS** — das sind die
  typischen Fixkostentreiber; alles bleibt nutzungsbasiert.
- **Next.js mit Server-Rendering in Lambda** (Standalone-Build +
  Lambda Web Adapter, statische Dateien aus S3) — echtes Next.js inkl.
  Server Components, `proxy.ts` und serverseitiger Session per
  `openid-client` (Tokens nur im Server, verschlüsseltes httpOnly-Cookie),
  ohne OpenNext als Zwischenschicht; Kosten
  bei Demo-Traffic ≈ 0 $. Vergleich der Wege in [Next.js-Betrieb](nextjs-betrieb.md).
- **Micro-Frontends als Multi-Zones** hinter derselben
  CloudFront-Distribution: je Zone eine Next.js-App unter eigenem Pfad
  (mit Login als SSR-Lambda, ohne Login als Static Export aus S3).
- **Teardown per Knopfdruck**: `cdk destroy` + `terraform destroy` als
  GitHub-Workflow; Tabellen/Buckets mit `RemovalPolicy.DESTROY` in der
  Demo-Stage.

## 3. Kosten

### 3.1 AWS-Kontomodell (seit 15.07.2025)

- Neue Konten wählen zwischen **Free Plan** und **Paid Plan**. Beide erhalten
  100 $ Startguthaben + bis zu 100 $ für Onboarding-Aufgaben; das Guthaben
  verfällt nach 12 Monaten [B].
- **Free Plan:** endet nach 6 Monaten oder aufgebrauchtem Guthaben — danach
  **schließt AWS das Konto automatisch** (90 Tage Datenfrist). Nur
  ausgewählte Services; Beitritt zu AWS Organizations erzwingt den Paid Plan [B].
- **Paid Plan:** alle Services, Guthaben wird zuerst verbraucht, Konto
  bleibt bestehen [B].
- Always-Free-Kontingente gelten in beiden Plänen [B]; Altkonten (vor
  15.07.2025) bleiben im alten 12-Monats-Modell [B].
- Unklar: Die CloudFront-Flat-Rate-Pläne schließen Konten aus, die
  „AWS Free Tier nutzen" — vermutlich ist der Free Plan gemeint [A].

**Registrierung:** kostenlos, aber **nicht ohne Nachweise**. AWS verlangt
für jedes Konto – auch im Free Plan – eine Kredit- oder Debitkarte
(Probebelastung 1 $, wird erstattet), Telefonverifikation per SMS/Anruf
sowie Kontakt- und Rechnungsadresse [B: https://aws.amazon.com/free/registration-faqs/].
Ausweisdokumente werden bei der normalen Registrierung nicht verlangt; AWS
prüft aber Plausibilität (Adresse, Telefonland, Karte) und kann in
Einzelfällen nachfragen [E].

**Öffentliches GitHub-Projekt ≠ kostenloses AWS.** Ob der Code öffentlich
ist, spielt für die AWS-Abrechnung keine Rolle. Es gibt zwar ein Programm
„AWS Promotional Credits for Open Source Projects": Guthaben für ein Jahr,
Voraussetzung OSI-Lizenz und bestehendes Konto mit Zahlungsmittel, monatliche
Prüfung; bevorzugt werden Projekte mit Maintainern aus mehreren
Organisationen oder unter einer Stiftung, genutzt vor allem für CI, Tests
und Artefakt-Ablage [B: https://aws.amazon.com/blogs/opensource/aws-promotional-credits-open-source-projects/].
Ein Einzelpersonen-Demo erfüllt diese Präferenzen nicht; ein Antrag ist
möglich, aber wenig aussichtsreich und unnötig, weil Startguthaben und
Always Free die Demo ohnehin abdecken [E].

> **Erledigt (29.09.2026):** Das alte Konto wird nicht weiter verfolgt. Der
> Inhaber hat ein **neues Konto im Free Plan** angelegt: 100 $ Guthaben bis
> 29.09.2027, Root-MFA aktiv; der Free Plan endet spätestens ca. 29.03.2027.
> Die folgenden Absätze zum bestehenden Konto sind damit historisch.

**Bestehendes Konto (ursprünglich angenommener Fall):** Free Plan und das neue
Startguthaben gibt es **nur für neue Kunden bei der Registrierung**. Die
Bedingungen schließen ein zweites Konto zum Abgreifen der Angebote
ausdrücklich aus: „You will not be eligible for any Offers if you or your
entity create(s) more than one account." [B: https://aws.amazon.com/free/terms/]
Ein bestehendes Konto (vor dem 15.07.2025) läuft nach den alten
Bedingungen: die 12-Monats-Angebote sind abgelaufen, die **Always-Free-Kontingente
gelten weiter** [B]. Ob noch Guthaben vorhanden ist, zeigt die
Billing-Konsole unter „Credits".

**Frühere Empfehlung (überholt):** das **bestehende Konto** nutzen — kein zweites Konto
anlegen. Mit der Architektur aus 3.2 fallen ohne Guthaben ≈ 0,50–2 $ im
Monat an (3.5). Optional: per AWS Organizations ein eigenes Mitgliedskonto
nur für das Demo anlegen (Organizations selbst ist kostenlos; bringt
saubere Kostentrennung und vollständigen Rückbau, aber keine Freiangebote) [E].

Für Neukunden gälte stattdessen: neues Konto im Paid Plan (Guthaben bis 200 $, keine Zwangsschließung).
Das Guthaben (bis 200 $) deckt die Demo praktisch vollständig, es gibt
keine Zwangsschließung, und ein separates Konto lässt sich am Ende
restlos schließen. Budget-Alarm am ersten Tag (3.4).

### 3.2 Kosten je Service bei Demo-Traffic

| Service | Always Free | Demokosten/Monat | Fallen / Entscheidung |
|---|---|---|---|
| Lambda | 1 Mio. Requests + 400.000 GB-s [D] | 0 $ | **nicht in ein VPC** (sonst NAT Gateway ≈ 32 $/Monat [A]) |
| DynamoDB | 25 GB + 25 RCU/WCU, **nur provisioned** [B] | 0 $ | On-Demand fällt nicht darunter [B] → **provisioned 5 RCU/5 WCU je Tabelle** (Entscheidung 29.09.2026), ohne Auto-Scaling; zusammen höchstens 25 Einheiten |
| Cognito (Essentials) | 10.000 aktive Nutzer (MAU) im Monat, **läuft nicht ab**, auch für bestehende Konten [B: https://aws.amazon.com/cognito/pricing/] | 0 $ | darüber 0,015 $ je MAU [B]; Essentials ist Standard für neue User Pools [B]; kein SMS-Versand (nur E-Mail) |
| API Gateway | nur 12 Monate bzw. über Guthaben [B] | < 0,10 $ | **HTTP API** (≈ 1 $/Mio.) statt REST API (≈ 3,50 $/Mio.) [B/D] |
| S3 | über Guthaben [B] | < 0,10 $ | Lifecycle-Regel für alte Build-Artefakte |
| CloudFront (Pay-as-you-go) | 1 TB, 10 Mio. Requests, 2 Mio. Functions — always free [D] | 0 $ | **kein Lambda@Edge** (immer kostenpflichtig [B]) → CloudFront Functions |
| CloudFront Flat-Rate Free (seit 11/2025) | 1 Distribution, 1 Mio. Req., 100 GB, WAF (5 Regeln), Route-53-Zone, ACM, 5 GB S3 [B] | 0 $ | nur **5 Cache-Behaviors**, WAF-Pflicht, OAC statt OAI; bei Überschreitung Drosselung statt Rechnung [B] |
| EventBridge | kein allgemeines Kontingent; Scheduler 14 Mio. frei [B] | ≈ 0 $ (1 $/Mio. Custom Events) | Archive/Replay und Pipes kosten extra [A] |
| SQS | 1 Mio. Requests [D] | 0 $ | Lambda-Poller erzeugen Leer-Requests, bleibt < 1 Mio. [A] |
| SNS | 1 Mio. Publishes [D] | 0 $ | **kein SMS-Versand**, nur E-Mail/In-App |
| CloudWatch | 10 Metriken/Alarme, Logs ≈ 5 GB [D] | 0–0,50 $ | Log-Retention auf 3–7 Tage setzen |
| SSM Parameter Store | Standard kostenlos [A] | 0 $ | statt Secrets Manager (0,40 $/Secret [B]) |
| KMS | 20.000 Requests [D] | 0 $ | AWS-verwaltete Schlüssel statt eigener (1 $/Monat [A]) |
| Route 53 | nur über Flat-Rate-Plan [B] | 0–0,50 $ + Domain ≈ 1 $ | alternativ Subdomain einer bestehenden Domain |
| WAF (Pay-as-you-go) | — | ab ≈ 6 $ [A] | **weglassen**, außer über den Flat-Rate-Free-Plan |

### 3.3 Nicht-AWS-Bausteine

| Baustein | Kosten | Grenzen |
|---|---|---|
| Keycloak (eigener Server, `id.rypox.net`) | 0 $ (self-hosted) | Anmeldung des Telko-Altsystems; ab Phase 3 Gegenstelle des Migrate-User-Triggers; Konfiguration per Terraform |
| GitHub Actions [B] | 0 $ in öffentlichen Repos | Deploy nur per OIDC-Rolle, nie für Fork-PRs; Environment mit Reviewer |
| Terraform-State | 0 $ | GitLab-managed Terraform State auf gitlab.rypox.org (Vorgabe „keine AWS-Kosten"); Alternative S3-Backend mit `use_lockfile = true` kostet Cent-Beträge [B] |
| CDK Bootstrap [A] | Cent-Beträge | Bootstrap-Stack bleibt nach `cdk destroy` stehen — separat entfernen |

### 3.4 Kostenschutz für eine öffentliche Demo

Budgets sind **kein harter Stopp** (Abrechnungsdaten kommen Stunden
verzögert [A]). Deshalb Schutz in Schichten:

1. **AWS Budgets** (kostenlos [B]): Alarm bei 1 $, 5 $, 10 $.
2. **Harte technische Grenzen:** Reserved Concurrency 2–5 je Lambda,
   API-Throttling (z. B. 10 req/s, Burst 20), DynamoDB provisioned ≤ 25
   Einheiten, SQS mit DLQ und `maxReceiveCount`.
3. **Schreibende Endpunkte nur mit Cognito-JWT** (JWT-Authorizer der HTTP API).
4. **Kill-Switch:** Budget-Alarm → SNS → Lambda setzt Concurrency/Throttling
   auf 0 — gleichzeitig ein schönes SNS-Beispiel im Demo.
5. **Teardown-Workflow** in GitHub Actions: `cdk destroy --all`,
   `terraform destroy`, danach Prüfung im Resource Explorer.

### 3.5 Gesamtschätzung

Vorgabe seit 29.09.2026: **keine AWS-Kosten** — Umsetzung und Restrisiko in
[Kostenfreier Betrieb](kostenfrei.md).

| Szenario | Monatskosten |
|---|---|
| **Neues Konto im Free Plan** (Fall des Nutzers seit 29.09.2026) | **garantiert 0 $** bis Ende des Free Plans (spätestens ca. 29.03.2027) [B] |
| danach Paid Plan mit Restguthaben (bis 29.09.2027) | **effektiv 0 $**, solange das Guthaben reicht [A] |
| Ohne Guthaben, Architektur wie oben | **≈ 0,50–2 $** + Domain ≈ 1 $ [A] |
| Mit einem der Kostentreiber (NAT, ALB, RDS, Pay-as-you-go-WAF) | 30–100 $ [A] |

**Fazit Machbarkeit:** Alle geforderten Techniken lassen sich ohne
Fixkostentreiber einsetzen. Der Betrieb als Demo über mehrere Monate ist
praktisch kostenlos; das Hauptrisiko sind vergessene Ressourcen und
Missbrauch, beides durch 3.4 abgedeckt.

## 4. Offene technische Entscheidungen

| Frage | Empfehlung | Begründung |
|---|---|---|
| Next.js-Betrieb | **SSR in Lambda per Standalone-Build + Lambda Web Adapter** für Zonen mit Login, Static Export für Zonen ohne Login | weniger Fremdabhängigkeit als OpenNext; Vergleich in [Next.js-Betrieb](nextjs-betrieb.md) |
| Micro-Frontend-Technik | **Multi-Zones** + ein Laufzeit-Widget | das Next.js-Plugin für Module Federation unterstützt den App Router nicht und läuft Ende 2026 aus [B: https://github.com/module-federation/core/issues/3153] |
| CloudFront-Plan | Pay-as-you-go (always free) | der Flat-Rate-Free-Plan ist attraktiv (WAF, Route 53 inklusive), aber die 5-Behavior-Grenze und die unklare Berechtigung sind Risiken; kann später gewechselt werden |
| Region | `eu-central-1` (Frankfurt) | DSGVO-Signal für deutsche Kunden; Mehrkosten bei Demo-Traffic vernachlässigbar |
| Domain | Subdomain von `rypox.com`, z. B. `kundenportal-demo.rypox.com` | rypox.com ist die öffentliche Firmendomain, rypox.org trägt interne Werkzeuge; DNS liegt auf eigenen Nameservern → nur CNAME-Einträge nötig, keine Route-53-Zone [E] |

Behavior-Budget (falls Flat-Rate-Plan, max. 5): Default (SSR-Lambda),
`/_next/static/*`, `/api/*` und je Zone ein Pfad — bei
mehreren SSR-Zonen reicht das nicht → Pay-as-you-go-CloudFront (always free) wählen [E].

## 5. Quellen

- AWS Free Tier Pläne: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html · https://aws.amazon.com/free/ · https://aws.amazon.com/free/terms
- Kontoablauf: https://repost.aws/knowledge-center/aws-free-tier-account-start-expire
- CloudFront Flat-Rate: https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html · https://aws.amazon.com/about-aws/whats-new/2025/11/aws-flat-rate-pricing-plans
- Preisseiten: https://aws.amazon.com/cloudfront/pricing/ · https://aws.amazon.com/api-gateway/pricing/ · https://aws.amazon.com/dynamodb/pricing/ · https://aws.amazon.com/s3/pricing/ · https://aws.amazon.com/eventbridge/pricing/ · https://aws.amazon.com/secrets-manager/pricing/ · https://aws.amazon.com/lambda/pricing/ · https://aws.amazon.com/amplify/pricing/ · https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/
- Drittquellen [D]: https://infratally.com/articles/aws-free-tier-2026.html · https://perfsys.com/blog/cloudfront-pricing-guide/ · https://scalr.com/learning-center/hcp-terraform-free-tier-is-being-discontinued-what-you-need-to-know
- OpenNext: https://opennext.js.org/aws
- Amazon Cognito: Preise https://aws.amazon.com/cognito/pricing/ · Migrate User Trigger https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html · Managed Login https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html (alle abgerufen 29.09.2026)
- Terraform S3-Backend: https://developer.hashicorp.com/terraform/language/backend/s3
- GitHub Actions: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- IAM OIDC: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html
- AWS-Registrierung: https://aws.amazon.com/free/registration-faqs/
- Free-Tier-Bedingungen (Neukunden, ein Konto): https://aws.amazon.com/free/terms/
- Open-Source-Credits: https://aws.amazon.com/blogs/opensource/aws-promotional-credits-open-source-projects/

**Nicht verifiziert:** exakte Always-Free-Werte für SNS, CloudWatch Logs,
KMS (nur Drittquellen); Preise für SSM Parameter Store, NAT Gateway, ALB,
WAF (nicht abgerufen, Erfahrungswerte); offizielle Liste der im Free Plan
gesperrten Services; Nutzbarkeit der Flat-Rate-Pläne im Free Plan.
