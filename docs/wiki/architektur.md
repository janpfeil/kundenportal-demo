# Architektur — Ist-Stand des Portals

Stand: 2026-09-30 · Beschreibt den **Ist-Stand** des Codes (Phase 1 bis 4 abgeschlossen, Release v0.4.0), nicht die Zielarchitektur. Kennzeichnung: **[B]** belegt (offizielle Quelle oder Messung), **[A]** Annahme, **[E]** Einschätzung.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

Die Zielarchitektur steht in [Machbarkeit & Kosten](machbarkeit-kosten.md);
diese Seite zeigt, was davon tatsächlich gebaut ist:

- **Phase 1 (Durchstich, abgeschlossen):** Registrierung und Anmeldung, ein
  geschütztes Profil, ein Domänen-Ereignis und eine Willkommensnachricht im
  Postfach.
- **Phase 2 (abgeschlossen, v0.2.0):** die Services `contract`, `consumption` und
  `documents` mit ihren Ereignissen (Abschnitt 6), Uploads nach S3, ein
  täglicher Zeitplan, das Zonen-Muster mit zwei Zonen, der Schreibweg aus dem
  Browser, das Laufzeit-Widget „Glocke" und die Component Library. Die
  Oberfläche beschreibt die Seite [Architektur: Zonen und Frontend](architektur-zonen.md).
- **Phase 3 (abgeschlossen, v0.3.0):** zwei
  simulierte Altsysteme, Übernahme der Kundenkonten per Migrate-User-Trigger
  und Bulk-Import, Dublettenerkennung mit Account-Linking, Migrations-Cockpit
  ([Architektur: Altsysteme und Migration](architektur-migration.md)).
- **Phase 4 (abgeschlossen, v0.4.0):** Einladungslinks und Demo-Pass mit
  eigenem Mandanten je Besucher im Bridge-Modell, Isolation per Token
  Vending, Kontingente, automatischer Ablauf und Rückbau (Abschnitt 11,
  [Architektur: Mandanten und Demo-Pass](architektur-mandanten.md)).

Wie der Kontoinhaber das Ganze aufbaut, steht in der
[Anleitung Fundament](anleitung-fundament.md) und der
[Anleitung Anwendung](anleitung-anwendung.md).

## 1. Überblick

```chart
{"type": "flow", "title": "Anfrage- und Ereignisfluss (Stand Phase 2)", "gap": 30,
 "layers": [
  {"title": "Nutzer", "nodes": [["Browser", "nur Cookies, keine Tokens"]]},
  {"title": "Rand", "accent": true, "nodes": [["CloudFront", "eine Domain, TLS-Zertifikat aus us-east-1"]]},
  {"title": "Einstieg", "nodes": [["Shell und Zonen", "Next.js standalone, Function URLs mit OAC"], ["S3", "/_next/static/*, /widgets/*"], ["API Gateway", "HTTP API /api/*, JWT, Scopes, 10/20"], ["Upload-Bucket", "Presigned PUT"]]},
  {"title": "Dienste", "accent": true, "nodes": [["Cognito", "Managed Login, Pre-Token-Lambda"], ["customer", "GET/PATCH /me"], ["contract, consumption, documents", "API-Funktion + Worker je Service"], ["notification-API", "GET/PATCH /notifications"]]},
  {"title": "Ereignisse", "nodes": [["EventBridge", "Bus kundenportal, Standard-Bus (S3), Scheduler"]]},
  {"title": "Wirkung", "accent": true, "nodes": [["Worker (direkt)", "Retry-Policy, DLQ, Alarm"], ["SQS → notification", "Postfach, Hinweis an den Inhaber"], ["DynamoDB", "eine Tabelle, provisioned 5/5"]]}
 ],
 "edges": [["Browser", "CloudFront"], ["Browser", "Cognito"], ["Browser", "Upload-Bucket"],
           ["CloudFront", "Shell und Zonen"], ["CloudFront", "S3"], ["CloudFront", "API Gateway"],
           ["Shell und Zonen", "Cognito"], ["Shell und Zonen", "API Gateway"],
           ["API Gateway", "customer"], ["API Gateway", "contract, consumption, documents"], ["API Gateway", "notification-API"],
           ["Upload-Bucket", "EventBridge"],
           ["customer", "EventBridge"], ["contract, consumption, documents", "EventBridge"],
           ["EventBridge", "Worker (direkt)"], ["EventBridge", "SQS → notification"],
           ["notification-API", "DynamoDB"]]}
```

Ablauf in Worten (Kern aus Phase 1): Der Browser spricht nur mit **CloudFront** unter
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

Phase 2 ergänzt: Pfade unter `/vertraege` und `/verbrauch` gehen an eigene
Zonen-Lambdas ([Architektur: Zonen und Frontend](architektur-zonen.md));
drei weitere Services reagieren auf Ereignisse, ohne Queue direkt von
EventBridge aufgerufen (Abschnitt 6); der Browser lädt Dateien mit einer
[Presigned URL](glossar.md#presigned-url) direkt in einen Upload-Bucket.

Vier [CloudFormation](glossar.md#cloudformation)-Stacks, alle mit Tag
`project=kundenportal-demo`; Aufteilung und Lebensdauer in Abschnitt 7a.
Outputs: `PortalUrl` und `DistributionDomain` (Ziel des CNAME) am
Edge-Stack, `UserPoolId` und `ManagedLoginUrl` am Base-Stack.

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
- **Schreiben nur mit Payload-Hash:** CloudFront erreicht die
  [Function URL](glossar.md#function-url) der Shell über
  [OAC](glossar.md#oac); dabei werden Anfrage-Inhalte nicht mitsigniert.
  In Phase 1 erlaubte das Verhalten der Shell deshalb nur `GET`, `HEAD`,
  `OPTIONS`. Seit Phase 2 sind alle Methoden erlaubt; der Browser schickt
  den SHA-256 des Bodys im Header `x-amz-content-sha256` mit (Funktion
  `sendJson`), und jede schreibende Route prüft Herkunft und Sitzung.
  Einzelheiten: [Architektur: Zonen und Frontend](architektur-zonen.md) §4.
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
| `tenant_id` | Attribut `custom:tenant_id` (unveränderlich, nur die Plattform setzt es); fehlt es, gilt der Mandant `owner`. Seit Phase 4 tragen Konten eines Pass-Mandanten dessen Kennung, und der Trigger lehnt Anmeldungen zu nicht mehr nutzbaren Pässen ab |
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

- den [Resource Server](glossar.md#resource-server) `kundenportal` mit
  14 Scopes, je Bereich `.read` und `.write`: `profile`, `notifications`
  (Phase 1), `contracts`, `readings`, `documents` (Phase 2), `migration`
  (Phase 3) sowie `tenancy.read` und `tenancy.admin` (Phase 4);
- je Route einen Eintrag im HTTP API mit
  [JWT-Authorizer](glossar.md#jwt-authorizer) (Aussteller = User Pool,
  Zielgruppe = Client-ID) und den verlangten Scopes.

| Operation | Pfad | Scope | Service |
|---|---|---|---|
| `getMe`, `updateMe` | `GET/PATCH /me` | `profile.read` / `profile.write` | customer |
| `listNotifications`, `markNotificationRead` | `GET /notifications`, `PATCH /notifications/{id}` | `notifications.read` / `notifications.write` | notification |
| `listContracts`, `getContract`, `updateContract` | `GET /contracts`, `GET/PATCH /contracts/{id}` | `contracts.read` / `contracts.write` | contract |
| `listMeterReadings`, `submitMeterReading` | `GET/POST /contracts/{id}/readings` | `readings.read` / `readings.write` | consumption |
| `getDataUsage` | `GET /contracts/{id}/usage` | `readings.read` | consumption |
| `getConsumptionHistory` (Phase 6) | `GET /contracts/{id}/consumption` | `readings.read` | consumption |
| `listDocuments`, `createUploadUrl` | `GET /documents`, `POST /documents/upload-url` | `documents.read` / `documents.write` | documents |
| `getMigrationStatus`, `searchMigration` (Phase 6) | `GET /migration/status`, `GET /migration/search?q=` | `migration.read` (Gruppe `owner` oder `pass`) | migration |
| `getPassOverview` (Phase 6) | `GET /tenancy/overview` | `tenancy.admin` (zusätzlich Gruppe `owner`) | tenancy |
| `createInvitation`, `listPasses`, `revokePass` | `POST /tenancy/invitations`, `GET /tenancy/passes`, `POST /tenancy/passes/{id}/revoke` | `tenancy.admin` (zusätzlich Gruppe `owner`) | tenancy |
| `getOwnPass` | `GET /tenancy/pass` | `tenancy.read` | tenancy |
| `getRedeemChallenge`, `redeemInvitation` | `GET /tenancy/challenge`, `POST /tenancy/redeem` | keiner (`security: []`, ohne Authorizer) | tenancy |

Fehlt ein Scope, antwortet das API Gateway mit 403, bevor eine Lambda läuft.
Die beiden öffentlichen Tenancy-Operationen sind die einzigen Routen ohne
JWT; sie schützen sich selbst (ALTCHA, Begrenzung je IP, einmaliger Link).
Die Shell fordert `openid email profile` und alle API-Scopes an (der
SSM-Parameter `/kundenportal/base/oidc-scopes` enthält die Liste).

## 5. Daten

Eine DynamoDB-Tabelle (Schlüssel `PK`/`SK`, **provisioned 5/5**,
AWS-verwalteter Schlüssel) für alle Services. Jeder Partition Key beginnt
mit dem Mandanten — mit einer begründeten Ausnahme (`SCHEDULE#DATAVOLUME`):

| PK | SK | Besitzer | Inhalt |
|---|---|---|---|
| `TENANT#<t>#CUST#<c>` | `PROFILE` | customer | Profil (E-Mail, Anzeigename, Sprache, Herkunft) |
| `TENANT#<t>#SUBJ#<sub>` | `CUSTOMER` | customer | welche Kundennummer zu einer Anmelde-Identität gehört |
| `TENANT#<t>#SUBJ#<sub>` | `MAILBOX` | notification | eigene Projektion aus dem Ereignis: wessen Postfach eine Identität öffnet |
| `TENANT#<t>#CUST#<c>` | `MAILBOX` | notification | Projektion: Sprache des Kunden für die Postfach-Texte (DE/EN) |
| `TENANT#<t>#CUST#<c>` | `NOTE#<id>` | notification | Postfach-Einträge; `<id>` = Zeitstempel + eventId |
| `TENANT#<t>#CUST#<c>` | `CONTRACT#<sparte>#<contractId>` | contract | Verträge je Sparte (Tarif, Option, Abschlag mit Spanne, Zähler, Version) |
| `TENANT#<t>#SUBJ#<sub>` | `CONTRACTS` | contract | Projektion aus `CustomerRegistered`: Identität → Kunde |
| `TENANT#<t>#CONTRACT#<contractId>` | `CONSUMPTION` | consumption | Projektion aus `ContractChanged` mit Versionsschutz |
| `TENANT#<t>#CONTRACT#<contractId>` | `READING#<readAt>#<readingId>` | consumption | Zählerstände, sortiert nach Ablesedatum |
| `TENANT#<t>#CONTRACT#<contractId>` | `USAGE#<yyyy-mm>` | consumption | Merker: Datenvolumen-Warnung für diesen Monat verschickt |
| `TENANT#<t>#SUBJ#<sub>` | `CONSUMPTION` | consumption | Projektion aus `CustomerRegistered` |
| `SCHEDULE#DATAVOLUME` | `TENANT#<t>#CONTRACT#<contractId>` | consumption | Mobilfunkverträge, die der tägliche Lauf prüft |
| `TENANT#<t>#CUST#<c>` | `DOC#<documentId>` | documents | Dokument-Metadaten; die ID beginnt mit dem Zeitpunkt, der Sort Key ordnet also nach Datum |
| `TENANT#<t>#SUBJ#<sub>` | `DOCUMENTS` | documents | Projektion aus `CustomerRegistered` |

- **Jeder Service hat eigene Einträge.** Braucht ein Service fremde Daten,
  hält er eine eigene [Projektion](glossar.md#projektion) aus Ereignissen
  (`…/CONTRACTS`, `…/CONSUMPTION`, `…/DOCUMENTS`, `…/MAILBOX`) statt die
  Einträge anderer Services zu lesen. Vertragsereignisse tragen dafür den
  ganzen Vertrag ([Event-carried State Transfer](glossar.md#event-carried-state-transfer)).
- **Versionsschutz:** Die Vertragsprojektion von consumption wird nur mit
  höherer `version` überschrieben (bedingtes Schreiben); ein verspätet
  zugestelltes älteres Ereignis ändert nichts.
- **Ausnahme `SCHEDULE#DATAVOLUME`:** der einzige Partition Key ohne
  Mandanten-Präfix, weil der tägliche Lauf mandantenübergreifend alle
  Mobilfunkverträge besucht. Der Mandant steht dort vorne im Sort Key.
- Profil und Verknüpfung entstehen in **einer** Transaktion mit Bedingung;
  bei zwei gleichzeitigen Erstaufrufen gewinnt einer, der andere liest
  dessen Ergebnis.

Der Abgleich mit dem geplanten Datenmodell steht im
[Fachkonzept](fachkonzept.md) §7.1.

## 6. Ereignisse und Services

### 6.1 Weg zum Postfach (seit Phase 1)

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
- Seit Phase 2 leiten fünf weitere Regeln die Ereignisse der neuen Services
  in **dieselbe** Queue; notification schreibt daraus Bestätigungen auf
  Deutsch oder Englisch ins Postfach (Sprache aus der eigenen Projektion).
  Die bei der Registrierung angelegten Demo-Verträge lösen keine eigene
  Nachricht aus.

### 6.2 Services aus Phase 2

Jeder Service besteht aus einer **API-Funktion** (hinter dem HTTP API) und
einem **Worker** (reagiert auf Ereignisse). Alle Geldbeträge sind ganze
Cent; Ereignisse werden vor dem Veröffentlichen gegen die Schemas aus
`packages/events` geprüft.

| Service | Fachlich | Worker reagiert auf |
|---|---|---|
| `contract` | Verträge je [Sparte](glossar.md#sparte) mit Tarif und Tarifoption; Kunden wählen den [Abschlag](glossar.md#abschlag) in ganzen Euro zwischen **80 % und 150 %** des berechneten Werts; Tarifoption wechseln | `CustomerRegistered` → drei **Demo-Verträge** (Strom und Gas mit Zähler, Mobilfunk mit 20 GB), Beginn 180 Tage vor der Registrierung; `MeterReadingSubmitted` → Jahresverbrauch hochrechnen (ab 30 Tagen Abstand), Abschlag **neu berechnen**, bei Änderung `InstallmentAdjusted` |
| `consumption` | Zählerstände mit **Plausibilitätsprüfung** (Vertrag aktiv und mit Zähler, Datum nicht in der Zukunft, weder Datum noch Wert unter dem letzten Stand); Datenvolumen für Mobilfunk (Demo-Werte: 40 % am Monatsanfang, linear bis 100 %) | `CustomerRegistered`, `ContractChanged` → eigene Projektionen; täglicher [EventBridge Scheduler](glossar.md#eventbridge-scheduler) **07:00 Europe/Berlin** → bei **80 %** `DataVolumeThresholdReached`, höchstens einmal je Vertrag und Monat |
| `documents` | Dokumentliste; `POST /documents/upload-url` legt ein Dokument „pending" an und gibt eine Presigned PUT URL für **genau diese Datei** zurück (Typ und Größe signiert, 5 Minuten gültig, JPEG/PNG/PDF bis 5 MB) | `CustomerRegistered` → Projektion; S3 „Object Created" → Größe prüfen, dann `DocumentUploaded`; unangekündigte oder abweichende Dateien werden gelöscht |

### 6.3 Ereignisfluss

| Ereignis | Quelle | Ziel | Zustellung | Wirkung |
|---|---|---|---|---|
| `CustomerRegistered` | customer | notification | Regel → SQS | Willkommensnachricht, Hinweis an den Inhaber |
| `CustomerRegistered` | customer | contract, consumption, documents | Regel → Worker direkt | Demo-Verträge; Projektionen Identität → Kunde |
| `ContractChanged` | contract | consumption | Regel → Worker direkt | Vertragsprojektion; Mobilfunkvertrag in `SCHEDULE#DATAVOLUME` aufnehmen |
| `ContractChanged` | contract | notification | Regel → SQS | Bestätigung (nicht bei Demo-Verträgen) |
| `MeterReadingSubmitted` | consumption | contract | Regel → Worker direkt | Abschlag neu berechnen |
| `MeterReadingSubmitted` | consumption | notification | Regel → SQS | Bestätigung des Zählerstands |
| `InstallmentAdjusted` | contract | notification | Regel → SQS | neuer Abschlag im Postfach |
| Zeitplan 07:00 | Scheduler | consumption | direkt (2 Wiederholungen, DLQ) | Datenvolumen aller Mobilfunkverträge prüfen |
| `DataVolumeThresholdReached` | consumption | notification | Regel → SQS | Warnung im Postfach |
| S3 „Object Created" | Upload-Bucket, [Standard-Bus](glossar.md#standard-bus) | documents | Regel → Worker direkt | Upload prüfen |
| `DocumentUploaded` | documents | notification | Regel → SQS | Eingangsbestätigung |

Folgeereignisse tragen IDs, die aus dem auslösenden Ereignis abgeleitet
sind (UUID Version 8 aus einem SHA-256); eine erneute Zustellung erzeugt
also dieselben IDs, und jeder Schritt bleibt
[idempotent](glossar.md#idempotenz).

### 6.4 Direktaufruf statt Queue

Nur `notification` hat eine SQS-Queue. Die Worker von `contract`,
`consumption` und `documents` ruft EventBridge **direkt** auf
([asynchroner Aufruf](glossar.md#asynchroner-aufruf)). Grund sind die
Kosten nach dem Free Plan [E]:

- Eine SQS-Ereignisquelle fragt die Queue rund um die Uhr ab, auch leer —
  grob **0,65 Mio. Anfragen je Queue und Monat** [A]. Frei sind 1 Mio.; die
  notification-Queue verbraucht davon schon den größten Teil, jede weitere
  Queue würde Geld kosten.
- Ein Direktaufruf kostet nur bei tatsächlichen Ereignissen.

Die Zuverlässigkeit sichern stattdessen drei Stufen, je Service mit eigener
DLQ und eigenem Alarm:

| Stufe | Einstellung |
|---|---|
| EventBridge kann nicht zustellen | [Retry-Policy](glossar.md#retry-policy) am Regelziel: bis zu 8 Versuche, höchstens 24 h; danach DLQ |
| Worker wirft einen Fehler | Lambda wiederholt asynchrone Aufrufe **2-mal** (Ereignisse höchstens 6 h alt); danach [On-Failure-Destination](glossar.md#on-failure-destination) in dieselbe DLQ |
| Nachricht in einer DLQ | Alarm `…DlqNotEmpty` (5 Minuten, Schwelle > 0) per SNS an den Inhaber; 14 Tage Aufbewahrung |

Damit gibt es vier Alarme (notification, contract, consumption,
documents). Ohne Queue fehlt die Stapelverarbeitung; bei Demo-Last spielt
das keine Rolle [E].

### 6.5 Uploads

Der Upload-Bucket liegt im dauerhaften Stack `KundenportalBase`, damit
Uploads eine Pause der Anwendung überstehen:

- [Block Public Access](glossar.md#block-public-access), [SSE-S3](glossar.md#sse-s3),
  nur HTTPS; Objekte gehören dem Bucket-Besitzer.
- [CORS](glossar.md#cors) erlaubt nur `PUT` von der Portal-Domain und — für
  die lokale Entwicklung — von `http://localhost:3000`.
- Eine [Lifecycle-Regel](glossar.md#lifecycle-regel) löscht jede Datei nach
  **7 Tagen**.
- Schlüssel `uploads/<tenant>/<customer>/<documentId>`; die API-Funktion darf
  nur unter `uploads/` schreiben, der Worker nur dort löschen.
- S3 meldet neue Dateien über den **Standard-Bus** von EventBridge
  (Ereignisse von AWS-Diensten sind dort kostenlos). Es gibt keine
  Bucket-Benachrichtigung auf eine Funktion des App-Stacks; deshalb lässt
  sich die Anwendung abbauen, während der Bucket bleibt.

## 7. Leitplanken

| Leitplanke | Umsetzung |
|---|---|
| Laufzeit | Node.js 24, arm64, 256 MB (Shell 1024 MB) |
| Kostendeckel Lambda | [Reserved Concurrency](glossar.md#reserved-concurrency) je Funktion: Worker und Trigger aus CDK-Kontext `reservedConcurrency` (Standard 2, `0` = gar nicht reservieren), API-Funktionen `apiReservedConcurrency` (Standard 5, seit Phase 4), Next.js-Funktionen (Shell, Zonen) `webReservedConcurrency` (Standard 10 seit v0.4.1, vorher 5); Stand v0.4.1: Base 4 × 2 + App-Worker 8 × 2 + API-Funktionen 8 × 5 + Next.js 4 × 10 = 104 (v0.4.0: 84, Phase 3: 52, Phase 2: 35, Phase 1: 10) |
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
dann ist gar keine Reservierung möglich. Faustregel: Kontolimit ≥ 100 +
Summe der Reservierungen, derzeit also ≥ 100 + 8 + 16 + 40 + 40 = 204; jeder
weitere Worker erhöht den Wert um 2, jede weitere API-Funktion oder Zone um 5. Das Konto hat nach genehmigter
Erhöhung ein Limit von 1.000 [B]. Weg bei zu kleinem Limit: Quotenerhöhung
oder `reservedConcurrency=0` (Anleitung Kapitel 4.5).

Die 20 Funktionen im App-Stack: acht API-Funktionen (customer,
notification, contract, consumption, documents, migration, tenancy-API und
die öffentliche Einlöse-Funktion von tenancy), acht Worker (customer-Worker,
notification-Konsument, Worker von contract, consumption, documents,
migration-Worker und -Record-Processor, tenancy-Worker), Shell und drei
Zonen. Im Base-Stack vier: die drei Cognito-Trigger (Pre Token Generation,
Migrate User, Post Authentication) und die Aufräum-Funktion der
Pass-Mandanten (Abschnitt 11).

Zusätzlich legt CDK Hilfs-Lambdas an (Kopieren der statischen Dateien nach S3,
Leeren des Buckets beim Löschen, regionsübergreifende Werte zwischen den zwei
Stacks). Sie laufen nur beim Deploy bzw. Abbau und haben keine Reserved
Concurrency [E].

## 7a. Stacks und Lebensdauer

| Stack | Region | Inhalt | Lebensdauer |
|---|---|---|---|
| `KundenportalCertificate` | us-east-1 | TLS-Zertifikat für CloudFront | dauerhaft |
| `KundenportalBase` | eu-central-1 | Cognito (User Pool, Client, Trigger), DynamoDB, Upload-Bucket, Hinweis-Topic; seit Phase 4 die Mandanten-Rolle für Token Vending, die Zeitplangruppe `kundenportal-passes` und `Custom::PassTenantCleanup` | dauerhaft — Nutzer, Daten, Uploads (bis zu 7 Tage), Pass-Mandanten und bestätigtes Abo bleiben |
| `KundenportalApp` | eu-central-1 | Services mit Workern, Shell- und Zonen-Lambdas, HTTP API, EventBridge-Bus und -Regeln, Scheduler, SQS, DLQs mit Alarmen | wird bei einer Pause abgebaut |
| `KundenportalEdge` | eu-central-1 | CloudFront mit Verhalten für Shell, Zonen, `/api/*`, `/_next/static/*`, `/widgets/*`; statische Dateien und Widget; Aufrufrechte für Shell und Zonen | dauerhaft — Domain und DNS-Eintrag ändern sich nie |

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

Gemessen beim ersten Durchstich am 29./30.09.2026 und mit dem Stand von
Phase 2 am 30.09.2026 (Quelle: Zusammenfassungen
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
| Deploy mit den Services aus Phase 2 | 484 s | 30.09.2026 | Build 42 s, Kern 302 s, Edge 140 s |
| Deploy nur der Zonen (lokal) | 212 s | 30.09.2026 | [Zonen und Frontend](architektur-zonen.md) §7 |
| Erstanmeldung → Willkommensnachricht, kaltes System | 7,3 s | 30.09.2026 | Playwright gegen ein kaltes System; mehr Kaltstarts als in Phase 1 (1,9 s / 3,3 s) |
| Pause mit Phase 3 (Abbau App-Stack) | 257 s | 30.09.2026 | GitHub-Workflow `Teardown`; Portal antwortet währenddessen 403 |
| Neuaufbau mit Phase 3 | 464 s | 30.09.2026 | 17 App-Funktionen, 3 Cognito-Trigger; gleiche Distribution, keine DNS-Änderung |
| Neuaufbau nach Pause (v0.4.1) | 497 s | 30.09.2026 | Edge zurück vom Pausenmodus auf die neuen Ursprünge; keine DNS-Änderung |
| Pause mit Pausenseite (v0.4.1) | 410 s | 30.09.2026 | GitHub-Workflow `Teardown`: erst Edge in den Pausenmodus, dann App-Stack; Portal antwortet währenddessen mit der Seite „Die Demo pausiert gerade“ (503), `/api/*` mit Problem Details (503) |
| E2E gesamt (16 Journeys inkl. J2, J3, J7, J8) | 1,8 min | 30.09.2026 | warm; direkt nach dem Neuaufbau brauchte J4 länger als die 5 s der Prüfung (Wartezeit auf 30 s erhöht) |
| Migrations-Journeys allein (9 Schritte) | 1,3 min | 30.09.2026 | lokal gegen live, inkl. zweimal Demo-Reset, Bulk-Import beider Altsysteme und Redrive |

Befunde beim ersten Deploy, jetzt im Code berücksichtigt: GitHub signiert
OIDC-Tokens mit unveränderlichen IDs (`repo:owner@id/name@id`), die
Vertrauensstellung prüft dieses Format; Function URLs brauchen seit
10/2025 zusätzlich `lambda:InvokeFunction`; das Lambda-Paket der Shell muss
die pnpm-Symlinks behalten (eigenes Zip statt CDK-Kopie).

## 10. Altsysteme und Migration (Phase 3)

Zwei simulierte Altsysteme auf eigenem Server, Übernahme der Kundenkonten per
Migrate-User-Trigger (J2) und Bulk-Import mit DLQ und Redrive (J7),
Dublettenerkennung und Account-Linking (J3) sowie das Migrations-Cockpit (J8)
beschreibt die eigene Seite
[Architektur: Altsysteme und Migration](architektur-migration.md).

## 11. Mandanten und Demo-Pass (Phase 4)

Jeder eingeladene Besucher bekommt einen eigenen
[Mandanten](glossar.md#mandant) im [Bridge-Modell](glossar.md#bridge-modell):
geteilte Lambdas, API und Bus; eigene Tabelle `kp-tenant-<kennung>`,
eigener Altsystem-Datenstand, eigenes Upload-Präfix und eigene Konten.

- **Service `tenancy`:** API für den Inhaber (Einladungen, Pässe, Widerruf)
  und den Pass-Inhaber (eigener Pass), öffentliche Einlöse-Funktion ohne
  Authorizer, Worker für Einrichtung (`DemoPassIssued`), Ablauf per
  einmaligem [EventBridge Scheduler](glossar.md#eventbridge-scheduler)-Zeitplan,
  täglichen Abgleich 03:30 und Ereignis-Kontingent; der Budget-Alarm sperrt
  per SNS das Einlösen ([Kill-Switch](glossar.md#kill-switch)).
- **[Token Vending](glossar.md#token-vending-machine) in `service-kit`:**
  `tenantData(tenantId)` nimmt per [STS](glossar.md#sts) die Mandanten-Rolle
  aus der Base mit Sitzungs-Tag `tenant` an; deren Richtlinie erlaubt nur
  `table/kp-tenant-${aws:PrincipalTag/tenant}` und
  `uploads/${aws:PrincipalTag/tenant}/*`. Der Inhaber-Mandant `owner` bleibt
  in der Tabelle der Base. Der Router zählt API-Aufrufe je Pass-Mandant
  (429 an der Grenze, 403 wenn nicht aktiv).
- **Aufräumen beim Vollabbau:** Die
  [Custom Resource](glossar.md#custom-resource) `Custom::PassTenantCleanup`
  im Base-Stack baut vor Tabelle, User Pool und Bucket alle Pass-Mandanten
  zurück; CloudFormation kennt die zur Laufzeit angelegten Tabellen sonst
  nicht.

- **Nachgezogen in v0.4.1:** Obergrenze gleichzeitiger Pass-Mandanten
  atomar (Zähler `activeTenants` in der Einlöse-Transaktion),
  Upload-Kontingent (20, dann 429), Einstellungen im Cockpit (Einlösen
  sperren/öffnen, Obergrenze 1–4), öffentliche Angebotsdaten
  `GET /api/tenancy/offer` für die Einlöseseite, E-Mail-Hinweis an den
  Inhaber bei eingelöstem und gelöschtem Pass, Demo-Reset räumt über
  `MigratedAccountsRemoved` die Daten entfernter Konten in allen Domänen ab.
- **Pause mit Pausenseite:** `teardown.sh` stellt zuerst die Edge in den
  Pausenmodus — eine [CloudFront Function](glossar.md#cloudfront-functions)
  beantwortet Seiten mit „Die Demo pausiert gerade“ und `/api/*` mit Problem
  Details (jeweils 503) — und baut dann den App-Stack ab; der nächste Deploy
  richtet die Edge wieder auf die Anwendung. Distribution und DNS bleiben.
- **Kopfzeile:** Jede Seite zeigt die ausgerollte Version (`v0.4.1 · <Commit>`,
  beim Build aus `package.json` und Commit gesetzt); wer die Cockpit-Rolle hat
  (Inhaber, Pass-Inhaber), sieht den Cockpit-Link in der Navigation.

Einrichtung ≈ 10 s, Rückbau ≈ 10 s nach Ablauf, E2E 25/25 grün
[B: 30.09.2026, v0.4.1]. Einzelheiten, Messwerte und offene Punkte:
[Architektur: Mandanten und Demo-Pass](architektur-mandanten.md); die
Seiten in Shell und Cockpit: [Zonen & Frontend](architektur-zonen.md) §8.

## Quellen

- Lambda Reserved Concurrency (höchstens Kontokapazität minus 100): https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html
- Lambda-Quoten (Standard 1.000, Neukonten reduziert): https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html
- Cognito Managed Login, Lokalisierung und Sitzungs-Cookie: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html
- Cognito `/oauth2/authorize` (Parameter `lang`): https://docs.aws.amazon.com/cognito/latest/developerguide/authorization-endpoint.html
- Lambda, asynchroner Aufruf (Wiederholungen, Ziele bei Fehlern): https://docs.aws.amazon.com/lambda/latest/dg/invocation-async.html
- EventBridge, Wiederholungen und DLQ am Regelziel: https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rule-dlq.html
- S3-Ereignisse über EventBridge: https://docs.aws.amazon.com/AmazonS3/latest/userguide/EventBridge.html
