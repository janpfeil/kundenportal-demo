"""SVG-Diagramme aus ```chart-Blöcken (JSON) der Wiki-Seiten."""
import html
import json
import math

W = 1000
FS = 14
CHAR = 0.6  # konservative Zeichenbreite in em (breite Schriften wie DejaVu Sans)
SERIES = ["f-s1", "f-s2", "f-s3"]


def esc(s):
    return html.escape(str(s), quote=True)


def tw(text, size=FS):
    return len(str(text)) * size * CHAR


def wrap(text, max_px, size=FS):
    words, lines, cur = str(text).split(), [], ""
    for w in words:
        cand = (cur + " " + w).strip()
        if tw(cand, size) <= max_px or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines or [""]


def fmt(v, unit=""):
    if isinstance(v, (int, float)):
        s = f"{v:,.1f}" if isinstance(v, float) and not float(v).is_integer() else f"{int(v):,}"
        s = s.replace(",", "X").replace(".", ",").replace("X", ".")
    else:
        s = str(v)
    return f"{s} {unit}".strip() if unit else s


def text(x, y, s, cls="t-ink2", size=FS, anchor="start", weight=None):
    w = f' font-weight="{weight}"' if weight else ""
    return f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" font-size="{size}" text-anchor="{anchor}"{w}>{esc(s)}</text>'


def bar_path(x, y, w, h, r=4):
    r = min(r, w / 2, h / 2)
    if w <= 0:
        return ""
    return (f"M{x:.1f},{y:.1f}h{w - r:.1f}a{r},{r} 0 0 1 {r},{r}v{h - 2 * r:.1f}"
            f"a{r},{r} 0 0 1 -{r},{r}h-{w - r:.1f}z")


def col_path(x, base, w, h, r=4):
    r = min(r, w / 2, h / 2)
    if h <= 0:
        return ""
    return (f"M{x:.1f},{base:.1f}v-{h - r:.1f}a{r},{r} 0 0 1 {r},-{r}h{w - 2 * r:.1f}"
            f"a{r},{r} 0 0 1 {r},{r}v{h - r:.1f}z")


def nice_max(v):
    if v <= 0:
        return 1
    e = 10 ** math.floor(math.log10(v))
    for m in (1, 2, 2.5, 5, 10):
        if v <= m * e:
            return m * e
    return 10 * e


def svg_wrap(h, body, label):
    return (f'<svg viewBox="0 0 {W} {h:.0f}" role="img" aria-label="{esc(label)}" '
            f'preserveAspectRatio="xMinYMin meet">{body}</svg>')


def table_view(headers, rows):
    th = "".join(f"<th>{esc(h)}</th>" for h in headers)
    tr = "".join("<tr>" + "".join(f"<td>{esc(c)}</td>" for c in r) + "</tr>" for r in rows)
    return (f'<details><summary>Daten als Tabelle</summary><div class="table-wrap">'
            f"<table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div></details>")


def legend(items):
    return '<div class="legend">' + "".join(
        f'<span style="--sw:var({c})">{esc(n)}</span>' for n, c in items) + "</div>"


def hbar(spec):
    data, unit = spec["data"], spec.get("unit", "")
    hl = set(spec.get("highlight", []))
    vmax = spec.get("max") or nice_max(max(d[1] for d in data))
    lw = min(max(tw(d[0]) for d in data) + 12, 380)
    x0, x1, row = lw + 8, W - 110, 30
    top = 24
    body = []
    for i in range(0, 5):
        gx = x0 + (x1 - x0) * i / 4
        body.append(f'<line class="grid" x1="{gx:.1f}" y1="{top - 6}" x2="{gx:.1f}" y2="{top + row * len(data)}"/>')
        body.append(text(gx, top - 10, fmt(vmax * i / 4, unit), "t-muted", 12, "middle"))
    for i, (lab, val, *rest) in enumerate(data):
        y = top + i * row
        note = rest[0] if rest else ""
        w = (x1 - x0) * val / vmax
        cls = "f-s2" if lab in hl else "f-s1"
        tip = f"{lab}: {fmt(val, unit)}" + (f" – {note}" if note else "")
        body.append(f'<g tabindex="0" data-tip="{esc(tip)}"><rect class="hit" x="0" y="{y}" width="{W}" height="{row}"/>')
        lab_s = lab if tw(lab) <= lw - 12 else lab[: int((lw - 12) / (FS * CHAR)) - 1] + "…"
        body.append(text(lw, y + row / 2 + 5, lab_s, "t-ink", FS, "end"))
        body.append(f'<path class="{cls}" d="{bar_path(x0, y + 6, w, row - 12)}"/>')
        body.append(text(x0 + w + 6, y + row / 2 + 5, fmt(val, unit), "t-ink2", 13) + "</g>")
    body.append(f'<line class="axis" x1="{x0}" y1="{top - 6}" x2="{x0}" y2="{top + row * len(data)}"/>')
    h = top + row * len(data) + 8
    rows = [[d[0], fmt(d[1], unit)] + ([d[2]] if len(d) > 2 else []) for d in data]
    hdr = ["Kategorie", "Wert"] + (["Anmerkung"] if any(len(d) > 2 for d in data) else [])
    return svg_wrap(h, "".join(body), spec.get("title", "")), table_view(hdr, rows)


def columns(spec):
    data, unit = spec["data"], spec.get("unit", "")
    vmax = spec.get("max") or nice_max(max(d[1] for d in data))
    x0, x1, top, base = 70, W - 20, 36, 316
    n = len(data)
    slot = (x1 - x0) / n
    bw = min(slot * 0.62, 70)
    body = []
    for i in range(0, 5):
        gy = base - (base - top) * i / 4
        body.append(f'<line class="grid" x1="{x0}" y1="{gy:.1f}" x2="{x1}" y2="{gy:.1f}"/>')
        body.append(text(x0 - 8, gy + 4, fmt(vmax * i / 4), "t-muted", 12, "end"))
    for i, (lab, val, *rest) in enumerate(data):
        cx = x0 + slot * i + slot / 2
        hgt = (base - top) * val / vmax
        tip = f"{lab}: {fmt(val, unit)}" + (f" – {rest[0]}" if rest else "")
        body.append(f'<g tabindex="0" data-tip="{esc(tip)}"><rect class="hit" x="{cx - slot / 2:.1f}" y="{top}" width="{slot:.1f}" height="{base - top + 30}"/>')
        body.append(f'<path class="f-s1" d="{col_path(cx - bw / 2, base, bw, hgt)}"/></g>')
        body.append(text(cx, base + 20, lab, "t-ink2", 13, "middle"))
    body.append(f'<line class="axis" x1="{x0}" y1="{base}" x2="{x1}" y2="{base}"/>')
    if unit:
        body.append(text(x0 - 8, 14, unit, "t-muted", 12, "end"))
    return svg_wrap(base + 32, "".join(body), spec.get("title", "")), table_view(
        ["Kategorie", f"Wert ({unit})" if unit else "Wert"], [[d[0], fmt(d[1])] for d in data])


def line(spec):
    xs, series, unit = spec["x"], spec["series"][:3], spec.get("unit", "")
    allv = [v for s in series for v in s["values"] if v is not None]
    vmin = spec.get("min", 0)
    vmax = spec.get("max") or nice_max(max(allv))
    x0, x1, top, base = 70, W - 170, 36, 316
    sx = lambda i: x0 + 30 + (x1 - x0 - 30) * i / max(1, len(xs) - 1)
    sy = lambda v: base - (base - top) * (v - vmin) / (vmax - vmin)
    body = []
    for i in range(0, 5):
        v = vmin + (vmax - vmin) * i / 4
        body.append(f'<line class="grid" x1="{x0}" y1="{sy(v):.1f}" x2="{x1}" y2="{sy(v):.1f}"/>')
        body.append(text(x0 - 8, sy(v) + 4, fmt(v), "t-muted", 12, "end"))
    step = max(1, math.ceil(len(xs) / 12))
    for i, xv in enumerate(xs):
        if i % step == 0 or i == len(xs) - 1:
            body.append(text(sx(i), base + 20, xv, "t-ink2", 13, "middle"))
    ends = []
    for k, s in enumerate(series):
        var = ["--s1", "--s2", "--s3"][k]
        pts = [(sx(i), sy(v)) for i, v in enumerate(s["values"]) if v is not None]
        d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts)
        body.append(f'<path d="{d}" fill="none" style="stroke:var({var})" stroke-width="2"/>')
        for i, v in enumerate(s["values"]):
            if v is None:
                continue
            tip = f"{s['name']} {xs[i]}: {fmt(v, unit)}"
            body.append(f'<g tabindex="0" data-tip="{esc(tip)}"><circle class="hit" cx="{sx(i):.1f}" cy="{sy(v):.1f}" r="11"/>'
                        f'<circle class="{SERIES[k]} ring" cx="{sx(i):.1f}" cy="{sy(v):.1f}" r="4"/></g>')
        ends.append([pts[-1][1], s["name"]])
    ends.sort()
    for j in range(1, len(ends)):
        ends[j][0] = max(ends[j][0], ends[j - 1][0] + 18)
    for y, name in ends:
        body.append(text(x1 + 10, y + 4, name, "t-ink", 13))
    body.append(f'<line class="axis" x1="{x0}" y1="{base}" x2="{x1}" y2="{base}"/>')
    if unit:
        body.append(text(x0 - 8, 14, unit, "t-muted", 12, "end"))
    rows = [[xs[i]] + [fmt(s["values"][i]) if s["values"][i] is not None else "–" for s in series] for i in range(len(xs))]
    lg = legend([(s["name"], ["--s1", "--s2", "--s3"][k]) for k, s in enumerate(series)]) if len(series) > 1 else ""
    return lg + svg_wrap(base + 32, "".join(body), spec.get("title", "")), table_view(["x"] + [s["name"] for s in series], rows)


def matrix(spec):
    cols, rows, states = spec["cols"], spec["rows"], spec["states"]
    lw = min(max(tw(r["label"]) for r in rows) + 12, 300)
    cw = min((W - lw - 10) / len(cols), 70)
    ch, top = 26, 30
    body = []
    for j, c in enumerate(cols):
        body.append(text(lw + 10 + cw * j + cw / 2, top - 10, c, "t-ink2", 12, "middle"))
    for i, r in enumerate(rows):
        y = top + i * ch
        body.append(text(lw, y + ch / 2 + 5, r["label"], "t-ink", FS, "end"))
        for j, v in enumerate(r["cells"]):
            st = states.get(v, {"label": v, "cls": "f-neutral"})
            tip = f"{r['label']} · {cols[j]}: {st['label']}"
            body.append(f'<rect tabindex="0" data-tip="{esc(tip)}" class="{st["cls"]} ring" x="{lw + 10 + cw * j:.1f}" y="{y}" width="{cw:.1f}" height="{ch}" rx="4"/>')
    h = top + ch * len(rows) + 6
    lg = legend([(s["label"], "--" + s["cls"][2:].replace("seq", "seq-")) for s in states.values()])
    trows = [[r["label"]] + [states.get(v, {"label": v})["label"] for v in r["cells"]] for r in rows]
    return lg + svg_wrap(h, "".join(body), spec.get("title", "")), table_view([""] + cols, trows)


def scatter(spec):
    pts, groups = spec["points"], spec.get("groups", [])[:3]
    x0, x1, top, base = 70, W - 30, 20, 520
    sx = lambda v: x0 + (x1 - x0) * v / 10
    sy = lambda v: base - (base - top) * v / 10
    body = [f'<rect class="f-surface2" x="{x0}" y="{top}" width="{x1 - x0}" height="{base - top}" rx="6"/>',
            f'<line class="axis" x1="{sx(5):.1f}" y1="{top}" x2="{sx(5):.1f}" y2="{base}" stroke-dasharray="4 4"/>',
            f'<line class="axis" x1="{x0}" y1="{sy(5):.1f}" x2="{x1}" y2="{sy(5):.1f}" stroke-dasharray="4 4"/>']
    for q in spec.get("quadrants", []):
        qx, qy, lab = q
        body.append(text(sx(qx), sy(qy), lab, "t-muted", 12, "middle"))
    for p in pts:
        k = groups.index(p["group"]) if p.get("group") in groups else 0
        cx, cy = sx(p["x"]), sy(p["y"])
        tip = f"{p['label']} ({p.get('group', '')}): {spec['xlabel']} {p['x']}, {spec['ylabel']} {p['y']}"
        body.append(f'<g tabindex="0" data-tip="{esc(tip)}"><circle class="hit" cx="{cx:.1f}" cy="{cy:.1f}" r="12"/>'
                    f'<circle class="{SERIES[k]} ring" cx="{cx:.1f}" cy="{cy:.1f}" r="7"/></g>')
        dx, dy = p.get("dx", 11), p.get("dy", 4)
        anchor = "end" if dx < 0 else "start"
        body.append(text(cx + dx, cy + dy, p["label"], "t-ink", 13, anchor))
    body.append(text((x0 + x1) / 2, base + 30, spec["xlabel"] + " →", "t-ink2", 13, "middle"))
    body.append(f'<text x="22" y="{(top + base) / 2:.0f}" class="t-ink2" font-size="13" text-anchor="middle" '
                f'transform="rotate(-90 22 {(top + base) / 2:.0f})">{esc(spec["ylabel"])} →</text>')
    lg = legend([(g, ["--s1", "--s2", "--s3"][i]) for i, g in enumerate(groups)])
    rows = [[p["label"], p.get("group", ""), p["x"], p["y"]] for p in pts]
    return lg + svg_wrap(base + 42, "".join(body), spec.get("title", "")), table_view(
        ["Anbieter", "Gruppe", spec["xlabel"], spec["ylabel"]], rows)


def timeline(spec):
    ev = spec["events"]
    dx, tx = 150, 180
    body, y = [], 16
    ys = []
    for date, label in ev:
        lines = wrap(label, W - tx - 20)
        ys.append((y, date, lines))
        y += max(1, len(lines)) * 20 + 14
    body.append(f'<line class="axis" x1="{dx + 12}" y1="10" x2="{dx + 12}" y2="{y - 10}"/>')
    for yy, date, lines in ys:
        body.append(f'<g tabindex="0" data-tip="{esc(date + ": " + " ".join(lines))}">')
        body.append(text(dx - 6, yy + 10, date, "t-ink2", 13, "end", 600))
        body.append(f'<circle class="f-s1 ring" cx="{dx + 12}" cy="{yy + 5}" r="6"/>')
        for k, ln in enumerate(lines):
            body.append(text(tx, yy + 10 + k * 20, ln, "t-ink", FS))
        body.append("</g>")
    return svg_wrap(y, "".join(body), spec.get("title", "")), table_view(["Datum", "Ereignis"], ev)


def flow(spec):
    layers, edges = spec["layers"], spec.get("edges", [])
    n = len(layers)
    gap = spec.get("gap", 70)
    bw = (W - gap * (n - 1) - 20) / n
    pos, body, maxy = {}, [], 0
    for li, layer in enumerate(layers):
        x = 10 + li * (bw + gap)
        body.append(text(x + bw / 2, 18, layer["title"], "t-muted", 12, "middle", 600))
        y = 32
        for node in layer["nodes"]:
            name, sub = (node, "") if isinstance(node, str) else (node[0], node[1])
            nl = wrap(name, bw - 20, 13)
            sl = wrap(sub, bw - 20, 12) if sub else []
            h = 16 + len(nl) * 19 + len(sl) * 17
            cls = "box-accent" if layer.get("accent") else "box"
            body.append(f'<rect class="{cls}" x="{x:.1f}" y="{y}" width="{bw:.1f}" height="{h}" rx="6"/>')
            for k, ln in enumerate(nl):
                body.append(text(x + 10, y + 21 + k * 19, ln, "t-ink", 13, weight=600))
            for k, ln in enumerate(sl):
                body.append(text(x + 10, y + 21 + len(nl) * 19 + k * 17, ln, "t-ink2", 12))
            pos[name] = (x, y, bw, h)
            y += h + 12
        maxy = max(maxy, y)
    body.insert(0, '<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
                   'orient="auto-start-reverse"><path class="edge-head" d="M0,0L10,5L0,10z"/></marker></defs>')
    for a, b in edges:
        if a not in pos or b not in pos:
            continue
        ax, ay, aw, ah = pos[a]
        bx, by, bw2, bh = pos[b]
        x1, y1, x2, y2 = ax + aw, ay + ah / 2, bx, by + bh / 2
        mx = (x1 + x2) / 2
        body.append(f'<path class="edge" marker-end="url(#ah)" d="M{x1:.1f},{y1:.1f} C{mx:.1f},{y1:.1f} {mx:.1f},{y2:.1f} {x2 - 2:.1f},{y2:.1f}"/>')
    rows = [[l["title"], (n if isinstance(n, str) else f"{n[0]} ({n[1]})")] for l in layers for n in l["nodes"]]
    return svg_wrap(maxy + 4, "".join(body), spec.get("title", "")), table_view(["Schicht", "Komponente"], rows)


def risk(spec):
    rs = spec["risks"]
    x0, top, cell = 120, 20, 90
    body = []
    for p in range(1, 6):
        for i in range(1, 6):
            sc = p * i
            cls = "f-seq1" if sc <= 4 else ("f-seq2" if sc <= 9 else ("f-seq3" if sc <= 15 else "f-seq4"))
            body.append(f'<rect class="{cls} ring" x="{x0 + (p - 1) * cell}" y="{top + (5 - i) * cell}" width="{cell}" height="{cell}" rx="4"/>')
    for k in range(1, 6):
        body.append(text(x0 + (k - 0.5) * cell, top + 5 * cell + 20, str(k), "t-ink2", 13, "middle"))
        body.append(text(x0 - 10, top + (5 - k + 0.5) * cell + 5, str(k), "t-ink2", 13, "end"))
    body.append(text(x0 + 2.5 * cell, top + 5 * cell + 42, "Eintrittswahrscheinlichkeit →", "t-ink2", 13, "middle"))
    body.append(f'<text x="40" y="{top + 2.5 * cell:.0f}" class="t-ink2" font-size="13" text-anchor="middle" transform="rotate(-90 40 {top + 2.5 * cell:.0f})">Auswirkung →</text>')
    cellpos = {}
    for r in rs:
        key = (r["p"], r["i"])
        n = cellpos.get(key, 0)
        cellpos[key] = n + 1
        cx = x0 + (r["p"] - 1) * cell + 24 + (n % 3) * 22
        cy = top + (5 - r["i"]) * cell + 24 + (n // 3) * 26
        tip = f"{r['id']} {r['label']} – Eintritt {r['p']}, Wirkung {r['i']}" + (f"; Gegenmaßnahme: {r['m']}" if r.get("m") else "")
        body.append(f'<g tabindex="0" data-tip="{esc(tip)}"><circle class="f-surface" style="stroke:var(--ink)" stroke-width="1.5" cx="{cx}" cy="{cy}" r="11"/>'
                    + text(cx, cy + 4, r["id"].replace("R", ""), "t-ink", 11, "middle", 700) + "</g>")
    lx = x0 + 5 * cell + 30
    ly = top + 14
    for r in rs:
        for k, ln in enumerate(wrap(f"{r['id']}: {r['label']}", W - lx - 10, 13)):
            body.append(text(lx, ly, ln, "t-ink" if k == 0 else "t-ink2", 13))
            ly += 18
        ly += 4
    h = max(top + 5 * cell + 52, ly)
    rows = [[r["id"], r["label"], r["p"], r["i"], r["p"] * r["i"], r.get("m", "")] for r in rs]
    lg = legend([("Score ≤ 4", "--seq-1"), ("5–9", "--seq-2"), ("10–15", "--seq-3"), ("≥ 16", "--seq-4")])
    return lg + svg_wrap(h, "".join(body), spec.get("title", "")), table_view(
        ["ID", "Risiko", "Eintritt", "Wirkung", "Score", "Gegenmaßnahme"], rows)


KINDS = {"hbar": hbar, "columns": columns, "line": line, "matrix": matrix, "scatter": scatter,
         "timeline": timeline, "flow": flow, "risk": risk}


def render(raw):
    spec = json.loads(raw)
    if spec["type"] == "stats":
        tiles = "".join(f'<div class="stat"><div class="v">{esc(v)}</div><div class="l">{esc(l)}</div></div>'
                        for v, l in spec["items"])
        return f'<div class="stats">{tiles}</div>'
    svg, tbl = KINDS[spec["type"]](spec)
    sub = f'<div class="sub">{esc(spec["subtitle"])}</div>' if spec.get("subtitle") else ""
    foot = f'<div class="foot">{esc(spec["source"])}</div>' if spec.get("source") else ""
    return (f'<figure class="chart"><figcaption>{esc(spec.get("title", ""))}</figcaption>{sub}'
            f"{svg}{foot}{tbl}</figure>")
