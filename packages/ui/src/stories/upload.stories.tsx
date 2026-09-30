import type { Meta, StoryObj } from "@storybook/react-vite";
import { UploadForm, type UploadTexts } from "../components/upload-form.js";
import { isLocale, type Locale } from "../i18n/index.js";

/** Example texts as the contracts zone words them (zone texts live in the zones). */
const texts: Record<Locale, UploadTexts & { other: string; meterPhoto: string; photo: string }> = {
  de: {
    file: "Datei",
    hint: "PDF, JPEG oder PNG, höchstens 5 MB",
    category: "Art des Dokuments",
    submit: "Hochladen",
    busy: "Wird hochgeladen …",
    success: "„{name}“ wurde hochgeladen. Die Prüfung dauert einen Moment.",
    errorMissing: "Bitte wählen Sie eine Datei aus.",
    errorType: "Bitte wählen Sie eine PDF-, JPEG- oder PNG-Datei.",
    errorSize: "Die Datei ist zu groß (höchstens 5 MB).",
    errorEmpty: "Die Datei ist leer.",
    errorSetup:
      "Ihr Konto wird noch eingerichtet. Bitte versuchen Sie es in einer Minute noch einmal.",
    errorSession: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
    errorGeneric: "Die Datei konnte nicht hochgeladen werden. Bitte versuchen Sie es noch einmal.",
    login: "Erneut anmelden",
    other: "Sonstiges",
    meterPhoto: "Zählerfoto",
    photo: "Foto des Zählers",
  },
  en: {
    file: "File",
    hint: "PDF, JPEG or PNG, at most 5 MB",
    category: "Type of document",
    submit: "Upload",
    busy: "Uploading …",
    success: "“{name}” has been uploaded. The check takes a moment.",
    errorMissing: "Please choose a file.",
    errorType: "Please choose a PDF, JPEG or PNG file.",
    errorSize: "The file is too large (at most 5 MB).",
    errorEmpty: "The file is empty.",
    errorSetup: "Your account is still being set up. Please try again in a minute.",
    errorSession: "Your session has expired. Please sign in again.",
    errorGeneric: "The file could not be uploaded. Please try again.",
    login: "Sign in again",
    other: "Other",
    meterPhoto: "Meter photo",
    photo: "Photo of the meter",
  },
};

interface Args {
  /** Status the simulated announcement answers with (no request leaves Storybook). */
  answer: 401 | 409 | 500;
  meterPhoto: boolean;
}

const meta: Meta<Args> = {
  title: "Forms/UploadForm",
  args: { answer: 409, meterPhoto: false },
  argTypes: { answer: { control: "select", options: [401, 409, 500] } },
  render: ({ answer, meterPhoto }, { globals }) => {
    const t = texts[isLocale(globals["locale"]) ? globals["locale"] : "de"];
    return (
      <UploadForm
        texts={t}
        endpoint="#upload"
        loginHref="#login"
        categories={
          meterPhoto
            ? [{ value: "meter-photo", label: t.meterPhoto }]
            : [
                { value: "other", label: t.other },
                { value: "meter-photo", label: t.meterPhoto },
              ]
        }
        {...(meterPhoto ? { accept: ["image/jpeg", "image/png"], fileLabel: t.photo } : {})}
        announce={async () => ({ ok: false, status: answer })}
      />
    );
  },
};

export default meta;
type Story = StoryObj<Args>;

/** Choose a file and submit: the simulated service answers "account is being set up". */
export const Documents: Story = {};
/** A single category hides the choice; the picker accepts images only. */
export const MeterPhoto: Story = { args: { meterPhoto: true } };
/** Expired session: the error offers a sign-in link. */
export const SessionExpired: Story = { args: { answer: 401 } };
export const English: Story = { globals: { locale: "en" } };
