/** Texts of the prerendered public pages (start page, redeem page); shipped to the browser. */
export const publicDe = {
  home: {
    eyebrow: "Ihr Versorger für zu Hause",
    title: "Strom, Gas, Wasser, Internet und Mobilfunk — alles in einem Konto",
    lead: "Dieses Kundenportal ist ein Demo-Projekt. Es zeigt, wie ein Versorger sein Portal modernisiert und dabei die Kunden eines übernommenen Anbieters übernimmt.",
    toPortal: "Anmelden oder zum Konto",
    redeem: "Demo-Pass einlösen",
    notice: "Alle Daten sind erfunden. Bitte keine echten persönlichen Daten eingeben.",
    art: "Illustration: ein Haus, verbunden mit Strom, Gas, Wasser, Internet und Mobilfunk",
    divisionsTitle: "Sparten",
    divisions: {
      electricity: { name: "Strom", text: "Ökostrom ab 32,4 ct/kWh" },
      gas: { name: "Gas", text: "Klima-Option mit Ausgleich" },
      water: { name: "Wasser", text: "Zählerstand online melden" },
      internet: { name: "Internet", text: "Glasfaser bis 1000 Mbit/s" },
      mobile: { name: "Mobilfunk", text: "10, 20 oder 40 GB" },
    },
    what: {
      title: "Was die Demo zeigt",
      text: "Ein Mehrsparten-Versorger übernimmt einen Telekommunikationsanbieter. Konten und Verträge werden beim ersten Anmelden oder im Bulk-Lauf übernommen; ein Migrations-Cockpit zeigt Fortschritt, Klärfälle und Fehler.",
    },
    pass: {
      title: "Eigene Instanz mit Einladung",
      text: "Mit einer Einladung bekommen Sie eine eigene Instanz für 48 Stunden — mit eigenen Demo-Kunden und eigenem Migrations-Cockpit. Nach Ablauf wird sie vollständig gelöscht.",
      more: "Mehr zum Demo-Pass",
    },
    code: {
      title: "Code und Berichte",
      text: "Der gesamte Code, die Infrastruktur als Code und die Architekturberichte sind öffentlich.",
      repo: "Code auf GitHub",
      reports: "Berichte und Storybook",
    },
  },
  redeem: {
    title: "Demo-Pass einlösen",
    lead: "Mit dieser Einladung erhalten Sie eine eigene Instanz des Kundenportals.",
    eyebrow: "Demo-Pass",
    stepsTitle: "So lösen Sie Ihre Einladung ein",
    steps: {
      check: "Ihr Browser bestätigt eine kurze Prüfung gegen Missbrauch — von selbst.",
      redeem:
        "Mit „Demo-Pass einlösen“ wird Ihre Instanz eingerichtet, meist in unter einer Minute.",
      signIn:
        "Die Zugangsdaten kommen per E-Mail an die eingeladene Adresse; damit melden Sie sich an.",
    },
    ring: {
      center: "{hours} Std.",
      sub: "Laufzeit",
      label: "Laufzeit: {hours} Stunden ab der ersten Anmeldung",
    },
    privacyTitle: "Datenschutz",
    noInvitation:
      "Zum Einlösen brauchen Sie einen Einladungslink. Öffnen Sie ihn genau so, wie Sie ihn erhalten haben — dann geht es hier weiter.",
    about: {
      title: "Was Sie bekommen",
      duration: "Laufzeit",
      durationText: "{hours} Stunden ab der ersten Anmeldung",
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
