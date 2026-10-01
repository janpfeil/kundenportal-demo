# Design und Theme (Phase 5)

Stand: 2026-10-01 · entschieden und umgesetzt · Kennzeichnung: **[E]** Einschätzung, **[B]** belegt.

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

> „Endkunde Klar, Cockpit Dicht als Default, aber über das Usermenü möchte
> ich zwischen den Themes umschalten können.“ (01.10.2026)

- **Endkunden:** Standard „Klar“ (grüner Bestandsakzent `#0b6e4f` bleibt);
  wählbar „Vertrauen“, „Warm“, „Klassisch“.
- **Cockpit:** Standard „Dicht“ mit Seitenleiste; wählbar „Übersicht“,
  „Kontrast“.
- **Farbmodus:** Standard „System“ (folgt dem Betriebssystem), wählbar
  „Hell“ und „Dunkel“.
- **Umschalten:** im Benutzermenü, Abschnitt „Darstellung“. Abgemeldete
  Besucher finden dieselbe Auswahl als kleines Menü „Darstellung“ neben dem
  Sprachlink; sie sollen Farbmodus und Lesbarkeit nicht erst nach der
  Anmeldung einstellen können.
- **Mobil:** Bottom-Nav nur in „Warm“ (wie im Mockup), sonst scrollbare
  Navigationszeile unter der Kopfzeile.

## Wie die Themes gebaut sind

| Teil | Ort | Aufgabe |
|---|---|---|
| Presets und Tokens | `packages/ui/src/themes.ts` | einzige Quelle: die Parameter aller sieben Presets aus dem Mockup und die Rechnung daraus (`themeTokens`), dieselben Formeln wie im Mockup |
| Stylesheet | `scripts/build-css.mjs` → `dist/styles.css` | der UI-Build schreibt `themesCss()` vor die handgeschriebenen Stile (`src/styles.css`, `src/layout.css`); Storybook holt die Tokens direkt aus `themes.ts` |
| Auswahl | `packages/ui/src/theme-runtime.ts` | Attribute an `<html>` (`data-audience`, `data-theme-preset`, `data-color-mode`, abgeleitet `data-nav`, `data-nav-marker`), Cookies `kp_theme_kunde`, `kp_theme_cockpit`, `kp_color_mode`, Prüfung der Werte, `applyTheme` für den Umschalter |
| Init-Skript | `/theme-init.js` (Shell) | setzt auf vorgerenderten Seiten die Attribute aus den Cookies vor dem ersten Zeichnen |
| Umschalter | `AppearanceItems` im `UserMenu`, `AppearanceMenu` für Abgemeldete | `menuitemradio` mit `aria-checked`; Wahl wirkt sofort und gilt in allen Zonen |

Wie die Attribute in Shell und Zonen gesetzt werden, welche Seiten das
Init-Skript laden und wie es ausgeliefert wird, steht in
[Architektur: Zonen und Frontend](architektur-zonen.md) §12.

**Neue Tokens** (zusätzlich zu den bisherigen Farben): `--kp-surface-2`,
`--kp-border-strong`, `--kp-accent-text` (Links, aktive Einträge),
`--kp-accent-soft`, `--kp-focus`, `--kp-track`, `--kp-badge`,
`--kp-row-hover`, `--kp-input-bg`, `--kp-header-bg`, `--kp-side-bg`,
`--kp-*-text` je Status; Schrift (`--kp-font`, `--kp-font-heading`,
`--kp-heading-weight`, `--kp-heading-tracking`), Größen (`--kp-font-size`,
`--kp-line-height`, `--kp-small`, `--kp-h1` bis `--kp-h3`), Dichte
(`--kp-space`, `--kp-control`, `--kp-cell-y`), Form (`--kp-radius`,
`--kp-radius-large`, `--kp-btn-radius`, `--kp-shadow`,
`--kp-shadow-raised`, `--kp-card-border`) und `--kp-content-width`. Das
alte Attribut `data-theme="light|dark"` entfällt; an seine Stelle tritt
`data-color-mode`.

**Abweichung vom Mockup:** Das Mockup passte die Link-Farbe nur gegen die
Fläche an; der aktive Navigationseintrag auf der getönten Akzentfläche kam im
Dunkelmodus nur auf rund 3,6:1. `--kp-accent-text` wird jetzt gegen
`--kp-accent-soft` (den schwierigsten Hintergrund) auf 4,5:1 gebracht.

## Kontrastprüfung

`packages/ui/src/themes.test.ts` rechnet für jedes Preset hell und dunkel
die Kontrastverhältnisse aus den Token-Werten (WCAG 2.x, relative Luminanz)
und verlangt mindestens 4,5:1 für Text / Fläche und Seite, Sekundärtext,
Links, aktiven Navigationseintrag, Button-Text auf Akzent, Text im
Eingabefeld, Statustexte und Text auf Statusflächen sowie 3:1 für Fokusring,
Akzent und Feldrahmen. **[B]** 14 Kombinationen aus Preset und Modus mit je 25 Paaren, alle bestanden. Weitere
Tests prüfen Cookies, Init-Skript, Umschalter und dass Kundenseiten
Bedienelemente von mindestens 44 px haben.

**[E]** „Kontrast“ ist im Mockup „dunkel zuerst“; hier folgt auch dieses
Preset dem gewählten Farbmodus (Standard System), damit der Modus überall
dieselbe Bedeutung hat.
