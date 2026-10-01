# Demo-Pass — eigene Instanz je Besucher

Stand: 2026-10-01 · Stufe 1 umgesetzt (Phase 4, Release v0.4.0) · Kennzeichnung: **[B]** belegt (offizielle Quelle), **[A]** Annahme/Schätzung, **[E]** Einschätzung.

**Entscheidung (29.09.2026): Stufe 1 — Inhaber-Zugang und Einladungslinks.** Ein bezahlter Zugang ist optional für später denkbar, aber nicht geplant.

**Entscheidung 01.10.2026: 48 Stunden statt 7 Tage.** Ein Pass gilt 48
Stunden ab dem Einlösen; die erste Anmeldung des Inhabers startet die 48
Stunden neu (einmal). Wer sich nach 24 Stunden noch nicht angemeldet hat,
bekommt die Einladung mit neuem Einmal-Passwort noch einmal (höchstens
einmal). Bis dahin galten 7 Tage ab dem Einlösen ohne Erinnerung.

**Umgesetzt (30.09.2026):** Stufe 1 ist gebaut und live geprüft —
Einladungslinks aus dem Cockpit, Einlösen mit [ALTCHA](glossar.md#altcha),
eigener Mandant im Bridge-Modell in ≈ 10 s, Kontingente, Ablauf und
Rückbau nach damals 7 Tagen (seit 01.10.2026: 48 Stunden, siehe oben), höchstens 3 gleichzeitige Pass-Mandanten. Wie es
gebaut ist, beschreibt [Architektur: Mandanten und Demo-Pass](architektur-mandanten.md).
Diese Seite bleibt die Entscheidungsgrundlage; wo die Umsetzung vom
ursprünglichen Vorschlag abweicht, ist das vermerkt.

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

## 1. Anforderungen (29.09.2026)

1. Der Inhaber kann die Demo **für sich selbst jederzeit** starten.
2. Die **öffentliche Demoseite** ist für alle zugänglich.
3. Ein Demo-Pass ist **48 Stunden** nutzbar, gezählt ab der ersten
   Anmeldung (ohne Anmeldung ab dem Einlösen), auch mehrfach, solange das
   Kontingent reicht; danach werden Instanz und Daten gelöscht. Wer sich
   nach **24 Stunden** noch nicht angemeldet hat, wird einmal erinnert.
   (Bis 01.10.2026: 7 Tage ohne Erinnerung.)
4. **Jeder Besucher bekommt eine eigene Instanz** — Besucher stören sich
   gegenseitig nicht.
5. **Spam- und Missbrauchsabwehr** ist Pflicht.

## 2. Ergebnis

**Machbar** [E]. Alle Teile — Freischaltung, eigene Instanz, Kontingent,
Ablauf nach 48 Stunden, Erinnerung — lassen sich mit den ohnehin geplanten, kostenlosen
AWS-Bausteinen (Lambda, DynamoDB, EventBridge Scheduler, SNS) bauen. Der
Demo-Pass wird dabei selbst zu einem vorzeigbaren Stück SaaS-Architektur:
Mandantenfähigkeit, Bereitstellung auf Knopfdruck, automatischer Rückbau.

Eine Instanz kostet bei Demo-Nutzung Bruchteile eines Cents [A]. Den
Zugang steuern deshalb **Einladungslinks** statt einer offenen
Selbstbedienung: Sie halten Bots fern, ohne Besucher warten zu lassen.

## 3. Zwei Wege zum Demo-Pass

Beide erzeugen dasselbe: einen **Demo-Pass** (48 Stunden, Kontingent, eigene
Instanz). Sie unterscheiden sich nur darin, wer ihn ausstellt.

| Weg | Für wen | Wie | Kosten trägt |
|---|---|---|---|
| **Inhaber-Zugang** | den Inhaber selbst | Anmeldung mit Inhaber-Rolle (Cognito-Gruppe); Instanz starten/stoppen im Verwaltungsbereich | Inhaber (Cent-Bruchteile) |
| **Einladungslink** | eingeladene Besucher | Inhaber erzeugt im Verwaltungsbereich einen persönlichen Link (einmalig verwendbar, 14 Tage gültig) und schickt ihn per E-Mail; der Link stellt den Pass aus | Inhaber (Cent-Bruchteile) |

Optional später: bezahlter Zugang für die Öffentlichkeit (nicht geplant) —
technisch nur ein weiterer Aussteller desselben Demo-Passes.

Einladungslinks sind personenbezogen; ihre Nutzung gehört in die
Datenschutzerklärung.

## 4. Ablauf für Besucher

```chart
{"type": "timeline", "title": "Vom Einladungslink zur eigenen Instanz", "events": [
 ["Schritt 1", "Öffentliche Demoseite: Beschreibung, Architekturbild, Video — alles kostenlos, ohne Anmeldung"],
 ["Schritt 2", "Einladungslink öffnen: Bot-Prüfung (ALTCHA), der Link ist einmalig verwendbar"],
 ["Schritt 3", "Lambda stellt den Pass aus (48 Stunden, Kontingent) und startet die eigene Instanz"],
 ["Schritt 4", "Statusseite „Ihre Instanz wird eingerichtet\" (gemessen ≈ 10 s), dann Login in das eigene Portal mit Demo-Personen; die erste Anmeldung startet die 48 Stunden neu"],
 ["Nach 24 h", "Noch nicht angemeldet: Cognito schickt die Einladung mit neuem Einmal-Passwort noch einmal (höchstens einmal)"],
 ["48 Stunden", "Beliebig oft nutzen; Anzeige „Kontingent: 83 % übrig · gültig bis …\"; Instanz schläft bei Nichtnutzung und wacht beim nächsten Besuch auf"],
 ["Ende", "Pass läuft ab; Instanz und alle Daten werden automatisch gelöscht (keine Bestätigungs-E-Mail)"]]}
```

Technisch: Die Ausstellung legt den Pass in DynamoDB an und veröffentlicht
das Domänen-Event `DemoPassIssued`; daraufhin wird der Mandant
eingerichtet, und EventBridge Scheduler plant den Ablauf in 48 Stunden
und die Erinnerung nach 24 Stunden.

**Umsetzung:** So gebaut, mit zwei Abweichungen: Das System verschickt außer
dem Einmal-Passwort von Cognito und der einen Erinnerung **keine** E-Mails
(auch keine Bestätigung nach dem Löschen), und die Instanz „schläft" nicht eigens — geteilte
Lambdas kosten ohne Aufrufe ohnehin nichts. Details:
[Architektur: Mandanten und Demo-Pass](architektur-mandanten.md) §4 und §7.

## 5. Eigene Instanz je Besucher

„Eigene Instanz" lässt sich unterschiedlich tief umsetzen — in der
SaaS-Architektur heißen die Modelle **Silo**, **Bridge** und **Pool** [E]:

| | **Silo** – eigener Stack je Besucher | **Bridge** – geteilte Rechenleistung, eigene Daten und Ereignisse | **Pool** – alles geteilt, Trennung nur per Mandanten-Kennung |
|---|---|---|---|
| Was ist eigen | API Gateway, Lambdas, DynamoDB-Tabelle, EventBridge-Bus, SQS, SNS | eigener Datenbereich (eigene DynamoDB-Tabelle), eigene Ereignis-Regeln/Queues, eigener Datenstand der Altsysteme | nur die Datensätze (Schlüssel enthält Mandanten-Kennung) |
| Stören sich Besucher? | nein | nein (Drosselung je Mandant verhindert, dass einer die geteilten Lambdas auslastet) | theoretisch ja (Last), fachlich nein |
| Startzeit [A] | 2–5 min (CloudFormation-Stack) | 5–30 s (Tabelle + Regeln + Demo-Daten) | < 5 s (Demo-Daten schreiben) |
| Grenzen [B] | EventBridge: 100 Busse je Konto und Region (erhöhbar); CloudFormation-Stacks, Lambda-Speicher | DynamoDB: 2.500 Tabellen je Region | keine praktischen |
| Kosten im Leerlauf | 0 $ (alles nutzungsbasiert, Tabellen provisioned 5 RCU/5 WCU im Always Free) | 0 $ | 0 $ |
| Zeigt | Infrastruktur-Automatisierung | **typische SaaS-Architektur** mit Mandantentrennung — genau das, was ein Consumer-Portal mit Kundenkonten braucht | Datenmodellierung |

**Empfehlung: Bridge** [E] — **entschieden am 29.09.2026**. Jeder Besucher bekommt einen eigenen Mandanten
mit eigener DynamoDB-Tabelle (**provisioned 5 RCU/5 WCU**, Entscheidung
29.09.2026 — nur provisionierte Kapazität fällt unter Always Free; die 25
kostenlosen Einheiten je Konto und Region teilen sich alle Tabellen
einschließlich Plattform-Tabelle, ein GSI belegt eigene Kapazität [E];
darüber hinaus trägt bis 29.09.2027 das Startguthaben), eigenem Datenstand beider Altsysteme auf
dem eigenen Server (je Mandant ein eigenes Datenbankschema aus einer Vorlage) und eigenen
Ereignis-Regeln auf dem gemeinsamen Bus. Die Lambdas werden geteilt, aber
je Mandant gedrosselt; IAM-Bedingungen verhindern, dass eine Lambda auf die
Tabelle eines anderen Mandanten zugreift. Start in Sekunden statt Minuten —
wichtig, weil Besucher sonst wieder warten.

**Umsetzung:** Eigene Ereignis-Regeln je Mandant sind nicht nötig
geworden — jedes Ereignis trägt `tenantId`, Konsumenten schreiben nur in
die Tabelle dieses Mandanten, und eine einzige Regel zählt die Ereignisse
aller Pass-Mandanten. Die Drosselung je Mandant ist das API-Kontingent;
den Zugriff auf fremde Tabellen verhindert eine
[Token Vending Machine](glossar.md#token-vending-machine) mit Sitzungs-Tag
([Architektur: Mandanten und Demo-Pass](architektur-mandanten.md) §3).

Silo bleibt als Option für den **Inhaber-Zugang** (eigener vollständiger
Stack auf Knopfdruck zeigt „Infrastruktur als Code" am deutlichsten).

Kontingent je Pass [A], als Vorschlag (umgesetzt wie unten, außer den
E-Mails: nur das Einmal-Passwort und höchstens eine Erinnerung —
[Architektur: Mandanten und Demo-Pass](architektur-mandanten.md) §5):

| Größe | Grenze | Begründung |
|---|---|---|
| Laufzeit | 48 Stunden ab der ersten Anmeldung, ohne Anmeldung ab dem Einlösen (bis 01.10.2026: 7 Tage ab Ausstellung) | Anforderung |
| API-Aufrufe | 5.000 | reicht für viele Durchläufe der 5-Minuten-Demo |
| Domänen-Events | 1.000 | jede Aktion erzeugt 1–3 Events |
| Uploads | 20 Dateien, je max. 5 MB, nur Bilder/PDF | Zählerfotos, Dokumente |
| Gleichzeitige Instanzen | 1 je Pass | Missbrauchsschutz |
| E-Mails | nur an die bestätigte Adresse des Pass-Inhabers, max. 20 | verhindert, dass die Demo als Spam-Schleuder dient |

## 6. Spam- und Missbrauchsschutz

| Risiko | Maßnahme |
|---|---|
| Bots rufen die öffentliche Seite massenhaft auf | Seite ist statisch und im CDN zwischengespeichert — Aufrufe kosten nichts; CloudFront Functions begrenzen auffällige Muster |
| Bots lösen Einladungslinks ein oder erraten sie | CAPTCHA vor der Ausstellung — ursprünglich Cloudflare Turnstile oder hCaptcha vorgeschlagen, **umgesetzt mit ALTCHA** (selbst gehostet, kein Drittanbieter, kein Konto; gelöste Rätsel gelten nur einmal); Links einmalig verwendbar und befristet, Begrenzung je IP |
| Missbrauch der Demo als E-Mail-Versender | E-Mails nur an die bestätigte Pass-Adresse; alle anderen Benachrichtigungen im In-App-Postfach der Instanz |
| Hochladen fremder oder schädlicher Inhalte | nur über Presigned URL mit Größen- und Typbeschränkung; Dateien nur für den eigenen Mandanten sichtbar; Löschung mit Pass-Ablauf |
| Ein Besucher lastet das System aus | Kontingent je Pass (Abschnitt 5), Drosselung je Mandant, Reserved Concurrency je Lambda |
| Weitergabe eines Passes | Pass an Login gebunden; eine aktive Sitzung zur Zeit; Einladungslinks einmalig verwendbar |
| Kosten laufen trotzdem davon | globaler Kill-Switch per Budget-Alarm (siehe [Kostenfreier Betrieb](kostenfrei.md)) sperrt das Einlösen; Obergrenze gleichzeitiger Instanzen — vorgeschlagen z. B. 20, **entschieden: 3**, damit alle Tabellen in die 25 freien DynamoDB-Einheiten passen |

## 7. Stufenplan [E]

1. **Stufe 1 – Inhaber-Zugang und Einladungslinks.** Die Kosten
   (Cent-Bruchteile je Mandant) trägt der Inhaber. **Umgesetzt
   (30.09.2026, v0.4.0).** Der Inhaber-Mandant (`owner`) bleibt in der
   Tabelle der Base und läuft dauerhaft; Einladungslinks erzeugt er im
   Cockpit unter `/cockpit/paesse`.
2. Die öffentliche Seite zeigt von Anfang an Video, Architektur und Code
   — kostenlos, ohne Instanz.

## 8. Auswirkungen auf bisherige Entscheidungen

- Die Betriebsarten Z1–Z3 ([Kostenfreier Betrieb](kostenfrei.md)) werden
  durch den Demo-Pass ersetzt: Die **gemeinsame Grundlage** (Seite, Login,
  SSR-Lambda, geteilte Lambdas, Cognito) läuft dauerhaft und kostenlos;
  **Mandanten** entstehen nur mit einem Pass und verschwinden nach 48 Stunden.
  Das ist die Z3-Idee („kostet nur, wenn jemand es nutzt"), sauber an einen
  Einladenden gebunden.
- Kosten der **gemeinsamen** Cent-Dienste (API Gateway, EventBridge, S3)
  entstehen nur durch Mandanten, also durch Pass-Inhaber.
- Neu im Umfang: Pass-Verwaltung, Einladungslinks, Verwaltungsbereich für
  den Inhaber — gebaut in Phase 4 (Service `tenancy`, Seiten `/pass` und
  `/pass/einloesen` in der Shell, `/cockpit/paesse`).

## Quellen

- EventBridge-Quoten: https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-quota.html · DynamoDB-Quoten: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/ServiceQuotas.html
