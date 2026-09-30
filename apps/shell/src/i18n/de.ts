export const de = {
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
    edit: {
      heading: "Profil ändern",
      name: "Anzeigename",
      locale: "Sprache",
      save: "Speichern",
      saved: "Gespeichert.",
      failed: "Speichern fehlgeschlagen. Bitte erneut versuchen.",
    },
    title: "Mein Konto",
    customerId: "Kundennummer",
    name: "Name",
    email: "E-Mail",
    locale: "Sprache",
    origin: "Herkunft",
    since: "Kunde seit",
    address: "Anschrift",
    legacyAccounts: "Altkonten",
    links: {
      heading: "Weitere Kundenkonten",
      lead: "Wir haben bei unserem übernommenen Anbieter ein Kundenkonto gefunden, das zu Ihnen gehören könnte. Bestätigen Sie es mit dem Passwort dieses Kontos, dann sehen Sie alle Verträge hier.",
      candidate: "Kundenkonto",
      password: "Passwort des anderen Kontos",
      confirm: "Verknüpfen",
      linked: "Verknüpft",
      done: "Die Konten sind verknüpft. Die Verträge erscheinen in wenigen Sekunden.",
      wrongPassword: "Das Passwort passt nicht zu diesem Kundenkonto.",
      failed: "Die Verknüpfung ist fehlgeschlagen. Bitte erneut versuchen.",
      systems: { utility: "Versorger", telco: "Telko" },
    },
    origins: {
      registration: "Registrierung",
      "legacy-utility": "Versorger-Altsystem",
      "legacy-telco": "Telko-Altsystem",
    },
    error:
      "Ihr Konto konnte gerade nicht geladen werden. Bitte versuchen Sie es gleich noch einmal.",
  },
  mailbox: {
    markRead: "Als gelesen markieren",
    title: "Demo-Postfach",
    empty:
      "Noch keine Nachrichten. Die Willkommensnachricht erscheint wenige Sekunden nach der ersten Anmeldung.",
    unread: "neu",
    refresh: "Aktualisieren",
    error: "Das Postfach konnte gerade nicht geladen werden.",
  },
} as const;
