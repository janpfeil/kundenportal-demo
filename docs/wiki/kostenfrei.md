# Kostenfreier Betrieb — AWS nur im Freikontingent

Stand: 2026-09-30 · Kennzeichnung: **[B]** belegt (offizielle Quelle), **[D]** Drittquelle, **[A]** Annahme/Schätzung, **[E]** Einschätzung.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

## 1. Vorgabe und Ergebnis

Vorgabe des Nutzers (29.09.2026): **Auf AWS keine Kosten verursachen.**
Lieber einzelne Komponenten auf eigener Infrastruktur betreiben und auf AWS
nur das, was kostenlos ist.

**Ausgangslage (erledigt 29.09.2026):** Das alte Konto von 2021 wird nicht
weiter verfolgt; der Inhaber hat am 29.09.2026 ein **neues Konto im Free
Plan** angelegt (100 $ Guthaben bis 29.09.2027, Root-MFA aktiv; der Free
Plan endet spätestens ca. 29.03.2027 —
[Anleitung Kontoinhaber](anleitung-kontoinhaber.md) Kapitel 1–2). Damit gilt:

| Phase | Kostenlage |
|---|---|
| Monat 1–6 im **Free Plan** (bis spätestens ca. 29.03.2027) | **garantiert 0 $**: AWS berechnet im Free Plan nichts; auch API Gateway, EventBridge und S3 laufen über das Startguthaben [B] |
| danach, falls das Demo weiterlaufen soll: Paid Plan | Restguthaben (von 100 $, gültig bis 29.09.2027) deckt die Cent-Dienste; danach Always Free + Deckel wie unten |
| ohne Neukunden-Angebote | Always Free + Deckel wie unten (Abschnitte 2–5) |

Die folgenden Abschnitte beschreiben den Betrieb **ohne** Guthaben — den
ungünstigsten Fall.

**Ergebnis:** machbar — mit einer Einschränkung. Alle eingesetzten
AWS-Dienste bis auf drei sind dauerhaft kostenlos. Drei für die Architektur zentrale
Dienste haben **kein** Always-Free-Kontingent und kosten pro Nutzung:
API Gateway, EventBridge (eigene Events) und S3. Bei Demo-Traffic sind das
Bruchteile eines Cents; ob AWS solche Beträge auf 0,00 $ rundet, ist nicht
belegt [A]. Garantiert 0,00 $ gibt es nur, wenn diese drei Dienste nicht
dauerhaft laufen (Variante Z2 in Abschnitt 4).

## 2. Jeder AWS-Baustein im Freikontingent-Check

```chart
{"type": "matrix", "title": "AWS-Bausteine nach Kostenart", "subtitle": "Bestehendes Konto ohne Guthaben; Demo-Traffic (< 10.000 Aufrufe/Monat)", "source": "AWS-Preisseiten [B], teils Drittquellen [D]",
 "cols": ["kostenlos", "Cent-Beträge", "Fixkosten"],
 "states": {"j": {"label": "trifft zu", "cls": "f-seq4"}, "n": {"label": "—", "cls": "f-neutral"}},
 "rows": [
  {"label": "CloudFront", "cells": ["j","n","n"]},
  {"label": "Lambda (REST, SSR, Function URL)", "cells": ["j","n","n"]},
  {"label": "DynamoDB (provisioned ≤ 25)", "cells": ["j","n","n"]},
  {"label": "SQS", "cells": ["j","n","n"]},
  {"label": "SNS (inkl. E-Mail)", "cells": ["j","n","n"]},
  {"label": "EventBridge Scheduler", "cells": ["j","n","n"]},
  {"label": "CloudWatch (kurze Retention)", "cells": ["j","n","n"]},
  {"label": "IAM, STS, ACM, Budgets, SSM, KMS", "cells": ["j","n","n"]},
  {"label": "Cognito (Essentials, ≤ 10.000 MAU)", "cells": ["j","n","n"]},
  {"label": "CloudFormation (CDK)", "cells": ["j","n","n"]},
  {"label": "API Gateway (HTTP API)", "cells": ["n","j","n"]},
  {"label": "EventBridge (eigene Events)", "cells": ["n","j","n"]},
  {"label": "S3 (Speicher + Anfragen)", "cells": ["n","j","n"]},
  {"label": "Route 53, NAT, ALB, RDS, WAF", "cells": ["n","n","j"]}
 ]}
```

| Baustein | Always Free | Demo-Nutzung | Kosten/Monat |
|---|---|---|---|
| CloudFront | 1 TB Übertragung, 10 Mio. Anfragen, 2 Mio. CloudFront Functions [D] | Auslieferung aller Seiten und `/api/*` | 0 $ |
| Lambda | 1 Mio. Aufrufe + 400.000 GB-s [D] | REST-Handler, Event-Konsumenten, Next.js-SSR | 0 $ |
| DynamoDB | 25 GB, 25 RCU/WCU provisioned [B] | Single Table, provisioned 5 RCU/5 WCU je Tabelle, zusammen ≤ 25 | 0 $ |
| Cognito (Plan Essentials) | 10.000 aktive Nutzer (MAU) im Monat, läuft nicht ab [B: https://aws.amazon.com/cognito/pricing/] | Portal-Login, Managed Login, Lambda-Trigger | 0 $ |
| SQS | 1 Mio. Anfragen [D] | eine Queue (notification) mit DLQ, drei weitere DLQs ohne Abfrager | 0 $ |
| SNS | 1 Mio. Publishes, 1.000 E-Mails [D] | Benachrichtigungen, Kill-Switch | 0 $ |
| EventBridge Scheduler | 14 Mio. Aufrufe [B] | tägliche Datenvolumen-Prüfung (≈ 30 Aufrufe/Monat) | 0 $ |
| CloudWatch | Logs ≈ 5 GB, 10 Metriken, 10 Alarme [D] | Logs mit 3–7 Tagen Retention | 0 $ |
| IAM, STS, ACM, AWS Budgets, SSM Parameter Store (Standard), KMS mit AWS-verwalteten Schlüsseln | kostenlos [B/A] | Rechte, kurzlebige Anmeldedaten je Mandant, Zertifikat, Kostenalarm, Konfiguration | 0 $ |
| CloudFormation | für AWS-eigene Ressourcen kostenlos [A] | CDK-Deployments | 0 $ |
| **API Gateway (HTTP API)** | nur 12 Monate für Neukonten [B] | alle REST-Aufrufe | ≈ 1 $ pro Mio. → 0,01 $ je 10.000 Aufrufe [B] |
| **EventBridge (eigene Events)** | **kein** Freikontingent [B] | Domänen-Events | 1 $ pro Mio. → 0,01 $ je 10.000 Events [B] |
| **S3** | nur 12 Monate für Neukonten [B] | Uploads, CDK-Artefakte, ggf. statische Dateien | wenige MB Speicher + einige hundert Anfragen → < 0,01 $ [A] |

Weggelassen bzw. ersetzt, weil nie kostenlos: Route 53 (DNS bleibt auf den
eigenen Nameservern), NAT Gateway, ALB, RDS, Secrets Manager, WAF
(Pay-as-you-go), öffentliche IPv4-Adressen.

**Ergänzungen aus Phase 1 (Stand 29.09.2026)** — was der gebaute Code
zusätzlich verbraucht ([Architektur](architektur.md)):

- **SQS im Leerlauf [A]:** Die Lambda-Ereignisquelle fragt die Queue auch
  ohne Nachrichten dauerhaft ab (Long Polling, 20 s je Abfrage, mehrere
  Abfrager parallel). Grob 0,5–0,7 Mio. SQS-Anfragen im Monat — innerhalb der
  1 Mio. freien Anfragen, aber der größte Posten im Leerlauf.
- **Cognito [B]:** Plan Essentials ist bis 10.000 monatlich aktive Nutzer
  kostenlos (https://aws.amazon.com/cognito/pricing/); Bestätigungs-E-Mails
  über den Cognito-Standardversand (höchstens 50 pro Tag) kosten nichts.
- **CloudWatch:** ein Alarm (DLQ nicht leer) von 10 freien; Logs mit 3 Tagen
  Aufbewahrung.
- **CDK-Bootstrap:** ein S3-Staging-Bucket je Region (Frankfurt und
  Nord-Virginia) mit wenigen MB Lambda-Code und statischen Dateien; ohne
  Guthaben Bruchteile eines Cents [A]. Ein leeres ECR-Repository kostet nichts.

**Ergänzungen aus Phase 2 (Stand 30.09.2026)** — neue Services, Uploads und
Zonen ([Architektur](architektur.md) §6):

- **Nur eine SQS-Queue [E]:** Jede weitere Queue mit Lambda-Ereignisquelle
  käme im Leerlauf auf weitere ≈ 0,65 Mio. Anfragen im Monat [A]; zusammen
  mit der notification-Queue wären die 1 Mio. freien Anfragen überschritten.
  Deshalb ruft EventBridge die Worker von `contract`, `consumption` und
  `documents` **direkt** auf (asynchroner Lambda-Aufruf). Zuverlässigkeit
  kommt von der Retry-Policy am Regelziel, zwei Lambda-Wiederholungen und
  einer On-Failure-DLQ je Service. Die drei DLQs verursachen nur Anfragen,
  wenn tatsächlich etwas darin landet (kein Abfrager).
- **EventBridge (eigene Events):** je Kundenaktion ein bis zwei Ereignisse
  mehr als in Phase 1 (z. B. Zählerstand → `MeterReadingSubmitted` →
  `InstallmentAdjusted`); weiterhin 1 $ je Mio., also bei Demo-Traffic
  Bruchteile eines Cents [A]. S3-Ereignisse kommen über den Standard-Bus;
  Ereignisse von AWS-Diensten sind dort kostenlos
  [B: https://aws.amazon.com/eventbridge/pricing/].
- **EventBridge Scheduler:** ein täglicher Zeitplan (Datenvolumen-Prüfung
  07:00) ≈ 30 Aufrufe im Monat von 14 Mio. freien [B].
- **S3 für Uploads:** ein Bucket im dauerhaften Base-Stack; Dateien bis 5 MB,
  Löschung nach 7 Tagen per Lifecycle-Regel; Speicher und Anfragen bei
  Demo-Nutzung < 0,01 $ im Monat [A], im Free Plan über das Guthaben.
- **Lambda:** 13 Funktionen statt 5; die Aufrufe bleiben bei Demo-Traffic
  weit unter 1 Mio. im Monat. Zonen liefern ihre statischen Dateien einmal
  selbst aus, danach kommen sie aus dem CloudFront-Cache [E].
- **CloudWatch:** vier Alarme (je eine DLQ für notification, contract,
  consumption, documents) von 10 freien.
- **Storybook** liegt auf GitHub Pages (Abschnitt 3), nicht auf S3 oder
  CloudFront.

**Ergänzungen aus Phase 3 (Stand 30.09.2026)** — Altsysteme und Migration
([Altsysteme & Migration](architektur-migration.md)):

- **Keine weitere abgefragte Queue [E]:** customer- und migration-Worker
  sowie der Record-Processor werden wie in Phase 2 direkt aufgerufen. Drei neue
  SQS-Queues (DLQ von customer und migration-Worker, Migrations-DLQ) haben
  keinen Abfrager; Anfragen entstehen nur, wenn etwas darin landet, und beim
  Redrive aus dem Cockpit (einige Long Polls je Klick).
- **EventBridge:** Die Timeline-Regel liefert jedes Ereignis zusätzlich an
  den migration-Worker. Berechnet werden veröffentlichte Ereignisse, nicht
  Zustellungen an Ziele auf demselben Bus
  [B: https://aws.amazon.com/eventbridge/pricing/]; die zusätzlichen
  Lambda-Aufrufe liegen weit unter 1 Mio. im Monat.
- **Lambda:** 19 Funktionen mit Reservierung statt 13 (drei Cognito-Trigger,
  customer-Worker, migration-API, -Worker, -Processor, Cockpit-Zone);
  Cognito-Trigger kosten nur ihre Lambda-Aufrufe.
- **SSM Parameter Store und KMS:** sieben Standard-Parameter, davon drei
  SecureStrings mit dem AWS-verwalteten Schlüssel `aws/ssm` — kostenlos; die
  Entschlüsselung beim Kaltstart zählt gegen die 20.000 freien KMS-Anfragen im
  Monat [B: https://aws.amazon.com/kms/pricing/]. Kein Secrets Manager.
- **Cognito:** Per Bulk-Import angelegte Konten zählen erst mit einer
  Anmeldung als aktive Nutzer (MAU); das Demo bleibt weit unter 10.000.
- **DynamoDB:** Timeline-Einträge (einer je Ereignis) laufen nach 7 Tagen per
  TTL ab — kostenlos; kein zusätzlicher Index, Kapazität bleibt 5/5.
- **CloudWatch:** sechs Alarme von 10 freien (neu: DLQ von customer und
  migration-Worker; die Migrations-DLQ bekommt bewusst keinen, weil der
  fehlerhafte Datensatz zur Demo gehört).
- **Eigene Infrastruktur statt AWS:** Altsysteme (zwei Container mit
  SQLite) und der Keycloak-Realm laufen auf dem eigenen Server; ihre
  Pipelines laufen in GitLab (Abschnitt 3).

**Ergänzungen aus Phase 4 (Stand 30.09.2026)** — Mandanten und Demo-Pass
([Mandanten & Demo-Pass](architektur-mandanten.md) §6):

- **[STS](glossar.md#sts):** Jede geteilte Lambda holt sich für einen
  Pass-Mandanten per `AssumeRole` kurzlebige Anmeldedaten (Token Vending,
  15 Minuten, gecacht). STS ist kostenlos [B].
- **EventBridge Scheduler:** je Pass ein **einmaliger** Zeitplan
  (`at(…)`, wird nach dem Auslösen gelöscht) und ein täglicher Abgleich
  (03:30) — zusammen wenige Dutzend Aufrufe im Monat von 14 Mio. freien [B].
- **DynamoDB:** je Pass-Mandant eine eigene Tabelle, provisioned 5 RCU/5 WCU.
  Die 25 freien Einheiten je Konto und Region reichen für die Tabelle der
  Base und **3** Pass-Tabellen (5 + 3 × 5 = 20); daher die Obergrenze von 3
  gleichzeitigen Pass-Mandanten. `CreateTable` und `DeleteTable` sind
  Steuerungsaufrufe und kosten nichts [B].
- **ALTCHA:** Das Rätsel vor dem Einlösen erzeugt und prüft eine eigene
  Lambda — kein Drittanbieter, kein Konto, 0 $. Gelöste Rätsel liegen bis
  zu ihrem Ablauf als TTL-Eintrag in der Tabelle der Base.
- **Cognito:** je Pass ein Konto des Pass-Inhabers plus die Demo-Personen,
  die er anmeldet; weit unter 10.000 aktiven Nutzern. Die einzige
  Systemmail ist das Einmal-Passwort über den Cognito-Standardversand.
- **EventBridge (eigene Events):** sechs neue Ereignisarten des
  Tenancy-Service, eine Regel zählt die Ereignisse der Pass-Mandanten;
  weiterhin Bruchteile eines Cents [A].
- **Lambda:** 24 Funktionen mit Reservierung (Base 4, App 20); API-Funktionen
  jetzt mit 5 statt 2 — das erhöht nur die Obergrenze gleichzeitiger
  Ausführungen, nicht die Kosten.
- **Kill-Switch:** Der Budget-Alarm sperrt über SNS das Einlösen neuer
  Pässe; laufende Pässe bleiben nutzbar.

## 3. Was auf eigene Infrastruktur wandert

Eigene, bereits vorhandene Infrastruktur: ein **eigener Server** mit Docker,
**gitlab.rypox.org**, eigene Nameserver; dazu kostenlos GitHub (öffentliches
Repository, Actions, Pages).

| Komponente | bisher geplant | neu | Wirkung |
|---|---|---|---|
| Terraform-State | S3-Bucket | **GitLab-managed Terraform State** auf gitlab.rypox.org (HTTP-Backend mit Locking) [B: https://docs.gitlab.com/user/infrastructure/iac/terraform_state/]; Terraform läuft **nur in GitLab CI** (siehe 3.1) | kein State-Bucket in S3; State (ab Phase 3 mit Keycloak-Zugangsdaten) bleibt privat |
| Altsysteme (Energie-Kundensystem, Kundensystem des übernommenen Telekommunikationsanbieters) | simuliert, teils als Lambda | **Docker-Container auf dem eigenen Server**, eigenes Deployment über GitLab CI auf gitlab.rypox.org | echte Hybrid-Architektur „Altsystem im eigenen Rechenzentrum, neues Portal in der Cloud"; ab Phase 3 ruft der Cognito-Migrate-User-Trigger (Lambda) das Altsystem per HTTPS für die Lazy Migration auf [E] |
| Anmeldung des Telko-Altsystems | — | **eigener Keycloak** unter `id.rypox.net` (self-hosted); Konfiguration ab Phase 3 per Terraform | Gegenstelle des Migrate-User-Triggers für Telko-Kunden; 0 $ auf AWS [E] |
| Storybook (Component Library) und diese Berichte | S3 + CloudFront | **GitHub Pages** (umgesetzt 30.09.2026: https://janpfeil.github.io/kundenportal-demo/storybook/) | kostenlos für öffentliche Repositories, entlastet S3 und CloudFront-Behaviors [E] |
| DNS | Route 53 optional | eigene Nameserver, CNAME auf CloudFront | 0 $ |
| CI/CD | GitHub Actions | GitHub Actions für die Anwendung auf AWS; GitLab CI für Plattform und Altsysteme (siehe 3.1) | 0 $ [B]; kein GitLab-Zugang in GitHub |

Bewusst **nicht** verlagert: Next.js-SSR, REST-Lambdas, DynamoDB, SQS, SNS —
sie sind kostenlos und gehören zum Kern dessen, was das Demo zeigen soll.
Statische Next.js-Dateien könnten ebenfalls vom eigenen Server kommen (CloudFront mit
Custom Origin); das spart nur Bruchteile eines Cents und schwächt die
S3-Geschichte, daher nicht empfohlen [E].

### 3.1 Zwei getrennte Pipelines, keine fremden Zugangsdaten

Vorgabe des Nutzers: **Kein Zugangstoken für gitlab.rypox.org in GitHub** —
in einem öffentlichen Repository wäre jede Fehlkonfiguration öffentlich.
Deshalb zwei getrennte Vertrauensbereiche [E]:

| | GitHub (öffentlich) | GitLab (gitlab.rypox.org, privat) |
|---|---|---|
| Quellcode | öffentliches Repository: Portal, Services, CDK, **Terraform-Code**, OpenAPI-Vertrag der Altsysteme | **privates GitLab-Repository für die Altsysteme** (Entscheidung 29.09.2026); die Plattform-Pipeline klont das öffentliche GitHub-Repository bei jedem Lauf per `git clone` auf einen festen Tag/Commit — öffentlich lesbar, also **ohne Token** |
| Pipeline | GitHub Actions | GitLab CI |
| Baut und deployt | **Anwendungsschicht** per CDK: Next.js-Zonen, Lambdas, API Gateway, DynamoDB, EventBridge, SQS, SNS, **Cognito User Pool** mit Triggern | **Fundament** per Terraform: OIDC-Vertrauensstellungen, Budget + SNS-Grundlage des Kill-Switch, SSM-Grundwerte, ab Phase 3 Zugangsdaten der Altsysteme (SSM); **Altsysteme** als Docker-Container auf dem eigenen Server |
| Zugang zu AWS | OIDC-Rolle nur für das GitHub-Repository `janpfeil/…` | eigene OIDC-Rolle für gitlab.rypox.org (GitLab als Identitätsanbieter; `id_tokens` in der Pipeline); die OIDC-Discovery unter `https://gitlab.rypox.org/.well-known/openid-configuration` ist öffentlich erreichbar (geprüft 29.09.2026), AWS kann die Signatur also prüfen |
| Geheimnisse | keine | z. B. Keycloak-Verwaltungszugang (ab Phase 3), Schlüssel der Altsystem-Schnittstelle, Terraform-State — nur in GitLab-CI-Variablen und im GitLab-State; was die Anwendung zur Laufzeit braucht (z. B. Zugang des Migrate-User-Triggers zum Altsystem), legt GitLab als SSM-SecureString ab |
| Übergabe | liest Werte aus dem SSM Parameter Store (z. B. Adresse des Keycloak, Altsystem-Endpunkte, Budget-Topic) | schreibt diese Werte in den SSM Parameter Store |

Damit hat GitHub **keinerlei** Zugang zu GitLab oder den eigenen Server, und GitLab
braucht keinen Zugang zu GitHub (ein öffentliches Repository lässt sich
ohne Token klonen). Beide erhalten AWS-Rechte nur als
kurzlebige OIDC-Berechtigung, eingeschränkt auf ihren Teil.

**Code auf GitHub, Deployment über GitLab — geht das?** Ja [E]:

- GitLabs eingebauter **Pull-Mirror** wäre der bequeme Weg, ist aber erst
  ab GitLab Premium verfügbar [B: https://docs.gitlab.com/user/project/repository/mirror/pull/].
  gitlab.rypox.org ist eine selbst betriebene **Community Edition** (geprüft
  29.09.2026) — der Pull-Mirror steht dort also nicht zur Verfügung.
- Ohne Premium: Ein kleines GitLab-Projekt enthält nur die Pipeline
  (`.gitlab-ci.yml`); sie klont das **öffentliche** GitHub-Repository auf
  einen festen Tag oder Commit (kein Token nötig), baut und deployt. Start
  manuell, zeitgesteuert oder per Knopf in GitLab.
- Die Versionsnummer (Tag) wird in GitLab gesetzt — GitHub kann GitLab nicht
  anstoßen, und das ist gewollt.

**Entscheidung (29.09.2026):**

| Teil | Code liegt | Deployment |
|---|---|---|
| Portal, Services, CDK | GitHub (öffentlich) | GitHub Actions |
| Terraform (Plattform) | GitHub (öffentlich — zeigt Terraform-Kenntnisse) | GitLab CI, klont GitHub ohne Token |
| Altsysteme | GitLab (privat) | GitLab CI → eigener Server |
| Schnittstelle der Altsysteme (OpenAPI) | GitHub (öffentlich, als Vertrag) | — |

## 4. Betriebsarten und wie sie sich für Besucher anfühlen

Kostenlose Bausteine (CloudFront, Next.js-SSR-Lambda, REST-Lambdas,
DynamoDB, SQS, SNS, Cognito) dürfen **immer** laufen. Die Frage betrifft nur
die drei Cent-Dienste API Gateway, EventBridge und S3.

### 4.1 Drei Betriebsarten

| | **Z1 – dauerhaft mit Deckel** | **Z2 – Demo auf Abruf (Inhaber startet)** | **Z3 – Schlafmodus (Besucher weckt)** |
|---|---|---|---|
| Idee | alles läuft dauerhaft; Throttling, Budget-Alarm und Kill-Switch begrenzen Kosten | der gesamte AWS-Teil wird vor einer Vorführung per Workflow aufgebaut und danach abgebaut | kostenlose Teile laufen immer; die drei Cent-Dienste werden nach Inaktivität automatisch entfernt und beim nächsten Besuch automatisch neu angelegt |
| Kosten | 0,00–0,05 $/Monat [A] | 0,00 $ zwischen Vorführungen [A] | 0,00 $ im Schlaf; Bruchteile eines Cents je Wachphase [A] |
| Link aus Profil oder Präsentation | funktioniert jederzeit | funktioniert nur im vereinbarten Zeitfenster | funktioniert jederzeit, mit Wartezeit beim ersten Aufruf |
| Aufwand | gering (Deckel ohnehin geplant) | mittel (zuverlässiger Auf-/Abbau, Demo-Daten) | hoch (Aufweck-Mechanik, Statusseite, Zeitschaltung) |
| Zeigt zusätzlich | Kostenschutz im Betrieb | reproduzierbare Infrastruktur als Code | „Scale to zero" bis auf Infrastrukturebene — ein starkes, seltenes Demo-Merkmal |

### 4.2 Erlebnis des Besuchers

**Z1:** Link öffnen → Startseite in unter einer Sekunde (aus dem CDN) →
Login → Portal. Nach längerer Ruhe dauert der erste Seitenaufbau hinter
dem Login 1–2 s länger (Kaltstart der SSR-Lambda) [A].

**Z2:** Außerhalb einer Vorführung zeigt der Link eine Hinweisseite (auf
GitHub Pages): kurze Beschreibung, Architekturbild, **Video/GIF der
5-Minuten-Demo**, Link zum Code und die Bitte, eine Live-Vorführung
anzufragen. Innerhalb des Zeitfensters verhält sich alles wie Z1. Wer den
Link spontan aus einem Profil oder einer Präsentation öffnet, sieht also **kein** lebendes
System — nur das Video.

**Z3:** Link öffnen → Startseite und Login sofort (laufen immer). Nach dem
Login erscheint, falls das Portal schläft, eine Statusseite: „Das
Demo-Backend wird gestartet – ca. 1–3 Minuten", mit Fortschrittsanzeige
(„API wird angelegt … Ereignisbus … fertig"). Danach geht es automatisch
weiter. Nach z. B. 60 Minuten ohne Aufruf legt sich das Portal wieder
schlafen. Mechanik [E]: Eine kostenlose Lambda erzeugt die kleine
CloudFormation-Vorlage der drei Cent-Dienste direkt (ohne GitHub-Umweg);
der EventBridge Scheduler (kostenlos) löst das Einschlafen aus.

### 4.3 Wie lange dauert der Start?

Gemessen beim ersten Durchstich am 29.09.2026 [B: Zusammenfassungen der
GitHub-Actions-Läufe „Deploy", CloudFormation-Ereignisse,
[Architektur](architektur.md) §9]; Z3 ist weiterhin eine Schätzung [A], weil
die Aufweck-Mechanik nicht gebaut ist.

```chart
{"type": "hbar", "title": "Startzeit bis zum nutzbaren Portal", "subtitle": "Minuten; gemessen 29.09.2026, Z3 geschätzt; hervorgehoben: Wartezeit, die ein Besucher erlebt", "unit": "min", "max": 10, "highlight": ["Z3 Aufwecken (Besucher wartet, geschätzt)"], "source": "GitHub Actions / CloudFormation [B], Z3 [A]",
 "data": [["Z1 (läuft immer)", 0.03, "Kaltstart der Shell-Lambda 1,6 s, danach 0,05–0,07 s"], ["Z3 Aufwecken (Besucher wartet, geschätzt)", 2, "API Gateway, EventBridge-Regeln, Upload-Bucket"], ["Z2 Teilaufbau (CloudFront bleibt stehen)", 5.5, "Neuaufbau nach Pause: Build 0,5 + Kern 3,2 + Edge 1,8 min; keine DNS-Änderung"], ["Z2 Vollaufbau (inkl. CloudFront)", 6.3, "Build 0,5 min + Anwendungs-Stack 5,7 min, davon CloudFront 3,7 min"]]}
```

| Schritt | Z2 Vollaufbau (gemessen) | Z2 Teilaufbau (gemessen) | Z3 Aufwecken [A] |
|---|---|---|---|
| Runner-Start, Installation, Build inkl. Synth | 32 s | 32 s | entfällt |
| CloudFront-Distribution anlegen | 222 s | entfällt (bleibt stehen) | entfällt |
| übrige Ressourcen (Cognito, Lambdas, DynamoDB, SQS, SNS, API, EventBridge, S3) | ≈ 121 s | im Update-Deploy enthalten | 1–2 min |
| Anwendungs-Stack gesamt | 343 s | 191 s + 105 s Edge-Umstellung (Neuaufbau nach Pause); 72–83 s bei reinem Code-Update | — |
| **Summe bis nutzbar** | **ca. 6 min** | **ca. 5,5 min** nach Pause, **ca. 2 min** bei Code-Update | **ca. 1–3 min** |

Nur beim allerersten Aufbau kommt die Zertifikatsprüfung hinzu (Stack in
us-east-1: 1.144 s, fast vollständig Warten auf den DNS-Eintrag). Der
Validierungs-CNAME bleibt dauerhaft stehen; jeder weitere Aufbau bestätigt
das Zertifikat ohne Wartezeit. Gegenüber der Schätzung (10–15 min) ist der
Vollaufbau damit gut doppelt so schnell; Demo-Daten gibt es in Phase 1 noch
nicht.

## 5. Empfehlung

- **Z1**, wenn der Link jederzeit ohne Wartezeit funktionieren soll und
  Cent-Bruchteile mit hartem Deckel akzeptabel sind.
- **Z3**, wenn garantiert nichts laufen soll, das kostet, und der Link
  trotzdem jederzeit funktionieren soll — mit 1–3 Minuten Wartezeit nach
  längerer Ruhe und deutlich mehr Bauaufwand.
- **Z2** nur, wenn Live-Vorführungen ohnehin verabredet werden; für
  spontane Besucher ist ein Video schwächer als ein
  lebendes System [E].

Vorgehen [E]: mit **Z1 und Deckel** starten (für den Durchstich ohnehin
nötig), Startzeiten messen und dann über Z3 entscheiden. Der Auf-/Abbau-
Workflow aus Z2 entsteht als Teardown sowieso.

## 6. Grenzen dieser Aussage

- Die Always-Free-Werte für Lambda, SQS, SNS, CloudWatch und KMS stammen
  aus Drittquellen [D]; die Preise für API Gateway, EventBridge und DynamoDB
  aus AWS-Preisseiten [B].
- Nicht belegt: ob AWS Rechnungsbeträge unter 0,01 $ auf 0 rundet [A].
- Die CloudFront-Flat-Rate-Stufe „Free" (inkl. 5 GB S3-Speichergutschrift)
  schließt Konten aus, die „AWS Free Tier nutzen" [B]; ob das auf ein
  Altkonto mit abgelaufenem 12-Monats-Angebot zutrifft, ist unklar [A].
  Die S3-Gutschrift deckt nur Speicher, nicht Anfragen [B].

## Quellen

- EventBridge-Preise (kein Freikontingent für eigene Events, Scheduler 14 Mio.): https://aws.amazon.com/eventbridge/pricing/
- API-Gateway-Preise: https://aws.amazon.com/api-gateway/pricing/
- DynamoDB-Preise: https://aws.amazon.com/dynamodb/pricing/
- Cognito-Preise (Essentials/Lite: 10.000 MAU frei, ohne Ablauf; abgerufen 29.09.2026): https://aws.amazon.com/cognito/pricing/
- S3-Preise: https://aws.amazon.com/s3/pricing/
- AWS Budgets (kostenlos): https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/
- CloudFront-Flat-Rate (Berechtigung, S3-Gutschrift): https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html
- GitHub Actions (kostenlos für öffentliche Repositories): https://docs.github.com/en/billing/concepts/product-billing/github-actions
- GitLab-managed Terraform State: https://docs.gitlab.com/user/infrastructure/iac/terraform_state/
- Drittquelle Always Free [D]: https://infratally.com/articles/aws-free-tier-2026.html
