# Architektur: Mandanten und Demo-Pass

Stand: 2026-09-30 · Phase 4, **Entwurf** (wird mit der Umsetzung zum Ist-Stand). Ergänzt die [Architektur](architektur.md), [Zonen & Frontend](architektur-zonen.md) und [Altsysteme & Migration](architektur-migration.md); Anforderungen und Grundentscheidung (Bridge-Modell) stehen in [Demo-Pass](demo-pass.md). Kennzeichnung: **[B]** belegt, **[A]** Annahme, **[E]** Einschätzung.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

## Überblick

Der Inhaber stellt **Einladungslinks** aus. Wer einen Link einlöst, erhält
einen **Demo-Pass** (7 Tage, Kontingent) und damit einen eigenen
[Mandanten](glossar.md#mandant) im [Bridge-Modell](glossar.md#bridge-modell):
Die Lambdas, das API und der Ereignisbus sind geteilt; Daten, Altsystem-
Datenstand, Uploads und Konten gehören dem Mandanten allein. Nach Ablauf baut
das System den Mandanten vollständig zurück.

```chart
{"type": "timeline", "title": "Lebenszyklus eines Mandanten", "events": [
 ["Einladung", "Inhaber erzeugt im Cockpit einen Link für eine E-Mail-Adresse (einmalig, 14 Tage)"],
 ["Einlösen", "Besucher öffnet den Link, löst das ALTCHA-Rätsel; Pass wird ausgestellt"],
 ["Einrichtung", "Tabelle, Altsystem-Datenstand, Konto des Pass-Inhabers, Ablauf-Zeitplan (Ziel unter 1 Minute)"],
 ["Tag 1–7", "Nutzung mit den Demo-Personen des Mandanten; Kontingent sichtbar"],
 ["Tag 7", "Zeitplan oder täglicher Abgleich meldet den Ablauf"],
 ["Rückbau", "Tabelle, Altsystem-Daten, Uploads, Konten, Zeitplan, Plattform-Einträge"]]}
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
| `PASS#<passId>` | `META` | Mandant, E-Mail, Status, ausgestellt, gültig bis |
| `TENANT#<kennung>` | `QUOTA#<art>` | Zähler `used` (`api`, `events`, `uploads`) — der Router kennt nur den Mandanten, nicht den Pass |
| `PLATFORM` | `TENANT#<kennung>` | Tabelle, Status (`provisioning`, `active`, `quota-exceeded`, `tearing-down`, `deleted`), Pass — Liste für Abgleich und Cockpit |
| `PLATFORM` | `SETTINGS` | Einlösen offen/gesperrt (Kill-Switch), Obergrenze |
| `RATE#<ip-hash>` | `REDEEM` | Einlöseversuche je IP, TTL 1 h |

## 2. Bindung von Konten an den Mandanten

`custom:tenant_id` ist in Cognito **unveränderlich** und lässt sich nur beim
Anlegen eines Kontos setzen. Genau das nutzt der Entwurf — jedes Konto eines
Pass-Mandanten entsteht durch das System, nie durch Selbstregistrierung:

- **Pass-Inhaber:** Das Einlösen legt das Konto per `AdminCreateUser` an —
  E-Mail aus der Einladung, `custom:tenant_id` = Kennung, Gruppe `pass`.
  Cognito schickt das Einmal-Passwort an diese Adresse; die erste Anmeldung
  bestätigt sie. Weitere E-Mails verschickt das System an Pass-Inhaber nicht.
- **Demo-Personen:** Anmeldename mit Plus-Adresse, z. B.
  `anna.becker+p4k7x2qa@example.org`. Der Migrate-User-Trigger liest den
  Zusatz, prüft, dass ein aktiver Pass-Mandant dieser Kennung existiert,
  fragt das Altsystem **dieses** Mandanten mit der Adresse ohne Zusatz und
  setzt `custom:tenant_id` beim Anlegen. Der Bulk-Import eines
  Pass-Mandanten verfährt ebenso. Ohne Zusatz bleibt alles wie bisher
  (Mandant `owner`).
- **Pre-Token-Trigger:** unverändert — `tenant_id` aus `custom:tenant_id`,
  sonst `owner`. Zusätzlich lehnt er Anmeldungen ab, deren Pass nicht mehr
  aktiv ist (Status aus `PLATFORM/TENANT#…`).

**Demo-Passwort je Mandant:** Das Einrichten erzeugt ein zufälliges
Passwort und übergibt es beiden Altsystemen, die damit den Datenstand des
Mandanten anlegen. Die Statusseite zeigt es dem Pass-Inhaber zusammen mit
den Anmeldenamen der Demo-Personen. So verrät ein Pass nichts über den
Inhaber-Mandanten. Die Telko-Anmeldung eines Pass-Mandanten prüft das
Telko-Altsystem direkt (`/v2/auth/check`); der Keycloak-Realm `telko` bleibt
dem Inhaber-Mandanten vorbehalten.

## 3. Isolation

```chart
{"type": "flow", "title": "Zugriff einer geteilten Lambda auf Mandantendaten", "gap": 30,
 "layers": [
  {"title": "Mandant", "nodes": [["Token oder Ereignis", "tenant_id aus dem geprüften JWT bzw. detail.tenantId"]]},
  {"title": "Token Vending", "accent": true, "nodes": [["sts:AssumeRole", "Rolle kundenportal-tenant-data, Sitzungs-Tag tenant, gecacht 15 min"]]},
  {"title": "Client", "nodes": [["DynamoDB, S3", "Clients mit diesen Anmeldedaten"]]},
  {"title": "IAM", "accent": true, "nodes": [["Richtlinie", "nur table/kp-tenant-${aws:PrincipalTag/tenant} und uploads/${aws:PrincipalTag/tenant}/*"]]}
 ],
 "edges": [["Token oder Ereignis", "sts:AssumeRole"], ["sts:AssumeRole", "DynamoDB, S3"], ["DynamoDB, S3", "Richtlinie"]]}
```

- **[Token Vending Machine](glossar.md#token-vending-machine):** Die
  Lambda-Rollen haben **keine** Rechte an `kp-tenant-*`-Tabellen. Sie dürfen
  nur die Rolle `kundenportal-tenant-data` annehmen und müssen dabei den
  Sitzungs-Tag `tenant` setzen; deren Richtlinie löst den Tabellennamen und
  das Upload-Präfix aus dem Tag auf. Ein Programmfehler, der den falschen
  Schlüssel baut, trifft damit höchstens die eigene Tabelle — nie eine
  fremde [B: IAM-Richtlinienvariable `aws:PrincipalTag`].
- **`packages/service-kit`:** `tenantData(tenantId)` liefert Tabellenname
  und Client — `owner` → Tabelle der Base mit den Rechten der Lambda,
  sonst Tabelle des Mandanten mit Vending-Anmeldedaten. Die Repositories der
  Services werden je Mandant gebaut statt einmal je Kaltstart.
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

- **[ALTCHA](glossar.md#altcha)** statt Turnstile/hCaptcha: ein
  [Proof-of-Work](glossar.md#proof-of-work)-Rätsel, das der Browser in
  ungefähr einer Sekunde löst; selbst gehostet, Open Source (MIT), keine
  Daten an Dritte, kein Konto beim Anbieter, 0 $. Der HMAC-Schlüssel liegt
  als SecureString im Parameter Store (AWS-verwalteter Schlüssel). Der
  E2E-Test löst das Rätsel wie ein Browser — es gibt **keine**
  Umgehung.
- Einladungs-Token: 32 Byte Zufall, im Link; gespeichert wird nur sein
  SHA-256. Einlösen per bedingtem Schreiben (`attribute_not_exists(redeemedAt)`)
  — genau einmal.
- Begrenzung: 10 Einlöseversuche je IP und Stunde; höchstens **3
  gleichzeitige Pass-Mandanten** (Abschnitt 6); ein Pass je E-Mail-Adresse.
- **Kill-Switch:** Der Budget-Alarm (Terraform, Thema
  `kundenportal-budget-alerts`) ruft zusätzlich die Tenancy-Lambda auf, die
  `PLATFORM/SETTINGS` auf „gesperrt" setzt. Laufende Pässe bleiben nutzbar.

## 5. Kontingente

| Größe | Grenze | Zählung |
|---|---|---|
| Laufzeit | 7 Tage | Zeitplan + täglicher Abgleich |
| API-Aufrufe | 5.000 (`QUOTA_API_CALLS`) | `service-kit`-Router vor jeder Route eines Pass-Mandanten: atomares `ADD` auf `TENANT#<kennung>/QUOTA#api` der Base mit Bedingung, sonst 429; Pass nicht `active` → 403 (`quota-exceeded` → 429), Status 30 s gecacht |
| Domänen-Ereignisse | 1.000 | Timeline-Konsument der Migration zählt; bei Überschreitung Status „Kontingent erschöpft" → API 429 |
| Uploads | 20, je ≤ 5 MB, nur JPEG/PNG/PDF | Documents beim Ausstellen der URL |
| Gleichzeitige Instanzen | 1 je Pass | ein Mandant je Pass |
| E-Mails | 1 (Einmal-Passwort) | keine weiteren E-Mails an Pass-Inhaber |

Bei Überschreitung erscheint `QuotaExceeded`; die Shell zeigt
„Kontingent: … übrig · gültig bis …" aus `GET /pass`.

## 6. Kosten und Obergrenze

| Baustein | Kosten | Begründung |
|---|---|---|
| Tabelle je Mandant, provisioned 5/5 | 0 $ | Always Free: 25 RCU/25 WCU je Konto und Region; Base 5/5 + 3 × 5/5 = 20 [B] |
| STS AssumeRole | 0 $ | STS ist kostenlos [B] |
| EventBridge Scheduler | 0 $ | 14 Mio. Aufrufe/Monat frei [B] |
| Cognito-Konten | 0 $ | 10.000 aktive Nutzer/Monat frei [B] |
| ALTCHA | 0 $ | eigene Lambda, kein Drittanbieter |
| CreateTable/DeleteTable | 0 $ | Steuerungsaufrufe sind kostenlos [B] |

Daraus die **Obergrenze von 3 gleichzeitigen Pass-Mandanten** (änderbar in
`PLATFORM/SETTINGS`). Mehr Mandanten trüge im Free Plan das Guthaben, danach
kostete jede weitere Tabelle 5 × (0,00065 + 0,00013) $/h ≈ 2,85 $/Monat [A].

## 7. Ablauf und Rückbau

- **Zeitplan:** Die Einrichtung legt einen einmaligen Zeitplan
  (`at(…)`, `ActionAfterCompletion: DELETE`) in der Gruppe
  `kundenportal-passes` an. Die Gruppe liegt im Base-Stack, damit eine Pause
  (Abbau des App-Stacks) sie nicht löscht.
- **Täglicher Abgleich:** Ein Lauf findet abgelaufene, hängende
  (Einrichtung > 10 min) und verwaiste Mandanten (z. B. Zeitplan während
  einer Pause ins Leere gelaufen) und baut sie zurück.
- **Rückbau** (idempotent, jeder Schritt überspringt Fehlendes): Cognito-
  Konten mit `custom:tenant_id` = Kennung löschen; Altsysteme
  `DELETE …/mandant` bzw. `…/tenant`; Upload-Präfix löschen; Tabelle
  löschen; Zeitplan löschen; Plattform-Einträge auf „gelöscht" (Pass bleibt
  30 Tage als Nachweis, dann TTL); `TenantDeleted`.
- **`scripts/teardown.sh --all`** löscht zusätzlich alle Tabellen
  `kp-tenant-*` und die Zeitplangruppe; eine Pause lässt sie bestehen.

## 8. Ereignisse

| Ereignis | Quelle | Bedeutung |
|---|---|---|
| `InvitationCreated` | `kundenportal.tenancy` | Link erzeugt (ohne Token) |
| `DemoPassIssued` | `kundenportal.tenancy` | Link eingelöst, Mandant reserviert |
| `TenantProvisioned` | `kundenportal.tenancy` | Mandant nutzbar |
| `QuotaExceeded` | `kundenportal.tenancy` | eine Grenze erreicht |
| `DemoPassExpired` | `kundenportal.tenancy` | Laufzeit vorbei oder widerrufen |
| `TenantDeleted` | `kundenportal.tenancy` | Rückbau abgeschlossen |

`tenantId` im Umschlag ist bei allen die Kennung des Pass-Mandanten; das
Postfach des Inhabers erhält `DemoPassIssued` und `TenantDeleted` als
Hinweis.

## 9. Ausblick: Silo für den Inhaber

Ein vollständiger eigener Stack je Instanz (Silo) zeigt Infrastruktur als
Code am deutlichsten, dauert aber 2–5 Minuten und belegt je Instanz einen
Bus und eine Distribution. Er bleibt eine Option für den Inhaber und ist
nicht Teil von Phase 4.
