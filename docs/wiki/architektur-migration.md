# Architektur: Altsysteme und Migration

Stand: 2026-09-30 · Phase 3 abgeschlossen (Release v0.3.0), live per E2E geprüft; Altsysteme und Keycloak-Realm laufen ([Anleitung Altsysteme](anleitung-altsysteme.md)). Ergänzt die [Architektur](architektur.md) (Ist-Stand Phase 1 und 2). Kennzeichnung: **[B]** belegt, **[A]** Annahme, **[E]** Einschätzung.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

## Überblick

Der Versorger übernimmt die Kundenkonten zweier Altsysteme
([Fachkonzept](fachkonzept.md) §7.3). Beide laufen als kleine HTTP-Dienste
auf einem eigenen Server hinter einem [Reverse Proxy](glossar.md#reverse-proxy)
mit TLS, damit Lambdas sie ohne VPC erreichen; Code und Beispieldaten liegen in
privaten GitLab-Projekten, die Schnittstellen öffentlich in
`packages/api-contract/legacy/`.

| | Versorger (`legacy-versorger`) | Telko (`legacy-telko`) |
|---|---|---|
| Adresse | `https://kundenportal-versorger.rypox.com` | `https://kundenportal-telko.rypox.com` |
| Datenform | deutsche Felder, Straße und Hausnummer getrennt, Euro als Dezimaltext | `Nachname, Vorname`, eine Adresszeile mit Abkürzungen, deutsche Daten, Preise als Zahl |
| Kundennummer | `V-1000123` | `T/88-4711` (mit Schrägstrich, in Pfaden URL-kodiert) |
| Passwörter | [bcrypt](glossar.md#bcrypt) | eigenes Verfahren: HMAC-SHA256 mit Salt und geheimem [Pepper](glossar.md#pepper) |
| Anmeldung am Portal | Passwortprüfung per REST | Passwortprüfung im Realm `telko` des eigenen [Keycloak](glossar.md#keycloak) per [Password Grant](glossar.md#password-grant) |
| Datenhaltung | eine [SQLite](glossar.md#sqlite)-Datei je Mandant (`X-Mandant`) | eine SQLite-Datei je Mandant (`X-Tenant`) |
| Absicherung | API-Schlüssel `X-Api-Key` | API-Schlüssel `Authorization: ApiKey …` |

Beide Altsysteme bieten: Anmeldung prüfen, Kunde lesen, Kunde per E-Mail
finden, Kunden seitenweise exportieren (inklusive Hashes) und die
Beispieldaten eines Mandanten neu erzeugen. Adressen, Schlüssel und das
Keycloak-Client-Secret liest die Anwendung zur Laufzeit aus dem
[Parameter Store](glossar.md#ssm-parameter-store) (`/kundenportal/legacy/…`,
drei SecureStrings mit dem AWS-verwalteten Schlüssel); geschrieben werden sie
von Terraform aus CI-Variablen des GitLab-Projekts `platform`
([Anleitung Altsysteme](anleitung-altsysteme.md)). Den Realm `telko` im eigenen
Keycloak legt das Deploy des Telko-Altsystems an: [Ansible](glossar.md#ansible)
rendert die Realm-Definition (Einstellungen, User-Profile mit `subscriberId`,
vertraulicher Client `kundenportal-migration` nur mit Password Grant, Mapper
`subscriber_id`, Demo-Personen) mit den Secrets aus dem verschlüsselten Vault
und übergibt sie `kcadm.sh` im Keycloak-Container über stdin, sofern der Realm
fehlt. Das Paket
`packages/legacy` kapselt die Clients und die Abbildung auf die Ereignisse
des Portals.

```chart
{"type": "flow", "title": "Übernahme eines Altkontos (J2, J3, J7)", "gap": 30,
 "layers": [
  {"title": "Auslöser", "nodes": [["Erste Anmeldung", "Cognito kennt die Adresse nicht"], ["Bulk-Import", "Inhaber im Cockpit"]]},
  {"title": "Identität", "accent": true, "nodes": [["Migrate User", "prüft Passwort beim Altsystem"], ["Post Authentication", "kennt jetzt die sub"]]},
  {"title": "Migration", "nodes": [["migration-Worker", "liest Export, sucht Dubletten"], ["Record-Processor", "legt Konto ohne Passwort an"]]},
  {"title": "Ereignisse", "accent": true, "nodes": [["EventBridge", "LegacyAccountMigrated, DuplicateCandidateFound, AccountsLinked, PasswordResetRequired, MigrationRecordFailed"]]},
  {"title": "Wirkung", "nodes": [["customer, contract", "Profil und Altverträge"], ["notification", "Reset-Aufforderung, Verknüpfungsangebot"], ["Migrations-DLQ", "Redrive aus dem Cockpit"]]}
 ],
 "edges": [["Erste Anmeldung", "Migrate User"], ["Migrate User", "Post Authentication"], ["Post Authentication", "EventBridge"],
           ["Bulk-Import", "migration-Worker"], ["migration-Worker", "Record-Processor"], ["Record-Processor", "EventBridge"], ["Record-Processor", "Migrations-DLQ"],
           ["EventBridge", "customer, contract"], ["EventBridge", "notification"], ["EventBridge", "migration-Worker"]]}
```

## 1. Lazy Migration (J2)

1. Anna meldet sich mit ihrer alten Adresse und ihrem alten Passwort am
   Managed Login an. Cognito kennt sie nicht und ruft den
   [Migrate-User-Trigger](glossar.md#migrate-user-trigger) (`services/identity`).
2. Der Trigger prüft das Passwort **parallel** beim Versorger (REST, bcrypt)
   und beim Keycloak der Telko — Cognito gibt einem Trigger höchstens
   5 Sekunden [B: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-working-with-lambda-triggers.html].
   Passt es, liest er den Kunden, prüft die Pflichtdaten und gibt die
   Attribute zurück: bestätigte E-Mail, Name und die
   [Custom Attributes](glossar.md#custom-attribute) `legacy_ref`
   (`utility:V-1000123`) und `migration_mode` (`lazy`). Cognito legt den
   Nutzer mit dem eingegebenen Passwort an; der Hash verlässt das Altsystem nie.
3. Die neue `sub` steht erst nach dem Migrate-User-Trigger fest. Die
   AWS-Dokumentation lässt offen, ob bei genau dieser Anmeldung der
   [Post-Authentication-Trigger](glossar.md#post-authentication-trigger) läuft
   (in der Tabelle für Managed Login fehlt er); der Pre-Token-Trigger läuft,
   weil Tokens ausgestellt werden [A]. Deshalb versuchen **beide**, die Übernahme
   zu melden: Sie lesen das Altsystem erneut und veröffentlichen
   `LegacyAccountMigrated` (Quelle `kundenportal.identity`) mit Stammdaten und
   Verträgen. Ein Merker (`SUBJ#<sub>` / `IDENTITY#LEGACY`) sorgt dafür, dass es
   einmal geschieht; die Ereignis-ID ist aus dem Altkonto abgeleitet, eine
   Wiederholung ist also dasselbe Ereignis. Scheitert das Veröffentlichen,
   versucht es die nächste Anmeldung oder Token-Erneuerung erneut; die Anmeldung
   selbst scheitert daran nie. Der App-Client erlaubt den Passwort-Flow
   (`USER_PASSWORD_AUTH`), den AWS für den Migrate-User-Trigger voraussetzt
   [B: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-migrate-user.html].
4. Der Pre-Token-Trigger setzt zusätzlich den Claim `origin`. Ruft die Shell
   `/me` auf, bevor das Ereignis verarbeitet ist, legt `customer` das Profil
   mit dieser Herkunft und der aus der Identität abgeleiteten Kunden-ID an
   (`customerIdFor`) — ohne Demo-Verträge. Der Worker von `customer` ergänzt
   dann Anschrift und Telefon; `contract` übernimmt die Verträge mit dem
   bisherigen Abschlag und dem letzten abgerechneten Zählerstand als Bezug.

Fehlt einem Altkonto die E-Mail-Adresse (Emil), lehnt der Trigger ab: ein
[Klärfall](glossar.md#klärfall), kein Portal-Konto.

## 2. Bulk-Import der Inaktiven (J7)

Der Inhaber startet im Cockpit den Import eines Altsystems
(`POST /migration/bulk`, `BulkMigrationStarted`). Der migration-Worker liest
den Export und sortiert: Konten mit Anmeldung in den letzten 12 Monaten
warten auf ihre eigene Anmeldung (`pending-lazy`), bereits übernommene
zählen als erledigt, jedes inaktive Konto geht als eigener asynchroner Aufruf
an den **Record-Processor**. Dieser

- legt das Cognito-Konto mit einem zufälligen, niemandem bekannten Passwort
  an (bestätigt, damit „Passwort vergessen" funktioniert; keine Mail),
- veröffentlicht `LegacyAccountMigrated` (Quelle `kundenportal.migration`,
  `passwordMigrated: false`) und `PasswordResetRequired` — die
  Aufforderung erscheint im Demo-Postfach,
- führt Klärfälle (keine oder ungültige E-Mail) als Status im Cockpit,
- und wirft bei fehlenden Pflicht-Stammdaten: Lambda gibt den Aufruf ohne
  Wiederholung an die **Migrations-DLQ** (SQS,
  [On-Failure-Destination](glossar.md#on-failure-destination)), der Datensatz
  steht als `failed` im Cockpit, `MigrationRecordFailed` geht auf den Bus.

Der letzte bearbeitete Datensatz schließt den Lauf (`BulkMigrationCompleted`
mit Zählern). **Redrive:** Das Cockpit nimmt die Aufgabe per Long Poll aus der
DLQ und gibt sie mit der eingetragenen Korrektur (z. B. fehlende
Postleitzahl) erneut an den Processor; das Altsystem bleibt unverändert.

Passwort-Hashes: Telko-Hashes lassen sich ohne den Pepper nirgends prüfen,
also nie importieren. bcrypt-Hashes des Versorgers kann Cognito seit 07/2026
per CSV-Importauftrag übernehmen (Spalte `password_hash`, `$2b$` bis Aufwand
12; importierte Nutzer sind sofort `CONFIRMED`, zählen beim Import nicht als
MAU) — aber nur in User Pools auf der neuen Cognito-Infrastruktur, ohne
Einstellung, mit der man das selbst herbeiführen kann
[B: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-using-import-tool.html].
Ein Auftrag braucht außerdem eine IAM-Rolle für CloudWatch Logs, eine CSV über
eine vorsignierte URL und darf nur einzeln je Konto laufen; ein Passwort-Hash
für einzelne Nutzer per API existiert nicht
[B: https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminSetUserPassword.html].
Das Demo setzt deshalb auch beim Versorger auf die Reset-Aufforderung (Grund
`hash-import-unavailable`); die offene Folgefrage steht in der
[Übersicht](uebersicht.md).

## 3. Dubletten und Account-Linking (J3)

Nach jeder Übernahme durchsucht der migration-Worker den Export des jeweils
anderen Altsystems. Als dieselbe Person gilt nur, wer im Namen übereinstimmt
**und** zusätzlich in der normalisierten Adresse, im Geburtsdatum oder in der
E-Mail ([Adressnormalisierung](glossar.md#adressnormalisierung):
„Hauptstr. 5" = „Hauptstraße 5"). Ein Treffer wird Angebot
(`SUBJ#<sub>` / `LINK#…`) und Nachricht im Postfach
(`DuplicateCandidateFound`). Auf der Kontoseite bestätigt der Kunde mit dem
**Passwort des anderen Kontos** — geprüft vom anderen Altsystem bzw. dessen
Keycloak, nie gespeichert. Danach veröffentlicht der Dienst `AccountsLinked`
mit den Verträgen des verknüpften Kontos; `contract` übernimmt sie,
`customer` vermerkt das Altkonto.

## 4. Migrations-Cockpit (J8)

Zone `/cockpit` (`apps/cockpit`), nur für Mitglieder der
[Cognito-Gruppe](glossar.md#cognito-gruppe) `owner` — die API prüft
`cognito:groups`, die Zone zeigt bei 403 einen Hinweis. Inhalte: Fortschritt
je Altsystem (übernommen/verknüpft im Verhältnis zur Zahl im Altsystem),
Läufe, Klärfälle, DLQ mit Redrive und die Ereignis-
[Timeline](glossar.md#timeline): Eine Regel liefert **jedes** Ereignis des
Busses an den migration-Worker, der es ohne personenbezogene Daten (nur IDs,
Altkonten, Sparten, Zähler) mit [TTL](glossar.md#dynamodb-ttl) von 7 Tagen
ablegt. Die Seite lädt sich alle 10 Sekunden neu.

**Kennzahlen und Suche (Phase 6).** `GET /migration/status` liefert
zusätzlich je Altsystem `migratedToday` (übernommen oder verknüpft seit
00:00 Uhr deutscher Zeit) und `trends`: offene Klärfälle und DLQ-Einträge am
Ende der letzten sieben Tage (Sparklines), neue Klärfälle der letzten 24
Stunden und die in dieser Zeit erfolgreich erneut verarbeiteten Datensätze
(„−n nach Redrive“). Alles wird aus den Datensätzen berechnet, die das Cockpit
ohnehin liest; dafür merkt sich ein Datensatz `failedAt` und `redrivenAt`.
`GET /migration/search?q=` sucht ohne Index in denselben Datensätzen
(Kundennummer, Name, Status, Problem) und in der Timeline (Ereignistyp,
Kennungen); Mandanten findet die Cockpit-Seite des Inhabers zusätzlich in der
Pass-Liste.

### Demo-Reset

Der [Demo-Reset](glossar.md#demo-reset) (`POST /migration/reset`) entfernt
die von der Migration angelegten Konten (nie das eigene) samt ihrer
Portaldaten, damit die Journeys wieder von vorn laufen. Eine erneute
Anmeldung derselben Person erzeugt eine neue `sub` und damit eine neue
Kundennummer; ohne Aufräumen blieben die alten Daten unerreichbar liegen.
Schlimmer noch: Altverträge behalten ihre Vertragsnummer
(`deterministicUuid(Mandant, Altvertrag)`), sodass Zählerstände und die
Vertragsprojektion von `consumption` beim neuen Konto wieder auftauchten
bzw. die neue Projektion als „älter" verwürfen [E].

Ablauf im Migrationsdienst:

1. Er sammelt die Identitäten aus seinen Datensätzen (`REC#…` mit `sub`,
   ohne die des Aufrufers) und löscht deren Cognito-Konten.
2. Er leert die Timeline des Mandanten (sonst erst per TTL nach 7 Tagen).
3. Er veröffentlicht `MigratedAccountsRemoved` mit `reason: "demo-reset"`
   und je Konto `subject` und `customerId`
   (`customerIdFor(tenantId, subject)`) — in Schüben zu höchstens 100
   Konten, weit unter der Grenze von 256 KB je Ereignis und klein genug,
   dass jeder Konsument einen Schub in einem Aufruf abarbeitet. Auch
   Identitäten, deren Cognito-Konto schon fehlte, stehen darin: Ihre Daten
   können noch da sein.
4. Er löscht seine Verknüpfungsangebote (`SUBJ#<sub>` / `LINK#…`) und den
   Merker „Übernahme gemeldet" (`SUBJ#<sub>` / `IDENTITY#LEGACY`). Der
   Merker gehört dem Identitätsbereich; der hat aber keinen Worker, der auf
   Ereignisse reagieren könnte. Der Reset löscht ihn deshalb direkt — so wie
   er auch die Cognito-Konten des Identitätsbereichs löscht.
5. Zuletzt löscht er Datensätze und Läufe und leert — nur beim Inhaber — die
   gemeinsame DLQ. Scheitert ein Schritt vorher, findet ein zweiter Reset die
   Identitäten also noch.

Jeder Bereich löscht seine Daten selbst, im Mandanten des Ereignisses und
über `tenantData` (Pass-Mandant: eigene Tabelle, Vending-Anmeldedaten):

| Bereich | Löscht je Konto |
|---|---|
| customer | `CUST#<id>` / `PROFILE`, `SUBJ#<sub>` / `CUSTOMER` |
| contract | `CUST#<id>` / `CONTRACT#…`, `SUBJ#<sub>` / `CONTRACTS` |
| consumption | je Vertrag des Kunden alles unter `CONTRACT#<vertrag>` (Projektion zuletzt), den Eintrag der Überwachungsliste Datenvolumen (Base), `SUBJ#<sub>` / `CONSUMPTION` |
| documents | Dateien `uploads/<mandant>/<kunde>/<dokument>` (S3-Client des Mandanten), danach `CUST#<id>` / `DOC#…` und `SUBJ#<sub>` / `DOCUMENTS` |
| notification | `CUST#<id>` / `NOTE#…` und `MAILBOX`, `SUBJ#<sub>` / `MAILBOX` |

`consumption` kennt die Verträge eines Kunden nur aus der eigenen Projektion
unter `CONTRACT#<vertrag>`; es gibt keinen Index nach Kunde. Der Worker
sucht sie deshalb mit einem [Scan](glossar.md#dynamodb-scan) über die
Tabelle des Mandanten (Filter auf `customerId IN (…)`, höchstens 100 Werte
— daher die Schubgröße). Das kostet Lesekapazität im Umfang der Tabelle,
beim Inhaber also der Base; im Demo mit einigen hundert Einträgen und dem
seltenen Reset ist das vertretbar [E]. Alle Löschungen sind idempotent: ein
wiederholt zugestelltes Ereignis findet nichts mehr und löscht nur die
Identitäts-Verknüpfungen erneut. Nachzügler-Ereignisse, die nach dem Reset
noch einen Eintrag eines entfernten Kunden anlegen (z. B. eine späte
Postfach-Nachricht), bleiben unerreichbar liegen; sie stören keine neue
Übernahme, weil die neue Kundennummer eine andere ist.

## 5. Daten und Kapazität

| Eintrag | PK | SK |
|---|---|---|
| Status je Altdatensatz | `TENANT#<t>#MIGRATION` | `REC#<system>#<nummer>` |
| Bulk-Lauf mit Zählern | `TENANT#<t>#MIGRATION` | `RUN#<runId>` |
| Verknüpfungsangebot | `TENANT#<t>#SUBJ#<sub>` | `LINK#<system>#<nummer>` |
| Merker „Übernahme gemeldet" | `TENANT#<t>#SUBJ#<sub>` | `IDENTITY#LEGACY` |
| Timeline | `TENANT#<t>#TIMELINE` | `EVT#<zeitpunkt>#<eventId>`, `ttl` |

Kein `GSI1`: Das Cockpit liest alle Datensätze eines Mandanten mit einer
Abfrage (einige Dutzend Einträge im Demo); ein Index hätte eigene Kapazität
aus den 25 freien Einheiten gebraucht [E]. Bulk-Import und Reset schreiben in
Schüben; bei 5 WCU drosselt DynamoDB kurz, die SDK-Wiederholungen bzw. die
Wiederholung unverarbeiteter Löschungen fangen das ab [E].

