import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonLink, CheckboxField, Facts, OptionCards, TextareaField } from "../index.js";
import { Icon } from "./icon.js";

describe("Button variants and sizes", () => {
  it("maps variant, size and icon to the library's classes", () => {
    render(
      <>
        <Button>Speichern</Button>
        <Button variant="ghost" size="small">
          Korrigieren
        </Button>
        <Button variant="danger">Kündigen</Button>
        <Button variant="danger-solid" size="small" className="extra">
          Ja, kündigen
        </Button>
      </>,
    );
    const primary = screen.getByRole("button", { name: "Speichern" });
    expect(primary).toHaveClass("kp-button");
    expect(primary).not.toHaveClass("kp-button-secondary", "kp-button-small", "kp-button-icon");
    expect(screen.getByRole("button", { name: "Korrigieren" })).toHaveClass(
      "kp-button",
      "kp-button-ghost",
      "kp-button-small",
    );
    expect(screen.getByRole("button", { name: "Kündigen" })).toHaveClass(
      "kp-button",
      "kp-button-danger",
    );
    expect(screen.getByRole("button", { name: "Ja, kündigen" })).toHaveClass(
      "kp-button-danger-solid",
      "kp-button-small",
      "extra",
    );
  });

  it("names an icon-only button by its aria-label", () => {
    render(
      <Button variant="danger" size="small" icon aria-label="Pass von erika@example.org widerrufen">
        <Icon name="x" />
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Pass von erika@example.org widerrufen" });
    expect(button).toHaveClass("kp-button-icon", "kp-button-small", "kp-button-danger");
    expect(button).toHaveAttribute("type", "button");
  });

  it("requires an aria-label for icon-only buttons at compile time", () => {
    // @ts-expect-error -- an icon-only button without aria-label has no accessible name
    const nameless = <Button icon>×</Button>;
    // @ts-expect-error -- the same holds for icon-only links
    const namelessLink = <ButtonLink href="/neu" icon />;
    expect(nameless.props).not.toHaveProperty("aria-label");
    expect(namelessLink.props).not.toHaveProperty("aria-label");
  });

  it("styles button links the same way", () => {
    render(
      <ButtonLink href="/weiter" variant="secondary" size="small">
        Weitere laden
      </ButtonLink>,
    );
    expect(screen.getByRole("link", { name: "Weitere laden" })).toHaveClass(
      "kp-button",
      "kp-button-secondary",
      "kp-button-small",
    );
  });
});

describe("TextareaField", () => {
  it("names the textarea by its label and links hint and error", () => {
    render(
      <TextareaField
        label="Begründung"
        hint="Steht im Verlauf"
        error="Bitte mindestens 3 Zeichen."
        name="reason"
      />,
    );
    const textarea = screen.getByRole("textbox", { name: "Begründung" });
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveClass("kp-input", "kp-textarea");
    expect(textarea).toHaveAttribute("rows", "3");
    expect(textarea).toHaveAccessibleDescription("Steht im Verlauf Bitte mindestens 3 Zeichen.");
    expect(textarea).toHaveAttribute("aria-invalid", "true");
  });

  it("is valid and undescribed without hint and error, and keeps an own description", () => {
    const { rerender } = render(<TextareaField label="Beschreibung" id="beschreibung" />);
    const textarea = screen.getByRole("textbox", { name: "Beschreibung" });
    expect(textarea).toHaveAttribute("id", "beschreibung");
    expect(textarea).not.toHaveAttribute("aria-invalid");
    expect(textarea).not.toHaveAttribute("aria-describedby");
    rerender(
      <>
        <p id="extra">Höchstens 400 Zeichen</p>
        <TextareaField
          label="Beschreibung"
          id="beschreibung"
          aria-describedby="extra"
          hint="Kurz"
        />
      </>,
    );
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription("Höchstens 400 Zeichen Kurz");
  });
});

describe("CheckboxField", () => {
  it("names the checkbox by the label after the box and toggles it", () => {
    const onChange = vi.fn();
    render(<CheckboxField label="Ich bestelle kostenpflichtig" onChange={onChange} required />);
    const box = screen.getByRole("checkbox", { name: "Ich bestelle kostenpflichtig" });
    expect(box).toBeRequired();
    expect(box).not.toHaveAttribute("aria-invalid");
    expect(box).not.toHaveAttribute("aria-describedby");
    fireEvent.click(screen.getByText("Ich bestelle kostenpflichtig"));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("links hint and error and marks the checkbox invalid", () => {
    render(
      <CheckboxField
        id="consent"
        label="Ich stimme zu"
        hint="Sie erhalten eine Bestätigung per E-Mail."
        error="Bitte bestätigen Sie die Bestellung."
      />,
    );
    const box = screen.getByRole("checkbox", { name: "Ich stimme zu" });
    expect(box).toHaveAttribute("id", "consent");
    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(box).toHaveAccessibleDescription(
      "Sie erhalten eine Bestätigung per E-Mail. Bitte bestätigen Sie die Bestellung.",
    );
    expect(screen.getByText("Bitte bestätigen Sie die Bestellung.")).toHaveAttribute(
      "id",
      "consent-error",
    );
  });
});

describe("OptionCards", () => {
  const options = [
    { value: "basis", label: "Basis", price: "12,00 € Grundpreis / Monat" },
    {
      value: "plus",
      label: "Plus",
      price: "15,00 € Grundpreis / Monat",
      description: ["Arbeitspreis 30 ct/kWh", "Ökostrom"],
    },
    { value: "alt", label: "Alt", description: "nicht mehr wählbar", disabled: true },
  ];

  function Controlled({ error }: { error?: string }) {
    const [value, setValue] = useState("basis");
    return (
      <OptionCards
        id="option"
        legend="Option"
        name="tariff"
        options={options}
        value={value}
        onChange={setValue}
        error={error}
      />
    );
  }

  it("is a named radio group of native radios with one name", () => {
    render(<Controlled />);
    const group = screen.getByRole("group", { name: "Option" });
    expect(group.tagName).toBe("FIELDSET");
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    // One name groups the radios, so the browser moves the choice with the arrow keys.
    expect(radios.map((radio) => radio.getAttribute("name"))).toEqual([
      "tariff",
      "tariff",
      "tariff",
    ]);
    expect(within(group).getByRole("radio", { name: /^Basis/ })).toBeChecked();
    expect(within(group).getByRole("radio", { name: /Alt/ })).toBeDisabled();
    expect(group).not.toHaveAttribute("aria-describedby");
  });

  it("names each radio by the card's text and follows the choice", () => {
    render(<Controlled />);
    const plus = screen.getByRole("radio", {
      name: /Plus.*15,00 €.*Arbeitspreis 30 ct\/kWh.*Ökostrom/,
    });
    expect(plus).toHaveAttribute("value", "plus");
    fireEvent.click(plus);
    expect(plus).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Basis/ })).not.toBeChecked();
  });

  it("links the error to the group", () => {
    render(<Controlled error="Bitte wählen Sie eine Option." />);
    const group = screen.getByRole("group", { name: "Option" });
    expect(group).toHaveAccessibleDescription("Bitte wählen Sie eine Option.");
    expect(screen.getByText("Bitte wählen Sie eine Option.")).toHaveAttribute("id", "option-error");
  });

  it("checks nothing when the value matches no option", () => {
    render(
      <OptionCards legend="Option" name="none" options={options} value="" onChange={() => {}} />,
    );
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
  });
});

describe("Facts plain", () => {
  it("adds the plain class only on request", () => {
    render(
      <>
        <Facts data-testid="framed" items={[{ term: "Kundennummer", description: "K-1" }]} />
        <Facts plain data-testid="plain" items={[{ term: "Laufzeit", description: "12 Monate" }]} />
      </>,
    );
    expect(screen.getByTestId("framed")).toHaveClass("kp-facts");
    expect(screen.getByTestId("framed")).not.toHaveClass("kp-facts-plain");
    expect(screen.getByTestId("plain")).toHaveClass("kp-facts", "kp-facts-plain");
    expect(within(screen.getByTestId("plain")).getByRole("term")).toHaveTextContent("Laufzeit");
  });
});
