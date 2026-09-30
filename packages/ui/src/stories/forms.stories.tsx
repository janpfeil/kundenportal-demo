import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, ButtonLink } from "../components/button.js";
import { NumberField, Select, TextField } from "../components/fields.js";
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
