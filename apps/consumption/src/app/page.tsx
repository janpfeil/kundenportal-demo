import type { Contract, DataUsage, MeterReading } from "@kundenportal/api-contract";
import {
  ButtonLink,
  Card,
  type Column,
  DataTable,
  EmptyState,
  Notice,
  Page,
} from "@kundenportal/ui";
import type { Locale } from "@kundenportal/ui/i18n";
import { apiFor, loginUrl } from "@kundenportal/web-auth";
import { ReadingForm } from "@/components/reading-form";
import { UploadForm } from "@/components/upload-form";
import { type Dictionary, dictionary } from "@/i18n";
import { formatDataVolume, formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import { todayInGermany } from "@/lib/reading";
import { requireSession } from "@/lib/session";
import { fill, zonePath } from "@/lib/zone";
import { ZoneLink } from "@/lib/zone-link";

export const dynamic = "force-dynamic";

type Api = ReturnType<typeof apiFor>;

async function loadContracts(api: Api): Promise<Contract[] | undefined> {
  try {
    return (await api.GET("/contracts")).data?.items;
  } catch {
    return undefined;
  }
}

async function loadReadings(api: Api, contractId: string): Promise<MeterReading[] | undefined> {
  try {
    const { data } = await api.GET("/contracts/{contractId}/readings", {
      params: { path: { contractId } },
    });
    return data?.items;
  } catch {
    return undefined;
  }
}

async function loadUsage(api: Api, contractId: string): Promise<DataUsage | undefined> {
  try {
    return (await api.GET("/contracts/{contractId}/usage", { params: { path: { contractId } } }))
      .data;
  } catch {
    return undefined;
  }
}

function monthName(month: string, locale: Locale): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function Usage({ usage, t, locale }: { usage: DataUsage; t: Dictionary; locale: Locale }) {
  const id = `usage-${usage.contractId}`;
  const volume = (mb: number) => formatDataVolume(mb, locale);
  return (
    <div className="zone-usage" data-testid="usage">
      <p className="zone-usage-title">
        {fill(t.usage.title, { month: monthName(usage.month, locale) })}
      </p>
      <label className="kp-label" htmlFor={id}>
        {t.usage.label}
      </label>
      <progress
        id={id}
        className="zone-progress"
        max={usage.includedMb}
        value={Math.min(usage.usedMb, usage.includedMb)}
        aria-describedby={`${id}-text`}
      >
        {usage.usedPercent} %
      </progress>
      <p id={`${id}-text`}>
        {fill(t.usage.text, {
          used: volume(usage.usedMb),
          included: volume(usage.includedMb),
          percent: usage.usedPercent,
        })}
      </p>
      <p className="kp-muted">{fill(t.usage.asOf, { time: formatDateTime(usage.asOf, locale) })}</p>
      {usage.usedPercent >= usage.thresholdPercent && (
        <Notice tone="warning">{fill(t.usage.warning, { percent: usage.usedPercent })}</Notice>
      )}
    </div>
  );
}

export default async function ConsumptionPage() {
  const path = zonePath();
  const session = await requireSession(path);
  const { locale, t } = await dictionary();
  const api = apiFor(session);
  const refresh = (
    <ButtonLink href={path} variant="secondary" linkComponent={ZoneLink}>
      {t.overview.refresh}
    </ButtonLink>
  );

  const contracts = await loadContracts(api);
  if (!contracts) {
    return (
      <Page title={t.title} lead={t.overview.lead} actions={refresh}>
        <Notice tone="error">{t.overview.error}</Notice>
      </Page>
    );
  }
  const metered = contracts.filter((contract) => contract.meterNumber && contract.unit);
  const mobile = contracts.filter((contract) => contract.dataVolumeMb !== undefined);
  const [readings, usages] = await Promise.all([
    Promise.all(metered.map((contract) => loadReadings(api, contract.contractId))),
    Promise.all(mobile.map((contract) => loadUsage(api, contract.contractId))),
  ]);
  const today = todayInGermany();
  const loginHref = loginUrl(path);

  const columns = (unit: string): Column<MeterReading>[] => [
    { key: "readAt", header: t.meter.readAt, render: (row) => formatDate(row.readAt, locale) },
    {
      key: "value",
      header: t.meter.value,
      align: "end",
      render: (row) => formatQuantity(row.value, unit, locale),
    },
    {
      key: "source",
      header: t.meter.source,
      render: (row) => t.meter.sources[row.source] ?? row.source,
    },
  ];

  return (
    <Page title={t.title} lead={t.overview.lead} actions={refresh}>
      {metered.length === 0 && mobile.length === 0 && (
        <EmptyState title={t.overview.empty}>{t.overview.emptyText}</EmptyState>
      )}

      {metered.map((contract, index) => {
        const unit = contract.unit ?? "kWh";
        const items = readings[index];
        const latest = items?.[0];
        return (
          <Card
            key={contract.contractId}
            className="zone-section"
            title={fill(t.meter.heading, {
              division: t.divisions[contract.division],
              meter: contract.meterNumber ?? "",
            })}
          >
            <p>
              <a href={`/vertraege/${contract.contractId}`}>{t.overview.toContract}</a>
            </p>
            <div
              data-testid="readings"
              data-contract-id={contract.contractId}
              data-latest-value={latest ? String(latest.value) : ""}
            >
              {items ? (
                <DataTable
                  caption={t.meter.caption}
                  columns={columns(unit)}
                  rows={items}
                  rowKey={(row) => row.readingId}
                  empty={<p className="kp-muted">{t.meter.empty}</p>}
                />
              ) : (
                <Notice tone="error">{t.meter.error}</Notice>
              )}
            </div>
            {contract.status === "active" ? (
              <>
                <h3 className="zone-subheading">{t.reading.title}</h3>
                <ReadingForm
                  contractId={contract.contractId}
                  unit={unit}
                  latest={latest ? { value: latest.value, readAt: latest.readAt } : undefined}
                  today={today}
                  locale={locale}
                  texts={t.reading}
                  loginHref={loginHref}
                />
                <h3 className="zone-subheading">{t.photo.title}</h3>
                <p className="kp-muted">{t.photo.intro}</p>
                <UploadForm
                  texts={t.upload}
                  endpoint={zonePath("/api/documents/upload-url")}
                  loginHref={loginHref}
                  categories={[{ value: "meter-photo", label: t.photo.title }]}
                  accept={["image/jpeg", "image/png"]}
                  fileLabel={t.photo.file}
                  data-testid="meter-photo-upload"
                />
              </>
            ) : (
              <Notice tone="info">{t.meter.inactive}</Notice>
            )}
          </Card>
        );
      })}

      {mobile.map((contract, index) => {
        const usage = usages[index];
        return (
          <Card
            key={contract.contractId}
            className="zone-section"
            title={`${t.divisions[contract.division]} · ${contract.tariffName}`}
          >
            {usage ? (
              <Usage usage={usage} t={t} locale={locale} />
            ) : (
              <Notice tone="error">{t.usage.error}</Notice>
            )}
          </Card>
        );
      })}
    </Page>
  );
}
