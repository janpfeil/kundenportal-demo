import type {
  ContractChangedDetail,
  DataVolumeThresholdReachedDetail,
  Division,
  DocumentUploadedDetail,
  InstallmentAdjustedDetail,
  Locale,
  MeterReadingSubmittedDetail,
  MeterUnit,
} from "@kundenportal/events";

type Text = { title: string; body: string };

/** Mailbox texts per UI language; the mailbox stores them in the customer's language. */
export const welcomeText: Record<Locale, (name: string) => Text> = {
  de: (name) => ({
    title: "Willkommen im Kundenportal",
    body: `Hallo ${name}, Ihr Konto ist eingerichtet. Hier im Demo-Postfach erscheinen künftig alle Nachrichten des Portals.`,
  }),
  en: (name) => ({
    title: "Welcome to the customer portal",
    body: `Hello ${name}, your account is ready. All messages from the portal will appear here in the demo mailbox.`,
  }),
};

const TAG: Record<Locale, string> = { de: "de-DE", en: "en-GB" };

const DIVISION: Record<Locale, Record<Division, string>> = {
  de: {
    electricity: "Strom",
    gas: "Gas",
    water: "Wasser",
    internet: "Internet",
    mobile: "Mobilfunk",
  },
  en: {
    electricity: "electricity",
    gas: "gas",
    water: "water",
    internet: "internet",
    mobile: "mobile",
  },
};

const UNIT: Record<MeterUnit, string> = { kWh: "kWh", m3: "m³" };

const money = (locale: Locale, cents: number) =>
  new Intl.NumberFormat(TAG[locale], { style: "currency", currency: "EUR" }).format(cents / 100);
const number = (locale: Locale, value: number, digits = 3) =>
  new Intl.NumberFormat(TAG[locale], { maximumFractionDigits: digits }).format(value);
const date = (locale: Locale, isoDate: string) =>
  new Intl.DateTimeFormat(TAG[locale], { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`),
  );
const month = (locale: Locale, yearMonth: string) =>
  new Intl.DateTimeFormat(TAG[locale], { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${yearMonth}-01T00:00:00.000Z`),
  );
const gigabytes = (locale: Locale, mb: number) => number(locale, mb / 1024, 1);

export function meterReadingText(
  locale: Locale,
  { payload: p }: MeterReadingSubmittedDetail,
): Text {
  const value = `${number(locale, p.value)} ${UNIT[p.unit]}`;
  return locale === "de"
    ? {
        title: "Zählerstand bestätigt",
        body: `Ihr Zählerstand ${value} vom ${date(locale, p.readAt)} für ${DIVISION.de[p.division]} (Zähler ${p.meterNumber}) ist eingegangen.`,
      }
    : {
        title: "Meter reading confirmed",
        body: `We received your ${DIVISION.en[p.division]} meter reading of ${value} from ${date(locale, p.readAt)} (meter ${p.meterNumber}).`,
      };
}

export function installmentText(locale: Locale, { payload: p }: InstallmentAdjustedDetail): Text {
  const consumption = `${number(locale, p.estimatedAnnualConsumption, 0)} ${UNIT[p.unit]}`;
  const from = money(locale, p.previousInstallmentCent);
  const to = money(locale, p.newInstallmentCent);
  return locale === "de"
    ? {
        title: "Abschlag angepasst",
        body: `Nach Ihrem Zählerstand schätzen wir Ihren Jahresverbrauch ${DIVISION.de[p.division]} auf ${consumption}. Ihr monatlicher Abschlag ändert sich von ${from} auf ${to}.`,
      }
    : {
        title: "Installment adjusted",
        body: `Based on your meter reading we estimate your annual ${DIVISION.en[p.division]} consumption at ${consumption}. Your monthly installment changes from ${from} to ${to}.`,
      };
}

export function contractChangedText(locale: Locale, { payload: p }: ContractChangedDetail): Text {
  const contract = p.contract;
  const parts = p.changes.map((change) =>
    change === "installment"
      ? locale === "de"
        ? `monatlicher Betrag jetzt ${money(locale, contract.monthlyInstallmentCent)}`
        : `monthly amount now ${money(locale, contract.monthlyInstallmentCent)}`
      : locale === "de"
        ? `Tarifoption jetzt „${contract.tariffOption}“`
        : `tariff option now "${contract.tariffOption}"`,
  );
  return locale === "de"
    ? {
        title: "Vertrag geändert",
        body: `Ihr Vertrag ${contract.tariffName} (${DIVISION.de[contract.division]}) wurde geändert: ${parts.join(", ")}.`,
      }
    : {
        title: "Contract changed",
        body: `Your ${contract.tariffName} contract (${DIVISION.en[contract.division]}) was changed: ${parts.join(", ")}.`,
      };
}

export function dataVolumeText(
  locale: Locale,
  { payload: p }: DataVolumeThresholdReachedDetail,
): Text {
  const used = gigabytes(locale, p.usedMb);
  const included = gigabytes(locale, p.includedMb);
  return locale === "de"
    ? {
        title: `Datenvolumen zu ${p.thresholdPercent} % verbraucht`,
        body: `Im ${month(locale, p.month)} haben Sie ${used} von ${included} GB Ihres Mobilfunkvertrags verbraucht.`,
      }
    : {
        title: `${p.thresholdPercent} % of your data volume used`,
        body: `In ${month(locale, p.month)} you have used ${used} of ${included} GB of your mobile contract.`,
      };
}

export function documentText(locale: Locale, { payload: p }: DocumentUploadedDetail): Text {
  return locale === "de"
    ? {
        title: "Dokument hochgeladen",
        body: `Ihre Datei „${p.fileName}“ ist eingegangen und wird sieben Tage aufbewahrt.`,
      }
    : {
        title: "Document uploaded",
        body: `We received your file "${p.fileName}"; it is kept for seven days.`,
      };
}
