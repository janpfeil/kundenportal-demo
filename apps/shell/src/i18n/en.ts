import type { Dictionary } from "./index";

export const en: Dictionary = {
  home: {
    title: "Electricity, gas, water, internet and mobile — all in one account",
    lead: "This customer portal is a demo project. It shows how a utility modernises its portal while taking over the customers of an acquired provider.",
    register: "Create an account or sign in",
    toAccount: "Go to your account",
    notice: "All data is fictional. Please do not enter real personal data.",
    architecture:
      "Built with Next.js in AWS Lambda, sign-in via OpenID Connect (Amazon Cognito), a REST API and an event flow through EventBridge.",
  },
  account: {
    edit: {
      heading: "Edit profile",
      name: "Display name",
      locale: "Language",
      save: "Save",
      saved: "Saved.",
      failed: "Saving failed. Please try again.",
    },
    title: "My account",
    customerId: "Customer number",
    name: "Name",
    email: "E-mail",
    locale: "Language",
    origin: "Origin",
    since: "Customer since",
    address: "Address",
    legacyAccounts: "Legacy accounts",
    links: {
      heading: "More customer accounts",
      lead: "We found a customer account with the provider we took over that may belong to you. Confirm it with that account's password to see all contracts here.",
      candidate: "Customer account",
      password: "Password of the other account",
      confirm: "Link",
      linked: "Linked",
      done: "The accounts are linked. The contracts appear in a few seconds.",
      wrongPassword: "The password does not match this customer account.",
      failed: "Linking failed. Please try again.",
      systems: { utility: "Utility", telco: "Telco" },
    },
    origins: {
      registration: "Registration",
      "legacy-utility": "Utility legacy system",
      "legacy-telco": "Telco legacy system",
    },
    error: "Your account could not be loaded right now. Please try again in a moment.",
  },
  mailbox: {
    markRead: "Mark as read",
    title: "Demo mailbox",
    empty: "No messages yet. The welcome message appears a few seconds after your first sign-in.",
    unread: "new",
    refresh: "Refresh",
    error: "The mailbox could not be loaded right now.",
  },
};
