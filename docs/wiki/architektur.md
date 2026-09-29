# Architektur Phase 1 — der Durchstich

Stand: 2026-09-29 · Beschreibt den **Ist-Stand** des Codes (Branch `feature/cicd`), nicht die Zielarchitektur. Kennzeichnung: **[B]** belegt (offizielle Quelle), **[A]** Annahme, **[E]** Einschätzung.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

Die Zielarchitektur steht in [Machbarkeit & Kosten](machbarkeit-kosten.md);
diese Seite zeigt, was Phase 1 davon tatsächlich baut: Registrierung und
Anmeldung, ein geschütztes Profil, ein Domänen-Ereignis und eine
Willkommensnachricht im Postfach. Wie der Kontoinhaber das Ganze aufbaut,
steht in der [Anleitung Fundament](anleitung-fundament.md) und der
[Anleitung Anwendung](anleitung-anwendung.md).

## 1. Überblick

```chart
{"type": "flow", "title": "Phase 1: Anfrage- und Ereignisfluss", "gap": 34,
 "layers": [
  {"title": "Nutzer", "nodes": [["Browser", "nur Cookies, keine Tokens"]]},
  {"title": "Rand", "accent": true, "nodes": [["CloudFront", "eine Domain, TLS-Zertifikat aus us-east-1"]]},
  {"title": "Einstieg", "nodes": [["Shell-Lambda", "Next.js standalone, Function URL mit OAC"], ["S3", "/_next/static/*"], ["API Gateway", "HTTP API /api/*, JWT, Scopes, 10/20"]]},
  {"title": "Dienste", "accent": true, "nodes": [["Cognito", "Managed Login, Pre-Token-Lambda"], ["customer", "GET/PATCH /me"], ["notification-API", "GET/PATCH /notifications"]]},
  {"title": "Ereignisse", "nodes": [["EventBridge → SQS", "Bus kundenportal, Regel, Queue + DLQ, Alarm"]]},
  {"title": "Wirkung", "accent": true, "nodes": [["notification-Konsument", "Postfach-Eintrag, Hinweis an den Inhaber"], ["DynamoDB", "eine Tabelle, provisioned 5/5"], ["SNS „Kundenportal“", "E-Mail an den Inhaber"]]}
 ],
 "edges": [["Browser", "CloudFront"], ["Browser", "Cognito"],
           ["CloudFront", "Shell-Lambda"], ["CloudFront", "S3"], ["CloudFront", "API Gateway"],
           ["Shell-Lambda", "Cognito"], ["Shell-Lambda", "API Gateway"],
           ["API Gateway", "customer"], ["API Gateway", "notification-API"],
           ["customer", "EventBridge → SQS"], ["customer", "DynamoDB"], ["notification-API", "DynamoDB"],
           ["EventBridge → SQS", "notification-Konsument"]]}
```

Ablauf in Worten: Der Browser spricht nur mit **CloudFront** unter
`kundenportal-demo.rypox.com`. CloudFront verteilt nach Pfad: `/_next/static/*`
aus einem privaten **S3**-Bucket, `/api/*` an das **API Gateway**, alles
andere an die **Shell** — den Next.js-Server in einer Lambda mit dem
[Lambda Web Adapter](glossar.md#lambda-web-adapter) und Response Streaming.
Die Shell leitet zur Anmeldung an **Cognito** (Managed Login) weiter und ruft
die API serverseitig mit dem Access Token auf. Der Dienst **customer** legt
beim ersten Aufruf von `GET /me` das Profil an und veröffentlicht
`CustomerRegistered` auf dem eigenen EventBridge-Bus. Eine Regel legt das
Ereignis in eine SQS-Queue; der **notification-Konsument** schreibt daraus eine
Willkommensnachricht ins Postfach (DynamoDB) und schickt dem Inhaber einen
Hinweis per SNS-E-Mail.

Zwei [CloudFormation](glossar.md#cloudformation)-Stacks, beide mit Tag
`project=kundenportal-demo`:

| Stack | Region | Inhalt |
|---|---|---|
| `KundenportalCertificate` | us-east-1 | ACM-Zertifikat für CloudFront (DNS-Validierung beim eigenen Nameserver) |
| `Kundenportal` | eu-central-1 | alles andere: Cognito, Tabelle, Bus, Queues, Alarm, fünf Lambdas, HTTP API, CloudFront, S3 |

Outputs des Stacks `Kundenportal`: `PortalUrl`, `DistributionDomain` (Ziel des
CNAME), `ApiUrl`, `UserPoolId`, `ManagedLoginUrl`, `EventBusName`,
`NotificationDlqUrl`.

## 2. Anmeldung

Die Shell ist ein [BFF](glossar.md#bff): Tokens verlassen den Server nie.

- **Bibliothek und Ablauf:** `openid-client` mit
  [Authorization Code + PKCE](glossar.md#authorization-code-pkce), `state`
  und `nonce`. Die Shell ist ein **vertraulicher Client** (mit Client-Secret);
  Anbieterdaten kommen aus der Standard-Discovery
  (`.well-known/openid-configuration`).
- **Client-Secret:** steht weder im Template noch in Umgebungsvariablen. Die
  Shell liest es einmal je Lambda-Instanz per `DescribeUserPoolClient` aus dem
  User Pool (die Lambda-Rolle darf genau das). Für andere Anbieter oder lokal
  genügt `OIDC_CLIENT_SECRET`.
- **Sitzung:** ein `httpOnly`-Cookie `kp_session` mit einem
  [JWE](glossar.md#jwe) (`dir` + `A256GCM`, Bibliothek `jose`). Der Schlüssel
  wird per [HKDF](glossar.md#hkdf)-SHA256 aus dem Client-Secret abgeleitet
  (eigener Zweck je Cookie: `session`, `login`). Folge: ein neues
  Client-Secret macht alle Sitzungen ungültig; ein zweites Geheimnis ist
  nicht nötig. Der Anmeldevorgang selbst (state, nonce, verifier) liegt zehn
  Minuten im Cookie `kp_login` und wird nach einmaligem Lesen gelöscht.
- **Kein Refresh-Token:** Es passt zusammen mit dem Access Token nicht in ein
  Cookie (Grenze etwa 4 KB). Nach einer Stunde läuft das Access Token ab; die
  Shell schickt den Nutzer erneut zu Cognito. Innerhalb einer Stunde nach der
  letzten interaktiven Anmeldung meldet die Cognito-Sitzung ihn ohne Passwort
  wieder an; danach ist eine neue Anmeldung nötig
  [B: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html].
- **Nur GET an die Shell:** CloudFront erreicht die
  [Function URL](glossar.md#function-url) der Shell über
  [OAC](glossar.md#oac); dabei werden Anfrage-Inhalte nicht mitsigniert.
  Deshalb erlaubt das Verhalten der Shell nur `GET`, `HEAD`, `OPTIONS`;
  die Shell kommt in Phase 1 mit GET-Routen aus (z. B. `/sprache` für den
  Sprachwechsel). Die schreibenden API-Operationen (`PATCH`) stehen im
  Vertrag, werden von der Shell aber noch nicht aufgerufen.
- **Abmelden:** Cookie löschen, dann Cognitos `/logout` mit `client_id` und
  `logout_uri` (Cognito hat keinen Standard-`end_session_endpoint`).

**Sprache der Anmeldeseiten:** Die Shell übergibt an `/oauth2/authorize`
`lang` (Cognito) und `ui_locales` (OIDC-Standard) mit `de` oder `en`. Laut
AWS-Dokumentation gilt [B, ebenda]:

- Managed Login ist standardmäßig englisch; der Parameter **`lang`** im
  Anmeldelink wählt die Sprache. Verfügbar sind u. a. `de` und `en` (außerdem
  es, fr, id, nl, it, ja, ko, pt-BR, zh-CN, zh-TW).
- Cognito merkt sich die Wahl in einem Cookie `lang`; sie gilt, bis der
  Nutzer Cookies löscht oder ein neuer `lang`-Wert kommt.
- Lokalisierung gibt es **nur für Managed Login** (nicht für die klassische
  Hosted UI) und nur mit Feature-Plan **Essentials** oder **Plus** und einem
  Managed-Login-Branding. Beides ist gesetzt (`FeaturePlan.ESSENTIALS`,
  `NEWER_MANAGED_LOGIN`, `CfnManagedLoginBranding`).
- `ui_locales` erwähnt die Cognito-Dokumentation nicht; es schadet nicht und
  hilft bei einem späteren Anbieterwechsel [A].
- Die Bestätigungs-E-Mails von Cognito sind davon **nicht** betroffen; sie
  kommen im Standardtext vom Absender `no-reply@verificationemail.com`.

## 3. Mandant im Token

Ein [Pre-Token-Generation-Trigger](glossar.md#pre-token-generation-trigger)
(Ereignisversion 2) ergänzt das **Access Token** um:

| Claim | Quelle |
|---|---|
| `tenant_id` | Attribut `custom:tenant_id` (unveränderlich, nur die Plattform setzt es); fehlt es, gilt in Phase 1 der Mandant `owner` |
| `email` | nur wenn `email_verified = true` |
| `locale` | Attribut `locale`, falls gesetzt |
| `name` | Attribut `name`, falls gesetzt |

Die Dienste lesen nur diese Claims und `sub` aus dem vom API Gateway bereits
geprüften Token (`packages/service-kit`). Sie kennen Cognito nicht; ein
anderer OIDC-Anbieter (z. B. Auth0 mit einer Action) muss nur dieselben Claims
ausstellen. Der Mandant kommt **nie** aus der URL.

## 4. Scopes aus dem API-Vertrag

Der OpenAPI-Vertrag (`packages/api-contract/openapi.yaml`) nennt je Operation
den nötigen Scope. Die CDK-App liest ihn und erzeugt daraus

- den [Resource Server](glossar.md#resource-server) `kundenportal` mit vier
  Scopes: `profile.read`, `profile.write`, `notifications.read`,
  `notifications.write`;
- je Route einen Eintrag im HTTP API mit
  [JWT-Authorizer](glossar.md#jwt-authorizer) (Aussteller = User Pool,
  Zielgruppe = Client-ID) und den verlangten Scopes.

Fehlt ein Scope, antwortet das API Gateway mit 403, bevor eine Lambda läuft.
Die Shell fordert `openid email profile` und alle vier API-Scopes an.

## 5. Daten

Eine DynamoDB-Tabelle (Schlüssel `PK`/`SK`, **provisioned 5/5**,
AWS-verwalteter Schlüssel). Jeder Schlüssel beginnt mit dem Mandanten:

| PK | SK | Besitzer | Inhalt |
|---|---|---|---|
| `TENANT#<t>#CUST#<customerId>` | `PROFILE` | customer | Profil (E-Mail, Anzeigename, Sprache, Herkunft) |
| `TENANT#<t>#SUBJ#<sub>` | `CUSTOMER` | customer | welche Kundennummer zu einer Anmelde-Identität gehört |
| `TENANT#<t>#SUBJ#<sub>` | `MAILBOX` | notification | eigene Projektion aus dem Ereignis: wessen Postfach eine Identität öffnet |
| `TENANT#<t>#CUST#<customerId>` | `NOTE#<id>` | notification | Postfach-Einträge; `<id>` = Zeitstempel + eventId |

Profil und Verknüpfung entstehen in **einer** Transaktion mit Bedingung; bei
zwei gleichzeitigen Erstaufrufen gewinnt einer, der andere liest dessen
Ergebnis. notification liest nie die Einträge von customer.

## 6. Ereignisse

- `customer` veröffentlicht `CustomerRegistered` (Quelle
  `kundenportal.customer`) auf dem Bus `kundenportal`; der Inhalt wird vorher
  gegen das Schema aus `packages/events` geprüft.
- Eine Regel leitet es an die Queue des notification-Dienstes (Sichtbarkeit
  60 s = 6 × Lambda-Timeout, 4 Tage Aufbewahrung). Was EventBridge selbst
  nicht zustellen kann, landet nach 8 Versuchen in derselben DLQ.
- **Idempotenz:** Die Postfach-ID enthält die `eventId`; ein zweites Mal
  zugestellte Ereignisse treffen auf denselben Eintrag (bedingtes Schreiben)
  und lösen keinen zweiten Inhaber-Hinweis aus.
- **[Partial Batch Response](glossar.md#partial-batch-response):** Stapel bis
  10 Nachrichten; nur fehlgeschlagene werden zurückgemeldet und erneut
  zugestellt.
- Nach **3** Zustellversuchen (`maxReceiveCount`) wandert eine Nachricht in
  die DLQ (14 Tage Aufbewahrung). Ein CloudWatch-Alarm `DlqNotEmpty`
  (5-Minuten-Fenster, Schwelle > 0) meldet das per SNS an den Inhaber. Der
  Workflow „DLQ probe" prüft genau diesen Weg (Anleitung Kapitel 8).

## 7. Leitplanken

| Leitplanke | Umsetzung |
|---|---|
| Laufzeit | Node.js 24, arm64, 256 MB (Shell 1024 MB) |
| Kostendeckel Lambda | [Reserved Concurrency](glossar.md#reserved-concurrency) je Funktion aus CDK-Kontext `reservedConcurrency` (Standard 2, `0` = nicht setzen); fünf Funktionen × 2 = 10 |
| Kostendeckel API | Throttling der Stage: 10 Anfragen/s, Spitze 20 |
| Kostendeckel Datenbank | provisioned 5/5 statt On-Demand |
| Logs | eigene Log-Gruppen mit 3 Tagen Aufbewahrung; Reste löscht der Teardown |
| Abbau | `RemovalPolicy.DESTROY` für Tabelle, User Pool, Bucket, Logs; `cdk destroy` hinterlässt nichts außer dem Bootstrap |
| Kennzeichnung | Tag `project=kundenportal-demo` auf allem (CDK und Terraform) |
| Bewusst weggelassen | kein VPC, kein NAT Gateway, kein ALB, kein RDS, keine WAF, kein Route 53, kein Secrets Manager |

Hinweis zur Reserved Concurrency: AWS lässt höchstens „nicht reservierte
Kontokapazität minus 100" reservieren
[B: https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html].
Neue Konten haben oft ein Limit von 10
[B: https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html];
dann ist gar keine Reservierung möglich. Weg: Quotenerhöhung oder
`reservedConcurrency=0` (Anleitung Kapitel 4.5).

Zusätzlich legt CDK Hilfs-Lambdas an (Kopieren der statischen Dateien nach S3,
Leeren des Buckets beim Löschen, regionsübergreifende Werte zwischen den zwei
Stacks). Sie laufen nur beim Deploy bzw. Abbau und haben keine Reserved
Concurrency [E].

## 7a. Stacks und Lebensdauer

| Stack | Region | Inhalt | Lebensdauer |
|---|---|---|---|
| `KundenportalCertificate` | us-east-1 | TLS-Zertifikat für CloudFront | dauerhaft |
| `KundenportalBase` | eu-central-1 | Cognito (User Pool, Client, Trigger), DynamoDB, Hinweis-Topic | dauerhaft — Nutzer, Daten und bestätigtes Abo bleiben |
| `KundenportalApp` | eu-central-1 | Services, Shell-Lambda, HTTP API, EventBridge, SQS, DLQ-Alarm | wird bei einer Pause abgebaut |
| `KundenportalEdge` | eu-central-1 | CloudFront, statische Dateien, Aufrufrechte für die Shell | dauerhaft — Domain und DNS-Eintrag ändern sich nie |

Die Stacks tauschen Werte über SSM-Parameter (`/kundenportal/base/…`,
`/kundenportal/app/…`) statt über CloudFormation-Exports aus; dadurch lässt
sich `KundenportalApp` jederzeit abbauen und neu anlegen. `deploy.sh`
aktualisiert `KundenportalEdge` nach jedem App-Deploy mit `--force`, damit
dieselbe Distribution auf die neuen Ursprünge zeigt. Nur ein Vollabbau
entfernt auch Edge, Base und Zertifikat — danach ist ein neuer
DNS-Eintrag nötig.

## 8. Pipelines

| Was | Werkzeug | Wer löst aus | AWS-Zugang | Freigabe |
|---|---|---|---|---|
| Prüfen (Format, Lint, Typen, Tests, Build, Synth) | GitHub Actions `CI` | jeder Push und Pull Request | keiner | — |
| Anwendung aufbauen | GitHub Actions `Deploy` → `scripts/deploy.sh` (unbeaufsichtigt) | Inhaber, manuell | [OIDC-Rolle](glossar.md#oidc-rolle) `kundenportal-github-deploy` → CDK-Bootstrap-Rollen | Environment `production` |
| Anwendung abbauen | GitHub Actions `Teardown` → `scripts/teardown.sh` (Pause: nur App; Ende: alle Stacks, Log-Reste) | Inhaber, Eingabe `destroy` | dieselbe Rolle | Environment `production` |
| DLQ-Weg prüfen | GitHub Actions `DLQ probe` (ungültiges Ereignis) | Inhaber, manuell | dieselbe Rolle (`events:PutEvents` nur auf den eigenen Bus) | Environment `production` |
| Fundament (OIDC, Rollen, Budget, SSM) | GitLab CI im Projekt `saas/kundenportal-demo/platform` | Push auf `main` → `plan`; `apply` per Klick | OIDC-Rolle `kundenportal-gitlab-foundation` | manueller Job |
| Fundament Erstlauf und Abbau | Terraform lokal | Inhaber | `aws login` | — |
| CDK-Bootstrap | `cdk bootstrap` lokal | Inhaber, einmalig | `aws login` | — |

Beide CI-Rollen tragen die [Permissions Boundary](glossar.md#permissions-boundary)
`kundenportal-ci-boundary`. Die GitLab-Rolle darf Rollen nur **mit** dieser
Boundary anlegen oder ändern und die Boundary selbst nie anfassen;
Änderungen daran macht nur der Inhaber lokal. Die GitHub-Rolle vertraut nur
dem unveränderlichen Subject
`repo:janpfeil@5345175/kundenportal-demo@1395090655:environment:production`
(Besitzer- und Repository-ID statt Name, damit ein umbenanntes oder neu
angelegtes Repository gleichen Namens die Rolle nicht übernehmen kann), die GitLab-Rolle nur
`project_path:saas/kundenportal-demo/platform:ref_type:branch:ref:main`.

## 9. Messwerte

Gemessen beim ersten Durchstich am 29./30.09.2026 (Quelle: Zusammenfassungen
der GitHub-Actions-Läufe, CloudFormation-Ereignisse, `curl` und der
Playwright-Lauf gegen die Live-Umgebung).

| Messgröße | Wert | Gemessen am | Anmerkung |
|---|---|---|---|
| Build inkl. Synth (GitHub Actions) | 32 s | 29.09.2026 | `BUILD_SECONDS` |
| Zertifikats-Stack (us-east-1), erster Aufbau | 1.144 s | 29.09.2026 | fast nur Warten auf den DNS-Eintrag des Inhabers |
| Anwendungs-Stack, erster Aufbau | 343 s | 29.09.2026 | `cdk deploy`, ohne DNS-Wartezeit |
| davon CloudFront-Anlage | 222 s | 29.09.2026 | CloudFormation-Ereignisse |
| Update-Deploy (neuer Shell-Code) | 72–83 s | 29./30.09.2026 | Stack 46 s |
| Kaltstart Shell (erster Seitenaufruf) | 1,6 s | 29.09.2026 | `curl` direkt nach dem Deploy, inkl. CloudFront-Miss |
| Seitenaufruf warm | 0,05–0,07 s | 30.09.2026 | `curl`, Startseite |
| Erstanmeldung → Willkommensnachricht | 1,9 s / 3,3 s | 30.09.2026 | Playwright, ab Anzeige von „Mein Konto" (zwei Läufe) |
| ungültiges Ereignis → DLQ | 201 s | 30.09.2026 | drei Zustellversuche à 60 s Sichtbarkeit |
| Pause (`teardown.sh`, nur App) | 143 s | 30.09.2026 | GitHub Actions; Domain liefert währenddessen 403 |
| Neuaufbau nach Pause | 328 s | 30.09.2026 | Build 32 s, Kern 191 s, Edge 105 s; keine DNS-Änderung |
| Vollabbau (`teardown.sh --all`) | 437 s | 30.09.2026 | App, Edge, Base, Zertifikat |
| Neuaufbau nach Vollabbau | 610 s | 30.09.2026 | Build 33 s, Kern 322 s, Edge 255 s; danach neuer Portal-CNAME (30 s bis sichtbar) |
| erster `cdk destroy` (ein Stack, alte Aufteilung) | 243 s | 29.09.2026 | vor der Aufteilung in vier Stacks |

Befunde beim ersten Deploy, jetzt im Code berücksichtigt: GitHub signiert
OIDC-Tokens mit unveränderlichen IDs (`repo:owner@id/name@id`), die
Vertrauensstellung prüft dieses Format; Function URLs brauchen seit
10/2025 zusätzlich `lambda:InvokeFunction`; das Lambda-Paket der Shell muss
die pnpm-Symlinks behalten (eigenes Zip statt CDK-Kopie).

## Quellen

- Lambda Reserved Concurrency (höchstens Kontokapazität minus 100): https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html
- Lambda-Quoten (Standard 1.000, Neukonten reduziert): https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
- Cognito Managed Login, Lokalisierung und Sitzungs-Cookie: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html
- Cognito `/oauth2/authorize` (Parameter `lang`): https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html
