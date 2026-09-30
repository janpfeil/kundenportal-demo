import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge, Notice } from "../components/feedback.js";
import { Meter } from "../components/meter.js";
import { storyTexts } from "./texts.js";

const meta: Meta = {
  title: "Feedback",
};

export default meta;
type Story = StoryObj;

export const Notices: Story = {
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <>
        <Notice tone="info">{demo.info}</Notice>
        <Notice tone="success">{demo.success}</Notice>
        <Notice tone="warning">{demo.warning}</Notice>
        <Notice tone="error" title={demo.errorTitle}>
          {demo.error}
        </Notice>
      </>
    );
  },
};

export const NoticesDark: Story = {
  ...Notices,
  name: "Notices (dark)",
  globals: { theme: "dark" },
};

export const Badges: Story = {
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <p style={{ display: "flex", gap: 16 }}>
        <Badge>{demo.unread}</Badge>
        <Badge tone="neutral">{demo.migrated}</Badge>
        <Badge tone="success">{demo.saved}</Badge>
        <Badge tone="warning">{demo.conflict}</Badge>
        <Badge tone="error">{demo.errorTitle}</Badge>
      </p>
    );
  },
};

export const Meters: Story = {
  render: (_, { globals }) => {
    const { demo } = storyTexts(globals);
    return (
      <>
        <Meter label={demo.quotaApi} value={1200} max={5000} valueText={demo.quotaApiValue} />
        <Meter label={demo.quotaEvents} value={850} max={1000} valueText={demo.quotaEventsValue} />
        <Meter label={demo.quotaUploads} value={20} max={20} valueText={demo.quotaUploadsValue} />
      </>
    );
  },
};

export const MetersDark: Story = {
  ...Meters,
  name: "Meters (dark)",
  globals: { theme: "dark" },
};
