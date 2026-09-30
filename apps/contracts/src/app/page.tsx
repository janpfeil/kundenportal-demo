import type { Contract, Document } from "@kundenportal/api-contract";
import {
  Badge,
  ButtonLink,
  Card,
  type Column,
  DataTable,
  EmptyState,
  Notice,
  Page,
} from "@kundenportal/ui";
import { apiFor, loginUrl } from "@kundenportal/web-auth";
import Link from "next/link";
import { UploadForm } from "@/components/upload-form";
import { dictionary } from "@/i18n";
import { formatDate, formatDateTime, formatEuro, formatFileSize } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { ZoneLink } from "@/lib/zone-link";
import { zonePath } from "@/lib/zone";

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
        <Link href={`/${contract.contractId}`}>{t.divisions[contract.division]}</Link>
      ),
    },
    {
      key: "tariff",
      header: t.overview.tariff,
      render: (contract) =>
        `${contract.tariffName} · ${t.options[contract.tariffOption] ?? contract.tariffOption}`,
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
        <Badge tone={contract.status === "active" ? "success" : "neutral"}>
          {t.status[contract.status]}
        </Badge>
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
        <Badge
          tone={
            doc.status === "uploaded" ? "success" : doc.status === "rejected" ? "error" : "neutral"
          }
        >
          {t.documents.statuses[doc.status] ?? doc.status}
        </Badge>
      ),
    },
  ];

  return (
    <Page
      title={t.title}
      lead={t.overview.lead}
      actions={
        <ButtonLink href={zonePath()} variant="secondary" linkComponent={ZoneLink}>
          {t.overview.refresh}
        </ButtonLink>
      }
    >
      {contracts.data ? (
        <DataTable
          data-testid="contracts"
          caption={t.overview.caption}
          columns={contractColumns}
          rows={contracts.data.items}
          rowKey={(contract) => contract.contractId}
          empty={<EmptyState title={t.overview.empty}>{t.overview.emptyText}</EmptyState>}
        />
      ) : (
        <Notice tone="error">{t.overview.error}</Notice>
      )}

      <Card title={t.documents.title} className="zone-section">
        <p className="kp-muted">{t.documents.intro}</p>
        {documents.data ? (
          <DataTable
            data-testid="documents"
            caption={t.documents.caption}
            columns={documentColumns}
            rows={documents.data.items}
            rowKey={(doc) => doc.documentId}
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
    </Page>
  );
}
