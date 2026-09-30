import type { Meta, StoryObj } from "@storybook/react-vite";
import { ButtonLink } from "../components/button.js";
import { DataTable, Facts } from "../components/data.js";
import { EmptyState } from "../components/feedback.js";
import { Footer } from "../components/footer.js";
import { Card, Page } from "../components/page.js";
import { storyTexts } from "./texts.js";

const meta: Meta = {
  title: "Content",
};

export default meta;
type Story = StoryObj;

export const PageDefault: Story = {
  name: "Page",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <Page title={demo.accountTitle} lead={demo.lead}>
        <Card title={demo.address}>{demo.addressText}</Card>
      </Page>
    );
  },
};

export const PageHero: Story = {
  name: "Page (hero)",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <Page
        variant="hero"
        title={demo.heroTitle}
        lead={demo.heroLead}
        actions={<ButtonLink href="#login">{demo.register}</ButtonLink>}
      />
    );
  },
};

export const CardStory: Story = {
  name: "Card",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return <Card title={demo.address}>{demo.addressText}</Card>;
  },
};

export const FactsStory: Story = {
  name: "Facts",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <Facts
        items={[
          { term: demo.customerId, description: "K-100042" },
          { term: demo.name, description: "Erika Mustermann" },
          { term: demo.email, description: "erika.mustermann@example.org" },
          { term: demo.since, description: demo.sinceValue },
        ]}
      />
    );
  },
};

interface Reading {
  date: string;
  meter: string;
  kwh: number;
  source: "customer" | "estimate";
}

const readings: Reading[] = [
  { date: "2026-09-01", meter: "1ESY1160000001", kwh: 12480, source: "customer" },
  { date: "2026-06-01", meter: "1ESY1160000001", kwh: 11925, source: "estimate" },
  { date: "2026-03-01", meter: "1ESY1160000001", kwh: 11310, source: "customer" },
];

function ReadingsTable({ globals, rows }: { globals: Record<string, unknown>; rows: Reading[] }) {
  const { locale, demo } = storyTexts(globals);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });
  const number = new Intl.NumberFormat(locale);
  return (
    <DataTable
      caption={demo.readings}
      rows={rows}
      rowKey={(row) => row.date}
      columns={[
        { key: "date", header: demo.date, render: (row) => date.format(new Date(row.date)) },
        { key: "meter", header: demo.meter, render: (row) => row.meter },
        {
          key: "kwh",
          header: demo.reading,
          align: "end",
          render: (row) => `${number.format(row.kwh)} kWh`,
        },
        { key: "source", header: demo.source, render: (row) => demo.sources[row.source] },
      ]}
      empty={
        <EmptyState
          title={demo.noReadings}
          action={<ButtonLink href="#erfassen">{demo.addReading}</ButtonLink>}
        >
          {demo.noReadingsText}
        </EmptyState>
      }
    />
  );
}

export const DataTableStory: Story = {
  name: "DataTable",
  render: (_, { globals }) => <ReadingsTable globals={globals} rows={readings} />,
};

export const DataTablePhone: Story = {
  name: "DataTable (360 px)",
  render: (_, { globals }) => <ReadingsTable globals={globals} rows={readings} />,
  globals: { viewport: { value: "phone360" } },
};

export const DataTableEmpty: Story = {
  name: "DataTable (empty)",
  render: (_, { globals }) => <ReadingsTable globals={globals} rows={[]} />,
};

export const EmptyStateStory: Story = {
  name: "EmptyState",
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <EmptyState
        title={demo.noReadings}
        action={<ButtonLink href="#erfassen">{demo.addReading}</ButtonLink>}
      >
        {demo.noReadingsText}
      </EmptyState>
    );
  },
};

export const FooterStory: Story = {
  name: "Footer",
  render: (_, { globals }) => {
    const { common } = storyTexts(globals);
    return (
      <Footer>
        <a href={common.footer.href}>{common.footer.text}</a>
      </Footer>
    );
  },
};
