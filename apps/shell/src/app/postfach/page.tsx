import { dictionary } from "@/i18n";
import { api } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function MailboxPage() {
  const { locale, t } = await dictionary();
  const { data, error } = await (await api()).GET("/notifications");
  const format = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <section>
      <h1>{t.mailbox.title}</h1>
      <p>
        <a href="/postfach" className="button secondary">
          {t.mailbox.refresh}
        </a>
      </p>
      {error || !data ? (
        <p role="alert">{t.mailbox.error}</p>
      ) : data.items.length === 0 ? (
        <p className="muted">{t.mailbox.empty}</p>
      ) : (
        <ul className="mailbox" data-testid="mailbox">
          {data.items.map((note) => (
            <li key={note.notificationId} className={note.read ? "read" : "unread"}>
              <div className="meta">
                <time dateTime={note.createdAt}>{format.format(new Date(note.createdAt))}</time>
                {!note.read && <span className="badge">{t.mailbox.unread}</span>}
              </div>
              <h2>{note.title}</h2>
              <p>{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
