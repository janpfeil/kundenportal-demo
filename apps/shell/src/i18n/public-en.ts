import type { PublicTexts } from "./public";

export const publicEn: PublicTexts = {
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
      text: "If you received an invitation, its link gives you an instance of your own for a few days — with its own demo customers, legacy data and migration cockpit. When it ends, it is deleted completely.",
    },
  },
  redeem: {
    title: "Redeem your demo pass",
    lead: "This invitation gives you an instance of the customer portal of your own.",
    about: {
      title: "What you get",
      duration: "Duration",
      durationText: "{days} days from redemption",
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
