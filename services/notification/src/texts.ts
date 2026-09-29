import type { Locale } from "@kundenportal/events";

/** Mailbox texts per UI language; the mailbox stores them in the customer's language. */
export const welcomeText: Record<Locale, (name: string) => { title: string; body: string }> = {
  de: (name) => ({
    title: "Willkommen im Kundenportal",
    body: `Hallo ${name}, Ihr Konto ist eingerichtet. Hier im Demo-Postfach erscheinen künftig alle Nachrichten des Portals.`,
  }),
  en: (name) => ({
    title: "Welcome to the customer portal",
    body: `Hello ${name}, your account is ready. All messages from the portal will appear here in the demo mailbox.`,
  }),
};
