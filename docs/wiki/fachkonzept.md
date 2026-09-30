# Fachkonzept — Multi-Sparten-Kundenportal

Stand: 2026-09-30 (Identität: Cognito/Keycloak eingearbeitet; §7.1 mit dem Code abgeglichen) · Status: **abgestimmt** (29.09.2026) · Kennzeichnung: **[E]** Einschätzung/Festlegung im Entwurf.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

## 1. Zweck und Rahmen

Das Demo zeigt die **Modernisierung eines Kundenportals** mit Übernahme
bestehender Kundenkonten — ein typisches Kernthema solcher Modernisierungen.
Rahmen aus den bisherigen Entscheidungen ([Übersicht](uebersicht.md)):

- fiktiver **Multi-Sparten-Versorger** (Strom, Gas, Wasser, Internet,
  Mobilfunk), der einen regionalen Internet-/Mobilfunkanbieter übernommen hat;
- jeder Besucher erhält per Einladungslink einen eigenen **Mandanten**
  (Bridge-Modell) mit vollständigem Beispieldatenstand;
- zwei simulierte **Altsysteme** auf einem eigenen Server, Portal auf AWS (Hybrid);
- Anmeldung am Portal über **Amazon Cognito**; das Telko-Altsystem meldet
  seine Kunden über einen selbst betriebenen **Keycloak** (`id.rypox.net`)
  an. Die Muster (Login per OIDC, Lazy Migration, Bulk-Import) funktionieren
  mit jedem Standard-OIDC-Anbieter; Auth0 oder Keycloak wären austauschbar;
- keine Markennamen: Die Unternehmen heißen im Demo schlicht
  **„Versorger"** und **„Telko"** (der übernommene Anbieter).

Nicht Ziel: echte Abrechnung, echte Tarife, rechtlich belastbare
Vertragsabschlüsse. Alles Fachliche ist **plausibel vereinfacht** [E].

## 2. Die Geschichte in drei Sätzen

Der Versorger modernisiert sein Kundenportal und holt dabei die Kunden der
übernommenen Telko herüber. Bestandskunden beider Häuser sollen sich
**ohne Neuregistrierung** mit ihren alten Zugangsdaten anmelden können;
wer bei beiden Kunde ist, bekommt **ein** Konto mit allen Verträgen. Das
**Migrations-Cockpit** zeigt jederzeit, wie weit die Übernahme ist und wo
es hakt.

## 3. Demo-Personen (je Mandant)

Jeder Mandant enthält dieselben Demo-Personen; der Besucher meldet sich
auf der Pass-Seite per Knopf „Als … anmelden" an (Zugangsdaten werden dort
angezeigt, die Personen existieren nur in seinem Mandanten) [E].

| Person | Herkunft | Verträge | Besonderheit | zeigt |
|---|---|---|---|---|
| **Anna Becker** | Versorger-Altsystem, aktiv | Strom, Gas | Passwort-Hash bcrypt, Profil vollständig | **Lazy Migration** beim ersten Login, danach Zählerstand erfassen |
| **Bernd Yilmaz** | beide Altsysteme | Strom (Versorger), Internet + Mobilfunk (Telko) | zwei Konten, Adresse unterschiedlich geschrieben („Hauptstr. 5" / „Hauptstraße 5") | **Dublettenerkennung** und **Account-Linking** |
| **Carla Schulz** | Telko-Altsystem, seit 2 Jahren nicht angemeldet | Mobilfunk | Telko-eigenes Hash-Verfahren; Hashes lassen sich nicht nach Cognito importieren | **Bulk-Import** der Inaktiven, erzwungener **Passwort-Reset** |
| **David Neumann** | kein Altkonto | – | Neukunde | **Registrierung** und **progressives Onboarding** (Kundennummer verknüpfen) |
| **Emil Wagner** | Versorger-Altsystem | Wasser | fehlende E-Mail-Adresse im Altsystem | Datenmangel → landet im Cockpit unter „Klärfälle" |

Zusätzlich zwei Rollen außerhalb der Geschichte:

| Rolle | Wer | darf |
|---|---|---|
| **Pass-Inhaber** | Besucher mit Einladungslink | Demo-Personen nutzen, Migrations-Cockpit seines Mandanten, Mandant zurücksetzen |
| **Inhaber** | Projektinhaber | Einladungslinks erzeugen, Mandanten starten/löschen, Übersicht aller Mandanten |

## 4. Journeys

```chart
{"type": "timeline", "title": "Die neun Journeys des Demos", "events": [["J1", "Registrierung: Neukunde (David) registriert sich, bestätigt E-Mail im Demo-Postfach, verknüpft seine Kundennummer im Onboarding"], ["J2", "Erst-Login Altkunde: Anna meldet sich mit altem Passwort an; Cognito ruft per Migrate-User-Trigger das Versorger-Altsystem, prüft das Passwort dort und übernimmt das Konto (Lazy Migration); Telko-Kunden werden ebenso gegen den Keycloak der Telko geprüft; fehlende Angaben per Formular"], ["J3", "Konten zusammenführen: Bernd meldet sich an; das Portal erkennt ein zweites Altkonto bei der Telko und bietet die Verknüpfung an; nach Bestätigung sieht er alle Verträge"], ["J4", "Zählerstand: Anna fotografiert den Stromzähler, gibt den Stand ein; Ereignis → neuer Abschlag berechnet → Bestätigung im Postfach"], ["J5", "Datenvolumen: Zeitgesteuert: Bernds Mobilfunk-Datenvolumen erreicht 80 % → Benachrichtigung im Portal"], ["J6", "Vertrag ändern: Kunde ändert Abschlag oder Tarifoption; Änderung erscheint als Ereignis in der Timeline"], ["J7", "Bulk-Migration: Pass-Inhaber startet im Cockpit den Import der inaktiven Telko-Kunden; Carla erhält Reset-Aufforderung; ein fehlerhafter Datensatz landet in der DLQ"], ["J8", "Migrations-Cockpit: Fortschritt beider Altbestände, Klärfälle (Emil), DLQ mit Redrive-Knopf, Ereignis-Timeline live"], ["J9", "Demo-Pass: Einladungslink → Mandant in Sekunden → 7 Tage Nutzung → automatische Löschung"]]}
```

Die **5-Minuten-Demo** nutzt J2 → J3 → J4 → J7 → J8 [E].

## 5. Fachliche Bereiche

Jeder Bereich hat eine klare Zuständigkeit, eigene Daten und
veröffentlicht Ereignisse; Bereiche lesen fremde Daten nie direkt [E].

| Bereich | Verantwortet | Oberfläche (Zone) | Service |
|---|---|---|---|
| **Identität & Konto** | Login, Registrierung, Verknüpfung von Altkonten, Rollen | Shell (`/`, Login, Onboarding) | Cognito + `identity`-Lambda (Cognito-Trigger, u. a. Migrate User) |
| **Kunde** | Stammdaten, Adresse, Einwilligungen, Profilvollständigkeit | Shell (`/profil`) | `customer` |
| **Vertrag** | Verträge je Sparte, Tarif, Abschlag, Laufzeit | Zone „Verträge & Rechnungen" (`/vertraege`) | `contract` |
| **Verbrauch** | Zählerstände (Strom, Gas, Wasser), Datenvolumen (Mobilfunk) | Zone „Verbrauch" (`/verbrauch`) | `consumption` |
| **Dokumente** | Rechnungen (PDF), Uploads (Zählerfotos) | Zone „Verträge & Rechnungen" | `documents` (S3) |
| **Benachrichtigung** | Demo-Postfach, In-App-Feed | Widget „Glocke" in allen Zonen | `notification` (SNS) |
| **Migration** | Lazy-/Bulk-Migration, Dubletten, Klärfälle, Fortschritt | Zone „Migrations-Cockpit" (`/cockpit`) | `migration` |
| **Mandant & Pass** | Einladungen, Mandanten anlegen/löschen, Kontingent | Verwaltungsbereich (`/admin`, `/pass`) | `tenancy` |

## 6. Ereigniskatalog

Alle Ereignisse laufen über EventBridge; Name in Vergangenheitsform, jedes
enthält `tenantId`, `occurredAt`, `correlationId` [E].

| Ereignis | Quelle | Reagiert | Wirkung |
|---|---|---|---|
| `CustomerRegistered` | identity | customer, notification | Kundendatensatz anlegen, Willkommensnachricht |
| `LegacyAccountMigrated` | identity (Lazy) / migration (Bulk) | customer, contract, migration | Stammdaten und Verträge aus Altsystem übernehmen, Cockpit zählt |
| `DuplicateCandidateFound` | migration | notification | Kunde erhält Verknüpfungsangebot |
| `AccountsLinked` | identity | contract, migration | Verträge beider Häuser einem Konto zuordnen |
| `OnboardingCompleted` | customer | notification | Hinweis „Profil vollständig" |
| `MeterReadingSubmitted` | consumption | contract, notification | Abschlag neu berechnen, Bestätigung |
| `InstallmentAdjusted` | contract | notification, documents | neue Abschlagsinfo als PDF |
| `DataVolumeThresholdReached` | consumption (per Scheduler) | notification | Warnung im Portal |
| `ContractChanged` | contract | notification | Bestätigung |
| `BulkMigrationStarted` / `BulkMigrationCompleted` | migration | notification | Cockpit-Status |
| `PasswordResetRequired` | migration | notification | Reset-Aufforderung ins Demo-Postfach |
| `MigrationRecordFailed` | migration (DLQ) | — | Klärfall im Cockpit, Redrive möglich |
| `DemoPassIssued` / `DemoPassExpired` | tenancy | tenancy, alle | Mandant anlegen bzw. löschen |

```chart
{"type": "flow", "title": "Beispiel: Zählerstand erfassen (J4)", "gap": 60,
 "layers": [
  {"title": "Oberfläche", "nodes": [["Zone Verbrauch", "Foto + Zählerstand"]]},
  {"title": "Eingang", "accent": true, "nodes": [["API Gateway", "JWT prüfen, Mandant bestimmen"], ["S3 (Presigned URL)", "Foto"]]},
  {"title": "Service", "nodes": [["consumption", "speichert Stand"]]},
  {"title": "Ereignis", "accent": true, "nodes": [["EventBridge", "MeterReadingSubmitted"]]},
  {"title": "Reaktion", "nodes": [["contract (direkt)", "Abschlag neu"], ["SQS → notification", "Postfach, Glocke"]]}
 ],
 "edges": [["Zone Verbrauch", "API Gateway"], ["Zone Verbrauch", "S3 (Presigned URL)"], ["API Gateway", "consumption"], ["consumption", "EventBridge"], ["EventBridge", "contract (direkt)"], ["EventBridge", "SQS → notification"]]}
```

## 7. Datenmodell

### 7.1 Mandanten-Tabelle (eine DynamoDB-Tabelle je Mandant, provisioned 5 RCU/5 WCU)

Kapazitätsmodus **provisioned mit 5 RCU/5 WCU** je Tabelle (Entscheidung
29.09.2026), weil nur provisionierte Kapazität unter Always Free fällt
(25 RCU/WCU je Konto und Region). Folge [E]: Plattform-Tabelle und
Mandanten-Tabellen teilen sich diese 25 Einheiten; ein GSI belegt eigene
Kapazität. Ohne Guthaben sind damit nur wenige Mandanten gleichzeitig
kostenlos — siehe [Demo-Pass](demo-pass.md) §5.

Single-Table-Design: Partition Key `PK`, Sort Key `SK`, ein globaler
Sekundärindex `GSI1` für Suchen [E].

**Abgleich mit dem Code (Stand 30.09.2026, Phase 2 in Arbeit):** Bis zum
Demo-Pass (Phase 4) gibt es genau **eine** Tabelle für alle Mandanten. Jeder
Schlüssel beginnt deshalb mit dem Mandanten (`TENANT#<t>#…`, Helfer
`tenantKey` in `packages/service-kit`); mit einer eigenen Tabelle je Mandant
wäre dieses Präfix überflüssig, schadet aber nicht [E]. `GSI1` ist noch nicht
angelegt. Die Spalte „Stand" nennt, was schon gebaut ist; Einzelheiten in
[Architektur](architektur.md) §5.

| Entität | PK | SK | Zugriffsmuster | Stand |
|---|---|---|---|---|
| Kunde | `TENANT#<t>#CUST#<kundeId>` | `PROFILE` | Profil lesen/ändern | gebaut (customer) |
| Anmelde-Identität → Kunde | `TENANT#<t>#SUBJ#<sub>` | `CUSTOMER` | Kunde zum Token finden | gebaut (customer) |
| Projektion Identität → Kunde je Service | `TENANT#<t>#SUBJ#<sub>` | `CONTRACTS`, `CONSUMPTION`, `DOCUMENTS`, `MAILBOX` | jeder Service findet den Kunden ohne fremde Einträge | gebaut |
| Verknüpftes Altkonto | `TENANT#<t>#CUST#<kundeId>` | `LEGACY#<system>#<altId>` | Herkunft anzeigen, Dubletten prüfen | geplant (Phase 3) |
| Vertrag | `TENANT#<t>#CUST#<kundeId>` | `CONTRACT#<sparte>#<vertragId>` | alle Verträge eines Kunden, je Sparte filtern | gebaut (contract) |
| Vertragsprojektion | `TENANT#<t>#CONTRACT#<vertragId>` | `CONSUMPTION` | Vertrag aus Sicht des Verbrauchs, mit Versionsschutz | gebaut (consumption) |
| Zählerstand | `TENANT#<t>#CONTRACT#<vertragId>` | `READING#<datum>#<readingId>` | Verlauf je Zähler, neuester zuerst (geplant: `READING#<datum>`; die ID erlaubt mehrere Stände am selben Tag) | gebaut (consumption) |
| Datenvolumen | `TENANT#<t>#CONTRACT#<vertragId>` | `USAGE#<monat>` | Monatsverbrauch; im Code bisher nur der Merker „Warnung verschickt", der Verbrauch selbst ist berechnet (Demo) | teilweise |
| Zeitplan Datenvolumen | `SCHEDULE#DATAVOLUME` | `TENANT#<t>#CONTRACT#<vertragId>` | täglicher Lauf über alle Mobilfunkverträge; einziger Schlüssel ohne Mandanten-Präfix vorne, weil der Lauf mandantenübergreifend ist | gebaut (consumption) |
| Dokument | `TENANT#<t>#CUST#<kundeId>` | `DOC#<documentId>` | Postfach, Rechnungen; die ID beginnt mit dem Zeitpunkt (geplant: `DOC#<datum>#<docId>`, gleiche Sortierung) | gebaut (documents) |
| Benachrichtigung | `TENANT#<t>#CUST#<kundeId>` | `NOTE#<id>` | Glocke, ungelesene zuerst; `<id>` = Zeitstempel + eventId | gebaut (notification) |
| Postfach-Sprache | `TENANT#<t>#CUST#<kundeId>` | `MAILBOX` | Texte auf Deutsch oder Englisch | gebaut (notification) |
| Migrationsstatus | `TENANT#<t>#MIGRATION` | `REC#<system>#<altId>` | Cockpit: Status je Altdatensatz; `GSI1PK=MIGSTATUS#<status>` für Zählungen | geplant (Phase 3; Präfix nach der Konvention oben [E]) |
| Ereignis-Timeline | `TENANT#<t>#TIMELINE` | `EVT#<zeitstempel>#<id>` | Cockpit-Timeline (Stream-Kopie aller Ereignisse) | geplant (Phase 3; Präfix nach der Konvention oben [E]) |

### 7.2 Plattform-Tabelle (eine, mandantenübergreifend)

| Entität | PK | SK | Zweck |
|---|---|---|---|
| Einladung | `INVITE#<code-hash>` | `META` | Einladungslink, einmalig, 14 Tage gültig |
| Pass | `PASS#<passId>` | `META` | Inhaber-E-Mail, gültig bis, Kontingent-Zähler |
| Mandant | `TENANT#<tenantId>` | `META` | Tabellenname, Status (anlegen, aktiv, löschen) |
| Kontingent-Zähler | `PASS#<passId>` | `QUOTA#<art>` | API-Aufrufe, Events, Uploads (atomar hochgezählt) |

### 7.3 Altsysteme (eigener Server, je Mandant ein Datenbankschema)

| | Versorger-Altsystem | Telko-Altsystem |
|---|---|---|
| Technik (simuliert) | relationale DB, „klassischer" Aufbau | andere Feldnamen, andere Formate |
| Kundennummer | `V-1000123` | `T/88-4711` |
| Anmeldung | REST „Anmeldung prüfen" (bcrypt-Hash im Altsystem) | eigener **Keycloak** unter `id.rypox.net` (Realm der Telko) |
| Passwort | bcrypt; beim Login per Migrate-User-Trigger übernehmbar (Cognito erhält das Passwort einmalig im Trigger); beim Bulk-Import gilt im Demo: nicht übernehmen → Reset. Hinweis: Cognito kann inzwischen bcrypt-Hashes per CSV importieren, aber nicht in jedem User Pool (offen, siehe [Übersicht](uebersicht.md)) | Telko-eigenes Verfahren mit geheimem Zusatzwert; beim Login per Migrate-User-Trigger gegen Keycloak übernehmbar, per Bulk-Import **nicht** (Verfahren von Cognito nicht unterstützt) → Reset nötig |
| Adresse | Straße und Hausnummer getrennt | eine Zeile, Abkürzungen („Str.") |
| Gezielte Mängel | fehlende E-Mail (Emil), veraltete Telefonnummern | Dublette zu Versorger (Bernd), ungültige E-Mail, ein Datensatz mit Pflichtfeld leer (→ DLQ) |
| Schnittstelle | REST: Anmeldung prüfen, Kunde lesen, Kunden seitenweise exportieren (OpenAPI-Vertrag öffentlich im GitHub-Repository) | dieselbe Schnittstelle, andere Datenform |

Die Mängel sind **Absicht**: Sie machen die Migrationsgeschichte echt und
füllen das Cockpit mit Klärfällen [E].

## 8. REST-Schnittstelle (Überblick)

Alle Pfade unter `/api`, Mandant aus dem JWT (nie aus der URL), OpenAPI als
Vertrag, TypeScript-Client wird daraus erzeugt [E].

| Ressource | Methoden | Bereich |
|---|---|---|
| `/me` | GET, PATCH | Kunde |
| `/me/links` | GET, POST (Verknüpfung bestätigen) | Identität |
| `/contracts`, `/contracts/{id}` | GET, PATCH (Abschlag, Option) | Vertrag |
| `/contracts/{id}/readings` | GET, POST | Verbrauch |
| `/contracts/{id}/usage` | GET | Verbrauch |
| `/documents`, `/documents/upload-url` | GET, POST | Dokumente |
| `/notifications` | GET, PATCH (gelesen) | Benachrichtigung |
| `/migration/status`, `/migration/bulk`, `/migration/dlq/{id}/redrive` | GET, POST | Migration (nur Pass-Inhaber) |
| `/admin/invites`, `/admin/tenants` | GET, POST, DELETE | Mandant & Pass (nur Inhaber) |

## 9. Repository-Struktur

**Öffentlich (GitHub, Monorepo)** [E]:

| Pfad | Inhalt |
|---|---|
| `apps/shell` | Next.js-Zone: Start, Login, Onboarding, Profil, Pass-Seite |
| `apps/contracts` | Next.js-Zone „Verträge & Rechnungen" |
| `apps/consumption` | Next.js-Zone „Verbrauch" |
| `apps/cockpit` | Next.js-Zone „Migrations-Cockpit" |
| `apps/admin` | Verwaltungsbereich des Inhabers |
| `packages/ui` | Component Library + Storybook |
| `packages/widget-notifications` | Laufzeit-Widget „Glocke" |
| `packages/api-contract` | OpenAPI des Portals und der Altsysteme, erzeugte TS-Clients |
| `packages/events` | Ereignis-Schemas und Typen |
| `services/*` | Lambdas je Bereich (`identity` mit den Cognito-Triggern, `customer`, `contract`, `consumption`, `documents`, `notification`, `migration`, `tenancy`) |
| `infra/cdk` | CDK-Anwendung (Stacks: Edge, Identität mit Cognito User Pool und App-Client, Plattform-Tabelle, Services, Mandanten-Vorlage) |
| `infra/terraform` | Fundament (OIDC-Vertrauensstellungen für GitHub Actions und GitLab CI, Budget + SNS-Grundlage des Kill-Switch, SSM-Grundwerte; ab Phase 3 Keycloak-Konfiguration) — deployt von GitLab CI |
| `docs/` | dieses Wiki und die Berichte |
| `.github/workflows` | CI, Deploy, Teardown |

**Privat (gitlab.rypox.org)**: `legacy-versorger`, `legacy-telko` (je
Dienst + Beispieldaten-Generator), Pipeline-Projekt für Terraform. Der
Keycloak der Telko (`id.rypox.net`) läuft auf eigener Infrastruktur; seine
Konfiguration kommt ab Phase 3 aus `infra/terraform`.

## 10. Entscheidungen (29.09.2026)

1. Demo-Personen und Journeys: **passen** wie beschrieben.
2. Besucher dürfen **eigene Testkunden** anlegen — nur im eigenen Mandanten;
   sie verschwinden mit dem Pass.
3. **Demo-Postfach** statt echter E-Mails an Demo-Personen; echte E-Mails
   gehen nur an die bestätigte Adresse des Pass-Inhabers.
4. Oberfläche **zweisprachig: Deutsch und Englisch** (Umschalter in der
   Shell, Texte je Zone und in der Component Library über gemeinsame
   Übersetzungsdateien; Demo-Daten bleiben deutsch) [E].
