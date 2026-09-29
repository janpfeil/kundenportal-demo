# Anleitung für den Kontoinhaber

Stand: 2026-09-29 · Gilt für: das AWS-Konto des Projektinhabers (altes Konto von 2021 nicht mehr zugänglich → Klärung und Neuanlage).

**Fortschritt (29.09.2026):** Kapitel 1–3 erledigt — neues Konto im Free Plan,
100 $ Guthaben bis 29.09.2027, MFA für Root aktiv. Weiter mit
[Kapitel 4](anleitung-fundament.md#4-alltagszugang-einrichten).

Fachbegriffe sind in jedem Abschnitt beim ersten Vorkommen mit dem [Glossar](glossar.md) verlinkt (Erklärung und Entsprechung außerhalb von AWS).

## 0. Grundsätze

Diese Anleitung beschreibt **jede Handlung, die der Kontoinhaber selbst in
AWS ausführt** — Schritt für Schritt, so dass sie ohne AWS-Vorkenntnisse
nachvollziehbar und wiederholbar ist. Automatisierte Schritte (GitHub
Actions, GitLab CI) sind in den jeweiligen Kapiteln verlinkt; hier steht nur,
was ein Mensch in der AWS-Weboberfläche tut.

Regeln für alle Kapitel:

1. **Jeder Schritt nennt:** Ziel (warum), Ort (genauer Klickpfad), was man
   sieht, was man notiert, und ob der Schritt etwas **verändert** oder nur
   **liest**.
2. **Nur lesende Schritte** sind mit 👁 markiert, **verändernde** mit ✎.
   Verändernde Schritte können Kosten oder Sicherheitsfolgen haben; sie
   nennen immer auch den Rückweg.
3. **Keine Zugangsdaten weitergeben** — weder Passwort noch Einmalcodes
   noch Zugangsschlüssel (Access Keys). Automatisierungen erhalten nie
   Schlüssel, sondern kurzlebige Berechtigungen über OIDC-Rollen.
4. **Ergebnisse protokollieren** im Abschnitt „Protokoll" am Ende des
   jeweiligen Kapitels (Datum, Wert, wer). Keine geheimen Werte ins
   Protokoll schreiben; die Kontonummer (12 Ziffern) ist kein Geheimnis,
   gehört aber nicht in das öffentliche Repository.
5. **Bezeichnungen in der AWS-Oberfläche** sind in Englisch angegeben, so
   wie sie in der Standardeinstellung erscheinen (Stand 09/2026). AWS ändert
   Menüs gelegentlich; weicht etwas ab, hilft die Suchleiste oben in der
   Konsole: dort den fett gedruckten Begriff eingeben.

Hinweise aus der ersten Anmeldung (29.09.2026):

- Beim ersten Öffnen erscheint unten ein Cookie-Hinweis: **Decline**
  wählen (nur notwendige Cookies).
- Oben rechts steht zunächst die Region **Europe (Stockholm)**; für
  Abrechnungsseiten egal, für das Projekt später **Europe (Frankfurt)**
  wählen.
- Der erste Besuch der Billing-Startseite schaltet den Cost Explorer
  automatisch ein (kostenlos); Kostendaten erscheinen erst nach bis zu
  24 Stunden.

Begriffe, die in allen Kapiteln vorkommen:

- **AWS Management Console** — die Weboberfläche unter
  https://console.aws.amazon.com; alle Schritte hier finden dort statt.
- **Root-Benutzer** — die E-Mail-Adresse, mit der das Konto einst angelegt
  wurde. Hat alle Rechte und ist nur für wenige Aufgaben nötig (Konto,
  Abrechnung). Für Anlage und Prüfungen genügt er; für den späteren
  Alltag wird ein eigener Zugang eingerichtet ([Kapitel 4](anleitung-fundament.md#4-alltagszugang-einrichten)).
- **Region** — oben rechts in der Konsole steht ein Ort (z. B. „Europe
  (Frankfurt)"). Abrechnungsseiten sind regionsunabhängig; für dieses
  Projekt wird später immer **Europe (Frankfurt) eu-central-1** gewählt.

## 1. Altes Konto klären 👁

Status: **erledigt 29.09.2026** (altes Konto nicht zugänglich → neues Konto).

Ausgangslage (29.09.2026): Es gab ein AWS-Konto von 2021; die alten
Zugangsdaten werden abgelehnt. Bevor ein neues Konto entsteht, muss klar
sein, ob das alte noch existiert — denn:

- Solange das alte Konto **besteht**, soll es genutzt werden; ein zweites
  Konto nur für Freiangebote ist laut AWS-Bedingungen ausgeschlossen
  [B: https://aws.amazon.com/free/terms/].
- Ist das alte Konto **geschlossen**, bleibt seine E-Mail-Adresse
  **dauerhaft gesperrt**; das neue Konto braucht eine andere Adresse. Auch
  ein damals vergebener Konto-Alias ist nicht wiederverwendbar
  [B: https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-closing.html].
- Nach der Schließung gibt es 90 Tage, in denen das Konto über den AWS
  Support wieder geöffnet werden kann; danach löscht AWS es endgültig
  [B, ebenda].

### 1.1 Passwort zurücksetzen versuchen 👁

1. https://console.aws.amazon.com öffnen. Die Seite zeigt zuerst „IAM user
   sign in"; darunter auf **Sign in using root user email** klicken
   (Stand 29.09.2026 gesehen).
2. Die E-Mail-Adresse von damals eingeben, **Next**.
3. **Forgot password?** anklicken, die Zeichenprüfung (CAPTCHA) lösen.
4. Mögliche Ergebnisse:
    - Eine E-Mail mit Link zum Zurücksetzen kommt an → **das Konto
      existiert**. Neues Passwort setzen, anmelden, dann **Kapitel 3**
      (Konto prüfen); Kapitel 2 entfällt.
    - Meldung, dass es kein Konto zu dieser Adresse gibt, oder keine E-Mail
      (auch nicht im Spam-Ordner) → vermutlich geschlossen oder anders
      registriert. Weiter mit 1.2.
5. Falls mehrere alte Adressen in Frage kommen: jede einmal versuchen.

### 1.2 Entscheidung dokumentieren 👁

| Befund | Nächster Schritt |
|---|---|
| Altes Konto existiert und ist zugänglich | Kapitel 3, dann Kapitel 4 ff.; kein neues Konto |
| Altes Konto existiert, aber Anmeldung scheitert trotz Reset | AWS Support über https://support.aws.amazon.com (Kategorie „Account and billing", Anmeldung nicht nötig) |
| Kein Konto zu den bekannten Adressen | Kapitel 2 mit einer **neuen** E-Mail-Adresse |

Ob ein neues Konto die Neukunden-Angebote (Free Plan, Startguthaben)
erhält, entscheidet AWS bei der Anmeldung. Alle Angaben wahrheitsgemäß
machen; nichts verschleiern [E].

## 2. Neues Konto anlegen ✎

Status: **erledigt 29.09.2026** (Free Plan, 100 $ Guthaben, Root-MFA aktiv).

Nur, wenn Kapitel 1 ergeben hat, dass kein zugängliches Konto existiert.
Dauer: etwa 20 Minuten, Freischaltung durch AWS bis zu 24 Stunden.
Grundlage ist die AWS-Anleitung „Sign up for AWS (advanced)"
[B: https://docs.aws.amazon.com/accounts/latest/reference/getting-started.html].

**Verändernd:** Es entsteht ein Vertrag mit AWS. Rückweg: Konto schließen
(Account → Close account); danach ist die E-Mail-Adresse dauerhaft
gesperrt.

Hinweis: AWS erprobt zusätzlich eine vereinfachte Anmeldung „Sign up for
AWS (new)" mit Projekten und Ausgabenlimit (ab 20 $). Sie ist nur für
einen Teil der Kunden freigeschaltet und schränkt Rechte und Regionen ein
[B: https://docs.aws.amazon.com/accounts/latest/reference/sign-up-for-aws.html].
Für dieses Projekt wird die klassische Anmeldung verwendet.

### 2.1 Vorbereiten 👁

| Angabe | Empfehlung | Warum |
|---|---|---|
| E-Mail-Adresse (Root) | eine **neue**, dauerhafte Funktionsadresse, z. B. `aws-demo@…` auf der eigenen Domain; **nicht** die Adresse eines geschlossenen Kontos | Anmeldename und Wiederherstellung; muss erreichbar bleiben |
| Kontoname | z. B. `rypox-kundenportal-demo` (AWS empfiehlt Organisation-Zweck-Umgebung) | nur Anzeigename auf Rechnungen und in der Konsole; **muss nicht eindeutig sein** — „rypox" wird deshalb nicht abgelehnt [E, nach AWS-Beschreibung des Felds] |
| Passwort | lang und zufällig, im Passwortmanager | Root hat alle Rechte |
| Telefon | eine Nummer, die dauerhaft erreichbar ist (bei Firma: Firmennummer) | Identitätsprüfung und Kontowiederherstellung |
| Zahlungsmittel | Kredit- oder Debitkarte | Pflicht, auch im Free Plan; Probebelastung 1 $, wird erstattet [B] |
| Authentifizierungs-App | z. B. auf dem Smartphone (Aegis, Google Authenticator, 1Password) | für Abschnitt 2.3 |

### 2.2 Anmelden bei AWS ✎

1. https://signin.aws.amazon.com/signup?request_type=register öffnen.
2. **Root user email address** und **AWS account name** eintragen,
   **Verify email address** klicken.
3. Den per E-Mail erhaltenen Code eingeben, **Verify**.
4. Root-Passwort zweimal eingeben (mind. 8 Zeichen, drei Zeichenarten,
   nicht gleich Kontoname oder E-Mail), **Continue**.
5. **Kontoplan wählen: Free** (Empfehlung für dieses Projekt, siehe
   Kasten unten). Wird der Free Plan nicht angeboten, notieren und Paid
   wählen; dann greift der Kostenschutz aus Kapitel 5.
6. Kontaktdaten eingeben. Bei **Business**: Firmenname und Anschrift von
   rypox; bei **Personal**: Privatanschrift. AWS Customer Agreement lesen und
   bestätigen.
7. Zahlungsdaten eingeben (Karte). Ohne gültiges Zahlungsmittel geht es
   nicht weiter.
8. Identität bestätigen: Land und Telefonnummer eingeben, **Send SMS**,
   den erhaltenen Code eingeben, **Continue**.
9. Support-Plan: **Basic support – Free** wählen.
10. **Complete sign up** klicken.
11. Auf die Bestätigungs-E-Mail warten (meist Minuten, bis zu 24 Stunden;
    Spam-Ordner prüfen).

Die Reihenfolge der Seiten kann sich bei AWS ändern; die Inhalte bleiben
dieselben.

**Warum Free Plan?** Der Free Plan garantiert, dass **keine Kosten**
entstehen — genau die Vorgabe des Projekts. Er endet nach 6 Monaten oder
wenn das Guthaben aufgebraucht ist; dann schließt AWS das Konto, es sei
denn, man wechselt vorher auf den Paid Plan (Restguthaben bleibt erhalten)
[B: https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html].
Alle Dienste dieses Projekts sind im Free Plan nutzbar [E]. Achtung: Der
Beitritt zu AWS Organizations wechselt automatisch in den Paid Plan [B] —
deshalb vorerst **keine** Organization anlegen.

Erinnerung im Kalender: **5 Monate nach Anlage** entscheiden, ob das Demo
weiterlaufen soll (dann Paid Plan mit Kostenschutz) oder mit dem Konto
endet.

### 2.3 Root-Benutzer mit zweitem Faktor schützen ✎

Sofort nach der ersten Anmeldung. Grundlage:
https://docs.aws.amazon.com/IAM/latest/UserGuide/enable-virt-mfa-for-root.html

1. Als Root anmelden (https://console.aws.amazon.com → **Sign in using root
   user email**).
2. Oben rechts auf den Kontonamen klicken, **Security credentials** wählen.
3. Im Abschnitt **Multi-factor authentication (MFA)** auf **Assign MFA
   device** klicken.
4. Einen Gerätenamen eingeben (z. B. `root-handy`), **Authenticator app**
   wählen, **Next**.
5. **Show QR code**, mit der Authentifizierungs-App scannen.
6. Zwei **aufeinanderfolgende** Codes aus der App in die beiden Felder
   eintragen, **Add MFA**.
7. Abmelden und erneut anmelden: Nach dem Passwort wird der Code aus der
   App verlangt.

Rückweg: Unter Security credentials das Gerät entfernen (nicht
empfohlen). Geht das Handy verloren: Wiederherstellung über E-Mail und
Telefon des Kontos.

### 2.4 Protokoll

| Datum | Schritt | Ergebnis | Wer |
|---|---|---|---|
| | 1.1 Altes Konto | | |
| | 2.2 Konto angelegt (Kontoname, gewählter Plan, angebotenes Guthaben) | | |
| | 2.2 Freischaltungs-E-Mail erhalten | | |
| | 2.3 MFA für Root aktiv | | |

Kapitel 1–2 erledigt 29.09.2026; die ausgefüllte Tabelle liegt im privaten
Protokoll des Inhabers.

## 3. Konto prüfen 👁

Status: Erstprüfung **erledigt 29.09.2026**; die monatliche Wiederholung bleibt.

Wann: direkt nach der Anlage (Kapitel 2) und danach monatlich.

Ziel: Feststellen, nach welchen Bedingungen das Konto abgerechnet wird, ob
noch Guthaben vorhanden ist und ob bereits Ressourcen laufen, die Kosten
verursachen. **Alle Schritte in diesem Kapitel sind nur lesend.** Dauer:
etwa 15 Minuten.

### 3.1 Anmelden 👁

1. https://console.aws.amazon.com öffnen.
2. Die Seite zeigt zuerst „IAM user sign in"; darunter auf **Sign in using
   root user email** klicken, die E-Mail-Adresse des Kontos eingeben,
   **Next** (Stand 29.09.2026 gesehen).
3. Passwort eingeben; falls eingerichtet, den Code der
   Authentifizierungs-App (MFA) eingeben.
4. Ergebnis: Die Startseite „Console Home" erscheint. Oben rechts steht der
   Kontoname; ein Klick darauf zeigt die **Account ID** (12 Ziffern).

Notieren: Account ID (nur im privaten Protokoll).

Klappt die Anmeldung nicht: **Forgot password?** auf der Anmeldeseite;
AWS schickt eine E-Mail an die Kontoadresse.

### 3.2 Erstellungsdatum des Kontos ermitteln 👁

Warum: Konten, die **vor dem 15.07.2025** angelegt wurden, laufen nach den
alten Freikontingent-Bedingungen (Legacy Free Tier); neuere nach dem
Guthaben-Modell. Davon hängt ab, was kostenlos ist
([Machbarkeit & Kosten](machbarkeit-kosten.md) §3.1).

AWS zeigt das Datum nicht direkt an; zuverlässig steht es im
„Credential Report" [B: https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_getting-report.html]:

1. In die Suchleiste oben **IAM** eingeben und den Dienst „IAM" öffnen.
2. Links im Menü **Credential report** anklicken.
3. **Download credentials report** anklicken. Es wird eine CSV-Datei
   heruntergeladen (erzeugen dauert wenige Sekunden; dieser Bericht ändert
   nichts am Konto).
4. Die Datei mit einer Tabellenkalkulation öffnen (LibreOffice Calc,
   Excel).
5. Die Zeile suchen, in deren erster Spalte `<root_account>` steht.
6. In dieser Zeile die Spalte **user_creation_time** ablesen, z. B.
   `2019-03-14T09:12:45+00:00` — das ist das Erstellungsdatum des Kontos.

Notieren: Erstellungsdatum. Danach die CSV-Datei löschen (sie enthält
Angaben zu allen Zugängen des Kontos).

Zusätzlich sichtbar in derselben Zeile: **mfa_active** — `true` heißt, die
Anmeldung des Root-Benutzers ist mit einem zweiten Faktor geschützt.
Notieren; bei `false` Abschnitt 2.3 nachholen.

### 3.3 Guthaben prüfen 👁

1. In die Suchleiste **Billing and Cost Management** eingeben und öffnen.
2. Links im Menü **Credits** anklicken (steht unter „Billing and
   Payments"; gesehen 29.09.2026).
3. Ergebnis: eine Tabelle mit Gutschriften. Wichtig sind die Spalten
   **Amount remaining** (Restbetrag) und **Expiration date** (Ablaufdatum).
   Ist die Tabelle leer, gibt es kein Guthaben. Beispiel nach der
   Neuanlage: eine Zeile „AWS Free Tier", 100,00 $, gültig ein Jahr,
   Status „Active"; oben die Summen „Total amount remaining" und
   „Total amount used".

Notieren: Restbetrag und Ablaufdatum, oder „kein Guthaben".

### 3.4 Freikontingent-Status prüfen 👁

1. In **Billing and Cost Management** links **Free Tier** anklicken (steht
   unter „Cost and Usage Analysis").
2. Ergebnis, je nach Kontoalter:
    - bei neueren Konten im Free Plan ein blauer Hinweis „Your free plan
      account does not get charged" mit Knopf **Upgrade plan** — **nicht**
      anklicken, das wechselt in den Paid Plan;
    - bei älteren Konten eine Tabelle der Freikontingente mit Verbrauch im
      laufenden Monat. Abgelaufene 12-Monats-Angebote erscheinen nicht mehr.
3. Auf der Startseite von Billing and Cost Management steht bei neueren
   Konten zusätzlich die Art des Kontoplans.

Notieren: angezeigter Kontoplan bzw. „alte Bedingungen"; auffällige
Kontingente mit hohem Verbrauch.

### 3.5 Bisherige Kosten prüfen 👁

1. In **Billing and Cost Management** links **Bills** anklicken.
2. Oben den laufenden Monat auswählen; danach die letzten drei Monate.
3. Ergebnis: Gesamtbetrag je Monat und darunter eine Aufstellung **nach
   Dienst** (z. B. „Elastic Compute Cloud", „Simple Storage Service").

Notieren: Beträge der letzten drei Monate; jeden Dienst mit Betrag > 0,00 $.
Solche Dienste zeigen, dass noch etwas läuft oder gespeichert ist.

### 3.6 Laufende Ressourcen finden 👁

Nur nötig, wenn in 3.5 Beträge auftauchen oder unklar ist, ob noch alte
Ressourcen existieren.

1. In die Suchleiste **Resource Explorer** eingeben und öffnen.
2. Ist der Dienst noch nicht eingerichtet, schlägt AWS eine „Quick setup"
   vor — **das wäre ein verändernder Schritt; hier abbrechen** und
   stattdessen:
3. In die Suchleiste **Tag Editor** eingeben und öffnen
   (Teil von „Resource Groups & Tag Editor").
4. Bei **Regions** „All regions" wählen, bei **Resource types** „All
   supported resource types", dann **Search resources**.
5. Ergebnis: Liste aller Ressourcen im Konto mit Typ und Region.

Notieren: Anzahl und Art der gefundenen Ressourcen (z. B. „2 S3-Buckets in
eu-central-1"). Nichts löschen — das Aufräumen wird gemeinsam entschieden.

### 3.7 Protokoll

| Datum | Prüfpunkt | Ergebnis | Wer |
|---|---|---|---|
| | 3.2 Erstellungsdatum | | |
| | 3.2 MFA Root aktiv | | |
| | 3.3 Guthaben | | |
| | 3.4 Kontoplan / Freikontingent | | |
| | 3.5 Kosten letzte 3 Monate | | |
| | 3.6 Vorhandene Ressourcen | | |

Die ausgefüllte Tabelle bleibt **privat** (nicht ins öffentliche
Repository); ins Projekt-Journal kommt nur die Zusammenfassung, z. B.
„Konto vor 07/2025, kein Guthaben, keine laufenden Kosten".

Erstprüfung erledigt 29.09.2026: Konto neu (nach 15.07.2025), Free Plan,
100 $ Guthaben bis 29.09.2027, keine Kosten, keine Ressourcen.

## Alle Kapitel

Die Anleitung ist auf drei Seiten verteilt (jede Seite bleibt übersichtlich):

| Kapitel | Inhalt | Art | Seite | Stand |
|---|---|---|---|---|
| 0 | Grundsätze | — | diese Seite | — |
| 1 | Altes Konto klären | 👁 | diese Seite | erledigt 29.09.2026 |
| 2 | Neues Konto anlegen, Root-MFA | ✎ | diese Seite | erledigt 29.09.2026 |
| 3 | Konto prüfen (monatlich wiederholen) | 👁 | diese Seite | erledigt 29.09.2026 |
| 4 | Alltagszugang (IAM-Benutzer, MFA, `aws login`), Lambda-Kontolimit prüfen | ✎ | [Anleitung Fundament](anleitung-fundament.md#4-alltagszugang-einrichten) | offen |
| 5 | Terraform-Fundament im Erstlauf: OIDC-Rollen, Budget, SNS bestätigen | ✎ | [Anleitung Fundament](anleitung-fundament.md#5-terraform-fundament-erstlauf) | offen |
| 6 | GitLab-Projekt: Variablen, Deploy-Key, Pipeline | ✎ | [Anleitung Anwendung](anleitung-anwendung.md#6-gitlab-pipeline-für-das-fundament) | offen |
| 7 | CDK-Bootstrap, GitHub-Environment `production` | ✎ | [Anleitung Anwendung](anleitung-anwendung.md#7-cdk-bootstrap-und-github-freigabe) | offen |
| 8 | Zertifikat und DNS, Deploy, Test, DLQ-Probe, Abbau | ✎ | [Anleitung Anwendung](anleitung-anwendung.md#8-anwendung-deployen-testen-abbauen) | offen |
| 9 | Vor Ablauf des Free Plans | ✎ | [Anleitung Anwendung](anleitung-anwendung.md#9-vor-ablauf-des-free-plans) | offen |
| 10 | Repository öffentlich schalten | ✎ | [Anleitung Anwendung](anleitung-anwendung.md#10-repository-öffentlich-schalten) | offen |
