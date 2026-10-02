"""Baut docs/reports/*.html aus docs/wiki/*.md (Glossar, Quellenanker, SVG-Grafiken)."""
import datetime
import html
import re
import sys
from pathlib import Path

import markdown
from markdown.extensions.toc import slugify_unicode

sys.path.insert(0, str(Path(__file__).parent))
import report_charts  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
WIKI = ROOT / "docs" / "wiki"
OUT = ROOT / "docs" / "reports"

PAGES = [
    ("uebersicht", "index", "Übersicht", "Stand, Empfehlung und offene Entscheidungen"),
    ("machbarkeit-kosten", "machbarkeit-kosten", "Machbarkeit & Kosten", "Technik-Zuordnung, Architektur, AWS-Kosten, Kostenschutz"),
    ("fachkonzept", "fachkonzept", "Fachkonzept", "Personas, Journeys, Bereiche, Ereignisse, Datenmodell, Repository"),
    ("demo-pass", "demo-pass", "Demo-Pass", "Eigene Instanz je Besucher, Einladungslinks, Mandantenmodell, Missbrauchsschutz"),
    ("kostenfrei", "kostenfrei", "Kostenfreier Betrieb", "AWS nur im Freikontingent, Rest auf eigener Infrastruktur"),
    ("anleitung-kontoinhaber", "anleitung-kontoinhaber", "Anleitung Kontoinhaber", "Alle AWS-Handgriffe des Kontoinhabers Schritt für Schritt, ohne Vorkenntnisse"),
    ("anleitung-fundament", "anleitung-fundament", "Anleitung Fundament", "Alltagszugang, Terraform-Erstlauf, Budget (Kapitel 4–5)"),
    ("anleitung-anwendung", "anleitung-anwendung", "Anleitung Anwendung", "GitLab-Pipeline, CDK-Bootstrap, GitHub-Freigabe, DNS, Deploy, Test, Abbau (Kapitel 6–10)"),
    ("anleitung-altsysteme", "anleitung-altsysteme", "Anleitung Altsysteme", "Keycloak-Zugang für Terraform, CI-Variablen, Rechte, Pipeline (Kapitel 11)"),
    ("nextjs-betrieb", "nextjs-betrieb", "Next.js-Betrieb", "Static Export oder OpenNext: Auswirkungen, Micro-Frontends, Empfehlung"),
    ("architektur", "architektur", "Architektur", "Ist-Architektur: Anmeldung, API, Services, Daten, Ereignisse, Pipelines, Messwerte"),
    ("architektur-zonen", "architektur-zonen", "Zonen & Frontend", "Multi-Zones, Schreibweg aus dem Browser, Laufzeit-Widget, Component Library"),
    ("architektur-migration", "architektur-migration", "Altsysteme & Migration", "Lazy Migration, Bulk-Import mit DLQ, Dubletten und Account-Linking, Migrations-Cockpit"),
    ("architektur-mandanten", "architektur-mandanten", "Mandanten & Demo-Pass", "Einladung, Pass, eigener Mandant je Besucher, Isolation per Token Vending, Kontingente, Ablauf und Rückbau"),
    ("design", "design", "Design & Theme", "Phase 5: zwei Zielgruppen, Theme-Varianten, Mockup mit Werkzeugleiste und Kontrastprüfung"),
]
SKIP_TAGS = {"a", "h1", "h2", "h3", "h4", "h5", "h6", "code", "pre", "svg", "figure", "script", "style", "summary", "th"}
URL_RE = re.compile(r'(?<![(<"\'=])\bhttps?://[^\s<>()\]]*[^\s<>()\].,;:!?\'"»“”]')
CITE_RE = re.compile(r"\[(\d{1,3})\]")


def slug(s):
    return slugify_unicode(s, "-")


def glossary_files():
    """glossar.md (Einleitung, erste Kategorien) und danach die Fortsetzungen glossar-2.md, glossar-3.md …"""
    rest = sorted(WIKI.glob("glossar-*.md"), key=lambda f: int(re.sub(r"\D", "", f.stem) or 0))
    return [WIKI / "glossar.md", *rest]


def load_glossary():
    """Liest alle Glossar-Dateien: je Kategorie (## …) eine Tabelle Begriff | Auch | Erklärung | Außerhalb von AWS.
    Die Teil-Dateien ergeben zusammen eine Glossar-Seite (glossar.html); Anker hängen nur am Begriff."""
    terms, cat = [], ""
    lines = [ln for f in glossary_files() for ln in f.read_text(encoding="utf-8").splitlines()]
    for ln in lines:
        if ln.startswith("## "):
            cat = ln[3:].strip()
            continue
        if not ln.startswith("|") or set(ln.strip()) <= set("|-: "):
            continue
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) < 4 or cells[0] == "Begriff":
            continue
        name, also, desc, alt = cells[:4]
        base = name.split(" (")[0].strip()
        aliases = {name, base} | {a.strip() for a in also.split(",") if a.strip()}
        urls = URL_RE.findall(desc)
        desc = re.sub(r"\s*[–-]\s*$", "", URL_RE.sub("", desc)).strip()
        terms.append({"name": name, "also": also, "desc": desc, "alt": alt if alt not in ("—", "-") else "",
                      "urls": urls, "cat": cat, "pages": [],
                      "aliases": sorted(aliases, key=len, reverse=True)})
    return terms


def preprocess(md_text, charts):
    def chart(m):
        charts.append(report_charts.render(m.group(1)))
        return f"\n\nCHARTPLACEHOLDER{len(charts) - 1}\n\n"

    md_text = re.sub(r"^```chart\s*\n(.*?)\n```\s*$", chart, md_text, flags=re.M | re.S)
    md_text = re.sub(r"(^## Quellen\s*$)(.*?)(?=^## |\Z)",
                     lambda m: m.group(1) + "\n" + re.sub(r"^(\[\d{1,3}\])", r"- \1", m.group(2), flags=re.M),
                     md_text, flags=re.M | re.S)
    md_text = re.sub(r"^(>.*\S)[ \t]*\n(?=>)", r"\1  \n", md_text, flags=re.M)
    md_text = URL_RE.sub(lambda m: f"<{m.group(0)}>", md_text)
    md_text = re.sub(r"\]\(uebersicht\.md", "](index.md", md_text)
    md_text = re.sub(r"\]\(([\w-]+)\.md(#[^)]*)?\)", lambda m: f"]({m.group(1)}.html{m.group(2) or ''})", md_text)
    return md_text


def walk_text(h, fn):
    """Wendet fn auf Textknoten außerhalb von SKIP_TAGS an."""
    out, depth = [], 0
    for tok in re.split(r"(<[^>]+>)", h):
        if tok.startswith("<"):
            m = re.match(r"<(/?)([a-zA-Z0-9]+)", tok)
            if m and m.group(2).lower() in SKIP_TAGS and not tok.endswith("/>"):
                depth += -1 if m.group(1) else 1
            out.append(tok)
        else:
            out.append(fn(tok) if depth == 0 and tok.strip() else tok)
    return "".join(out)


def alias_rx(alias):
    body = re.escape(alias).replace(r"\ ", r"\s+")  # Zeilenumbruch im Quelltext zählt als Leerzeichen
    return re.compile(r"(?<![\w@.])" + body + r"(?:e|en|es|s|n|er)?(?![\w@])")


def link_terms(h, terms, self_page, skip=None, href=lambda t: "glossar.html#" + slug(t["name"])):
    """Verlinkt je Begriff das erste Vorkommen. Schreibweisen werden global nach Länge abgearbeitet;
    jedes Vorkommen wird maskiert, damit kürzere Schreibweisen („Actions“) nicht in längere
    („Server Actions“) hineinverlinken."""
    used = {skip} if skip else set()
    pats = sorted(((rx, t) for t in terms for rx in t["rx"]), key=lambda p: -len(p[0].pattern))

    def keep(frag):
        stash.append(frag)
        return "\x00" + str(len(stash) - 1) + "\x00"

    def fn(txt):
        for rx, t in pats:
            def sub(m):
                if t["name"] in used:
                    return keep(m.group(0))
                used.add(t["name"])
                if self_page and self_page not in t["pages"]:
                    t["pages"].append(self_page)
                title = html.escape(re.sub(r"[*`]", "", t["desc"])[:180], quote=True)
                return keep(f'<a class="term" href="{href(t)}" title="{title}">{m.group(0)}</a>')
            txt = rx.sub(sub, txt)
        return txt

    stash = []
    h = walk_text(h, fn)
    return re.sub(r"\x00(\d+)\x00", lambda m: stash[int(m.group(1))], h)


def postprocess(body, charts, terms, page):
    body = re.sub(r"<p>CHARTPLACEHOLDER(\d+)</p>", lambda m: charts[int(m.group(1))], body)
    body = body.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
    body = re.sub(r"<td>([−+-]?[\d.,]+\s?(%|€|Mio\.|Mrd\.|€/m²)?)</td>", r'<td class="num">\1</td>', body)
    parts = re.split(r'(<h2 id="quellen")', body, maxsplit=1)
    main = parts[0]
    main = walk_text(main, lambda t: CITE_RE.sub(r'<a class="cite" href="#q-\1">[\1]</a>', t))
    chunks = re.split(r"(?=<h2 )", main)
    main = "".join(link_terms(c, terms, page) for c in chunks)
    # Zeilenköpfe von Tabellen immer verlinken, auch wenn der Begriff im Abschnitt schon vorkam
    main = re.sub(r"(<tr>\s*<td>)((?:(?!</td>).)*?)(</td>)",
                  lambda m: m.group(1) + (m.group(2) if "<a " in m.group(2) else link_terms(m.group(2), terms, page))
                  + m.group(3), main, flags=re.S)
    if len(parts) > 1:
        src = parts[1] + parts[2]
        src = re.sub(r"<(li|p)>\s*\[(\d{1,3})\]", r'<\1 id="q-\2">[\2]', src)
        src = src.replace("<ul>", '<ul class="sources">', 1)
        main += src
    return main


def page_html(title, slug_out, body, toc, source_md):
    nav = "".join(
        f'<a href="{o}.html"{" aria-current=\"page\"" if o == slug_out else ""}>{html.escape(t)}</a>'
        for _, o, t, _ in PAGES) + f'<a href="glossar.html"{" aria-current=\"page\"" if slug_out == "glossar" else ""}>Glossar</a>'
    src = f'<a href="../wiki/{source_md}">Markdown-Quelle</a> · ' if source_md else ""
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    toc = toc.replace('<div class="toc">', "<div>", 1)
    toc_html = f'<nav class="toc" aria-label="Inhalt"><div class="toc-title">Inhalt</div>{toc}</nav>' if toc else '<nav class="toc"></nav>'
    return f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} · kundenportal-demo</title>
<link rel="stylesheet" href="assets/report.css">
<script src="assets/report.js"></script>
</head>
<body>
<header class="topbar"><a class="brand" href="index.html">kundenportal-demo · Konzept</a><nav class="topnav">{nav}</nav>
<button class="theme-toggle" type="button">Dunkel</button></header>
<div class="layout">{toc_html}<main>{body}</main></div>
<footer class="site">{src}Generiert {now} aus <code>docs/wiki</code> mit <code>scripts/build_reports.py</code></footer>
</body>
</html>
"""


def inline_md(text):
    h = markdown.markdown(text)
    return re.sub(r"^<p>|</p>$", "", h.strip())


def glossary_html(terms, names):
    local = lambda t: "#" + slug(t["name"])
    cats = list(dict.fromkeys(t["cat"] for t in terms))
    first = lambda t: t["name"][0].upper() if t["name"][0].isalpha() else "#"
    letters = sorted({first(t) for t in terms})
    alpha = sorted(terms, key=lambda t: t["name"].lower())
    jump = " ".join(
        f'<details class="az"><summary>{L}</summary>'
        + " · ".join(f'<a href="{local(t)}">{html.escape(t["name"])}</a>' for t in alpha if first(t) == L)
        + "</details>" for L in letters)
    parts = [f"<h1>Glossar</h1><p>{len(terms)} Begriffe, nach Themen gruppiert. Jeder Eintrag nennt, "
             "was der Begriff bedeutet und was ihm außerhalb von AWS entspricht (andere Clouds, Open Source, "
             "Java-/Self-Hosting-Welt). Auf den Berichtsseiten ist das erste Vorkommen je Abschnitt hierher verlinkt; "
             "beim Überfahren mit der Maus erscheint die Kurzerklärung.</p>"
             f'<div class="az-index"><strong>A–Z:</strong> {jump}</div>']
    for c in cats:
        parts.append(f'<h2 id="{slug(c)}">{html.escape(c)}</h2><dl class="glossary">')
        for t in (t for t in terms if t["cat"] == c):
            desc = link_terms(inline_md(t["desc"]), terms, None, skip=t["name"], href=local)
            extra = ""
            if t["also"]:
                extra += f'<div class="also">Auch: {html.escape(t["also"])}</div>'
            if t["alt"]:
                alt = link_terms(inline_md(t["alt"]), terms, None, skip=t["name"], href=local)
                extra += f'<div class="alt"><strong>Außerhalb von AWS:</strong> {alt}</div>'
            if t["urls"]:
                extra += "<div>" + " · ".join(
                    f'<a href="{u}">{html.escape(re.sub(r"^https?://", "", u)[:80])}</a>' for u in t["urls"]) + "</div>"
            if t["pages"]:
                extra += '<div class="used">Vorkommen: ' + ", ".join(
                    f'<a href="{p}.html">{html.escape(names.get(p, p))}</a>' for p in t["pages"]) + "</div>"
            parts.append(f'<dt id="{slug(t["name"])}">{html.escape(t["name"])}</dt><dd>{desc}{extra}</dd>')
        parts.append("</dl>")
    dup = [n for n in dict.fromkeys(t["name"] for t in terms) if sum(t["name"] == n for t in terms) > 1]
    if dup:
        raise SystemExit(f"Glossar: doppelte Begriffe {dup}")
    toc = '<div class="toc"><ul>' + "".join(f'<li><a href="#{slug(c)}">{html.escape(c)}</a></li>' for c in cats) + "</ul></div>"
    return page_html("Glossar", "glossar", "".join(parts), toc, "glossar.md")


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    texts = {}
    for src, _, _, _ in PAGES:
        f = WIKI / f"{src}.md"
        if f.exists():
            texts[src] = f.read_text(encoding="utf-8")
    terms = load_glossary()
    for t in terms:
        t["rx"] = [alias_rx(a) for a in t["aliases"]]
    built = []
    for src, out, title, desc in PAGES:
        if src not in texts:
            continue
        charts = []
        md = markdown.Markdown(extensions=["tables", "toc", "sane_lists", "attr_list"], extension_configs={
            "toc": {"slugify": slugify_unicode, "toc_depth": "2-3", "permalink": "#", "permalink_class": "anchor"}})
        body = md.convert(preprocess(texts[src], charts))
        body = postprocess(body, charts, terms, out)
        if out == "index":
            cards = "".join(f'<a class="card" href="{o}.html"><h3>{html.escape(t)}</h3><p>{html.escape(d)}</p></a>'
                            for s, o, t, d in PAGES if o != "index" and s in texts)
            # A notice right below the title (blockquote, e.g. the link to the live demo) stays on top.
            body = re.sub(r"(</h1>\s*(?:<blockquote>.*?</blockquote>)?)", lambda m: m.group(1) + f'<div class="cards">{cards}</div>',
                          body, count=1, flags=re.S)
        (OUT / f"{out}.html").write_text(page_html(title, out, body, md.toc, f"{src}.md"), encoding="utf-8")
        built.append(out)
    names = {o: t for _, o, t, _ in PAGES}
    (OUT / "glossar.html").write_text(glossary_html(terms, names), encoding="utf-8")
    print("gebaut:", ", ".join(built + ["glossar"]), f"· {len(terms)} Begriffe")


if __name__ == "__main__":
    build()
