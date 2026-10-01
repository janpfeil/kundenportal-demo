# Design und Theme (Phase 5)

Stand: 2026-10-01 · Entwurf zur Entscheidung · Kennzeichnung: **[E]** Einschätzung.

**Mockup:** https://janpfeil.github.io/kundenportal-demo/design/mockups.html
(eine einzelne HTML-Datei, `docs/design/mockups.html`; läuft auch lokal per
Doppelklick, ohne Build und ohne Internet).

## Ziel

Phase 5 legt das Aussehen des Portals fest. Heute gibt es genau ein Theme:
die Design-Tokens `--kp-*` in `packages/ui/src/styles.css` (grüner Akzent
`#0b6e4f`, Systemschrift, hell und dunkel nach Betriebssystem). Das Mockup
zeigt echte Seiten des Portals mit erfundenen Daten in mehreren Varianten.
Der Inhaber wählt je Zielgruppe eine Variante; ihre Werte wandern danach als
Tokens in die Component Library. Am Code der Seiten ändert sich dafür wenig,
weil alle Komponenten ihre Farben, Abstände und Schriften aus den Tokens
lesen.

## Zwei Zielgruppen

| Zielgruppe | Seiten | Was sie braucht |
|---|---|---|
| Endkunden eines Mehrsparten-Versorgers (Strom, Gas, Wasser, Internet, Mobilfunk) | `/`, `/konto`, `/postfach`, `/vertraege`, `/verbrauch`, `/pass` | ruhig, vertrauenswürdig, freundlich; gut lesbar nach WCAG 2.2 AA (Kontrastverhältnis mindestens 4,5:1 für Text); große Touch-Ziele (44 px); klare Hierarchie; zuerst für das Smartphone gedacht |
| Inhaber im Migrations-Cockpit (Power-User) | `/cockpit`, `/cockpit/paesse` | dicht und schnell erfassbar; per Tastatur bedienbar; Tabellen, Kennzahlen, Timeline, Status-Badges; Seitenleiste; ein guter Dunkelmodus für lange Sitzungen |

Beide Zielgruppen nutzen dieselben Token-Namen und dieselbe Component
Library; sie unterscheiden sich nur in den Werten.

## Die Varianten im Mockup

Jede Variante ist ein **Preset**: es setzt mehrere Parameter auf einmal
(Farbe, Schrift, Dichte, Ecken, Schatten, Rahmen, Navigation). Jede Variante
funktioniert hell und dunkel; im Dunkelmodus wird der Akzent automatisch so
weit aufgehellt, dass er 4,5:1 erreicht.

**Endkunden**

| Preset | Absicht |
|---|---|
| Vertrauen | ruhiges Blau, kühle Grautöne, Karten mit feinem Schatten, Top-Bar. Seriös, ohne kühl zu wirken. |
| Warm | Terrakotta, warme Neutraltöne, gerundete Schrift, große Radien, viel Luft; mobil eine Bottom-Nav. Nahbar, für Familien und ältere Kunden. |
| Klar | monochrom mit dem grünen Bestandsakzent, fast keine Radien, Linien statt Schatten. Sachlich und sehr ruhig; am nächsten am heutigen Stand. |
| Klassisch | Petrol, Serifen-Überschriften, Seitenleiste. Wirkt wie ein etabliertes Stadtwerk. |

**Cockpit**

| Preset | Absicht |
|---|---|
| Dicht | kompakt, 14 px, Seitenleiste mit Sektionen und Tastaturkürzeln, Linien statt Schatten. Viele Zeilen auf einen Blick. |
| Übersicht | Karten mit Schatten, Top-Bar, mehr Weißraum. Für den Überblick und für Vorführungen. |
| Kontrast | dunkel zuerst, aufgehellter Cyan-Akzent, kräftigere Ränder. Für lange Sitzungen und große Bildschirme. |

Gezeigte Seiten: Startseite (öffentlich), Übersicht mit Konto und geöffnetem
Benutzermenü, Verträge mit Änderungsformular, Verbrauch mit Monatsdiagramm,
Postfach, Demo-Pass mit Kontingenten; im Cockpit die Übersicht (Fortschritt
Versorger/Telko, Klärfälle, Dead-Letter-Queue mit Redrive, Ereignis-Timeline)
und die Demo-Pässe (Tabelle, Einladung, Einstellungen). Kopfzeile mit Marke,
Versions-Chip, Navigation, Glocke mit Zähler und Benutzermenü sowie Fußzeile
sind überall gleich aufgebaut.

## Die Werkzeugleiste

Die Leiste links (auf schmalen Bildschirmen oben) lässt sich einklappen und
ist vollständig per Tastatur bedienbar.

1. **Zielgruppe und Screen** wählen; „Mobil-Rahmen" zeigt die Seite in
   375 px Breite mit dem echten mobilen Layout.
2. **Preset** wählen. Danach lassen sich einzelne Parameter übersteuern:
   Farbmodus (Hell, Dunkel, System), Akzentfarbe (frei oder aus acht
   Vorschlägen), Neutralton (kühl, neutral, warm), Schrift, Grundgröße
   (14–18 px), Zeilenhöhe, Typo-Skala, Dichte, Eckenradius (0–20 px),
   Schatten, Kartenrahmen, Navigation (Top-Bar, Seitenleiste, Bottom-Nav)
   und deren Markierung.
3. Die **Kontrastprüfung** zeigt live die Kontrastverhältnisse für Text,
   Sekundärtext, Links, Button-Text und Akzent gegen die Seite, jeweils mit
   „AA ✓" oder „AA ✗". So fällt eine Akzentfarbe, die nicht lesbar ist,
   sofort auf.
4. **Parameter kopieren** legt die Einstellung als JSON und als fertigen
   CSS-Block (`:root` hell, Dunkelmodus per `prefers-color-scheme`) in die
   Zwischenablage; der Block lässt sich so in `packages/ui/src/styles.css`
   übernehmen. **Link kopieren** teilt die Variante: alle Abweichungen
   vom Preset stehen im Link hinter dem `#`.

Die Mockups sind klickbar: Navigation, Benutzermenü (Escape schließt),
Reiter im Verbrauch, der Schalter „Einlösen" und die Redrive-Zeile reagieren.
Das Ende der Seite erklärt jedes Token und enthält eine Empfehlung.

## Empfehlung [E]

- **Endkunden: „Vertrauen"**, ergänzt um die Bottom-Nav aus „Warm" auf dem
  Smartphone. „Warm" ist die Alternative, wenn die Marke nahbarer wirken
  soll; „Klar", wenn der grüne Bestandsakzent bleiben soll.
- **Cockpit: „Dicht"**, im Dunkelmodus mit den Werten von „Kontrast".

## Entscheidung des Inhabers

Offen sind vier Fragen, je mit einem Satz zu beantworten:

1. Welches Preset für die Endkunden (oder welcher geteilte Link)?
2. Welches Preset für das Cockpit, und soll es dunkel starten?
3. Bleibt der grüne Akzent `#0b6e4f` als Marke, oder wechselt sie?
4. Mobil: Bottom-Nav oder Menü-Knopf?

Danach überträgt Phase 5 die gewählten Werte in die Tokens, ergänzt die neuen
Tokens aus der Legende und prüft Storybook und die Seiten in beiden Modi.
