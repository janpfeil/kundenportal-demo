# Architektur: Mandanten und Demo-Pass

Stand: 2026-09-30 · Beschreibt den **Ist-Stand** des Codes (Phase 4 abgeschlossen, Release v0.4.0, live geprüft am 30.09.2026; danach geschlossen: atomare Obergrenze, Upload-Kontingent, Einstellungen und Angebot im API, Hinweise an den Inhaber — noch nicht live geprüft; 01.10.2026: Laufzeit 48 Stunden ab der ersten Anmeldung, Erinnerung nach 24 Stunden — noch nicht live geprüft). Ergänzt die [Architektur](architektur.md), [Zonen & Frontend](architektur-zonen.md) und [Altsysteme & Migration](architektur-migration.md); Anforderungen und Grundentscheidung (Bridge-Modell) stehen in [Demo-Pass](demo-pass.md). Kennzeichnung: **[B]** belegt, **[A]** Annahme, **[E]** Einschätzung.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

## Überblick

Der Inhaber stellt **Einladungslinks** aus. Wer einen Link einlöst, erhält
einen **Demo-Pass** (48 Stunden, mit der ersten Anmeldung neu gezählt; Kontingent) und damit einen eigenen
[Mandanten](glossar.md#mandant) im [Bridge-Modell](glossar.md#bridge-modell):
Die Lambdas, das API und der Ereignisbus sind geteilt; Daten, Altsystem-
Datenstand, Uploads und Konten gehören dem Mandanten allein. Nach Ablauf baut
das System den Mandanten vollständig zurück.

Gebaut ist das im Service `services/tenancy` (API, öffentliche Einlöse-
Funktionen, Worker), in `packages/service-kit` (`tenantData`,
`TenantDirectory`, Kontingent-Wächter im Router), in den Cognito-Triggern
(`services/identity`), in beiden Altsystemen (Datenstand je Mandant) und in
Shell und Cockpit ([Zonen & Frontend](architektur-zonen.md) §8).

```chart
{"type": "stats", "items": [["≈ 10 s", "vom Einlösen bis zum nutzbaren Mandanten (Ziel < 1 min)"], ["≈ 10 s", "Rückbau nach Ablauf"], ["23/23", "E2E-Schritte grün, inkl. J2/J3/J4/J6 im Pass-Mandanten"], ["3 (bis 4)", "gleichzeitige Pass-Mandanten höchstens, atomar gezählt"]]}
```

```chart
{"type": "timeline", "title": "Lebenszyklus eines Mandanten", "events": [
 ["Einladung", "Inhaber erzeugt im Cockpit einen Link für eine E-Mail-Adresse (einmalig, 14 Tage)"],
 ["Einlösen", "Besucher öffnet den Link, löst das ALTCHA-Rätsel; Pass wird ausgestellt"],
 ["Einrichtung", "Tabelle, Altsystem-Datenstand, Konto des Pass-Inhabers (Cognito schickt das Einmal-Passwort), Ablauf- und Erinnerungs-Zeitplan (gemessen ≈ 10 s)"],
 ["Erste Anmeldung", "Die Shell meldet sie (POST /api/tenancy/pass/activate); ab jetzt gilt der Pass 48 Stunden"],
 ["Nach 24 h ohne Anmeldung", "Erinnerungs-Zeitplan oder täglicher Abgleich: Cognito schickt die Einladung mit neuem Einmal-Passwort noch einmal (höchstens einmal)"],
 ["48 h", "Nutzung mit den Demo-Personen des Mandanten; Kontingent sichtbar"],
 ["Ende", "48 h nach der ersten Anmeldung, ohne Anmeldung 48 h nach dem Einlösen: Einmal-Zeitplan oder täglicher Abgleich (03:30) meldet den Ablauf"],
 ["Rückbau", "Tabelle, Altsystem-Daten, Uploads, Konten, Zeitplan, Plattform-Einträge (gemessen ≈ 10 s)"]]}
```

## 1. Mandanten und Kennungen

| Mandant | Kennung | Daten | Konten |
|---|---|---|---|
| Inhaber (Bestand) | `owner` | Tabelle der Base (unverändert) | bisherige Konten, Gruppe `owner` |
| Demo-Pass | `p` + 7 Zeichen Base32, z. B. `p4k7x2qa` | eigene Tabelle `kp-tenant-<kennung>` | Pass-Inhaber (Gruppe `pass`) und Demo-Personen des Mandanten |

Die Kennung passt in alle bestehenden Muster (Token-Claim
`/^[a-z0-9-]{1,40}$/`, Altsysteme `/^[a-z0-9][a-z0-9-]{0,39}$/`,
Tabellennamen). Sie ist zufällig, damit niemand fremde Mandanten errät.

**Entscheidung:** Der Inhaber-Mandant bleibt in der Tabelle der Base. Eine
Umzugs-Migration brächte Ausfallrisiko ohne Nutzen; die Schlüssel tragen
ohnehin `TENANT#owner#…`. Die Plattform-Daten (Einladungen, Pässe,
Mandanten, Kontingente) liegen ebenfalls dort, unter eigenen Präfixen
([Fachkonzept](fachkonzept.md) §7.2):

| PK | SK | Inhalt |
|---|---|---|
| `INVITE#<sha256(token)>` | `META` | E-Mail, erstellt, gültig bis (TTL 14 Tage), eingelöst |
| `PASS#<passId>` | `META` | Mandant, E-Mail, Status, ausgestellt, erste Anmeldung (`activatedAt`), gültig bis; bleibt nach dem Rückbau 30 Tage als Nachweis, dann [TTL](glossar.md#dynamodb-ttl) |
| `TENANT#<kennung>` | `QUOTA#<art>` | Zähler `used` (`api`, `events`, `uploads`) — der Router und Documents kennen nur den Mandanten, nicht den Pass; `api` trägt zusätzlich `lastActiveAt` (letzter API-Aufruf, im selben atomaren Update geschrieben, Spalte „Letzte Aktivität“ im Cockpit), `uploads` trägt `exceededAt` (Merker: `QuotaExceeded` einmal gemeldet) |
| `PLATFORM` | `TENANT#<kennung>` | Tabelle, Status (`provisioning`, `active`, `quota-exceeded`, `tearing-down`, `deleted`), Pass, gültig bis, erste Anmeldung (`activatedAt`), Erinnerung verschickt (`reminderSentAt`) — Liste für Abgleich und Cockpit |
| `PLATFORM` | `SETTINGS` | Einlösen offen/gesperrt ([Kill-Switch](glossar.md#kill-switch)) mit `closedAt`/`closedReason`, Obergrenze `maxTenants` (Vorgabe 3, höchstens 4), Zähler `activeTenants` (Mandanten, die nicht `deleted` sind) |
| `EMAIL#<sha256(adresse)>` | `PASS` | ein Pass je E-Mail-Adresse |
| `RATE#<sha256(ip)>` | `REDEEM` | Einlöseversuche je IP, TTL 1 h |
| `ALTCHA#<sha256(signatur)>` | `USED` | gelöste Rätsel, [Replay-Schutz](glossar.md#replay-schutz), TTL bis zum Ablauf des Rätsels |

## 2. Bindung von Konten an den Mandanten

`custom:tenant_id` ist in Cognito **unveränderlich** und lässt sich nur beim
Anlegen eines Kontos setzen. Genau das nutzt die Umsetzung — jedes Konto eines
Pass-Mandanten entsteht durch das System, nie durch Selbstregistrierung:

- **Pass-Inhaber:** Die Einrichtung (Worker auf `DemoPassIssued`) legt das
  Konto per `AdminCreateUser` an — E-Mail aus der Einladung,
  `custom:tenant_id` = Kennung, Gruppe `pass`. Cognito schickt das
  Einmal-Passwort an diese Adresse; die erste Anmeldung bestätigt sie. Das
  ist die **einzige** Systemmail; kurze Test-Pässe des E2E-Laufs
  unterdrücken auch sie (`MessageAction: SUPPRESS`).
- **Demo-Personen:** Anmeldename mit Plus-Adresse, z. B.
  `anna.becker+p4k7x2qa@example.org`. Der Migrate-User-Trigger liest den
  Zusatz, prüft, dass ein aktiver Pass-Mandant dieser Kennung existiert,
  fragt das Altsystem **dieses** Mandanten mit der Adresse ohne Zusatz und
  setzt `custom:tenant_id` beim Anlegen. Plus-Adressen nimmt er **nur für
  aktive Pass-Mandanten** an; eine unbekannte oder abgelaufene Kennung
  scheitert wie ein falsches Passwort. Der Bulk-Import eines
  Pass-Mandanten verfährt ebenso. Ohne Zusatz bleibt alles wie bisher
  (Mandant `owner`).
- **Pre-Token-Trigger:** unverändert — `tenant_id` aus `custom:tenant_id`,
  sonst `owner`. Zusätzlich lehnt er Anmeldungen ab, deren Pass nicht mehr
  nutzbar ist (Status aus `PLATFORM/TENANT#…`); nach Ablauf und Rückbau
  kann sich der Pass-Inhaber nicht mehr anmelden [B: E2E 30.09.2026].

**Demo-Passwort je Mandant:** Das Einrichten erzeugt ein zufälliges
Passwort und übergibt es beiden Altsystemen, die damit den Datenstand des
Mandanten anlegen (ausdrückliches `PUT` je Mandant; `DELETE` baut ihn
zurück; unbekannte Mandanten außer `owner` beantworten die Altsysteme mit
404). Die Statusseite zeigt es dem Pass-Inhaber zusammen mit
den Anmeldenamen der Demo-Personen. So verrät ein Pass nichts über den
Inhaber-Mandanten. Die Telko-Anmeldung eines Pass-Mandanten prüft das
Telko-Altsystem direkt (`checkLogin`, `POST /v2/auth/check`); der Keycloak-Realm `telko` bleibt
dem Inhaber-Mandanten vorbehalten.

## 3. Isolation

```chart
{"type": "flow", "title": "Zugriff einer geteilten Lambda auf Mandantendaten", "gap": 30,
 "layers": [
  {"title": "Mandant", "nodes": [["Token oder Ereignis", "tenant_id aus dem geprüften JWT bzw. detail.tenantId"]]},
  {"title": "Token Vending", "accent": true, "nodes": [["sts:AssumeRole", "Rolle aus der Base, Sitzungs-Tag tenant, 15 min, gecacht je Mandant"]]},
  {"title": "Client", "nodes": [["DynamoDB, S3", "Clients mit diesen Anmeldedaten"]]},
  {"title": "IAM", "accent": true, "nodes": [["Richtlinie", "nur table/kp-tenant-${aws:PrincipalTag/tenant} und uploads/${aws:PrincipalTag/tenant}/*"]]}
 ],
 "edges": [["Token oder Ereignis", "sts:AssumeRole"], ["sts:AssumeRole", "DynamoDB, S3"], ["DynamoDB, S3", "Richtlinie"]]}
```

- **[Token Vending Machine](glossar.md#token-vending-machine):** Die
  Lambda-Rollen haben **keine** Rechte an `kp-tenant-*`-Tabellen. Sie dürfen
  nur die Mandanten-Rolle des Base-Stacks annehmen (ARN in SSM
  `/kundenportal/base/tenant-data-role-arn`) und müssen dabei den
  Sitzungs-Tag `tenant` setzen; deren Richtlinie löst den Tabellennamen und
  das Upload-Präfix aus dem Tag auf. Ein Programmfehler, der den falschen
  Schlüssel baut, trifft damit höchstens die eigene Tabelle — nie eine
  fremde [B: IAM-Richtlinienvariable `aws:PrincipalTag`].
- **`packages/service-kit`:** `tenantData(tenantId)` liefert Tabellenname
  und Client — `owner` → Tabelle der Base mit den Rechten der Lambda,
  sonst Tabelle des Mandanten mit Vending-Anmeldedaten. Die Repositories der
  Services werden je Mandant gebaut statt einmal je Kaltstart; Anmeldedaten
  und Clients bleiben je Mandant gecacht, bis die Sitzung bald abläuft.
- **`TenantDirectory`** (ebenfalls `service-kit`) liest den Status eines
  Mandanten aus `PLATFORM/TENANT#…` und cacht ihn 30 s; darauf baut der
  Kontingent-Wächter (Abschnitt 5).
- **Ereignisse:** Jedes Ereignis trägt `tenantId` (Umschlag,
  `packages/events`); Konsumenten schreiben nur über `tenantData` des
  Ereignis-Mandanten. Eigene Regeln je Mandant sind nicht nötig und würden
  die Grenze von 300 Regeln je Bus unnötig belasten [E].
- **Uploads:** Schlüssel `uploads/<kennung>/<kunde>/<dokument>` (bestehend);
  presignierte URLs signiert der Documents-Service mit Vending-Anmeldedaten,
  also nur für das eigene Präfix.
- **Plattformweite Einträge:** Die Überwachungsliste Datenvolumen
  (`SCHEDULE#DATAVOLUME`) bleibt als Plattform-Eintrag in der Base; der
  tägliche Lauf greift je Eintrag über `tenantData` zu. Die DLQ der Migration
  leeren darf nur der Inhaber; beim Demo-Reset eines Pass-Mandanten
  verwirft der Prozessor Nachrichten gelöschter Mandanten.
- **Cockpit:** Gruppe `owner` sieht den Inhaber-Mandanten und die
  Pass-Verwaltung; Gruppe `pass` sieht Migration, Timeline, Redrive und
  Demo-Reset **ihres** Mandanten (Mandant aus dem Token, nie aus der URL).

## 4. Einlösen und Missbrauchsschutz

- **Weg:** Die Shell-Seite `/pass/einloesen` liest den Token nur aus dem
  URL-Fragment (`#…`), das nie an einen Server oder in ein Log geht. Das
  Widget holt das Rätsel über den [Route Handler](glossar.md#route-handler)
  `/pass/einloesen/challenge`; `/pass/einloesen/api` prüft den
  Origin-Header, reicht die IP des Besuchers als `x-kp-client-ip` weiter
  und ruft `POST /api/tenancy/redeem`. Die drei öffentlichen Operationen
  (`getOffer`, `getRedeemChallenge`, `redeemInvitation`) tragen im Vertrag
  `security: []` und laufen damit **ohne** JWT-Authorizer.
- **Angebot:** `GET /api/tenancy/offer` liefert Laufzeit, Kontingente,
  größte Upload-Größe und ob Einlösen gerade möglich ist
  (`{passHours, quotas: {api, events, uploads}, uploadMaxBytes, redemptionOpen}`,
  aus Konfiguration und `PLATFORM/SETTINGS`). `redemptionOpen` ist falsch,
  solange der Kill-Switch sperrt oder alle Plätze belegt sind. Die Antwort
  ist für alle gleich und darf 60 s zwischengespeichert werden
  (`Cache-Control: public, max-age=60`); die Einlöse-Seite zeigt damit
  echte Zahlen statt festen Texts.
- **[ALTCHA](glossar.md#altcha)** statt Turnstile/hCaptcha: ein
  [Proof-of-Work](glossar.md#proof-of-work)-Rätsel; selbst gehostet, Open
  Source (MIT), keine Daten an Dritte, kein Konto beim Anbieter, 0 $.
  Gemessen: in Node.js ≈ 0,6 s, im Browser löst das Widget es
  selbsttätig [B: 30.09.2026]. Der HMAC-Schlüssel liegt als SecureString im
  Parameter Store (AWS-verwalteter Schlüssel). Jedes gelöste Rätsel gilt
  nur einmal (`ALTCHA#…/USED`); ein wiederholtes wird mit 400 abgelehnt.
  Der E2E-Test löst das Rätsel wie ein Browser — es gibt **keine**
  Umgehung.
- Einladungs-Token: 32 Byte Zufall, im Link; gespeichert wird nur sein
  SHA-256. Einlösen per bedingtem Schreiben (`attribute_not_exists(redeemedAt)`)
  — genau einmal.
- Begrenzung: 10 Einlöseversuche je IP und Stunde; höchstens **3
  gleichzeitige Pass-Mandanten** (Abschnitt 6); ein Pass je E-Mail-Adresse
  (`EMAIL#…/PASS`). Ein unbekannter Link ergibt 404.
- **Obergrenze atomar:** Dieselbe Transaktion, die Einladung, Pass und
  Mandant schreibt, zählt `activeTenants` in `PLATFORM/SETTINGS` hoch —
  `ADD activeTenants :one` unter der Bedingung
  `attribute_not_exists(activeTenants) OR activeTenants < :max`. Zwei
  gleichzeitige Einlösungen können die Grenze damit nicht überschreiten;
  die zweite bricht ab und erhält 503. Der Rückbau zählt beim Übergang des
  Mandanten nach `deleted` in einer Transaktion genau einmal herunter (nie
  unter 0). Der tägliche Abgleich berechnet den Zähler aus den
  Mandanten-Einträgen neu und ersetzt ihn nur, wenn ihn seit dem Lesen
  niemand geändert hat (selbstheilend). Fehlt der Zähler (Bestand vor
  dieser Änderung), setzt ihn das nächste Einlösen aus den Einträgen.
- **Kill-Switch:** Der Budget-Alarm (Terraform, Thema
  `kundenportal-budget-alerts`) ruft zusätzlich die Tenancy-Lambda auf, die
  `PLATFORM/SETTINGS` auf „gesperrt" setzt (SNS-Abo auf das Budget-Thema).
  Einlösen antwortet dann mit 503; laufende Pässe bleiben nutzbar
  [B: live 30.09.2026].
- **Einstellungen:** Der Inhaber (Gruppe `owner`, Scope
  `kundenportal/tenancy.admin`) liest sie mit `GET /api/tenancy/settings`
  (`{redemption, closedAt?, closedReason?, maxTenants, activeTenants}`)
  und ändert sie mit `PUT /api/tenancy/settings`
  (`{redemption?: "open"|"closed", maxTenants?: 1–4}`). Wieder öffnen
  entfernt `closedAt` und `closedReason`; Sperren durch den Inhaber
  behält einen früheren Grund (etwa den des Budget-Alarms), sonst steht
  dort „Vom Inhaber gesperrt".
- **Einladungslink:** Das Cockpit zeigt ihn genau einmal; der Inhaber
  schickt ihn selbst. Das System verschickt keine Einladungs-E-Mails.

## 5. Kontingente

| Größe | Grenze | Zählung |
|---|---|---|
| Laufzeit | 48 Stunden (`PASS_HOURS`) ab dem Einlösen, mit der ersten Anmeldung erneut 48 Stunden ab dieser (einmal); kurze Test-Pässe behalten ihre Minuten | Zeitplan + täglicher Abgleich |
| Erinnerung | nach 24 Stunden (`REMINDER_HOURS`) ohne Anmeldung, höchstens einmal | Erinnerungs-Zeitplan + täglicher Abgleich |
| API-Aufrufe | 5.000 (`QUOTA_API_CALLS`) | `service-kit`-Router vor jeder Route eines Pass-Mandanten: atomares `ADD` auf `TENANT#<kennung>/QUOTA#api` der Base mit Bedingung, an der Grenze 429; dasselbe Update zählt seit Phase 6 auch das Tagesattribut `d<JJJJMMTT>` (deutscher Kalendertag) für „API-Aufrufe heute“ im Cockpit; Mandant nicht `active` → 403 (`quota-exceeded` → 429), Status 30 s gecacht (`TenantDirectory`). Die Tenancy-Routen selbst umgehen den Wächter, damit Statusseite und Cockpit erreichbar bleiben |
| Domänen-Ereignisse | 1.000 | **eine** Regel „alle `kundenportal.*`-Ereignisse mit `detail.tenantId` Präfix `p`" an den Tenancy-Worker; der zählt `QUOTA#events`, das erste Ereignis über der Grenze setzt `quota-exceeded` → API 429 |
| Uploads | 20 (`QUOTA_UPLOADS`), je ≤ 5 MB, nur JPEG/PNG/PDF | Documents vor jeder presignierten Upload-URL eines Pass-Mandanten: atomares `ADD` auf `TENANT#<kennung>/QUOTA#uploads` der Base mit Bedingung `used < 20`, an der Grenze 429 „Kontingent erschöpft" und **einmal** `QuotaExceeded` (Art `uploads`); die übrige Nutzung bleibt möglich. Größe (signierte Länge, Nachprüfung im Worker) und Typ prüft Documents wie bisher; der Inhaber zählt nie |
| Gleichzeitige Instanzen | 1 je Pass | ein Mandant je Pass |
| E-Mails | 1 (Einmal-Passwort), höchstens 1 Erinnerung | die Erinnerung nur ohne Anmeldung nach 24 Stunden; sonst keine E-Mails an Pass-Inhaber |

Bei Überschreitung erscheint `QuotaExceeded` (Quelle `kundenportal.tenancy`,
auch wenn Documents es für die Uploads veröffentlicht); die Shell zeigt
„Kontingent: … übrig · gültig bis …" aus `GET /api/tenancy/pass` auf der
Seite `/pass` (Komponente `Meter` aus `packages/ui`).

**Übersicht der Pass-Verwaltung (Phase 6).** `GET /tenancy/overview` (nur
Inhaber) liefert die Kennzahlen der Seite `/cockpit/paesse`: aktive
Pass-Mandanten und Obergrenze, offene Einladungen samt Liste, Pässe ohne
erste Anmeldung, die Erinnerungsfrist und die API-Aufrufe der Pass-Mandanten
je Tag (heute und die letzten sieben Tage). Einladungen liegen unter dem Hash
ihres Tokens und sind so nicht auflistbar; deshalb schreibt das Anlegen
zusätzlich einen Index-Eintrag `PLATFORM` / `INVITE#<id>` (E-Mail, Zeitpunkte,
TTL wie die Einladung), den das Einlösen in seiner Transaktion löscht. Der
Index enthält damit nur offene Einladungen; Einladungen von vor Phase 6 fehlen
darin, bis sie ablaufen.

## 6. Kosten und Obergrenze

| Baustein | Kosten | Begründung |
|---|---|---|
| Tabelle je Mandant, provisioned 5/5 | 0 $ | Always Free: 25 RCU/25 WCU je Konto und Region; Base 5/5 + 3 × 5/5 = 20, höchstens 5 + 4 × 5 = 25 [B] |
| Einmal-Zeitpläne je Pass (Ablauf, Erinnerung) | 0 $ | [EventBridge Scheduler](glossar.md#eventbridge-scheduler), wird nach dem Auslösen gelöscht |
| STS AssumeRole | 0 $ | STS ist kostenlos [B] |
| EventBridge Scheduler (Zeitpläne und täglicher Abgleich) | 0 $ | 14 Mio. Aufrufe/Monat frei [B] |
| Cognito-Konten | 0 $ | 10.000 aktive Nutzer/Monat frei [B] |
| ALTCHA | 0 $ | eigene Lambda, kein Drittanbieter |
| CreateTable/DeleteTable | 0 $ | Steuerungsaufrufe sind kostenlos [B] |

Daraus die **Obergrenze von 3 gleichzeitigen Pass-Mandanten** (Vorgabe in
`PLATFORM/SETTINGS`, `maxTenants`). Der Inhaber kann sie über
`PUT /api/tenancy/settings` auf 1 bis 4 setzen; 4 schöpft die freien 25
Einheiten genau aus, mehr lässt das API nicht zu. Mehr Mandanten trüge im
Free Plan das Guthaben, danach kostete jede weitere Tabelle
5 × (0,00065 + 0,00013) $/h ≈ 2,85 $/Monat [A]. Gezählt wird atomar
(Abschnitt 4).

## 7. Ablauf und Rückbau

- **Zeitplan:** Die Einrichtung legt einen einmaligen Zeitplan
  `pass-expiry-<kennung>` (`at(…)`, `ActionAfterCompletion: DELETE`, Ziel:
  Tenancy-Worker, `{task: "expire"}`) in der Gruppe `kundenportal-passes`
  an. Die Gruppe liegt im Base-Stack, damit eine Pause (Abbau des
  App-Stacks) sie nicht löscht.
- **Erste Anmeldung:** Nach jeder Anmeldung eines Pass-Inhabers ruft die
  Shell `POST /api/tenancy/pass/activate` (höchstens 2 s, Fehler nur
  protokolliert). Der erste Aufruf setzt `activatedAt` und `validUntil` =
  jetzt + 48 h auf Mandant und Pass in einer bedingten Transaktion; spätere
  Aufrufe ändern nichts, andere Rollen bekommen 204. Das API braucht dafür
  keine Scheduler-Rechte: Löst der erste Zeitplan vor dem neuen Ende aus,
  legt der Worker `pass-expiry-moved-<kennung>` zum neuen Ende an, statt
  den Pass zu beenden.
- **Erinnerung:** Bekam der Inhaber die Einladung von Cognito (nicht bei
  kurzen Test-Pässen), legt die Einrichtung zusätzlich
  `pass-reminder-<kennung>` 24 h nach dem Einlösen an (`{task: "remind"}`;
  liegt der Zeitpunkt in der Vergangenheit oder nach dem Ende, entfällt
  er). Der Worker prüft: Mandant `active`, keine erste Anmeldung, Cognito-
  Status `FORCE_CHANGE_PASSWORD` (`AdminGetUser`). Dann setzt er bedingt
  `reminderSentAt` (höchstens einmal) und lässt Cognito die Einladung mit
  neuem Einmal-Passwort an dieselbe Adresse schicken (`AdminCreateUser`
  mit `MessageAction: RESEND`); scheitert das, gibt er den Merker wieder
  frei. Wer schon angemeldet ist (`CONFIRMED`), bekommt nichts.
- **Täglicher Abgleich** (03:30 Europe/Berlin): Ein Lauf findet abgelaufene, hängende
  (Einrichtung > 10 min) und verwaiste Mandanten (z. B. Zeitplan während
  einer Pause ins Leere gelaufen) und baut sie zurück. Er schickt auch
  eine fällige Erinnerung, die kein Zeitplan verschickt hat.
- **Ablauf:** Zeitplan, Abgleich oder Widerruf im Cockpit setzen den
  Mandanten auf `tearing-down` und veröffentlichen `DemoPassExpired`; dessen
  Handler baut zurück. Gemessen: ≈ 10 s nach Ablauf ist alles weg
  [B: 30.09.2026]; Altsystem-Daten des gelöschten Mandanten antworten
  danach mit 404.
- **Rückbau** (idempotent, jeder Schritt überspringt Fehlendes): Cognito-
  Konten mit `custom:tenant_id` = Kennung löschen; Altsysteme
  `DELETE …/mandant` bzw. `…/tenant`; Upload-Präfix löschen; Tabelle
  löschen; alle Zeitpläne des Mandanten löschen; Plattform-Einträge auf „gelöscht" (Pass bleibt
  30 Tage als Nachweis, dann TTL) und dabei `activeTenants` genau einmal
  herunterzählen; `TenantDeleted`; Hinweis an den Inhaber.
- **Vollabbau:** Pass-Mandanten entstehen zur Laufzeit; CloudFormation
  kennt sie nicht. Deshalb liegt im Base-Stack die
  [Custom Resource](glossar.md#custom-resource) `Custom::PassTenantCleanup`.
  Beim Löschen des Base-Stacks (`scripts/teardown.sh --all`) baut sie
  **zuerst** alle Pass-Mandanten zurück — Tabellen, Altsystem-Daten,
  Konten, Uploads —, erst danach gehen Tabelle, User Pool und Bucket. Eine
  Pause (nur App-Stack) lässt Mandanten und Zeitplangruppe bestehen.

## 8. Ereignisse

| Ereignis | Quelle | Bedeutung |
|---|---|---|
| `InvitationCreated` | `kundenportal.tenancy` | Link erzeugt (ohne Token) |
| `DemoPassIssued` | `kundenportal.tenancy` | Link eingelöst, Mandant reserviert |
| `TenantProvisioned` | `kundenportal.tenancy` | Mandant nutzbar |
| `QuotaExceeded` | `kundenportal.tenancy` | eine Grenze erreicht |
| `DemoPassExpired` | `kundenportal.tenancy` | Laufzeit vorbei oder widerrufen |
| `TenantDeleted` | `kundenportal.tenancy` | Rückbau abgeschlossen |

`tenantId` im Umschlag ist bei allen die Kennung des Pass-Mandanten.
`DemoPassIssued` startet die Einrichtung, `DemoPassExpired` den Rückbau
(beides im Tenancy-Worker).

**Hinweise an den Inhaber:** Der Tenancy-Worker schickt über das
Inhaber-Thema (SNS, `OWNER_TOPIC_ARN`, dasselbe Thema wie die Hinweise des
Notification-Service) je eine kurze Nachricht, wenn ein Mandant nutzbar ist
(„Demo-Pass eingelöst: <E-Mail>, Mandant <kennung>, gültig bis …") und
wenn er gelöscht ist („Demo-Pass beendet (abgelaufen|widerrufen): <E-Mail>,
Mandant <kennung> gelöscht, <n> Konten, <m> Uploads"), außerdem nach einer
Erinnerung („Erinnerung an <E-Mail> verschickt: Mandant <kennung>, seit 24
Stunden nicht angemeldet."). Alle gehen genau
einmal hinaus (nur der Lauf, der den Status umstellt), nennen nie das
Demo-Passwort oder einen Token, und ein Fehler beim Versand bricht
Einrichtung oder Rückbau nicht ab. Kurze Test-Pässe (`validMinutes`, nur die
E2E-Läufe, mehrere je Lauf) lösen seit v0.6.1 keine Hinweise aus.

## 9. Ausblick: Silo für den Inhaber

Ein vollständiger eigener Stack je Instanz (Silo) zeigt Infrastruktur als
Code am deutlichsten, dauert aber 2–5 Minuten und belegt je Instanz einen
Bus und eine Distribution. Er bleibt eine Option für den Inhaber und ist
nicht Teil von Phase 4.

## 10. Messwerte

Gemessen am 30.09.2026 gegen die Live-Umgebung (Playwright, CloudWatch-Logs,
`curl`).

| Messgröße | Wert | Anmerkung |
|---|---|---|
| Einlösen → Mandant `active` | ≈ 10 s | davon Worker 9,6 s (Tabelle, Altsysteme, Konto, Zeitplan); Ziel < 1 min erreicht |
| Ablauf → Rückbau abgeschlossen | ≈ 10 s | kurzer Test-Pass, Zeitplan löst aus |
| ALTCHA lösen | ≈ 0,6 s | Node.js im E2E-Test; im Browser selbsttätig |
| E2E gesamt | 23/23 grün | inkl. J2, J3, J4, J6 im Pass-Mandanten, Isolation im Cockpit, Ablauf und Löschung, Anmeldung danach abgelehnt |
| Kill-Switch aktiv → Einlösen | 503 | |
| wiederholtes ALTCHA | 400 | Replay-Schutz |
| unbekannter Link | 404 | |
| Altsystem-Daten eines gelöschten Mandanten | 404 | beide Altsysteme |

## 11. Befunde aus dem Live-Test

Drei Fehler fielen erst live auf und sind behoben:

- **Cognito `ListUsers`** lehnt benutzerdefinierte Attribute in
  `AttributesToGet` ab. Die Konten eines Mandanten werden deshalb ohne
  diesen Parameter gelistet.
- **Typen der Oberfläche** waren vom API-Vertrag abgewichen (Pass-Liste
  unter einem anderen Schlüssel). Shell und Cockpit verwenden jetzt die
  Typen aus `packages/api-contract`.
- **Reserved Concurrency 2** drosselte parallele Aufrufe eines
  Seitenaufbaus. API-Funktionen haben jetzt 5 wie die Next.js-Funktionen,
  Worker weiter 2 ([Architektur](architektur.md) §7).

## Offen

Keine offenen Punkte. In v0.4.1 nachgezogen und live per E2E geprüft
(25/25): atomare Obergrenze, Upload-Kontingent, Einstellungen im Cockpit,
Angebotsdaten auf der Einlöseseite, Hinweise an den Inhaber, Aufräumen beim
Demo-Reset, CDN-cachebare Startseite, Pausenseite, Version und Cockpit-Link
in der Kopfzeile.
