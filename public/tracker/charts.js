// Tiny dependency-free SVG charts. Series are told apart by marker shape and
// line dash as well as colour, and every chart carries a text summary plus a
// collapsible data table for screen-reader / non-visual use.

const W = 340, H = 170, M = { l: 34, r: 8, t: 10, b: 24 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (v) => (Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1));

function scales(n, yMin, yMax) {
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  return {
    x: (i) => M.l + (n <= 1 ? pw / 2 : (i * pw) / (n - 1)),
    y: (v) => M.t + ph - ((v - yMin) / (yMax - yMin || 1)) * ph,
    ticks: [yMin, (yMin + yMax) / 2, yMax],
  };
}
function frame(labels, sc, yLabel) {
  let s = `<g class="axis">`;
  for (const t of sc.ticks) s += `<line x1="${M.l}" x2="${W - M.r}" y1="${sc.y(t)}" y2="${sc.y(t)}" class="grid"/><text x="${M.l - 4}" y="${sc.y(t) + 4}" text-anchor="end">${fmt(t)}</text>`;
  const last = labels.length - 1;
  if (labels.length) {
    s += `<text x="${sc.x(0)}" y="${H - 6}" text-anchor="start">${esc(labels[0])}</text>`;
    if (last > 0) s += `<text x="${sc.x(last)}" y="${H - 6}" text-anchor="end">${esc(labels[last])}</text>`;
  }
  if (yLabel) s += `<text x="4" y="8" class="ylabel">${esc(yLabel)}</text>`;
  return s + `</g>`;
}
const marker = (kind, x, y, cls) =>
  kind === "square" ? `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" class="${cls}"/>`
  : kind === "none" ? "" : `<circle cx="${x}" cy="${y}" r="3.2" class="${cls}"/>`;

function wrap(title, summary, svg, legend, table) {
  const head = table.head.map((h) => `<th scope="col">${esc(h)}</th>`).join("");
  const rows = table.rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${esc(c ?? "—")}</td>` : `<th scope="row">${esc(c)}</th>`)).join("")}</tr>`).join("");
  return `<figure class="chart"><figcaption>${esc(title)}</figcaption>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}. ${esc(summary)}">${svg}</svg>
  ${legend ? `<div class="legend">${legend}</div>` : ""}
  <p class="sr-summary">${esc(summary)}</p>
  <details><summary>Data table</summary><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></details></figure>`;
}

// series: [{name, cls:'s1'|'s2'|'s3', dash:bool, marker, points:[number|null per label]}]
export function lineChart({ title, labels, series, yMin, yMax, yLabel, summary }) {
  const sc = scales(labels.length, yMin, yMax);
  let svg = frame(labels, sc, yLabel), legend = "";
  for (const s of series) {
    const pts = s.points.map((v, i) => (v == null ? null : [sc.x(i), sc.y(v)]));
    let d = "", pen = false;
    for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`; pen = true; }
    if (s.line !== false && d) svg += `<path d="${d}" class="line ${s.cls}${s.dash ? " dash" : ""}"/>`;
    pts.forEach((p) => { if (p) svg += marker(s.marker || "circle", p[0], p[1], `mk ${s.cls}`); });
    legend += `<span class="lg"><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" class="line ${s.cls}${s.dash ? " dash" : ""}"/>${marker(s.marker || "circle", 11, 5, `mk ${s.cls}`)}</svg>${esc(s.name)}</span>`;
  }
  return wrap(title, summary, svg, legend, {
    head: ["Date", ...series.map((s) => s.name)],
    rows: labels.map((l, i) => [l, ...series.map((s) => (s.points[i] == null ? null : fmt(s.points[i])))]),
  });
}

export function barChart({ title, labels, values, yMax, target, yLabel, summary, unit = "" }) {
  const max = Math.max(yMax || 0, target || 0, ...values.filter((v) => v != null), 1);
  const sc = scales(labels.length, 0, max);
  const bw = Math.max(3, ((W - M.l - M.r) / Math.max(labels.length, 1)) * 0.65);
  let svg = frame(labels, sc, yLabel);
  values.forEach((v, i) => { if (v != null) svg += `<rect x="${sc.x(i) - bw / 2}" y="${sc.y(v)}" width="${bw}" height="${sc.y(0) - sc.y(v)}" class="bar s1"/>`; });
  let legend = "";
  if (target) {
    svg += `<line x1="${M.l}" x2="${W - M.r}" y1="${sc.y(target)}" y2="${sc.y(target)}" class="line s3 dash"/>`;
    legend = `<span class="lg"><svg width="22" height="10" aria-hidden="true"><line x1="0" x2="22" y1="5" y2="5" class="line s3 dash"/></svg>Target ${fmt(target)}${unit}</span>`;
  }
  return wrap(title, summary, svg, legend, { head: ["Date", title], rows: labels.map((l, i) => [l, values[i] == null ? null : fmt(values[i]) + unit]) });
}
