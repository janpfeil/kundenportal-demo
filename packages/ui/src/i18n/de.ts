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
  footer: {
    text: "Demo-Projekt · Quellcode auf GitHub",
    href: "https://github.com/janpfeil/kundenportal-demo",
  },
} as const;
