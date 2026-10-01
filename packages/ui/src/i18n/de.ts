export const de = {
  brand: "Kundenportal",
  nav: {
    label: "Hauptnavigation",
    home: "Start",
    account: "Mein Konto",
    mailbox: "Postfach",
    contracts: "Verträge",
    consumption: "Verbrauch",
    cockpit: "Cockpit",
    pass: "Demo-Pass",
    /** Spoken text of a counter at a navigation entry, e.g. "14 offen". */
    openCount: "{count} offen",
    /** Spoken text of a keyboard shortcut hint in the sidebar, e.g. "Tastenkürzel g c". */
    shortcut: "Tastenkürzel {keys}",
  },
  auth: {
    login: "Anmelden",
    logout: "Abmelden",
    /** Accessible name of the user menu button (followed by the user's name). */
    menu: "Benutzermenü",
  },
  language: {
    label: "Sprache",
    /** Visible text of the switch link, written in the target language. */
    switchTo: "English",
  },
  appearance: {
    /** Section of the user menu and name of the menu button for signed-out visitors. */
    label: "Darstellung",
    preset: "Stil",
    colorMode: "Farbmodus",
    modes: { light: "Hell", dark: "Dunkel", system: "System" },
    presets: {
      klar: "Klar",
      vertrauen: "Vertrauen",
      warm: "Warm",
      klassisch: "Klassisch",
      dicht: "Dicht",
      uebersicht: "Übersicht",
      kontrast: "Kontrast",
    },
  },
  /** Marker of simulated values (FakeMarker). */
  fake: {
    label: "Demo-Wert",
    description: "simuliert — noch nicht aus dem System",
  },
  /** Bar chart: legend entries, table toggle, first table column. */
  chart: {
    previousYear: "Vorjahr",
    estimated: "geschätzt",
    showTable: "Als Tabelle anzeigen",
    period: "Monat",
  },
  messages: {
    /** Spoken marker of an unread message in a message list. */
    unread: "ungelesen",
  },
  footer: {
    text: "Demo-Projekt · Quellcode auf GitHub",
    href: "https://github.com/janpfeil/kundenportal-demo",
  },
} as const;
