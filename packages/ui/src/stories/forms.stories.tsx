import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button, ButtonLink } from "../components/button.js";
import {
  CheckboxField,
  NumberField,
  Select,
  TextField,
  TextareaField,
} from "../components/fields.js";
import { Icon } from "../components/icon.js";
import { OptionCards } from "../components/option-cards.js";
import { storyTexts } from "./texts.js";

const meta: Meta = {
  title: "Forms",
};

export default meta;
type Story = StoryObj;

export const Buttons: Story = {
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <Button>{demo.save}</Button>
        <Button variant="secondary">{demo.cancel}</Button>
        <Button disabled>{demo.save}</Button>
        <ButtonLink href="#konto">{demo.toAccount}</ButtonLink>
        <ButtonLink href="#konto" variant="secondary">
          {demo.toAccount}
        </ButtonLink>
      </div>
    );
  },
};

export const ButtonVariants: Story = {
  name: "Button variants and sizes",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    const row = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 } as const;
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div style={row}>
          <Button variant="ghost">{demo.correct}</Button>
          <Button variant="danger">{demo.terminate}</Button>
          <Button variant="danger-solid">{demo.confirmTerminate}</Button>
          <Button variant="danger" disabled>
            {demo.terminate}
          </Button>
        </div>
        <div style={row}>
          <Button size="small">{demo.save}</Button>
          <Button variant="secondary" size="small">
            {demo.cancel}
          </Button>
          <Button variant="ghost" size="small">
            {demo.correct}
          </Button>
          <Button variant="danger" size="small">
            {demo.terminate}
          </Button>
          <Button variant="danger-solid" size="small">
            {demo.confirmTerminate}
          </Button>
          <ButtonLink href="#mehr" variant="secondary" size="small">
            {demo.more}
            <Icon name="right" />
          </ButtonLink>
        </div>
        <div style={row}>
          <Button variant="secondary" icon aria-label={demo.revoke} title={demo.revoke}>
            <Icon name="x" />
          </Button>
          <Button variant="danger" size="small" icon aria-label={demo.revoke} title={demo.revoke}>
            <Icon name="x" />
          </Button>
        </div>
      </div>
    );
  },
};

export const TextFieldStory: Story = {
  name: "TextField",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <>
        <TextField label={demo.name} name="name" autoComplete="name" />
        <TextField label={demo.email} name="email" type="email" hint={demo.emailHint} />
        <TextField
          label={demo.email}
          name="email-invalid"
          type="email"
          defaultValue="erika@"
          error={demo.emailError}
        />
      </>
    );
  },
};

export const TextareaFieldStory: Story = {
  name: "TextareaField",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <>
        <TextareaField label={demo.reason} name="reason" hint={demo.reasonHint} maxLength={300} />
        <TextareaField
          label={demo.reason}
          name="reason-invalid"
          rows={2}
          defaultValue="ok"
          hint={demo.reasonHint}
          error={demo.reasonError}
        />
      </>
    );
  },
};

export const CheckboxFieldStory: Story = {
  name: "CheckboxField",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <>
        <CheckboxField label={demo.consent} name="consent" hint={demo.consentHint} />
        <CheckboxField label={demo.consent} name="consent-invalid" error={demo.consentError} />
      </>
    );
  },
};

/** Option cards hold no state; the story keeps the choice like a zone's form does. */
function OptionCardsDemo({
  invalid,
  globals,
}: {
  invalid: boolean;
  globals: Record<string, unknown>;
}) {
  const { demo } = storyTexts(globals);
  const [value, setValue] = useState(invalid ? "" : "basis");
  return (
    <OptionCards
      legend={demo.optionLegend}
      name={invalid ? "option-invalid" : "option"}
      value={value}
      onChange={setValue}
      error={invalid && value === "" ? demo.optionError : undefined}
      options={demo.options.map((option) => ({
        value: option.value,
        label: option.label,
        price: option.price,
        description: option.value === "basis" ? [demo.current, ...option.lines] : option.lines,
      }))}
    />
  );
}

export const OptionCardsStory: Story = {
  name: "OptionCards",
  render: (_, { globals }) => (
    <div style={{ display: "grid", gap: 24, maxWidth: 640 }}>
      <OptionCardsDemo invalid={false} globals={globals} />
      <OptionCardsDemo invalid globals={globals} />
    </div>
  ),
};

export const NumberFieldStory: Story = {
  name: "NumberField",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <NumberField
        label={demo.reading}
        name="reading"
        unit="kWh"
        min={0}
        step={1}
        hint={demo.readingHint}
      />
    );
  },
};

export const SelectStory: Story = {
  name: "Select",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <Select
        label={demo.division}
        name="division"
        placeholder={demo.choose}
        options={[
          { value: "power", label: demo.divisions.power },
          { value: "gas", label: demo.divisions.gas },
          { value: "water", label: demo.divisions.water },
        ]}
      />
    );
  },
};

export const Form: Story = {
  name: "Complete form",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <form onSubmit={(event) => event.preventDefault()} style={{ maxWidth: 420 }}>
        <Select
          label={demo.division}
          name="division"
          placeholder={demo.choose}
          options={[
            { value: "power", label: demo.divisions.power },
            { value: "gas", label: demo.divisions.gas },
          ]}
        />
        <NumberField label={demo.reading} name="reading" unit="kWh" min={0} />
        <Button type="submit">{demo.save}</Button>
      </form>
    );
  },
};
