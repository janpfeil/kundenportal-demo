import type { Contract, MeterReading, components } from "@kundenportal/api-contract";
import {
  BarChart,
  Card,
  type Column,
  DataTable,
  Grid,
  Kpi,
  Notice,
  Split,
  Stack,
  formatDate,
  formatQuantity,
} from "@kundenportal/ui";
import { type Locale, fill } from "@kundenportal/ui/i18n";
import type { Dictionary } from "@/i18n";
import {
  changeDelta,
  formatCent,
  monthLabel,
  monthRange,
  monthlyCost,
  unitLabel,
} from "@/lib/consumption";
import { zonePath } from "@/lib/zone";
import { ReadingForm } from "./reading-form";
import { UploadForm } from "./upload-form";

export type ConsumptionHistory = components["schemas"]["ConsumptionHistory"];

export interface MeteredPanelProps {
  contract: Contract;
  /** Readings, newest first; `undefined` if they could not be loaded. */
  readings: MeterReading[] | undefined;
  /** Monthly history and key figures; `undefined` if it could not be loaded. */
  history: ConsumptionHistory | undefined;
  /** Today in German time (`YYYY-MM-DD`). */
  today: string;
  locale: Locale;
  t: Dictionary;
  loginHref: string;
}

/**
 * One metered contract's tab, as in the mockup: three key figures, the chart of the last 12
 * months next to the reading form, and the readings below.
 */
export function MeteredPanel({
  contract,
  readings,
  history,
  today,
  locale,
  t,
  loginHref,
}: MeteredPanelProps) {
  const unit = contract.unit ?? history?.unit ?? "kWh";
  const shownUnit = unitLabel(unit);
  const latest = readings?.[0] ?? history?.latestReading;
  const quantity = (value: number) => formatQuantity(value, unit, locale);
  const division = t.divisions[contract.division];
  const estimatedMonths = history?.months.filter((month) => month.basis === "estimate").length ?? 0;
  const range = history ? monthRange(history.months, t.months, t.chart.range) : "";
  const fractionDigits = unit === "kWh" ? 0 : 1;

  const columns: Column<MeterReading>[] = [
    { key: "readAt", header: t.meter.readAt, render: (row) => formatDate(row.readAt, locale) },
    {
      key: "value",
      header: t.meter.value,
      align: "end",
      render: (row) => quantity(row.value),
    },
    {
      key: "source",
      header: t.meter.source,
      render: (row) => t.meter.sources[row.source] ?? row.source,
    },
  ];

  return (
    <Stack gap="large">
      <Grid min="180px">
        <Kpi
          label={t.kpi.latest}
          value={latest ? quantity(latest.value) : t.kpi.none}
          hint={
            latest
              ? fill(t.kpi.latestHint, {
                  date: formatDate(latest.readAt, locale),
                  source: t.meter.sources[latest.source] ?? latest.source,
                })
              : t.kpi.noneHint
          }
        />
        <Kpi
          label={t.kpi.total}
          value={history ? quantity(history.total) : t.kpi.none}
          delta={
            history?.changePercent !== undefined
              ? changeDelta(history.changePercent, locale, t.kpi.change)
              : undefined
          }
          hint={
            estimatedMonths > 0
              ? fill(t.kpi.estimatedMonths, { count: estimatedMonths })
              : undefined
          }
        />
        <Kpi
          label={t.kpi.average}
          value={history ? quantity(history.averagePerMonth) : t.kpi.none}
          hint={
            history && contract.workPriceCent !== undefined
              ? fill(t.kpi.cost, {
                  amount: monthlyCost(history.averagePerMonth, contract.workPriceCent, locale),
                  price: formatCent(contract.workPriceCent, locale),
                  unit: shownUnit,
                })
              : undefined
          }
        />
      </Grid>

      <Split>
        <Card
          as="section"
          title={fill(t.chart.title, { division, meter: contract.meterNumber ?? "" })}
        >
          {history ? (
            <BarChart
              labels={history.months.map((month) => monthLabel(month.month, t.months))}
              values={history.months.map((month) => month.value)}
              previous={history.months.map((month) => month.previousYear)}
              estimated={history.months.map((month) => month.basis === "estimate")}
              unit={shownUnit}
              title={fill(t.chart.label, { division, range })}
              rangeLabel={range}
              fractionDigits={fractionDigits}
              locale={locale}
            />
          ) : (
            <Notice tone="error">{t.chart.error}</Notice>
          )}
        </Card>

        <Card as="section" title={t.reading.title}>
          {contract.status === "active" ? (
            <>
              <ReadingForm
                contractId={contract.contractId}
                unit={unit}
                latest={latest ? { value: latest.value, readAt: latest.readAt } : undefined}
                today={today}
                plausibleRange={history?.plausibleRange}
                locale={locale}
                texts={t.reading}
                loginHref={loginHref}
              />
              <UploadForm
                texts={t.upload}
                endpoint={zonePath("/api/documents/upload-url")}
                loginHref={loginHref}
                categories={[{ value: "meter-photo", label: t.photo.file }]}
                accept={["image/jpeg", "image/png"]}
                fileLabel={t.photo.file}
                data-testid="meter-photo-upload"
              />
            </>
          ) : (
            // No Notice: its status role would compete with the forms' confirmations.
            <p className="kp-muted">{t.meter.inactive}</p>
          )}
        </Card>
      </Split>

      <Card as="section" title={t.meter.title}>
        <div
          data-testid="readings"
          data-contract-id={contract.contractId}
          data-latest-value={readings?.[0] ? String(readings[0].value) : ""}
        >
          {readings ? (
            <DataTable
              caption={t.meter.caption}
              columns={columns}
              rows={readings}
              rowKey={(row) => row.readingId}
              className="zone-table"
              empty={<p className="kp-muted">{t.meter.empty}</p>}
            />
          ) : (
            <Notice tone="error">{t.meter.error}</Notice>
          )}
        </div>
      </Card>
    </Stack>
  );
}
