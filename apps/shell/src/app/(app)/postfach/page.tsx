import {
  ButtonLink,
  Card,
  EmptyState,
  Icon,
  MessageList,
  Notice,
  Page,
  StatusBadge,
} from "@kundenportal/ui";
import { MarkReadButton } from "@/components/mark-read-button";
import { dictionary } from "@/i18n";
import { api } from "@/lib/api";
import {
  messageDateTime,
  messageTime,
  newestFirst,
  paragraphs,
  selectMessage,
} from "@/lib/overview";
import { ShellLink } from "@/lib/shell-link";

export const dynamic = "force-dynamic";

/**
 * The demo mailbox as in the mockup: the list of messages (unread ones highlighted) and the
 * message chosen with `?n=<id>` (default: the newest) next to it; one column on phones.
 */
export default async function MailboxPage({ searchParams }: PageProps<"/postfach">) {
  const [{ locale, t }, client, query] = await Promise.all([dictionary(), api(), searchParams]);
  // Undefined when the call failed, also when the API could not be reached.
  const data = await client.GET("/notifications").then(
    (result) => result.data,
    () => undefined,
  );
  const texts = t.mailbox;
  const now = new Date();
  const messages = newestFirst(data?.items ?? []);
  const selected = selectMessage(messages, query.n);

  return (
    <Page
      title={texts.title}
      aside={
        <ButtonLink
          href={
            selected ? `/postfach?n=${encodeURIComponent(selected.notificationId)}` : "/postfach"
          }
          variant="secondary"
          linkComponent={ShellLink}
          className="shell-small-button"
        >
          <Icon name="refresh" />
          {texts.refresh}
        </ButtonLink>
      }
    >
      {!data ? (
        <Notice tone="error">{texts.error}</Notice>
      ) : messages.length === 0 || !selected ? (
        <EmptyState>{texts.empty}</EmptyState>
      ) : (
        <div className="mailbox" data-testid="mailbox">
          <Card as="section" className="mailbox-list" aria-label={texts.messages}>
            <MessageList
              locale={locale}
              linkComponent={ShellLink}
              items={messages.map((message) => ({
                id: message.notificationId,
                href: `/postfach?n=${encodeURIComponent(message.notificationId)}`,
                title: message.title,
                time: (
                  <time dateTime={message.createdAt}>
                    {messageTime(message.createdAt, now, locale, texts.yesterday)}
                  </time>
                ),
                preview: message.body,
                unread: !message.read,
                current: message.notificationId === selected.notificationId,
              }))}
            />
          </Card>
          <Card
            as="article"
            className="mailbox-message"
            aria-labelledby="mailbox-message-title"
            data-message={selected.notificationId}
            data-read={selected.read}
          >
            <div className="mailbox-message-meta">
              {!selected.read && <StatusBadge tone="info">{texts.unread}</StatusBadge>}
              <time className="kp-muted" dateTime={selected.createdAt}>
                {messageDateTime(selected.createdAt, locale)}
              </time>
            </div>
            <h2 id="mailbox-message-title">{selected.title}</h2>
            <p className="kp-muted mailbox-from">{texts.from}</p>
            <div className="mailbox-body">
              {paragraphs(selected.body).map((paragraph, index) => (
                // Paragraphs of one message body never move; the index is a stable key.
                <p key={index}>{paragraph}</p>
              ))}
            </div>
            <div className="mailbox-actions">
              {!selected.read && (
                <MarkReadButton notificationId={selected.notificationId} label={texts.markRead} />
              )}
              <ButtonLink href="/verbrauch" variant="secondary">
                {texts.consumption}
              </ButtonLink>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}
