import type { Contract, Document } from "@kundenportal/api-contract";
import {
  ButtonLink,
  Card,
  type Column,
  DataTable,
  EmptyState,
  Icon,
  Notice,
  Page,
  Stack,
  StatusBadge,
  divisionIcon,
  formatDate,
  formatDateTime,
  formatEuro,
  formatFileSize,
} from "@kundenportal/ui";
import { apiFor, loginUrl } from "@kundenportal/web-auth";
import { requireSession } from "@kundenportal/web-auth/pages";
import { UploadForm } from "@/components/upload-form";
import { dictionary } from "@/i18n";
import { ZoneLink } from "@/lib/zone-link";
import { zonePath } from "@/lib/zone";
import Link from "next/link";

export const dynamic = "force-dynamic";

/** Order of the category choice: general documents first. */
const UPLOAD_CATEGORIES = ["other", "meter-photo"] as const;

export default async function ContractsPage() {
  const session = await requireSession(zonePath());
  const { locale, t } = await dictionary();
  const api = apiFor(session);
  const [contracts, documents] = await Promise.all([
    api.GET("/contracts").catch(() => ({ data: undefined })),
    api.GET("/documents").catch(() => ({ data: undefined })),
  ]);

  const contractColumns: Column<Contract>[] = [
    {
      key: "division",
      header: t.overview.division,
      render: (contract) => (
        <span className="zone-division">
          <Icon name={divisionIcon(contract.division)} />
          <Link href={`/${contract.contractId}`}>{t.divisions[contract.division]}</Link>
        </span>
      ),
    },
    {
      key: "tariff",
      header: t.overview.tariff,
      render: (contract) => (
        // One element, so the stacked row on phones keeps tariff and option together.
        <span>
          {contract.tariffName}
          <span className="zone-sub">
            {t.options[contract.tariffOption] ?? contract.tariffOption}
          </span>
        </span>
      ),
    },
    {
      key: "amount",
      header: t.overview.amount,
      align: "end",
      render: (contract) => formatEuro(contract.monthlyInstallmentCent, locale),
    },
    {
      key: "termEnd",
      header: t.overview.termEnd,
      render: (contract) => formatDate(contract.minimumTermEndDate, locale),
    },
    {
      key: "status",
      header: t.overview.status,
      render: (contract) => (
        <StatusBadge tone={contract.status === "active" ? "ok" : "neutral"}>
          {t.status[contract.status]}
        </StatusBadge>
      ),
    },
  ];

  const documentColumns: Column<Document>[] = [
    {
      key: "name",
      header: t.documents.name,
      render: (doc) => <span className="zone-break">{doc.fileName}</span>,
    },
    {
      key: "category",
      header: t.documents.category,
      render: (doc) => t.documents.categories[doc.category] ?? doc.category,
    },
    {
      key: "size",
      header: t.documents.size,
      align: "end",
      render: (doc) => formatFileSize(doc.sizeBytes, locale),
    },
    {
      key: "uploadedAt",
      header: t.documents.uploadedAt,
      render: (doc) => formatDateTime(doc.uploadedAt ?? doc.createdAt, locale),
    },
    {
      key: "status",
      header: t.documents.status,
      render: (doc) => (
        <StatusBadge
          tone={doc.status === "uploaded" ? "ok" : doc.status === "rejected" ? "err" : "info"}
        >
          {t.documents.statuses[doc.status] ?? doc.status}
        </StatusBadge>
      ),
    },
  ];

  return (
    <Page title={t.title} lead={t.overview.lead}>
      <Stack gap="large">
        <Card>
          {contracts.data ? (
            <DataTable
              data-testid="contracts"
              caption={t.overview.caption}
              columns={contractColumns}
              rows={contracts.data.items}
              rowKey={(contract) => contract.contractId}
              className="zone-table"
              empty={
                <EmptyState
                  title={t.overview.empty}
                  action={
                    <ButtonLink href={zonePath()} variant="secondary" linkComponent={ZoneLink}>
                      {t.overview.refresh}
                    </ButtonLink>
                  }
                >
                  {t.overview.emptyText}
                </EmptyState>
              }
            />
          ) : (
            <Notice tone="error">{t.overview.error}</Notice>
          )}
        </Card>

        <Card as="section" title={t.documents.title} icon="file">
          <p className="kp-muted">{t.documents.intro}</p>
          {documents.data ? (
            <DataTable
              data-testid="documents"
              caption={t.documents.caption}
              columns={documentColumns}
              rows={documents.data.items}
              rowKey={(doc) => doc.documentId}
              className="zone-table"
              empty={
                <p className="kp-muted" data-testid="documents">
                  {t.documents.empty}
                </p>
              }
            />
          ) : (
            <Notice tone="error">{t.documents.error}</Notice>
          )}
          <UploadForm
            texts={t.upload}
            endpoint={zonePath("/api/documents/upload-url")}
            loginHref={loginUrl(zonePath())}
            categories={UPLOAD_CATEGORIES.map((value) => ({
              value,
              label: t.documents.categories[value] ?? value,
            }))}
            data-testid="document-upload"
          />
        </Card>
      </Stack>
    </Page>
  );
}
