import type { Dictionary } from "./index";

export const en: Dictionary = {
  home: {
    title: "Electricity, gas, water, internet and mobile — all in one account",
    lead: "This customer portal is a demo project. It shows how a utility modernises its portal while taking over the customers of an acquired provider.",
    toPortal: "Sign in or go to your account",
    notice: "All data is fictional. Please do not enter real personal data.",
    what: {
      title: "What the demo shows",
      text: "A multi-utility (electricity, gas, water) takes over a telecommunications provider. Customers of both legacy systems sign in to the new portal; their accounts and contracts are migrated at first sign-in or in a bulk run, and a migration cockpit shows progress, cases to review and failures.",
    },
    architecture: {
      title: "Architecture",
      text: "Next.js multi-zones in AWS Lambda behind CloudFront, sign-in via OpenID Connect (Amazon Cognito) in the BFF pattern, a REST API with Lambda services and an event flow through EventBridge. Every demo instance is a tenant of its own with its own table and accounts.",
    },
    code: {
      title: "Code and reports",
      text: "All code, the infrastructure as code and the architecture reports are public.",
      repo: "Code on GitHub",
      reports: "Reports and Storybook",
    },
    pass: {
      title: "Your own instance with an invitation",
      text: "If you received an invitation, its link gives you an instance of your own for 7 days — with its own demo customers, legacy data and migration cockpit. When it ends, it is deleted completely.",
    },
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
    passHint: "Your demo pass: status, quota and demo persons",
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
  nav: {
    pass: "Demo pass",
  },
  redeem: {
    title: "Redeem your demo pass",
    lead: "This invitation gives you an instance of the customer portal of your own.",
    about: {
      title: "What you get",
      duration: "Duration",
      durationText: "7 days from redemption",
      instance: "Your own instance",
      instanceText:
        "Your own demo customers, legacy data and migration cockpit. Other visitors cannot see your instance.",
      quota: "Quota",
      quotaText: "5,000 API calls, 1,000 events, 20 uploads",
      data: "Your data",
      dataText:
        "Everything you create in the instance is deleted automatically and completely when it ends. Please do not enter real personal data.",
    },
    privacy:
      "Privacy: the invited e-mail address is used only for this demo pass — for the one-time password and sign-in — and is deleted with the instance. There are no further e-mails and nothing is passed on to third parties.",
    check:
      "A short check against abuse: your browser solves a small puzzle (ALTCHA, no third party, no cookies).",
    submit: "Redeem demo pass",
    sending: "Redeeming …",
    verifyFirst: "Please complete the check above first.",
    noToken:
      "The invitation link is incomplete. Please open the link exactly as you received it — including the part after the #.",
    done: {
      title: "Your instance is being set up",
      text: "This usually takes less than a minute. Your sign-in details arrive by e-mail at the invited address: your user name is that address, together with a temporary password that you change at your first sign-in.",
      signIn: "Go to sign-in",
      hint: "After signing in, “Demo pass” shows the setup status, your quota and the sign-in details of the demo persons.",
    },
    errors: {
      invalid: "The check failed or expired. Please complete it again and resubmit.",
      unknown: "We do not know this invitation link. Please check that it is complete.",
      used: "This invitation link has already been redeemed, or this e-mail address already has a demo pass or an account.",
      expired: "This invitation link has expired. Please ask for a new invitation.",
      rateLimited: "Too many attempts in a short time. Please try again in an hour.",
      closed:
        "No new instances can be set up right now — all places are taken or redemption is paused. Your link stays valid; please try again later.",
      failed: "Redemption did not work. Please try again in a moment.",
    },
  },
  pass: {
    title: "Your demo pass",
    lead: "Status of your own instance, your quota and the sign-in details of the demo persons.",
    status: "Status",
    statuses: {
      provisioning: "Being set up",
      active: "Active",
      "quota-exceeded": "Quota used up",
      expired: "Expired",
      deleted: "Deleted",
    },
    statusText: {
      provisioning:
        "Your instance is being set up. This page refreshes by itself as soon as it is ready.",
      active: "Your instance is ready.",
      "quota-exceeded":
        "A quota is used up. The instance accepts no further changes; you can still look around.",
      expired: "The pass has ended. The instance is being deleted.",
      deleted: "The instance has been deleted.",
    },
    tenant: "Tenant",
    validUntil: "Valid until",
    daysLeft: "{days} days left",
    quotaTitle: "Quota",
    quotaLine: "Quota: {left} of {limit} left · valid until {date}",
    quotas: { api: "API calls", events: "Domain events", uploads: "Uploads" },
    left: "{left} of {limit} left",
    personsTitle: "Demo persons",
    personsIntro:
      "Sign in with these accounts as a customer of the two legacy systems and experience the migration. All use your instance's demo password.",
    personName: "Name",
    personLogin: "User name",
    password: "Demo password",
    copy: "Copy",
    copyPassword: "Copy demo password",
    copied: "Copied.",
    copyFailed: "Copying is not possible — please select and copy it yourself.",
    cockpit: "Open your instance's migration cockpit",
    deletion:
      "When the pass ends, the instance is deleted automatically: accounts, contracts, uploads and legacy data.",
    owner: "You are signed in with an owner account. It has no demo pass.",
    error: "Your demo pass could not be loaded right now. Please try again in a moment.",
    refresh: "Refresh",
  },
};
