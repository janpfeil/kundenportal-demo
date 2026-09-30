import { Badge, ButtonLink, EmptyState, Notice, Page } from "@kundenportal/ui";
import { dictionary } from "@/i18n";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function MailboxPage() {
  const { locale, t } = await dictionary();
  const { data, error } = await (await api()).GET("/notifications");
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <Page
      title={t.mailbox.title}
      actions={
        <ButtonLink href="/postfach" variant="secondary">
          {t.mailbox.refresh}
        </ButtonLink>
      }
    >
      {error || !data ? (
        <Notice tone="error">{t.mailbox.error}</Notice>
      ) : data.items.length === 0 ? (
        <EmptyState>{t.mailbox.empty}</EmptyState>
      ) : (
        <ul className="mailbox" data-testid="mailbox">
          {data.items.map((note) => (
            <li key={note.notificationId} className={note.read ? "read" : "unread"}>
              <div className="meta">
                <time dateTime={note.createdAt}>{format.format(new Date(note.createdAt))}</time>
                {!note.read && <Badge>{t.mailbox.unread}</Badge>}
              </div>
              <h2>{note.title}</h2>
              <p>{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
