/**
 * <kp-bell> — runtime widget showing the number of unread messages in the demo mailbox.
 *
 * Framework-independent (a custom element), so every zone can embed it regardless of its
 * own stack: `<script type="module" src="/widgets/bell.js"></script>` and `<kp-bell></kp-bell>`.
 * It asks the shell's same-origin endpoint (session cookie, no token in the browser) and
 * links to the mailbox. Attributes: `label` (accessible text), `href` (default /postfach),
 * `src` (default /postfach/anzahl), `interval` in seconds (default 30, 0 = once).
 */
export interface BellCount {
  unread: number;
}

export async function fetchUnread(src: string): Promise<number | undefined> {
  try {
    const response = await fetch(src, {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const body = (await response.json()) as Partial<BellCount>;
    return typeof body.unread === "number" && body.unread >= 0 ? body.unread : undefined;
  } catch {
    return undefined;
  }
}

const STYLE = `
  :host { display: inline-block; }
  a { position: relative; display: inline-flex; align-items: center; padding: 4px;
      color: inherit; text-decoration: none; border-radius: 6px; }
  a:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  svg { width: 22px; height: 22px; }
  .badge { position: absolute; top: -4px; right: -6px; min-width: 18px; height: 18px;
           padding: 0 5px; border-radius: 9px; font: 700 11px/18px system-ui, sans-serif;
           text-align: center; background: var(--kp-accent, #0b6e4f); color: var(--kp-accent-contrast, #fff); }
  .badge[hidden] { display: none; }
`;

const ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2">' +
  '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';

export class KpBell extends HTMLElement {
  #timer: ReturnType<typeof setInterval> | undefined;
  readonly #link = document.createElement("a");
  readonly #badge = document.createElement("span");

  connectedCallback(): void {
    if (!this.shadowRoot) {
      const root = this.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLE;
      this.#link.setAttribute("part", "link");
      this.#link.innerHTML = ICON;
      this.#badge.className = "badge";
      this.#badge.setAttribute("part", "badge");
      this.#link.append(this.#badge);
      root.append(style, this.#link);
    }
    this.#link.href = this.getAttribute("href") ?? "/postfach";
    this.#render(undefined);
    void this.refresh();
    const seconds = Number(this.getAttribute("interval") ?? 30);
    if (seconds > 0) this.#timer = setInterval(() => void this.refresh(), seconds * 1000);
  }

  disconnectedCallback(): void {
    if (this.#timer) clearInterval(this.#timer);
  }

  async refresh(): Promise<void> {
    this.#render(await fetchUnread(this.getAttribute("src") ?? "/postfach/anzahl"));
  }

  #render(unread: number | undefined): void {
    const label = this.getAttribute("label") ?? "Postfach";
    const count = unread ?? 0;
    this.#badge.hidden = count === 0;
    this.#badge.textContent = count > 99 ? "99+" : String(count);
    // Visible text is only the icon and number, so the link carries the full name.
    this.#link.setAttribute("aria-label", count > 0 ? `${label}: ${count}` : label);
  }
}

if (!customElements.get("kp-bell")) customElements.define("kp-bell", KpBell);
