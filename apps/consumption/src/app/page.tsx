import type { Contract, DataUsage, MeterReading } from "@kundenportal/api-contract";
import { ButtonLink, EmptyState, Notice, Page, divisionIcon } from "@kundenportal/ui";
import { apiFor, loginUrl } from "@kundenportal/web-auth";
import { requireSession } from "@kundenportal/web-auth/pages";
import { ContractTabs } from "@/components/contract-tabs";
import { type ConsumptionHistory, MeteredPanel } from "@/components/metered-panel";
import { UsagePanel } from "@/components/usage-panel";
import { dictionary } from "@/i18n";
import { TAB_PARAM, isMetered, selectedTab, tabContracts } from "@/lib/consumption";
import { todayInGermany } from "@/lib/reading";
import { zonePath } from "@/lib/zone";
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

async function loadHistory(api: Api, contractId: string): Promise<ConsumptionHistory | undefined> {
  try {
    const { data } = await api.GET("/contracts/{contractId}/consumption", {
      params: { path: { contractId } },
    });
    return data;
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

export default async function ConsumptionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const path = zonePath();
  const session = await requireSession(path);
  const [{ locale, t }, query] = await Promise.all([dictionary(), searchParams]);
  const api = apiFor(session);

  const contracts = await loadContracts(api);
  if (!contracts) {
    return (
      <Page title={t.title} lead={t.overview.lead}>
        <Notice tone="error">{t.overview.error}</Notice>
      </Page>
    );
  }
  const tabs = tabContracts(contracts);
  if (tabs.length === 0) {
    return (
      <Page title={t.title} lead={t.overview.lead}>
        <EmptyState
          title={t.overview.empty}
          action={
            <ButtonLink href={path} variant="secondary" linkComponent={ZoneLink}>
              {t.overview.refresh}
            </ButtonLink>
          }
        >
          {t.overview.emptyText}
        </EmptyState>
      </Page>
    );
  }

  const data = await Promise.all(
    tabs.map(async (contract) => {
      if (!isMetered(contract))
        return { kind: "usage" as const, usage: await loadUsage(api, contract.contractId) };
      const [readings, history] = await Promise.all([
        loadReadings(api, contract.contractId),
        loadHistory(api, contract.contractId),
      ]);
      return { kind: "metered" as const, readings, history };
    }),
  );
  const today = todayInGermany();
  // Sign-in after an expired session returns to the tab the customer was on.
  const selected = selectedTab(
    tabs.map((contract) => contract.contractId),
    query[TAB_PARAM],
  );
  const loginHref = loginUrl(
    selected ? `${path}?${TAB_PARAM}=${encodeURIComponent(selected)}` : path,
  );
  // Two contracts of one division are told apart by their tariff.
  const label = (contract: Contract) =>
    tabs.filter((other) => other.division === contract.division).length > 1
      ? `${t.divisions[contract.division]} · ${contract.tariffName}`
      : t.divisions[contract.division];

  return (
    <Page title={t.title} lead={t.overview.lead}>
      <ContractTabs
        label={t.overview.tabs}
        defaultTab={selected}
        items={tabs.map((contract, index) => {
          const entry = data[index];
          return {
            id: contract.contractId,
            label: label(contract),
            icon: divisionIcon(contract.division),
            panel:
              entry?.kind === "metered" ? (
                <MeteredPanel
                  contract={contract}
                  readings={entry.readings}
                  history={entry.history}
                  today={today}
                  locale={locale}
                  t={t}
                  loginHref={loginHref}
                />
              ) : (
                <UsagePanel contract={contract} usage={entry?.usage} locale={locale} t={t} />
              ),
          };
        })}
      />
    </Page>
  );
}
