import type { Dictionary } from "./index";

export const en: Dictionary = {
  brand: "Customer portal",
  nav: {
    home: "Home",
    account: "My account",
    mailbox: "Mailbox",
    login: "Sign in",
    logout: "Sign out",
  },
  language: { label: "Language", switchTo: "Deutsch" },
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
    title: "My account",
    customerId: "Customer number",
    name: "Name",
    email: "E-mail",
    locale: "Language",
    origin: "Origin",
    since: "Customer since",
    origins: {
      registration: "Registration",
      "legacy-utility": "Utility legacy system",
      "legacy-telco": "Telco legacy system",
    },
    error: "Your account could not be loaded right now. Please try again in a moment.",
  },
  mailbox: {
    title: "Demo mailbox",
    empty: "No messages yet. The welcome message appears a few seconds after your first sign-in.",
    unread: "new",
    refresh: "Refresh",
    error: "The mailbox could not be loaded right now.",
  },
  footer: "Demo project · source code on GitHub",
};
