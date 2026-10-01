import type { ContractChangedDetail, ContractChangeField, Locale } from "@kundenportal/events";
import { addCalendarDays, germanDate } from "@kundenportal/service-kit";
import { contractChangedText, DIVISION, date, money, type Text } from "./texts.js";

/** A mailbox text with the kind of entry it deserves (`warning` for the operator's hard steps). */
export type ContractNote = Text & { kind: "info" | "warning" };

/** Days a contract concluded in the portal can be withdrawn (fachkonzept, phase 7). */
export const WITHDRAWAL_DAYS = 14;

type Payload = ContractChangedDetail["payload"];

/** Changes the customer makes to a running contract since phase 4; their text stays as it was. */
const OWN_CHANGES: readonly ContractChangeField[] = ["installment", "tariffOption"];

/** The first change in this order names the entry when one event carries several. */
const PRIORITY: readonly ContractChangeField[] = [
  "withdrawal",
  "termination",
  "terminationCancelled",
  "blocked",
  "unblocked",
  "product",
  "priceVersion",
  "tariffOption",
  "installment",
];

const TITLES: Record<Locale, Record<ContractChangeField, (p: Payload) => string>> = {
  de: {
    withdrawal: () => "Widerruf bestätigt",
    termination: (p) =>
      p.initiatedBy === "operator" ? "Vertrag gekündigt" : "Kündigung bestätigt",
    terminationCancelled: () => "Kündigung zurückgenommen",
    blocked: () => "Vertrag gesperrt",
    unblocked: () => "Vertrag entsperrt",
    product: () => "Produkt gewechselt",
    priceVersion: () => "Neue Preise für Ihren Vertrag",
    tariffOption: () => "Tarifoption geändert",
    installment: () => "Abschlag festgesetzt",
  },
  en: {
    withdrawal: () => "Withdrawal confirmed",
    termination: (p) =>
      p.initiatedBy === "operator" ? "Contract terminated" : "Termination confirmed",
    terminationCancelled: () => "Termination cancelled",
    blocked: () => "Contract blocked",
    unblocked: () => "Contract unblocked",
    product: () => "Product changed",
    priceVersion: () => "New prices for your contract",
    tariffOption: () => "Tariff option changed",
    installment: () => "Installment set",
  },
};

/** One sentence per change, in the customer's language. */
function sentence(locale: Locale, change: ContractChangeField, p: Payload): string | undefined {
  const c = p.contract;
  const de = locale === "de";
  const name = de
    ? `${c.tariffName} (${DIVISION.de[c.division]})`
    : `${c.tariffName} contract (${DIVISION.en[c.division]})`;
  const end = c.termination ? date(locale, c.termination.effectiveDate) : undefined;
  const amount = money(locale, c.monthlyInstallmentCent);
  const byOperator = p.initiatedBy === "operator";
  switch (change) {
    case "withdrawal":
      if (byOperator) {
        return de
          ? `Ihr Vertrag ${name} wurde widerrufen und ist damit aufgehoben.`
          : `Your ${name} has been withdrawn and is cancelled.`;
      }
      return de
        ? `Ihr Widerruf des Vertrags ${name} ist eingegangen. Der Vertrag ist damit aufgehoben.`
        : `We received the withdrawal from your ${name}. The contract is cancelled.`;
    case "termination":
      if (byOperator) {
        return de
          ? `Ihr Vertrag ${name} wurde${end ? ` zum ${end}` : ""} gekündigt.`
          : `Your ${name} has been terminated${end ? ` effective ${end}` : ""}.`;
      }
      return de
        ? `Ihre Kündigung des Vertrags ${name} ist eingegangen.${end ? ` Der Vertrag endet zum ${end}.` : ""} Bis dahin können Sie die Kündigung im Portal zurücknehmen.`
        : `We received your notice for your ${name}.${end ? ` The contract ends on ${end}.` : ""} Until then you can cancel the termination in the portal.`;
    case "terminationCancelled":
      return de
        ? `Die Kündigung Ihres Vertrags ${name} ist zurückgenommen. Der Vertrag läuft weiter.`
        : `The termination of your ${name} has been cancelled. The contract continues.`;
    case "blocked":
      return de
        ? `Ihr Vertrag ${name} wurde gesperrt. Änderungen im Portal sind bis auf Weiteres nicht möglich.`
        : `Your ${name} has been blocked. Changes in the portal are not possible for the time being.`;
    case "unblocked":
      return de
        ? `Ihr Vertrag ${name} ist wieder freigegeben. Sie können ihn im Portal wieder ändern.`
        : `Your ${name} is unblocked. You can change it in the portal again.`;
    case "product": {
      const before = p.previous?.tariffName;
      return de
        ? `Ihr Vertrag (${DIVISION.de[c.division]}) läuft jetzt mit dem Produkt „${c.tariffName}“, Option „${c.tariffOption}“${before ? ` (bisher „${before}“)` : ""}.`
        : `Your ${DIVISION.en[c.division]} contract now runs on the product "${c.tariffName}", option "${c.tariffOption}"${before ? ` (previously "${before}")` : ""}.`;
    }
    case "priceVersion":
      return de
        ? `Ihr Vertrag ${name} wurde auf die aktuellen Preise umgestellt${c.productVersion ? ` (Preisversion ${c.productVersion})` : ""}. Ihr monatlicher Betrag: ${amount}.`
        : `Your ${name} has been moved to the current prices${c.productVersion ? ` (price version ${c.productVersion})` : ""}. Your monthly amount: ${amount}.`;
    case "tariffOption": {
      if (p.changes.includes("product")) return undefined;
      const before = p.previous?.tariffOption;
      return de
        ? `Ihr Vertrag ${name} läuft jetzt mit der Option „${c.tariffOption}“${before ? ` (bisher „${before}“)` : ""}.`
        : `Your ${name} now runs on the option "${c.tariffOption}"${before ? ` (previously "${before}")` : ""}.`;
    }
    case "installment": {
      const before = p.previous ? money(locale, p.previous.monthlyInstallmentCent) : undefined;
      return de
        ? `Der monatliche Betrag Ihres Vertrags ${name} wurde auf ${amount} festgesetzt${before ? ` (bisher ${before})` : ""}.`
        : `The monthly amount of your ${name} has been set to ${amount}${before ? ` (previously ${before})` : ""}.`;
    }
  }
}

/** Order from the catalogue: confirmation with product, start, amount and withdrawal period. */
function concludedText(locale: Locale, detail: ContractChangedDetail): ContractNote {
  const c = detail.payload.contract;
  const until = date(
    locale,
    addCalendarDays(germanDate(new Date(detail.occurredAt)), WITHDRAWAL_DAYS),
  );
  const start = date(locale, c.startDate);
  const amount = money(locale, c.monthlyInstallmentCent);
  return locale === "de"
    ? {
        kind: "info",
        title: "Vertrag abgeschlossen",
        body: `Vielen Dank für Ihre Bestellung: Ihr Vertrag ${c.tariffName}, Option „${c.tariffOption}“ (${DIVISION.de[c.division]}) beginnt am ${start}. Monatlicher Betrag: ${amount}. Sie können den Vertrag bis zum ${until} widerrufen.`,
      }
    : {
        kind: "info",
        title: "Contract concluded",
        body: `Thank you for your order: your ${c.tariffName} contract, option "${c.tariffOption}" (${DIVISION.en[c.division]}), starts on ${start}. Monthly amount: ${amount}. You can withdraw from it until ${until}.`,
      };
}

/**
 * The mailbox entry of a `ContractChanged`, or `undefined` for none:
 * - created by the customer (order from the catalogue) → "Vertrag abgeschlossen"; contracts
 *   the system creates (registration, migration) get no entry besides the welcome
 * - the customer's own installment or option change → "Vertrag geändert", as before
 * - everything else (termination, withdrawal, the operator's controls) → one entry named
 *   after the most important change, a sentence per change and the operator's reason
 */
export function contractText(
  locale: Locale,
  detail: ContractChangedDetail,
): ContractNote | undefined {
  const p = detail.payload;
  if (p.changeType === "created") {
    return p.initiatedBy === "customer" ? concludedText(locale, detail) : undefined;
  }
  const ownChange =
    p.initiatedBy !== "operator" && p.changes.every((change) => OWN_CHANGES.includes(change));
  if (ownChange) {
    return p.changes.length > 0
      ? { kind: "info", ...contractChangedText(locale, detail) }
      : undefined;
  }
  const changes = PRIORITY.filter((change) => p.changes.includes(change));
  const first = changes[0];
  if (!first) return undefined;
  const sentences = changes.flatMap((change) => sentence(locale, change, p) ?? []);
  if (p.reason) sentences.push(locale === "de" ? `Begründung: ${p.reason}` : `Reason: ${p.reason}`);
  const hard = p.initiatedBy === "operator" && (first === "termination" || first === "blocked");
  return {
    kind: hard ? "warning" : "info",
    title: TITLES[locale][first](p),
    body: sentences.join(" "),
  };
}
