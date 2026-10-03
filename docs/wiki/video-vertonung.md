# Vertonung des Demo-Videos — Möglichkeiten

Stand: 2026-10-03 · Phase 8 · Recherche für die Sprecherspur des 5-Minuten-Videos
([Drehbuch](demo.md)). Anforderung des Inhabers: „sehr professionell und
natürlich, auch die Sprache“. Kennzeichnung: **[B]** belegt (offizielle Quelle),
**[D]** Drittquelle, **[E]** eigene Einschätzung. Alle Quellen am 03.10.2026
abgerufen; Preise netto, USD wenn nicht anders angegeben.

Rechengrundlage: ein Sprechertext von rund **5.000 Zeichen**, zehnmal neu
erzeugt **50.000 Zeichen**. Für fünf Minuten Erklärvideo empfiehlt bodalgo
höchstens 110–120 Wörter je Minute [B], also **550–600 Wörter** [E].

## Kurzfassung

| Wofür | Empfehlung | Kosten |
|---|---|---|
| Beste Qualität | **ElevenLabs Eleven v4** über die API (Tarif Starter, ein Monat); Aussprache englischer Begriffe per IPA-Wörterbuch | einmalig $1–6 |
| Null Kosten, gut steuerbar | **Azure AI Speech F0**, `de-DE-SeraphinaMultilingualNeural` oder `FlorianMultilingualNeural`, volles SSML | $0 (0,5 Mio. Zeichen/Monat frei) |
| Menschliche Stimme | professioneller Sprecher (Gagenkompass VDS 2026, Webvideo bis 5 Min.) | 450–550 € netto je Fassung |

Praktischer Weg [E]: während der Entwicklung mit Azure F0 vertonen (SSML je
Szene, Szenenlängen messen, Video daran ausrichten); die Endfassung einmal mit
ElevenLabs v4 erzeugen und die Audiodateien einfrieren. Einen Sprecher nur,
wenn sich die Demo kaum noch ändert — jede Änderung kostet erneut.

## Vergleich

| Option | Qualität Deutsch | Aussprache-Steuerung | 5.000 Zeichen | 10× | Gratis-Kontingent | Nutzung im öffentlichen Video | Automatisierung | EU |
|---|---|---|---|---|---|---|---|---|
| **ElevenLabs Eleven v4** (seit 28.09.2026) | sehr hoch; Platz 1 bei Artificial Analysis (Elo 1321) [B/D] | kein SSML, keine Pausen-Tags; IPA in `/…/` und Aussprache-Wörterbücher mit Phonemen — für Deutsch **nur mit v4** [B] | $0,40 (Aktion bis 12.10.: $0,11) [B] | $4,00 [B] | Free 10.000 Zeichen/Monat, **ohne kommerzielle Lizenz** [B] | ab Starter ($6/Monat) [B] | gute API; v4 noch „under active development“ [B] | Datenresidenz nur Enterprise [B] |
| ElevenLabs Multilingual v2 / v3 | hoch (v3 Elo 1174) [B/D] | v2 nur Alias-Regeln; v3 ohne Pausen-Tags [B] | $0,40 | $4,00 | wie oben | wie oben | v3 max. 5.000 Zeichen je Anfrage [B] | wie oben |
| **Azure AI Speech Neural** (Seraphina/Florian Multilingual, Conrad) | gut bis sehr gut; Blindtest Deutsch 4,2/5 [D] | **volles SSML**: `<phoneme>`, PLS-Lexikon, `<lang>`, `<sub>`, `<break>`, `<prosody>`, Bookmarks [B] | $0 (F0), sonst $0,075 [B] | $0 / $0,75 [B] | **0,5 Mio. Zeichen/Monat** [B] | kommerziell nutzbar [E] | sehr gut: SSML im Repo, Wort-Zeitstempel für die Synchronisierung [B] | EU-Regionen [B] |
| Azure HD (DragonHD) | sehr hoch [E] | Teilmenge des SSML; Lexikon nur Alias [B] | $0,11 [B] | $1,10 [B] | ob F0 HD abdeckt: **nicht belegt** | wie oben | Varianz einstellbar [B] | EU prüfen |
| **Google Chirp 3 HD** (de-DE) | sehr natürlich [E] | SSML, Pausen, Tempo; **eigene Aussprachen für de-DE nicht unterstützt** [B] | $0 im Kontingent, sonst $0,15 [B] | $0 / $1,50 [B] | **1 Mio. Zeichen/Monat** [B] | kommerziell nutzbar [E] | gut | EU-Endpunkt [B] |
| Gemini 3.8 Flash TTS | Elo 1275 [B/D] | Stilsteuerung, **keine Phoneme** [B] | ≈ $0,07 [E] | ≈ $0,70 [E] | Free Tier [B] | Google beansprucht keine Rechte [B] | Vorschau-Modell [E] | EWR-Regeln [B] |
| **Amazon Polly Generative** (Daniel, Vicki, Lennart) | gut bis sehr gut [D] | `<phoneme>` teilweise, `<lang>`/`<sub>`/`<break>` [B] | $0,15 [B] | $1,50 [B] | erste 12 Monate bzw. Credit-Modell [B] | kommerziell nutzbar [E] | passt zum AWS-Konto; keine Zeitmarken bei Generative [B] | **Frankfurt** [B] |
| OpenAI gpt-4o-mini-tts | mittel bis gut; „optimized for English“ [B] | kein SSML [B] | ≈ $0,08 [E] | ≈ $0,75 | – | **Offenlegung als KI-Stimme Pflicht** [B] | einfach | nicht geprüft |
| Lokal: Qwen3-TTS | gut [B: Herstellerbenchmark] | kein SSML [E] | $0 | $0 | – | Apache-2.0 [B] | offline, reproduzierbar [E] | lokal |
| Lokal: Chatterbox Multilingual | gut [D] | kein SSML | $0 | $0 | – | MIT, unhörbares Wasserzeichen [B] | gut | lokal |
| Lokal: Zonos, Thorsten Orpheus, Piper | gut / ruhig / hörbar TTS [B/D] | – | $0 | $0 | – | Apache-2.0 bzw. CC0, Piper GPL [B/D] | – | lokal |
| **Nicht geeignet** | – | – | – | – | – | XTTS-v2 (nur nicht-kommerziell), F5-TTS (CC-BY-NC), Fish S1/S2, VibeVoice (kein Deutsch) [B/D] | – | – |
| **Professioneller Sprecher** (VDS, bodalgo, Sprecherdatei) | am besten [E] | Briefing mit Aussprache | **450/500/550 €** [B] | jede Änderung kostet erneut [E] | – | vertraglich, keine KI-Nutzung [B] | nicht neu erzeugbar [E] | – |
| Fiverr | gemischt [E] | Briefing | grob $50–500 [D/E] | wie oben | – | je Angebot prüfen | – | – |
| Selbst einsprechen | je nach Stimme und Raum [E] | volle Kontrolle | Mikrofon 100–250 € [E] | Zeit | – | eigene Rechte | – | – |

## Anmerkungen

**ElevenLabs.** v4 ist das einzige Modell des Anbieters, das IPA in deutschen
Sätzen versteht [B] — damit lassen sich „Cognito“, „EventBridge“ oder
„DynamoDB“ gezielt aussprechen. Pausen entstehen über Satzzeichen oder über
die Aufteilung in Szenen [E]. Der API-Tarif Starter enthält rund 75.000
Zeichen [B], genug für mehr als zehn Durchläufe; danach kündigen. Ob die Rechte
an bereits erzeugtem Audio nach der Kündigung bleiben, ist nur von Dritten
belegt [D]. Risiko: v4 ist wenige Tage alt [B] — erzeugte Dateien archivieren
statt bei jedem Build neu zu erzeugen [E]. Die Gratisstufe taugt für ein
öffentliches Video nicht (keine kommerzielle Lizenz) [B].

**Azure.** Der beste Werkzeugkasten für Aussprache [E]: Phoneme (IPA, SAPI,
X-SAMPA), eigenes Lexikon, `<lang xml:lang="en-US">` für englische
Produktnamen, Pausen und Tempo per SSML, Zeitstempel je Wort zum Ausrichten
[B]. Die Gratisstufe F0 reicht für etwa hundert Durchläufe im Monat [B]. Die
HD-Stimmen klingen natürlicher, können aber weniger SSML [B]; ob F0 sie
abdeckt, klärt erst ein Test.

**Google.** Chirp 3 HD klingt sehr natürlich, erlaubt für Deutsch aber keine
eigenen Aussprachen [B] — Fachbegriffe nur über Umschreibung.

**Amazon Polly.** Passt zum vorhandenen AWS-Konto (Frankfurt) [B], generative
Stimmen sind gut, haben aber keine Zeitmarken und nur teilweise
Phonem-Steuerung [B]; jede Szene anhören [E].

**OpenAI.** Für Deutsch mit dem Anspruch „sehr natürlich“ nicht erste Wahl;
Offenlegung als KI-Stimme ist Pflicht [B].

**Lokal.** Kostenlos und reproduzierbar (fester Seed), aber ohne
Aussprache-Steuerung — englische Begriffe werden oft eingedeutscht; mehrere
Durchläufe je Satz und Auswahl kosten Stunden [E]. GPU mit 4–16 GB nötig
[D/E].

**Sprecher.** Klingt am besten [E], passt aber schlecht zur automatischen
Aufnahme: Jede Änderung an der Demo bedeutet neue Kosten und Wartezeit [E].

**Offenlegung [E, keine Rechtsberatung].** Bei einer KI-Stimme einen Hinweis
einplanen, z. B. „Sprecherstimme KI-generiert“ im Abspann oder in der
Beschreibung; die Transparenzpflichten des EU AI Act (Art. 50) gelten seit
August 2026 — ob eine generische Stimme darunter fällt, ist nicht geprüft.

## Einbau in die Aufnahme [E]

1. Sprechertext je Szene aus dem Drehbuch als Datei (bei Azure SSML, bei
   ElevenLabs Text plus Aussprache-Wörterbuch).
2. Audio je Szene erzeugen, Länge mit `ffprobe` messen.
3. Die Aufnahme hält jede Szene so lange wie ihre Audiodatei (Wartezeiten im
   Playwright-Skript aus den gemessenen Längen).
4. Bild und Ton mit `ffmpeg` zusammensetzen; Audiodateien versionieren.

## Nicht verifiziert

Kommerzielle Nutzungsbedingungen von Azure, Google und Polly im Wortlaut; ob
Azure F0 HD-Stimmen abdeckt; der Minutenpreis von gpt-4o-mini-tts (aus dem
Token-Preis geschätzt); Lieferzeiten von Agentursprechern; der Llama-Anteil der
Lizenz bei Thorsten Orpheus; VRAM-Bedarf der Orpheus-Varianten.

## Quellen

- ElevenLabs: https://elevenlabs.io/pricing/api ·
  https://elevenlabs.io/blog/eleven-v4 ·
  https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4 ·
  https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/pronunciation-dictionaries ·
  https://elevenlabs.io/docs/overview/administration/data-residency ·
  https://techcrunch.com/2026/09/28/elevenlabs-new-v4-speech-model-supports-more-expression-control-and-90-languages/
- Benchmarks: https://artificialanalysis.ai/text-to-speech/leaderboard ·
  https://speechgeneration.ai/de/beste-text-to-speech-tools [D]
- Azure: https://azure.microsoft.com/en-us/pricing/details/speech/ ·
  https://learn.microsoft.com/en-us/azure/ai-services/speech-service/high-definition-voices ·
  https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation ·
  https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits
- Google: https://cloud.google.com/text-to-speech/pricing ·
  https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd ·
  https://ai.google.dev/gemini-api/docs/pricing ·
  https://ai.google.dev/gemini-api/docs/speech-generation
- Amazon: https://aws.amazon.com/polly/pricing/ ·
  https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html ·
  https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html
- OpenAI: https://developers.openai.com/api/docs/guides/text-to-speech ·
  https://developers.openai.com/api/docs/pricing
- Lokal: https://github.com/QwenLM/Qwen3-TTS ·
  https://huggingface.co/ResembleAI/chatterbox ·
  https://huggingface.co/Zyphra/Zonos-v0.1-transformer ·
  https://huggingface.co/Thorsten-Voice/tv-orpheus-v1 ·
  https://huggingface.co/coqui/XTTS-v2 · https://huggingface.co/aihpi/F5-TTS-German ·
  https://github.com/OHF-Voice/piper1-gpl
- Sprecher: https://www.sprecherverband.de/vds-gagenkompass/ ·
  https://www.sprecherverband.de/wp-content/uploads/2026/06/VDS_Gagenkompass_2026.pdf ·
  https://www.bodalgo.com/de/know-how/sprecher-fuer-erklaerfilme/20 ·
  https://www.sprecherwiki.de/gagen/uebersicht [D]
