export const de = {
  home: {
    title: "Strom, Gas, Wasser, Internet und Mobilfunk — alles in einem Konto",
    lead: "Dieses Kundenportal ist ein Demo-Projekt. Es zeigt, wie ein Versorger sein Portal modernisiert und dabei die Kunden eines übernommenen Anbieters übernimmt.",
    toPortal: "Anmelden oder zum Konto",
    notice: "Alle Daten sind erfunden. Bitte keine echten persönlichen Daten eingeben.",
    what: {
      title: "Was die Demo zeigt",
      text: "Ein Mehrsparten-Versorger (Strom, Gas, Wasser) übernimmt einen Telekommunikationsanbieter. Kunden beider Altsysteme melden sich im neuen Portal an, ihre Konten und Verträge werden beim ersten Anmelden oder im Bulk-Lauf übernommen, und ein Migrations-Cockpit zeigt Fortschritt, Klärfälle und Fehler.",
    },
    architecture: {
      title: "Architektur",
      text: "Next.js-Multi-Zones in AWS Lambda hinter CloudFront, Anmeldung per OpenID Connect (Amazon Cognito) im BFF-Muster, eine REST-API mit Lambda-Services und ein Ereignisfluss über EventBridge. Jede Demo-Instanz ist ein eigener Mandant mit eigener Tabelle und eigenen Konten.",
    },
    code: {
      title: "Code und Berichte",
      text: "Der gesamte Code, die Infrastruktur als Code und die Architekturberichte sind öffentlich.",
      repo: "Code auf GitHub",
      reports: "Berichte und Storybook",
    },
    pass: {
      title: "Eigene Instanz mit Einladung",
      text: "Wer eine Einladung erhalten hat, bekommt mit dem Link eine eigene Instanz für 7 Tage — mit eigenen Demo-Kunden, eigenen Altsystem-Daten und eigenem Migrations-Cockpit. Nach Ablauf wird sie vollständig gelöscht.",
    },
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
    passHint: "Ihr Demo-Pass: Status, Kontingent und Demo-Personen",
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
  nav: {
    pass: "Demo-Pass",
  },
  redeem: {
    title: "Demo-Pass einlösen",
    lead: "Mit dieser Einladung erhalten Sie eine eigene Instanz des Kundenportals.",
    about: {
      title: "Was Sie bekommen",
      duration: "Laufzeit",
      durationText: "7 Tage ab dem Einlösen",
      instance: "Eigene Instanz",
      instanceText:
        "Eigene Demo-Kunden, eigene Altsystem-Daten und ein eigenes Migrations-Cockpit. Andere Besucher sehen Ihre Instanz nicht.",
      quota: "Kontingent",
      quotaText: "5.000 API-Aufrufe, 1.000 Ereignisse, 20 Uploads",
      data: "Ihre Daten",
      dataText:
        "Alles, was Sie in der Instanz anlegen, wird am Ende der Laufzeit automatisch und vollständig gelöscht. Bitte keine echten persönlichen Daten eingeben.",
    },
    privacy:
      "Datenschutz: Die eingeladene E-Mail-Adresse wird nur für diesen Demo-Pass verwendet — für das Einmal-Passwort und die Anmeldung — und mit der Instanz gelöscht. Es gibt keine weiteren E-Mails und keine Weitergabe an Dritte.",
    check:
      "Kurze Prüfung gegen Missbrauch: Ihr Browser löst ein kleines Rechenrätsel (ALTCHA, ohne Drittanbieter, ohne Cookies).",
    submit: "Demo-Pass einlösen",
    sending: "Wird eingelöst …",
    verifyFirst: "Bitte bestätigen Sie zuerst die Prüfung oben.",
    noToken:
      "Der Einladungslink ist unvollständig. Bitte öffnen Sie den Link genau so, wie Sie ihn erhalten haben — einschließlich des Teils nach dem #.",
    done: {
      title: "Ihre Instanz wird eingerichtet",
      text: "Das dauert in der Regel weniger als eine Minute. Ihre Anmeldedaten erhalten Sie per E-Mail an die eingeladene Adresse: Ihr Benutzername ist diese Adresse, dazu kommt ein vorläufiges Passwort, das Sie bei der ersten Anmeldung ändern.",
      signIn: "Zur Anmeldung",
      hint: "Nach der Anmeldung sehen Sie unter „Demo-Pass“ den Stand der Einrichtung, Ihr Kontingent und die Zugangsdaten der Demo-Personen.",
    },
    errors: {
      invalid:
        "Die Prüfung ist fehlgeschlagen oder abgelaufen. Bitte bestätigen Sie sie erneut und senden Sie noch einmal.",
      unknown: "Diesen Einladungslink kennen wir nicht. Bitte prüfen Sie, ob er vollständig ist.",
      used: "Dieser Einladungslink wurde bereits eingelöst, oder für diese E-Mail-Adresse gibt es schon einen Demo-Pass oder ein Konto.",
      expired: "Dieser Einladungslink ist abgelaufen. Bitten Sie um eine neue Einladung.",
      rateLimited:
        "Zu viele Versuche in kurzer Zeit. Bitte versuchen Sie es in einer Stunde erneut.",
      closed:
        "Im Moment können keine neuen Instanzen eingerichtet werden — alle Plätze sind belegt oder das Einlösen ist vorübergehend gesperrt. Ihr Link bleibt gültig; bitte versuchen Sie es später erneut.",
      failed: "Das Einlösen hat nicht geklappt. Bitte versuchen Sie es gleich noch einmal.",
    },
  },
  pass: {
    title: "Ihr Demo-Pass",
    lead: "Stand Ihrer eigenen Instanz, Kontingent und Zugangsdaten der Demo-Personen.",
    status: "Status",
    statuses: {
      provisioning: "Wird eingerichtet",
      active: "Aktiv",
      "quota-exceeded": "Kontingent erschöpft",
      "tearing-down": "Wird gelöscht",
      deleted: "Gelöscht",
    },
    statusText: {
      provisioning:
        "Ihre Instanz wird eingerichtet. Diese Seite aktualisiert sich von selbst, sobald sie bereit ist.",
      active: "Ihre Instanz ist bereit.",
      "quota-exceeded":
        "Ein Kontingent ist aufgebraucht. Die Instanz nimmt keine weiteren Änderungen an; Sie können sich weiter umsehen.",
      "tearing-down": "Die Laufzeit ist vorbei. Die Instanz wird gerade gelöscht.",
      deleted: "Die Instanz ist gelöscht.",
    },
    tenant: "Mandant",
    validUntil: "Gültig bis",
    daysLeft: "noch {days} Tage",
    hoursLeft: "noch {hours} Std.",
    minutesLeft: "noch {minutes} Min.",
    quotaTitle: "Kontingent",
    quotaLine: "Kontingent: {left} von {limit} übrig · gültig bis {date}",
    quotas: { api: "API-Aufrufe", events: "Domänen-Ereignisse", uploads: "Uploads" },
    left: "{left} von {limit} übrig",
    personsTitle: "Demo-Personen",
    personsIntro:
      "Mit diesen Konten melden Sie sich als Kunde der beiden Altsysteme an und erleben die Übernahme. Alle nutzen dasselbe Demo-Passwort Ihrer Instanz.",
    personName: "Name",
    personLogin: "Anmeldename",
    password: "Demo-Passwort",
    copy: "Kopieren",
    copyPassword: "Demo-Passwort kopieren",
    copied: "Kopiert.",
    copyFailed: "Kopieren nicht möglich — bitte markieren und selbst kopieren.",
    cockpit: "Zum Migrations-Cockpit Ihrer Instanz",
    deletion:
      "Am Ende der Laufzeit wird die Instanz automatisch gelöscht: Konten, Verträge, Uploads und Altsystem-Daten.",
    owner: "Sie sind mit einem Konto des Inhabers angemeldet. Dafür gibt es keinen Demo-Pass.",
    error:
      "Ihr Demo-Pass konnte gerade nicht geladen werden. Bitte versuchen Sie es gleich noch einmal.",
    refresh: "Aktualisieren",
  },
} as const;
