/** Texts of the prerendered public pages (start page, redeem page); shipped to the browser. */
export const publicDe = {
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
      text: "Wer eine Einladung erhalten hat, bekommt mit dem Link eine eigene Instanz für einige Tage — mit eigenen Demo-Kunden, eigenen Altsystem-Daten und eigenem Migrations-Cockpit. Nach Ablauf wird sie vollständig gelöscht.",
    },
  },
  redeem: {
    title: "Demo-Pass einlösen",
    lead: "Mit dieser Einladung erhalten Sie eine eigene Instanz des Kundenportals.",
    about: {
      title: "Was Sie bekommen",
      duration: "Laufzeit",
      durationText: "{days} Tage ab dem Einlösen",
      instance: "Eigene Instanz",
      instanceText:
        "Eigene Demo-Kunden, eigene Altsystem-Daten und ein eigenes Migrations-Cockpit. Andere Besucher sehen Ihre Instanz nicht.",
      quota: "Kontingent",
      quotaText:
        "{api} API-Aufrufe, {events} Ereignisse, {uploads} Uploads mit je höchstens {size}",
      loading: "Wird geladen …",
      unavailable: "Die aktuellen Werte sind gerade nicht abrufbar.",
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
    paused: {
      title: "Einlösen ist gerade pausiert",
      text: "Im Moment werden keine neuen Instanzen eingerichtet — alle Plätze sind belegt oder das Einlösen ist vorübergehend gesperrt. Ihr Einladungslink bleibt gültig; bitte versuchen Sie es später noch einmal.",
    },
  },
} as const;
