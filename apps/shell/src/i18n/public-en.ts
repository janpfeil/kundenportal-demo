import type { PublicTexts } from "./public";

export const publicEn: PublicTexts = {
  home: {
    eyebrow: "Your utility at home",
    title: "Electricity, gas, water, internet and mobile — all in one account",
    lead: "This customer portal is a demo project. It shows how a utility modernises its portal while taking over the customers of an acquired provider.",
    toPortal: "Sign in or go to your account",
    redeem: "Redeem a demo pass",
    notice: "All data is fictional. Please do not enter real personal data.",
    art: "Illustration: a house connected to electricity, gas, water, internet and mobile",
    divisionsTitle: "Divisions",
    divisions: {
      electricity: { name: "Electricity", text: "Green power from 32.4 ct/kWh" },
      gas: { name: "Gas", text: "Climate option with offsetting" },
      water: { name: "Water", text: "Submit meter readings online" },
      internet: { name: "Internet", text: "Fibre up to 1000 Mbit/s" },
      mobile: { name: "Mobile", text: "10, 20 or 40 GB" },
    },
    what: {
      title: "What the demo shows",
      text: "A multi-utility takes over a telecommunications provider. Accounts and contracts are migrated at first sign-in or in a bulk run; a migration cockpit shows progress, cases to review and failures.",
    },
    pass: {
      title: "Your own instance with an invitation",
      text: "An invitation gives you an instance of your own for 48 hours — with its own demo customers and migration cockpit. When it ends, it is deleted completely.",
      more: "More about the demo pass",
    },
    code: {
      title: "Code and reports",
      text: "All code, the infrastructure as code and the architecture reports are public.",
      repo: "Code on GitHub",
      reports: "Reports and Storybook",
    },
  },
  redeem: {
    title: "Redeem your demo pass",
    lead: "This invitation gives you an instance of the customer portal of your own.",
    eyebrow: "Demo pass",
    stepsTitle: "How to redeem your invitation",
    steps: {
      check: "Your browser confirms a short check against abuse — by itself.",
      redeem: "“Redeem demo pass” sets up your instance, usually in under a minute.",
      signIn: "Your sign-in details arrive by e-mail at the invited address; use them to sign in.",
    },
    ring: {
      center: "{hours} h",
      sub: "duration",
      label: "Duration: {hours} hours from your first sign-in",
    },
    privacyTitle: "Privacy",
    noInvitation:
      "To redeem a pass you need an invitation link. Open it exactly as you received it — then you can continue here.",
    about: {
      title: "What you get",
      duration: "Duration",
      durationText: "{hours} hours from your first sign-in",
      instance: "Your own instance",
      instanceText:
        "Your own demo customers, legacy data and migration cockpit. Other visitors cannot see your instance.",
      quota: "Quota",
      quotaText: "{api} API calls, {events} events, {uploads} uploads of at most {size} each",
      loading: "Loading …",
      unavailable: "The current values cannot be loaded right now.",
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
    paused: {
      title: "Redemption is paused right now",
      text: "No new instances are being set up at the moment — all places are taken or redemption has been paused. Your invitation link stays valid; please try again later.",
    },
  },
};
