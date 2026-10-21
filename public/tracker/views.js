// Rendering only: each view takes (state, ui) and returns an HTML string.
// All user-editable text is passed through esc(). Interaction lives in app.js.

import * as L from "./logic.js";
import { lineChart, barChart } from "./charts.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const attrs = (o) => Object.entries(o).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ");
// data-fk lets app.js restore keyboard focus after a re-render.
export function btn(label, d, { on, cls = "", disabled, long, aria } = {}) {
  return `<button type="button" class="${cls}" ${attrs(d)} data-fk="${esc(JSON.stringify(d))}"${on !== undefined ? ` aria-pressed="${!!on}"` : ""}${disabled ? ' aria-disabled="true"' : ""}${long ? " data-long=\"1\"" : ""}${aria ? ` aria-label="${esc(aria)}"` : ""}>${label}</button>`;
}
const nf = (n) => Math.round(n).toLocaleString("en-US");
const GLYPH = { done: "✓", partial: "◐", skipped: "⊘", substituted: "⇄", none: "○" };
const STATE_TEXT = { done: "Done", partial: "Partial", skipped: "Skipped", substituted: "Substituted", none: "Not logged" };
const dateLabel = (d) => L.parseYmd(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const shortDate = (d) => L.parseYmd(d).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });

function progress(label, value, target, unit) {
  const pct = target ? Math.min(100, (100 * value) / target) : 0;
  return `<div><div class="row between"><span>${label}</span><span><strong>${nf(value)}</strong> / ${nf(target)}${unit}</span></div>
  <div class="bar-track" role="progressbar" aria-label="${label}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${Math.round(value)}"><div class="bar-fill${value > target * 1.1 ? " over" : ""}" style="width:${pct}%"></div></div></div>`;
}
export const lastWeight = (S, date) => {
  for (let d = date, i = 0; i < 120; i++, d = L.addDays(d, -1)) { const w = L.getDay(S, d).weight; if (w) return w.lb; }
  return S.profile.startingWeight;
};

// ---------- Header / tabs ----------

export function header(S, ui, canUndo) {
  const today = L.ymd(), isToday = ui.date === today;
  const { week, phase } = L.phaseForDate(S, ui.date);
  return `<div class="row between"><h1>Gain Tracker</h1>
    ${btn("↶ Undo", { a: "undo" }, { disabled: !canUndo, aria: "Undo last change" })}</div>
  <div class="row" style="margin-top:6px">
    ${btn("◀", { a: "day", v: -1 }, { aria: "Previous day" })}
    <input type="date" value="${ui.date}" data-c="date" aria-label="Choose date" />
    ${btn("▶", { a: "day", v: 1 }, { aria: "Next day" })}
    ${isToday ? "" : btn("Today", { a: "today" })}
  </div>
  <p class="muted" style="margin:6px 0 0">${dateLabel(ui.date)}${isToday ? " · today" : " · <strong>editing another day</strong>"} ·
  ${week >= 1 ? `Week ${week}, Phase ${phase.n}: ${phase.name}` : "Before start date"} · ${esc(L.SCHEDULE[L.weekdayOf(ui.date)].label)}</p>`;
}
export const TABS = [["today", "☀️", "Today"], ["workout", "🏋️", "Workout"], ["recovery", "🧘", "Recovery"], ["progress", "📈", "Progress"], ["settings", "⚙️", "Settings"]];
export const tabs = (ui) => TABS.map(([id, ic, label]) => `<button type="button" data-a="tab" data-v="${id}"${ui.tab === id ? ' aria-current="page"' : ""}><span class="ic" aria-hidden="true">${ic}</span>${label}</button>`).join("");

// ---------- Today ----------

function mealCard(S, ui, slot) {
  const date = ui.date, p = L.currentPreset(S, date, slot.id), log = L.getDay(S, date).meals?.[slot.id];
  const alts = S.mealPresets.filter((x) => x.slot === slot.id);
  const cur = log ? log.multiplier : undefined;
  const chips = L.PORTIONS.map((o) => btn(o.label, { a: "meal", slot: slot.id, v: o.value }, { on: cur === o.value })).join("");
  const logged = log ? (log.multiplier > 0 ? `Logged: ${nf(log.calories * log.multiplier)} kcal · ${nf(log.protein * log.multiplier)} g protein` : "Logged: skipped (0 kcal)") : "Not logged";
  return `<section class="card" id="meal-${slot.id}" aria-label="${esc(slot.label)}">
    <div class="row between"><strong>${esc(p.label).toUpperCase()} · ${nf(p.calories)} kcal · ${nf(p.protein)}g protein</strong></div>
    <div class="chips" role="group" aria-label="${esc(slot.label)} portion" style="margin:8px 0">${chips}</div>
    <div class="muted">${logged}</div>
    ${alts.length > 1 ? `<label class="field">Swap meal <select data-c="swap" data-slot="${slot.id}">${alts.map((a) => `<option value="${esc(a.id)}"${a.id === p.id ? " selected" : ""}>${esc(a.label)} (${nf(a.calories)} kcal)</option>`).join("")}</select></label>` : ""}
    <details><summary class="small muted">Ingredients</summary><p class="small">${esc(p.ingredients)}</p></details></section>`;
}

function checklist(S, ui) {
  const items = L.checklistFor(S, ui.date);
  const sections = [...new Set(items.map((i) => i.section))];
  return sections.map((sec) => `<h3>${sec}</h3><ul class="checklist">${items.filter((i) => i.section === sec).map((i) => {
    const st = L.checklistStatus(S, ui.date, i) || "none";
    const override = L.getDay(S, ui.date).checks?.[i.id];
    const nav = i.derive.type !== "manual" && i.derive.type !== "hydration";
    return `<li><button type="button" class="item" data-a="check" data-id="${i.id}" data-long="1" data-fk="check-${i.id}" aria-label="${esc(i.label)}: ${STATE_TEXT[st]}${override ? " (manually set)" : ""}. ${nav ? "Opens the control." : "Tap to toggle; long-press for Skipped, Partial or Substituted."}"><span class="glyph s-${st}" aria-hidden="true">${GLYPH[st]}</span><span style="flex:1">${esc(i.label)}</span><span class="state s-${st}">${STATE_TEXT[st]}${override ? "*" : ""}</span></button></li>`;
  }).join("")}</ul>`).join("") + `<p class="muted small">Tap an item to toggle or open it. Long-press for Skipped / Partial / Substituted. * = set by hand. “Not logged” never means skipped.</p>`;
}

export function today(S, ui) {
  const date = ui.date, tot = L.mealTotals(S, date), day = L.getDay(S, date);
  const nx = L.nextReminder(S, new Date());
  const w = day.weight, base = ui.weightDraft ?? w?.lb ?? lastWeight(S, date);
  const last = lastWeight(S, date);
  const wPresets = [-2, -1, 0, 1, 2].map((d) => { const v = Math.round((last + d) * 10) / 10; return btn(`${v.toFixed(1)}`, { a: "wset", v }, { on: base === v, aria: `Set ${v.toFixed(1)} pounds` }); }).join("");
  const boosters = S.boosters.map((b) => btn(`+${b.calories} kcal`, { a: "booster", id: b.id }, { disabled: !b.foods.trim(), aria: b.foods.trim() ? `Add ${b.calories} kcal: ${b.foods}` : `${b.calories} kcal booster, no foods assigned. Assign in Settings.` })).join("");
  return `<section class="card" aria-label="Daily totals"><h2>Today's totals</h2><div class="stack" aria-live="polite">
      ${progress("Calories", tot.calories, S.profile.calorieTarget, " kcal")}${progress("Protein", tot.protein, S.profile.proteinTarget, " g")}</div>
      <p class="muted small" style="margin:8px 0 0">Totals count only meals you tapped. Targets are estimates.</p>
      ${nx ? `<p class="small" style="margin:8px 0 0">Next reminder: <strong>${esc(nx.reminder.label)}</strong> · ${nx.at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</p>` : ""}</section>
    ${L.SLOTS.map((s) => mealCard(S, ui, s)).join("")}
    <section class="card"><h2>Calorie boosters</h2><div class="row">${boosters}</div>
      ${(day.boosters || []).map((b) => `<div class="row between small" style="margin-top:6px"><span>+${b.calories} kcal · ${esc(b.foods)}</span>${btn("Remove", { a: "rmbooster", id: b.id }, { cls: "link" })}</div>`).join("")}
      <p class="muted small">Boosters need foods assigned in Settings; unassigned ones add nothing.</p></section>
    <section class="card" id="weight" aria-label="Weight"><h2>Morning weight</h2>
      <div class="row between"><span class="big">${base.toFixed(1)} lb</span><span class="muted">${w ? `Logged ${w.lb.toFixed(1)} lb` : "Not logged"}</span></div>
      <div class="row" style="margin:8px 0">${btn("−0.5", { a: "wstep", v: -0.5 }, { aria: "Minus half a pound" })}${btn("+0.5", { a: "wstep", v: 0.5 }, { aria: "Plus half a pound" })}
        <div class="chips" role="group" aria-label="Preset weights near last reading" style="flex:1">${wPresets}</div></div>
      <div class="row">${btn(w && w.lb === base ? "Logged ✓" : "Log weight", { a: "wlog" }, { cls: "primary" })}${w ? btn("Clear", { a: "wclear" }) : ""}</div></section>
    <section class="card"><h2>Sleep last night</h2><div class="chips" role="group" aria-label="Sleep duration">
      ${L.SLEEP_BANDS.map((b) => btn(b.label, { a: "sleep", v: b.id }, { on: day.sleepBand === b.id })).join("")}</div>
      <p class="muted small">Target 7–9 h.${day.sleepBand ? (L.SLEEP_ON_TARGET.includes(day.sleepBand) ? " On target." : " Outside the 7–9 h target.") : ""}</p></section>
    <section class="card"><h2>Daily checklist</h2>${checklist(S, ui)}</section>
    ${lists(S, ui)}`;
}

function lists(S, ui) {
  const wk = L.weekStartOf(ui.date);
  const mk = (title, key, items) => `<details class="card"><summary><strong>${title}</strong></summary><ul class="checklist">${items.map((it) => `<li>${btn(`<span class="glyph" aria-hidden="true">${S.lists[key]?.[it] ? "✓" : "○"}</span> ${esc(it)}`, { a: "list", key, item: it }, { cls: "item", on: !!S.lists[key]?.[it] })}</li>`).join("")}</ul></details>`;
  return mk("Weekly grocery checklist (≈ $67–93/week; local prices unverified)", `grocery|${wk}`, L.GROCERIES) + mk("Sunday meal-prep checklist", `prep|${wk}`, L.MEAL_PREP);
}

// ---------- Workout ----------

export function workout(S, ui) {
  const date = ui.date, routine = L.routineForDate(S, date), sched = L.SCHEDULE[L.weekdayOf(date)];
  const day = L.getDay(S, date), skipped = day.workout?.skipped;
  const ov = day.workout?.override;
  const opts = [["", "Scheduled"], ["A", "A"], ["B", "B"], ["walk", "Walk"], ["rest", "Rest"]];
  const picker = `<div class="chips" role="group" aria-label="Today's routine">${opts.map(([v, l]) => btn(l, { a: "override", v }, { on: (ov || "") === v })).join("")}</div>`;
  let body;
  if (!L.isLoadedRoutine(routine)) {
    const walked = day.checks?.walk?.status === "done";
    body = `<p>${routine === "walk" ? "Recovery walk or gentle mobility. Keep arms relaxed; nothing here counts against workout adherence." : "Rest day. Nothing here counts against workout adherence."}</p>
      ${routine === "walk" ? btn(walked ? "Walk done" : "Mark walk done", { a: "walkdone" }, { on: walked }) : ""}`;
  } else {
    const exs = L.exercisesForDate(S, date), prog = L.workoutProgress(S, date);
    const hasUpper = exs.some((e) => e.clearanceRequired);
    const rd = day.readiness || {}, rdOk = L.READINESS.every((r) => rd[r.id]);
    const readiness = hasUpper ? `<div class="alert ${rdOk ? "info" : ""}"><strong>Upper-body readiness</strong>
      <div class="stack" style="margin-top:6px">${L.READINESS.map((r) => btn(r.label, { a: "ready", id: r.id }, { on: !!rd[r.id] })).join("")}</div>
      <p class="small" style="margin:8px 0 0">${rdOk ? "All clear for today. Add load or reps gradually; stop if symptoms appear." : "If any of these is a no, do the lower-body sets only today and skip the upper-body ones."}</p></div>` : "";
    const w = L.waveInfo(S, date);
    const wave = `<div class="alert info"><strong>Week ${w.weekInBlock + 1} of 4${w.deload ? " — deload" : ""}</strong> · stop each set with ${w.rir}. Never to failure.
      <div class="small" style="margin-top:4px">If you add load: aim for ${w.reps} reps. When every set hits the top of the range with 2+ reps left, add the smallest increment next time. Rest 2–3 min on the big lifts.${L.isDensityWeek(S, date) ? " <strong>Density week:</strong> the marked leg lift is 8 sets with short rests. Keep it to about 2 reps in reserve, use a load where the last sets are hard but clean, and stop early if form or neck/elbow comfort slips." : ""}</div></div>`;
    body = `${wave}${readiness}<p class="muted">${prog.done} / ${prog.total} sets done · rest ~45–90 s between sets.</p>
    ${exs.map((e) => `<div style="margin:12px 0"><strong>${esc(e.name)}</strong> <span class="muted">${e.sets} × ${esc(e.reps)}</span>${e.isDensity ? ` <span class="state s-partial">Density block: rest 60–90 s</span>` : ""}${e.cue ? `<div class="muted small">${esc(e.cue)}</div>` : ""}
      <div class="setgrid" style="margin-top:6px">${Array.from({ length: e.sets }, (_, i) => {
        const st = day.sets?.[L.setKey(e.id, i)]?.status || "none";
        return `<button type="button" data-a="set" data-ex="${e.id}" data-i="${i}" data-long="1" data-fk="set-${e.id}-${i}" aria-pressed="${st === "done"}" aria-label="${esc(e.name)} set ${i + 1} of ${e.sets}: ${STATE_TEXT[st]}. Long-press for more."><span aria-hidden="true">${GLYPH[st]}</span> Set ${i + 1} of ${e.sets}${st !== "none" && st !== "done" ? ` (${STATE_TEXT[st]})` : ""}</button>`;
      }).join("")}</div></div>`).join("")}
    <div class="alert">Stop if neck or elbow symptoms are provoked. Keep arms relaxed, neck neutral, and don't support weight on the injured arm.
      <div style="margin-top:8px">${btn("Symptoms provoked — stop & check in", { a: "provoked" }, { cls: "danger" })}</div></div>
    <div class="row">${btn(skipped ? "Workout skipped (tap to undo)" : "Skip today's workout", { a: "skipworkout" }, { on: !!skipped })}</div>`;
  }
  const locked = L.UPPER_BODY.filter((u) => !L.isExerciseUnlocked(S, u.id));
  return `<section class="card"><h2>${esc(sched.label)}${ov ? ` → <em>${ov === "walk" ? "Walk" : ov === "rest" ? "Rest" : `Workout ${ov}`}</em>` : ""}</h2>${picker}
    <div id="rest-box" class="row" style="margin:10px 0"><span class="timer" id="rtime" aria-live="off">${ui.rest ? "" : ""}</span>
      ${ui.rest ? btn("Cancel rest", { a: "restcancel" }) : ""}</div>
    <div class="row small" role="group" aria-label="Rest timer length"><span class="muted">Auto-rest after a set:</span>${[0, ...L.REST_OPTIONS].map((n) => btn(n ? (n >= 120 ? `${n / 60}m` : `${n}s`) : "Off", { a: "restlen", v: n }, { on: ui.restLen === n })).join("")}</div>
    ${body}</section>
    <section class="card locked"><h2>🔒 Upper-body exercises (locked)</h2>
      <p class="muted small">These unlock only after you record clinician clearance <em>and</em> flag each exercise as cleared and pain-free in Settings → Injury clearance. The calendar never unlocks them. Until then, keep training legs.</p>
      <ul class="checklist">${locked.map((u) => `<li><span class="glyph" aria-hidden="true">🔒</span><span>${esc(u.name)} <span class="muted small">— ${S.clearance.ladder.clearance ? "needs cleared + pain-free flags" : "needs documented clearance"}</span></span></li>`).join("")}</ul>
      <p class="small"><strong>Avoid for now:</strong> curls, chin-ups, heavy rows, heavy carrying, forceful palm-up twisting, painful golf swings, shoulder-loaded yoga.</p></section>
    <details class="card"><summary><strong>90-day phases</strong></summary><table class="plain"><thead><tr><th>Phase</th><th>Plan</th><th>Advance only when…</th></tr></thead><tbody>
      ${L.PHASES.map((p) => `<tr><td><strong>${p.n} ${p.name}</strong><br><span class="muted">Wk ${p.weeks}</span></td><td>${p.plan}</td><td>${p.gate}</td></tr>`).join("")}</tbody></table>
      <p class="muted small">Weeks are a guide, not a gate. Nothing auto-unlocks on a week number.</p></details>`;
}

// ---------- Recovery ----------

function trendCharts(S, ui) {
  const labels = [], days = [];
  for (let i = 6; i >= 0; i--) { const d = L.addDays(ui.date, -i); days.push(d); labels.push(shortDate(d)); }
  const mk = (area, title, cls, dash, m) => {
    const pts = days.map((d) => L.painDaily(S, d, area));
    const have = pts.filter((v) => v != null);
    const sum = have.length ? `Logged on ${have.length} of 7 days; latest ${have[have.length - 1]} out of 10, highest ${Math.max(...have)}.` : "No scores logged in the last 7 days.";
    return lineChart({ title, labels, yMin: 0, yMax: 10, yLabel: "0–10", summary: sum, series: [{ name: title, cls, dash, marker: m, points: pts }] });
  };
  return mk("elbow", "Right elbow/forearm pain (daily max)", "s1", false, "circle") + mk("neck", "Neck/trap pain (daily max)", "s2", true, "square");
}

export function recovery(S, ui) {
  const date = ui.date, tod = ui.painTod, rows = L.painRows(S, date, tod);
  const skipped = rows.some((r) => r.skipped), allNone = rows.length && rows.every((r) => r.redFlags?.includes("none") && r.severity === 0);
  const areas = ui.painAreas;
  const first = rows.find((r) => !r.skipped) || {};
  const areaOpts = [["elbow", "Right elbow/forearm", ["elbow"]], ["neck", "Neck/trap", ["neck"]], ["both", "Both", ["elbow", "neck"]], ["none", "None", []]];
  const areaKey = areas.length === 2 ? "both" : areas.length === 1 ? areas[0] : "none";
  const chipRow = (label, key, list, cur) => `<h3>${label}</h3><div class="chips" role="group" aria-label="${label}">${list.map((v) => btn(v, { a: "pain", k: key, v }, { on: cur === v })).join("")}</div>`;
  const form = skipped ? `<p class="muted">Skipped — no score recorded. Tap any score below to log one instead.</p>` : "";
  const sevRows = areas.map((a) => {
    const r = rows.find((x) => x.area === a), name = L.PAIN.areas.find((x) => x.id === a).label;
    return `<h3>${name} severity (0–10)</h3><div class="chips sev" role="group" aria-label="${name} severity">${Array.from({ length: 11 }, (_, n) => btn(n, { a: "sev", area: a, v: n }, { on: r?.severity === n, aria: `${name} pain ${n} out of 10` })).join("")}</div>`;
  }).join("");
  const adviceAll = L.painAdvice(L.painRows(S, date));
  const stages = L.YOGA_STAGES.map((s) => {
    const st = L.getDay(S, date).yogaStages?.[s.id]?.status || "none";
    return `<li>${btn(`<span class="glyph s-${st}" aria-hidden="true">${GLYPH[st]}</span><span style="flex:1">${esc(s.label)} — ${s.minutes} min</span><span class="state s-${st}">${STATE_TEXT[st]}</span>`, { a: "stage", id: s.id }, { cls: "item", long: true, aria: `${s.label}, ${s.minutes} minutes: ${STATE_TEXT[st]}` })}</li>`;
  }).join("");
  const y = ui.yoga;
  return `${adviceAll ? `<div class="alert ${adviceAll.level === "red" ? "red" : ""}" role="alert"><strong>${adviceAll.level === "red" ? "⚠ Get assessed" : "Note"}:</strong> ${esc(adviceAll.text)}</div>` : ""}
  <section class="card"><h2>Symptom check-in</h2>
    <div class="chips" role="group" aria-label="When">${L.PAIN.times.map((t) => btn(t.label, { a: "ptod", v: t.id }, { on: tod === t.id })).join("")}</div>
    <h3>Area</h3><div class="chips" role="group" aria-label="Area">${areaOpts.map(([id, l, v]) => btn(l, { a: "parea", v: id }, { on: areaKey === id })).join("")}</div>
    ${form}${areaKey === "none" ? (allNone ? `<p>Logged: no symptoms.</p>` : `<p class="muted">Tap “None” again after choosing to record no symptoms.</p>`) : sevRows}
    ${areaKey !== "none" ? chipRow("Quality", "quality", L.PAIN.qualities, first.quality) + chipRow("Trigger", "trigger", L.PAIN.triggers, first.trigger) + chipRow("Compared with yesterday", "trend", L.PAIN.trends, first.trend) + `<h3>Warning signs</h3><div class="chips" role="group" aria-label="Warning signs">${L.PAIN.redFlags.map((f) => btn(f.label, { a: "flag", v: f.id }, { on: first.redFlags?.includes(f.id) })).join("")}${btn("None", { a: "flag", v: "none" }, { on: first.redFlags?.includes("none") })}</div>` : ""}
    <div class="row" style="margin-top:12px">${btn(skipped ? "Skipped ✓" : "Skip this check-in", { a: "pskip" }, { on: skipped })}${rows.length ? btn("Clear entry", { a: "pclear" }) : ""}</div>
    <p class="muted small">Logging helps you spot patterns; it is not a diagnosis or clearance. Deep pain at the front of the elbow with palm-up bending can involve the distal biceps tendon — have it assessed before loading or golfing. Electric or locking neck symptoms also warrant assessment.</p></section>
  <section class="card"><h2>7-day trend</h2>${trendCharts(S, ui)}<p class="muted small">Use this to guide your own review (and a clinician's), not as automatic clearance.</p></section>
  <section class="card"><h2>Evening yoga + meditation · 12 min</h2>
    ${y ? yogaRunner(ui) : `<div class="row">${btn("▶ Start 12-minute routine", { a: "yogastart" }, { cls: "primary" })}</div>`}
    <ul class="checklist" style="margin-top:10px">${stages}</ul>
    <p class="muted small"><strong>Avoid:</strong> neck circles, forceful twists, downward dog, hand-supported poses, and anything that reproduces elbow/neck symptoms. Tap a stage to mark it done; long-press for Skipped.</p></section>`;
}
function yogaRunner(ui) {
  const y = ui.yoga, st = L.YOGA_STAGES[y.idx];
  return `<div class="alert info"><div class="muted small">Stage ${y.idx + 1} of ${L.YOGA_STAGES.length}</div><strong>${esc(st.label)}</strong>
    <div class="timer" id="ytime" role="timer" aria-live="off"></div>
    <div class="row">${btn(y.paused ? "Resume" : "Pause", { a: "ypause" }, { cls: "primary" })}${btn("Skip stage", { a: "yskip" })}${btn("Done", { a: "ydone" })}${btn("End routine", { a: "yend" }, { cls: "danger" })}</div></div>`;
}

// ---------- Progress ----------

function reviewCard(S, ui) {
  const wk = L.weekStartOf(ui.date), end = L.addDays(wk, 6), r = S.weeklyReviews[wk] || {};
  const pts = L.weightPoints(S, wk, end);
  const avgW = pts.length ? pts.reduce((a, p) => a + p.lb, 0) / pts.length : null;
  let dl = 0, cal = 0, pro = 0, ep = [], np = [];
  for (let d = wk; d <= end; d = L.addDays(d, 1)) {
    const t = L.mealTotals(S, d), logged = Object.keys(L.getDay(S, d).meals || {}).length;
    if (logged) { dl++; cal += t.calories; pro += t.protein; }
    const e = L.painDaily(S, d, "elbow"), n = L.painDaily(S, d, "neck"); if (e != null) ep.push(e); if (n != null) np.push(n);
  }
  const ad = L.adherence(S, wk, end, L.ymd()), adv = L.calorieAdvice(S, ui.date);
  const avg = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "—");
  const prevWaist = Object.keys(S.weeklyReviews).sort().map((k) => S.weeklyReviews[k].waistIn).filter((v) => typeof v === "number").pop();
  const waist = ui.waistDraft ?? r.waistIn ?? prevWaist ?? 32;
  const chk = (k, label) => btn(label, { a: "rv", k }, { on: !!r[k] });
  return `<section class="card"><h2>Weekly review · week of ${shortDate(wk)}</h2>
    <ul class="small" style="padding-left:18px"><li>Average weight: <strong>${avgW ? avgW.toFixed(1) + " lb" : "no weigh-ins"}</strong> (${pts.length} reading${pts.length === 1 ? "" : "s"})</li>
    <li>Nutrition: ${dl ? `${dl} day(s) logged, avg ${nf(cal / dl)} kcal (${Math.round((100 * cal) / dl / S.profile.calorieTarget)}% of target), ${nf(pro / dl)} g protein` : "no meals logged"}</li>
    <li>Training: ${ad.scheduled ? `${ad.completed} of ${ad.scheduled} scheduled workouts done` : "no scheduled workouts elapsed yet"}</li>
    <li>Symptoms (avg of daily max, 0–10): elbow ${avg(ep)}, neck ${avg(np)}</li></ul>
    <div class="alert ${adv.action === "wait" || adv.action === "keep" ? "info" : ""}"><strong>Calorie guide:</strong> ${esc(adv.text)}${adv.waistUp ? " Waist measurement went up since last review." : ""}<div class="muted small">Suggestion only — you choose below. Starting calories were an estimate.</div></div>
    <div class="stack">${chk("rvWeight", "Reviewed weekly average weight")}${chk("rvNutrition", "Reviewed nutrition adherence")}${chk("rvTraining", "Reviewed training completion")}${chk("rvSymptoms", "Reviewed elbow and neck symptom trend")}</div>
    <h3>Next-week calorie target</h3><div class="chips" role="group" aria-label="Calorie adjustment">${L.REVIEW_CALORIE_OPTIONS.map((o) => btn(o === "Keep" ? o : `${o} kcal/day`, { a: "rvpick", k: "calorieAdjustment", v: o }, { on: r.calorieAdjustment === o })).join("")}</div>
    <h3>Training status</h3><div class="chips" role="group" aria-label="Training status">${L.REVIEW_TRAINING_OPTIONS.map((o) => btn(o, { a: "rvpick", k: "trainingDecision", v: o }, { on: r.trainingDecision === o })).join("")}</div>
    ${r.trainingDecision === "Progress if cleared" ? `<p class="muted small">“If cleared” means the Settings clearance gates, not this selection.</p>` : ""}
    <h3>Waist (inches, optional)</h3><div class="row"><span class="big">${waist.toFixed(2)}</span>${[-1, -0.25, 0.25, 1].map((v) => btn(`${v > 0 ? "+" : "−"}${Math.abs(v)}`, { a: "waist", v })).join("")}${btn(r.waistIn === waist ? "Logged ✓" : "Log waist", { a: "waistlog" }, { cls: "primary" })}</div>
    <p class="muted small">The starting value is a placeholder — step to your measurement.</p></section>`;
}

export function progressView(S, ui) {
  const end = ui.date;
  const wDays = Array.from({ length: 28 }, (_, i) => L.addDays(end, i - 27));
  const avgSeries = L.weightAvgSeries(S, wDays[0], end), avgMap = Object.fromEntries(avgSeries.map((p) => [p.date, p.avg]));
  const raw = wDays.map((d) => L.getDay(S, d).weight?.lb ?? null), avg = wDays.map((d) => avgMap[d] ?? null), ms = wDays.map((d) => L.milestoneAt(S, d));
  const all = [...raw, ...avg, ...ms].filter((v) => v != null);
  const weightChart = lineChart({
    title: "Body weight, 28 days (lb)", labels: wDays.map(shortDate), yMin: Math.floor(Math.min(...all, S.profile.startingWeight) - 1), yMax: Math.ceil(Math.max(...all, S.profile.startingWeight) + 1), yLabel: "lb",
    summary: avgSeries.length ? `Latest 7-day average ${avgSeries[avgSeries.length - 1].avg.toFixed(1)} lb across ${raw.filter((v) => v != null).length} readings.` : "No weigh-ins in this window.",
    series: [{ name: "Daily weigh-in", cls: "s3", marker: "circle", line: false, points: raw }, { name: "7-day average", cls: "s1", marker: "none", points: avg }, { name: "Illustrative milestone path (not a requirement)", cls: "s2", dash: true, marker: "none", points: ms }],
  });
  const d14 = Array.from({ length: 14 }, (_, i) => L.addDays(end, i - 13));
  const tots = d14.map((d) => (L.getDay(S, d).meals || L.getDay(S, d).boosters ? L.mealTotals(S, d) : null));
  const sum = (arr, k) => { const v = arr.filter(Boolean); return v.length ? `Average ${Math.round(v.reduce((a, t) => a + t[k], 0) / v.length)} over ${v.length} logged day(s).` : "Nothing logged."; };
  const calChart = barChart({ title: "Calories (14 days)", labels: d14.map(shortDate), values: tots.map((t) => t?.calories ?? null), target: S.profile.calorieTarget, summary: sum(tots, "calories"), yLabel: "kcal" });
  const proChart = barChart({ title: "Protein (14 days)", labels: d14.map(shortDate), values: tots.map((t) => t?.protein ?? null), target: S.profile.proteinTarget, summary: sum(tots, "protein"), unit: " g", yLabel: "g" });
  const weeks = Array.from({ length: 8 }, (_, i) => L.addDays(L.weekStartOf(end), (i - 7) * 7));
  const adh = weeks.map((w) => L.adherence(S, w, L.addDays(w, 6), L.ymd()));
  const adhChart = barChart({ title: "Workout adherence by week (%)", labels: weeks.map(shortDate), values: adh.map((a) => a.pct), yMax: 100, unit: "%", yLabel: "%", summary: "Counts only scheduled workout days; rest and walk days are excluded. Weeks with none scheduled are blank." });
  return `<section class="card"><h2>Weight</h2>${weightChart}<p class="muted small">A missed milestone isn't a failure — day-to-day weight swings by 1–2 lb. Watch the average.</p></section>
    <section class="card"><h2>Food</h2>${calChart}${proChart}</section>
    <section class="card"><h2>Training</h2>${adhChart}</section>
    <section class="card"><h2>Symptoms</h2>${trendCharts(S, ui)}</section>
    ${reviewCard(S, ui)}`;
}

// ---------- Settings ----------

const stepper = (label, field, val, step, unit = "") => `<div class="row between" style="margin:6px 0"><span>${label}: <strong>${val}${unit}</strong></span><span class="row">${btn("−", { a: "pstep", f: field, v: -step }, { aria: `Decrease ${label}` })}${btn("+", { a: "pstep", f: field, v: step }, { aria: `Increase ${label}` })}</span></div>`;

export function settings(S, ui) {
  const lad = L.LADDER.map((l, i) => {
    const on = !!S.clearance.ladder[l.id], avail = L.ladderStepAvailable(S, i);
    return `<li>${btn(`<span class="glyph" aria-hidden="true">${on ? "✓" : avail ? "○" : "🔒"}</span><span style="flex:1">${esc(l.label)}</span><span class="state">${on ? (i === 0 ? "Yes" : "Done") : avail ? "Not yet" : "Locked"}</span>`, { a: "ladder", id: l.id }, { cls: "item", disabled: !on && !avail, on, aria: `${l.label}: ${on ? "done" : avail ? "not yet" : "locked"}` })}</li>`;
  }).join("");
  const exFlags = L.UPPER_BODY.map((u) => {
    const f = S.clearance.exercises[u.id] || {}, can = !!S.clearance.ladder.clearance;
    return `<div style="margin:8px 0"><strong>${esc(u.name)}</strong> ${L.isExerciseUnlocked(S, u.id) ? "· <span class=\"s-done\">Unlocked ✓</span>" : "· 🔒 locked"}<div class="row">${btn("Clinician cleared", { a: "exflag", id: u.id, f: "cleared" }, { on: !!f.cleared, disabled: !can })}${btn("Pain-free at current level", { a: "exflag", id: u.id, f: "painFree" }, { on: !!f.painFree, disabled: !can })}</div></div>`;
  }).join("");
  const presets = S.mealPresets.map((p) => `<details class="card" style="margin:8px 0"><summary><strong>${esc(p.label)}</strong>&nbsp;<span class="muted">${esc(L.SLOTS.find((s) => s.id === p.slot)?.label)} · ${nf(p.calories)} kcal · ${nf(p.protein)} g</span></summary>
    <label class="field">Name<input type="text" data-c="preset" data-id="${esc(p.id)}" data-f="label" value="${esc(p.label)}"></label>
    <label class="field">Meal slot<select data-c="preset" data-id="${esc(p.id)}" data-f="slot">${L.SLOTS.map((s) => `<option value="${s.id}"${s.id === p.slot ? " selected" : ""}>${s.label}</option>`).join("")}</select></label>
    <label class="field">Calories<input type="number" inputmode="numeric" data-c="preset" data-id="${esc(p.id)}" data-f="calories" value="${p.calories}"></label>
    <label class="field">Protein (g)<input type="number" inputmode="numeric" data-c="preset" data-id="${esc(p.id)}" data-f="protein" value="${p.protein}"></label>
    <label class="field">Ingredients<input type="text" data-c="preset" data-id="${esc(p.id)}" data-f="ingredients" value="${esc(p.ingredients)}"></label>
    ${btn("Delete preset", { a: "rmpreset", id: p.id }, { cls: "danger", disabled: S.mealPresets.filter((x) => x.slot === p.slot).length < 2 })}</details>`).join("");
  const boosters = S.boosters.map((b) => `<div style="margin:8px 0"><strong>+${b.calories} kcal booster</strong> ${b.foods.trim() ? "" : "· <span class=\"s-partial\">unassigned (adds nothing)</span>"}
    <div class="chips" role="group" aria-label="Suggested foods for +${b.calories}">${(L.BOOSTER_SUGGESTIONS[b.id] || []).map((s) => btn(esc(s.foods), { a: "bsuggest", id: b.id, foods: s.foods, p: s.protein }, { on: b.foods === s.foods })).join("")}</div>
    <label class="field">Foods (type your own)<input type="text" data-c="booster" data-id="${esc(b.id)}" data-f="foods" value="${esc(b.foods)}"></label>
    <label class="field">Protein (g)<input type="number" inputmode="numeric" data-c="booster" data-id="${esc(b.id)}" data-f="protein" value="${b.protein || 0}"></label></div>`).join("");
  const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  const reminders = L.REMINDER_CATEGORIES.map((c) => `<h3>${c.label}</h3>${btn(S.reminderCategories[c.id] !== false ? "Category on" : "Category off", { a: "rcat", id: c.id }, { on: S.reminderCategories[c.id] !== false })}
    ${S.reminders.filter((r) => r.category === c.id).map((r) => `<div class="row" style="margin:6px 0"><label style="flex:1">${esc(r.label)} <span class="muted small">${r.weekdays.length === 7 ? "daily" : r.weekdays.map((d) => L.WEEKDAYS[d].slice(0, 3)).join(", ")}</span></label>
      <input type="time" value="${r.time}" data-c="rtime" data-id="${r.id}" aria-label="${esc(r.label)} time">
      <select data-c="rsnooze" data-id="${r.id}" aria-label="Snooze length">${[15, 30, 60].map((m) => `<option value="${m}"${r.snoozeMinutes === m ? " selected" : ""}>snooze ${m}m</option>`).join("")}</select>
      ${btn(r.enabled ? "On" : "Off", { a: "ron", id: r.id }, { on: r.enabled, aria: `${r.label} reminder` })}</div>`).join("")}`).join("");
  return `<section class="card"><h2>Targets</h2>
    ${stepper("Calories / day", "calorieTarget", S.profile.calorieTarget, 50, " kcal")}${stepper("Protein / day", "proteinTarget", S.profile.proteinTarget, 5, " g")}
    ${stepper("Starting weight", "startingWeight", S.profile.startingWeight, 0.5, " lb")}${stepper("Goal weight", "goalWeight", S.profile.goalWeight, 0.5, " lb")}
    <label class="field">Program start date<input type="date" data-c="start" value="${S.profile.startDate}"></label>
    <p class="muted small">Timezone: ${esc(S.profile.timezone)}. Start/goal weights are scale-weight targets, not lean mass. Calorie targets are estimates.</p></section>
  <section class="card"><h2>Injury clearance gates</h2>
    <p class="muted small">Record only what actually happened. Each step unlocks the next; upper-body exercises need clearance <em>plus</em> both per-exercise flags.</p>
    <ul class="checklist">${lad}</ul><h3>Per-exercise flags</h3>${btn("My clinician cleared all of these — flag all", { a: "flagall" }, { disabled: !S.clearance.ladder.clearance })}${exFlags}</section>
  <section class="card"><h2>Meal presets</h2><p class="muted small">Estimates — edit to match your brands and portions. Changing a preset doesn't rewrite meals you've already logged.</p>${presets}
    <div class="row" style="margin-top:8px"><label class="small muted" for="newslot">New preset for</label><select id="newslot">${L.SLOTS.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select>${btn("Add preset", { a: "addpreset" })}</div></section>
  <section class="card"><h2>Calorie boosters</h2>${boosters}</section>
  <section class="card"><h2>Reminders</h2>
    <div class="alert info small"><strong>Heads-up:</strong> a web app can only remind you while it's open or running in the background — it can't wake a closed app. Reminders never log anything; ignoring or skipping one leaves your day untouched.</div>
    <div class="row"><span>Notifications: <strong>${perm}</strong></span>${perm === "default" ? btn("Enable notifications", { a: "notifyperm" }) : ""}</div>${reminders}</section>
  <section class="card"><h2>Your data</h2><p class="muted small">Stored only on this device (offline-first). Export a backup occasionally — clearing site data deletes it.</p>
    <div class="row">${btn("Export JSON", { a: "exportjson" })}${btn("Export CSV", { a: "exportcsv" })}<label class="row"><span class="small muted">Import JSON</span><input type="file" accept="application/json,.json" data-c="import"></label></div>
    <div class="row" style="margin-top:8px">${btn(`Delete ${dateLabel(ui.date)}`, { a: "delday" }, { cls: "danger" })}${btn("Delete ALL data", { a: "delall" }, { cls: "danger" })}</div></section>
  <p class="muted small" style="padding:0 4px">Medical note: this tracker supports routines and symptom awareness, not diagnosis or treatment. Seek clinical assessment for persistent deep anterior elbow pain and recurrent electric/locking neck symptoms, especially before loading the elbow or returning to golf.</p>`;
}
