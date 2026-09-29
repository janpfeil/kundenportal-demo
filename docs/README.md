# aws-demo – Konzeptunterlagen

Stand: 2026-09-29. Markdown unter `wiki/` ist die Quelle (LLM-Wiki), `reports/` enthält die daraus erzeugten HTML-Berichte (HTML + CSS + SVG) für Menschen.

## Wiki (`wiki/`)

| Datei | Inhalt |
|---|---|
| [uebersicht.md](wiki/uebersicht.md) | Einstieg: Ergebnisse, Empfehlung, offene Entscheidungen, nächste Schritte |
| [machbarkeit-kosten.md](wiki/machbarkeit-kosten.md) | Technik → Rolle im Demo, Architektur, AWS-Kontomodell, Kosten je Service, Kostenschutz |
| [fachkonzept.md](wiki/fachkonzept.md) | Entwurf: Szenario, Demo-Personen, Journeys, Bereiche, Ereignisse, Datenmodell, REST, Repository-Struktur |
| [demo-pass.md](wiki/demo-pass.md) | Eigene Instanz je Besucher, Einladungslinks, Mandantenmodell, Kontingent, Missbrauchsschutz |
| [kostenfrei.md](wiki/kostenfrei.md) | Betrieb nur im AWS-Freikontingent, eigene Infrastruktur, Pipelines, Betriebsarten Z1–Z3 |
| [anleitung-kontoinhaber.md](wiki/anleitung-kontoinhaber.md) | Jede AWS-Handlung des Kontoinhabers Schritt für Schritt (Kapitel 1: Konto prüfen) |
| [nextjs-betrieb.md](wiki/nextjs-betrieb.md) | Entscheidungsvorlage Static Export vs. OpenNext, Folgen für Micro-Frontends |
| [glossar.md](wiki/glossar.md) | Zentrales Glossar (über 360 Begriffe): Erklärung und Entsprechung außerhalb von AWS, nach Themen gruppiert |

Konventionen: Kennzeichen `[B]` belegt, `[D]` Drittquelle, `[A]`/`[E]` Annahme bzw. Einschätzung. Grafiken stehen als ```` ```chart ````-Blöcke mit JSON-Daten im Markdown; Fachbegriffe stehen **nur** in `wiki/glossar.md` (Spalten Begriff | Auch | Erklärung | Außerhalb von AWS); der Generator verlinkt in jedem Abschnitt das erste Vorkommen jedes Begriffs bzw. einer seiner Schreibweisen (auch in Wortzusammensetzungen wie „S3-Bucket") sowie jeden Tabellen-Zeilenkopf. Neue Fachbegriffe auf einer Seite → Zeile im Glossar ergänzen.

## HTML-Berichte (`reports/`)

Einstieg: `reports/index.html`. Neu bauen nach Änderungen im Wiki:

```
python3 scripts/build_reports.py
```

Generator aus einem früheren Projekt des Inhabers übernommen (`scripts/build_reports.py`, Grafiken in `scripts/report_charts.py`); benötigt Python 3 mit dem Paket `markdown`. Nur relative Pfade, keine externen Abhängigkeiten.

Vorgabe: Jede Handlung, die der Kontoinhaber selbst in AWS ausführt, wird in `wiki/anleitung-kontoinhaber.md` so beschrieben, dass sie ohne AWS-Kenntnisse nachvollziehbar ist (Ziel, Klickpfad, Ergebnis, Notiz, lesend/verändernd, Rückweg).
