# 5-Minuten-Demo — Drehbuch

Stand: 2026-10-03 · Phase 8 · Grundlage für die Vorführung, die automatische
Aufnahme (`tests/e2e/src/demo.spec.ts`) und die Sprecherspur des Videos.

Die Demo erzählt eine Geschichte in neun Szenen: ein neuer Kunde, ein Altkunde
aus einem abgelösten System und der Betreiber, der das Portal steuert. Jede
Szene hat ein Zeitfenster, eine Handlung auf dem Bildschirm, den Sprechertext
und die Technik, die dahinter steckt. Der Sprechertext ist für ein ruhiges Erklärtempo von etwa 115 Wörtern
je Minute geschrieben (zusammen rund 500 Wörter, dazu kurze Pausen für die Handlung) und nennt Fachbegriffe nur, wo
sie im Bild zu sehen sind.

```chart
{"type": "timeline", "title": "Ablauf der Demo (Minuten)", "events": [["0:00", "Einstieg: das Portal"], ["0:20", "Anmeldung"], ["0:45", "Konto und Postfach"], ["1:15", "Verträge und Bestellung"], ["2:05", "Verbrauch"], ["2:30", "Kündigung und Widerruf"], ["2:55", "Altkunde: Übernahme beim Anmelden"], ["3:30", "Betreiber-Cockpit"], ["4:30", "Demo-Pass, Themes, Architektur"]]}
```

## Vorbereitung

- Demodaten zurücksetzen (`scripts/reset-owner-data.py --apply`), damit Listen
  und Kennzahlen überschaubar sind; danach einen Bulk-Import beider Altsysteme
  im Cockpit starten, damit die Betreiberansichten Inhalt haben.
- Die Aufnahme legt sich ihre Nutzer selbst an (Kundin „Lena Wagner“ und eine
  Betreiberin, beide an der reservierten Domain `.invalid`) und räumt sie am
  Ende weg; der Altkunde ist die Demo-Person Anna Becker aus dem
  Versorger-Altsystem (Passwort aus `LEGACY_DEMO_PASSWORD`).
- Browserfenster 1920 × 1080, Theme „Klar“ hell; im Cockpit „Dicht“.

## Szenen

### 1 · Einstieg: das Portal (0:00–0:20)

**Bild:** Startseite des Portals, langsamer Bildlauf über Sparten und
Vorteile; der Mauszeiger bleibt bei „Anmelden“.

**Sprecher:** „Das ist ein Kundenportal für einen Versorger mit Strom, Gas, Wasser, Internet und Mobilfunk. Kundinnen und Kunden verwalten hier ihre Verträge, ihre Zählerstände und ihr Postfach. Der Betreiber steuert alles aus einem eigenen Cockpit. Gebaut ist es vollständig serverlos auf AWS — es skaliert mit der Nutzung und kostet im Leerlauf nichts. In den nächsten fünf Minuten sehen Sie es aus drei Blickwinkeln.“

**Technik:** CloudFront vor einer Next.js-Shell in Lambda; die Startseite ist
vorgerendert und wird an der Edge zwischengespeichert.

### 2 · Anmeldung (0:20–0:45)

**Bild:** Klick auf „Anmelden“, die Anmeldeseite im Aussehen des Portals,
E-Mail und Passwort von Lena Wagner, weiter ins Portal.

**Sprecher:** „Wir beginnen mit Lena. Sie meldet sich an, und die Anmeldeseite stellt Amazon Cognito bereit — im Aussehen des Portals, mit seinen Farben und seinem Logo. Das Portal selbst bekommt nie ein Passwort zu sehen, und im Browser liegt nur ein verschlüsseltes Sitzungs-Cookie, das er selbst nicht lesen kann.“

**Technik:** Cognito Managed Login mit Branding; OIDC mit Authorization Code
und PKCE; die Shell ist ein Backend for Frontend, im Browser liegt nur ein
verschlüsseltes Sitzungs-Cookie.

### 3 · Konto und Postfach (0:45–1:15)

**Bild:** „Mein Konto“ mit Kundennummer; die Glocke zeigt eine neue Nachricht;
das Postfach mit der Willkommensnachricht.

**Sprecher:** „Beim ersten Besuch legt das Portal ein Kundenkonto an und meldet das als Ereignis. Andere Dienste reagieren darauf, jeder für sich: Lena bekommt eine Willkommensnachricht ins Postfach und — für die Demo — drei Beispielverträge. Keiner dieser Dienste ruft einen anderen direkt auf. Fällt einer kurz aus, holt er seine Arbeit nach, sobald er wieder läuft.“

**Technik:** Dienst `customer` veröffentlicht `CustomerRegistered` auf
EventBridge; `notification` und `contract` reagieren unabhängig voneinander.

### 4 · Verträge und Bestellung (1:15–2:05)

**Bild:** Vertragsübersicht mit Strom, Gas und Mobilfunk; der Stromvertrag:
Abschlag mit dem Schieberegler anpassen und speichern; dann „Neuen Vertrag
abschließen“, Tarif „Wasser“ wählen, Option, Vertragsbeginn, Zählernummer,
Zustimmung, kostenpflichtig bestellen — Bestätigung.

**Sprecher:** „Unter Verträge sieht Lena, was sie hat: Strom, Gas und Mobilfunk. Den monatlichen Abschlag passt sie selbst an, innerhalb des Rahmens, den der Tarif erlaubt. Und sie schließt einen neuen Vertrag ab: Tarif aus dem Katalog wählen, Option, Beginn, Zählernummer, Zustimmung — fertig. Die Bestätigung landet sofort im Postfach. Dieser Bereich ist übrigens eine eigene Anwendung, die unabhängig vom Rest ausgeliefert wird.“

**Technik:** Eigene Zone `/vertraege` (eigene Next.js-App hinter derselben
Domain); Schreibwege über die Shell mit Prüfsumme des Inhalts; HTTP API mit
JWT-Prüfung und Scopes je Route.

### 5 · Verbrauch (2:05–2:30)

**Bild:** Zone „Verbrauch“: Zählerstand für Strom eingeben, absenden; der
Verlauf als Diagramm.

**Sprecher:** „Zählerstände erfasst Lena direkt im Portal. Das System prüft sie auf Plausibilität und rechnet daraus den Jahresverbrauch hoch. Passt der Abschlag nicht mehr dazu, wird er angepasst, und Lena erfährt es im Postfach — wieder über ein Ereignis, ohne dass sie etwas tun muss.“

**Technik:** Dienst `consumption`; `MeterReadingSubmitted` führt im Dienst
`contract` zur Neuberechnung des Abschlags.

### 6 · Kündigung und Widerruf (2:30–2:55)

**Bild:** Der neue Wasservertrag: „Widerrufen“ innerhalb von 14 Tagen; beim
Mobilfunkvertrag „Kündigen“ mit dem frühestmöglichen Termin.

**Sprecher:** „Genauso einfach geht es wieder hinaus. Den eben bestellten Vertrag kann Lena vierzehn Tage lang widerrufen. Und bei einer Kündigung nennt das Portal den frühestmöglichen Termin — nach den Regeln des Tarifs, mit Mindestlaufzeit und Kündigungsfrist.“

**Technik:** Kündigungsregeln (Mindestlaufzeit, danach Frist zum Monatsende)
im Dienst `contract`; jede Änderung als `ContractChanged` mit Verlauf.

### 7 · Altkunde: Übernahme beim Anmelden (2:55–3:30)

**Bild:** Abmelden; Anmeldung als Anna Becker mit ihrem Passwort aus dem
Altsystem; „Mein Konto“ zeigt „übernommen aus dem Versorger-Altsystem“ und ihre
Altverträge.

**Sprecher:** „Jetzt kommt Anna. Sie hatte ein Konto im alten System des Versorgers und war noch nie hier. Sie meldet sich einfach mit ihrem alten Passwort an. Das Portal prüft es im Hintergrund beim Altsystem, übernimmt ihr Konto — und ihre Verträge sind sofort da, mit Adresse und dem bisherigen Abschlag. Ohne Passwort-Reset, ohne Brief, ohne Wartezeit.“

**Technik:** Lazy Migration mit dem Migrate-User-Trigger von Cognito; das
Altsystem läuft auf einem eigenen Server; `LegacyAccountMigrated` bringt die
Verträge in die Domänen.

### 8 · Betreiber-Cockpit (3:30–4:30)

**Bild:** Anmeldung als Betreiberin; Übersicht mit Kennzahlen und Verlauf;
Kundenliste mit Filter „Sparte Strom“; ein Vertrag: Abschlag mit Begründung
festsetzen; Produkte: neuen Tarif anlegen und freigeben; Migration: Fortschritt
des Bulk-Imports, ein Klärfall, die Zeitleiste der Ereignisse.

**Sprecher:** „Der Betreiber sieht das Ganze im Cockpit: Kunden, Verträge, Abschlüsse und Kündigungen der letzten Tage. Er findet Kunden über Filter, öffnet einen Vertrag und greift ein — immer mit einer Begründung, die der Kunde in seinem Postfach liest. Den Produktkatalog pflegt er mit Preisversionen: ein neuer Tarif ist in Sekunden angelegt und freigegeben. Daneben läuft die Migration der Altkunden: Inaktive Konten kommen per Massenimport herüber, unklare Fälle landen zur Klärung, und jedes Ereignis ist in der Zeitleiste nachvollziehbar.“

**Technik:** Zone `/cockpit` mit Rechten nur für die Gruppe `owner`;
Betreiberlisten aus je einer Verzeichnis-Partition (ohne Index, ohne Scan);
Bulk-Import mit Warteschlange und Dead Letter Queue.

### 9 · Demo-Pass, Themes, Architektur (4:30–5:00)

**Bild:** Umschalten des Themes (Preset „Vertrauen“, dunkel); die Seite zum
Einlösen eines Demo-Passes; zum Schluss das Deployment-Diagramm aus dem
Bericht.

**Sprecher:** „Wer das Portal selbst ausprobieren soll, bekommt per Einladung einen Demo-Pass mit einer eigenen, abgeschotteten Instanz — für achtundvierzig Stunden. Aussehen und Dunkelmodus wählt jeder selbst. Und alles, was Sie gesehen haben, läuft auf wenigen Bausteinen: CloudFront, Lambda, EventBridge und DynamoDB, beschrieben und ausgerollt als Code. Den Code und die Architektur finden Sie auf GitHub. Vielen Dank fürs Zuschauen.“

**Technik:** Mandant je Pass mit eigener Tabelle (Token Vending); Themes aus
Cookies serverseitig gerendert; Deployment-Diagramm in
[Architektur](architektur.md) §7a.

## Sprechertext am Stück

Für die Vertonung steht der Text oben je Szene in Anführungszeichen; die
Aufnahme hält die Zeitfenster ein und legt Anfang und Ende jeder Szene in einer
Datei ab, an der die Sprecherspur ausgerichtet wird.
