export const de = {
  brand: "Kundenportal",
  nav: {
    home: "Start",
    account: "Mein Konto",
    mailbox: "Postfach",
    login: "Anmelden",
    logout: "Abmelden",
  },
  language: { label: "Sprache", switchTo: "English" },
  home: {
    title: "Strom, Gas, Wasser, Internet und Mobilfunk — alles in einem Konto",
    lead: "Dieses Kundenportal ist ein Demo-Projekt. Es zeigt, wie ein Versorger sein Portal modernisiert und dabei die Kunden eines übernommenen Anbieters übernimmt.",
    register: "Konto anlegen oder anmelden",
    toAccount: "Zu Ihrem Konto",
    notice: "Alle Daten sind erfunden. Bitte keine echten persönlichen Daten eingeben.",
    architecture:
      "Technik: Next.js in AWS Lambda, Anmeldung per OpenID Connect (Amazon Cognito), REST-API mit Ereignisfluss über EventBridge.",
  },
  account: {
    title: "Mein Konto",
    customerId: "Kundennummer",
    name: "Name",
    email: "E-Mail",
    locale: "Sprache",
    origin: "Herkunft",
    since: "Kunde seit",
    origins: {
      registration: "Registrierung",
      "legacy-utility": "Versorger-Altsystem",
      "legacy-telco": "Telko-Altsystem",
    },
    error:
      "Ihr Konto konnte gerade nicht geladen werden. Bitte versuchen Sie es gleich noch einmal.",
  },
  mailbox: {
    title: "Demo-Postfach",
    empty:
      "Noch keine Nachrichten. Die Willkommensnachricht erscheint wenige Sekunden nach der ersten Anmeldung.",
    unread: "neu",
    refresh: "Aktualisieren",
    error: "Das Postfach konnte gerade nicht geladen werden.",
  },
  footer: "Demo-Projekt · Quellcode auf GitHub",
} as const;
