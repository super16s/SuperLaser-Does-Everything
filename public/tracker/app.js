// Wiring: state → views, tap handling, timers, reminders, import/export.

import { createStore, actions as A } from "./store.js";
import * as L from "./logic.js";
import * as V from "./views.js";
import * as OFF from "./off.js";
import { CELE, pixelIcon, victorySvg } from "./sprites.js";
import { startScheduler, snooze, skipToday, notify, askPermission } from "./reminders.js";

const store = createStore();
const $ = (s) => document.querySelector(s);
const ui = { tab: "today", date: L.ymd(), painTod: "morning", painAreas: ["elbow"], weightDraft: null, waistDraft: null, loadDraft: {}, prevPct: {}, popFk: null, prevG: null, guided: true, prevCele: {}, customKcal: 200, customProtein: 10, rest: null, restLen: 60, autoRest: true, yoga: null, banners: [] };
try { const t = localStorage.getItem("gain-tracker-ui"); if (t) Object.assign(ui, JSON.parse(t)); } catch {}
// Older saves used restLen 0 for "off": translate that, and keep the length in sane 15 s steps.
if (ui.restLen === 0) { ui.autoRest = false; ui.restLen = 60; }
ui.restLen = Math.min(300, Math.max(15, Math.round((ui.restLen || 60) / 15) * 15));
ui.date = L.ymd(); // always open on today
const saveUi = () => { try { localStorage.setItem("gain-tracker-ui", JSON.stringify({ tab: ui.tab, restLen: ui.restLen, autoRest: ui.autoRest, guided: ui.guided })); } catch {} };

// ---------- helpers ----------

const S = () => store.state;
let toastTimer;
function toast(msg, withUndo = true) {
  const el = $("#toast");
  el.innerHTML = `<span>${V.esc(msg)}</span>${withUndo && store.canUndo() ? `<button type="button" data-a="undo">Undo</button>` : ""}`;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 4500);
}
function act(fn, label) { store.mutate(fn, label); toast(label); }

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination); o.frequency.value = 660; g.gain.value = 0.15;
    o.start(); o.stop(ctx.currentTime + 0.35);
    setTimeout(() => ctx.close(), 600);
  } catch {}
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}
const mmss = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

function showMenu(title, items) {
  const m = $("#menu");
  m._items = items; m._openedAt = Date.now();
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${V.esc(title)}"><strong>${V.esc(title)}</strong>${items.map((it, i) => `<button type="button" data-m="${i}" class="${it.cls || ""}">${V.esc(it.label)}</button>`).join("")}<button type="button" data-m="cancel">Cancel</button></div>`;
  m.hidden = false;
  m.querySelector("button")?.focus();
}
const closeMenu = () => { $("#menu").hidden = true; };

// ---------- render ----------

// Screens are redrawn from scratch on every tap, which would collapse any open <details>
// (food groups, ingredient amounts, lists). Remember which were open and reopen them.
const detailsKey = (d) => `${d.closest("[id]")?.id || ""}|${d.querySelector("summary")?.textContent.trim().slice(0, 40)}`;
function render() {
  const openKeys = new Set([...document.querySelectorAll("#view details[open]")].map(detailsKey));
  const focusKey = document.activeElement?.dataset?.fk;
  const y = window.scrollY;
  $("#top").innerHTML = V.header(S(), ui, store.canUndo());
  const views = { today: V.today, workout: V.workout, recovery: V.recovery, progress: V.progressView, settings: V.settings };
  $("#view").innerHTML = views[ui.tab](S(), ui);
  $("#tabs").innerHTML = V.tabs(ui);
  document.querySelectorAll("#view details").forEach((d) => { if (openKeys.has(detailsKey(d))) d.open = true; });
  renderBanners();
  animateBars();
  celebrations();
  window.scrollTo(0, y);
  if (focusKey) document.querySelector(`[data-fk="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true });
  tickTimers();
}
function renderBanners() {
  const b = ui.banners.map((r) => `<div class="alert info" role="alert"><strong>⏰ ${V.esc(r.label)}</strong> — due now. <span class="muted small">(Nothing is logged until you do it.)</span>
    <div class="row" style="margin-top:6px">${V.btn("Open", { a: "bopen", id: r.id }, { cls: "primary" })}${[15, 30, 60].map((m) => V.btn(`Snooze ${m}m`, { a: "bsnooze", id: r.id, m })).join("")}${V.btn("Skip today", { a: "bskip", id: r.id })}${V.btn("Dismiss", { a: "bdismiss", id: r.id })}</div></div>`).join("");
  const err = store.persistError ? `<div class="alert red" role="alert">Couldn't save to this device's storage (private window or full?). Your latest changes may be lost — export a backup from Settings.</div>` : "";
  $("#banners").innerHTML = err + b;
}
store.subscribe(render);

// ---------- progress animation ----------

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// Views are re-rendered from scratch on every tap, so a bar would never animate by
// itself. Remember each bar's last value and grow it from there to the new one.
function setPos(el, p) {
  if (el.dataset.prop === "push") el.style.left = `calc((100% - 120px) * ${p / 100})`;
  else el.style.width = `${p}%`;
}
function animateBars() {
  const motion = !reduceMotion();
  let confetti = false;
  document.querySelectorAll("[data-pct]").forEach((el) => {
    const key = el.dataset.key, to = +el.dataset.pct, seen = key in ui.prevPct, from = seen ? ui.prevPct[key] : to;
    ui.prevPct[key] = to;
    if (motion && from !== to) {
      setPos(el, from);
      void el.offsetWidth; // commit the start position, then transition to the target
      setPos(el, to);
      const sc = el.closest(".scene");
      if (sc && to > from) { sc.classList.add("walking"); setTimeout(() => sc.classList.remove("walking"), 850); }
    }
    if (motion && seen && from < 100 && to === 100) {
      if (key.endsWith("|wk")) { confetti = true; el.closest(".scene")?.classList.add("celebrate"); }
      else if (/\|ex-/.test(key)) el.closest(".exblock, .seg")?.classList.add("pop");
      else el.closest(".card")?.classList.add("pop");
    }
  });
  const g = document.querySelector(".guided[data-gkey]");
  if (g) { if (motion && ui.prevG && ui.prevG !== g.dataset.gkey) g.classList.add("enter"); ui.prevG = g.dataset.gkey; }
  if (ui.popFk) { document.querySelector(`[data-fk="${CSS.escape(ui.popFk)}"]`)?.classList.add("tap-pop"); ui.popFk = null; }
  if (confetti) { launchFinale(); try { navigator.vibrate?.([30, 40, 60, 40, 120]); } catch {} }
}
// Each Today action plays its own little pixel celebration when it flips to done:
// the card's icon pops and particles burst or rise around it.
function celebrations() {
  if (reduceMotion()) return;
  document.querySelectorAll("[data-cele]").forEach((el) => {
    const key = `${ui.date}|${el.id}`, done = el.dataset.done === "1", prev = ui.prevCele[key];
    ui.prevCele[key] = done;
    if (prev === false && done) celebrate(el, el.dataset.cele);
  });
}
function celebrate(el, kind) {
  const cfg = CELE[kind], r = el.getBoundingClientRect();
  if (!cfg || !r.width) return;
  const box = document.createElement("div");
  box.className = `cele ${kind} ${cfg.mode}`; box.setAttribute("aria-hidden", "true");
  box.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
  box.innerHTML = `<div class="spr">${pixelIcon(kind, 5)}</div>`;
  for (let i = 0; i < 18; i++) {
    const p = document.createElement("i"), a = (Math.PI * 2 * i) / 18 + Math.random() * 0.4, d = 50 + Math.random() * 70;
    const dx = cfg.mode === "burst" ? Math.cos(a) * d : (Math.random() - 0.5) * 90, dy = cfg.mode === "burst" ? Math.sin(a) * d * 0.7 : -30 - Math.random() * 70;
    p.style.cssText = `background:${cfg.colors[i % cfg.colors.length]};left:50%;top:50%;--dx:${dx.toFixed(0)}px;--dy:${dy.toFixed(0)}px;animation-delay:${(Math.random() * 0.25).toFixed(2)}s`;
    box.append(p);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 1900);
  try { navigator.vibrate?.(20); } catch {}
}
// Workout complete: pixel flames climb until they fill the screen while the muscle man raises a victorious fist.
// (The classic "demo-scene" fire: each cell passes heat upward, losing a little at random.)
function launchFinale() {
  if (reduceMotion() || document.querySelector(".finale")) return;
  const box = document.createElement("div");
  box.className = "finale"; box.setAttribute("aria-hidden", "true");
  box.innerHTML = `<canvas></canvas><div class="fin-man">${victorySvg(7)}</div><div class="fin-text">WORKOUT COMPLETE</div>`;
  document.body.append(box);
  const CELL = 8, W = Math.ceil(innerWidth / CELL), H = Math.ceil(innerHeight / CELL), MAXI = Math.ceil(H * 0.46);
  const cv = box.querySelector("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"), img = ctx.createImageData(W, H), fire = new Uint8Array(W * H);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  // heat → colour: dark red at the tips, orange, yellow, white-hot at the base
  const pal = Array.from({ length: MAXI + 1 }, (_, i) => { const t = i / MAXI; return [clamp(255 * Math.min(1, t * 2.4)), clamp(255 * (t * 2.6 - 0.75)), clamp(255 * (t * 3 - 2.3)), i ? clamp(t * 520) : 0]; });
  const t0 = performance.now();
  const timer = setInterval(() => {
    const el = performance.now() - t0;
    const k = el < 1300 ? el / 1300 : el < 2500 ? 1 : Math.max(0, 1 - (el - 2500) / 1200); // climb, roar, die down
    for (let x = 0; x < W; x++) fire[(H - 1) * W + x] = Math.round(MAXI * k);
    for (let y = H - 1; y >= 1; y--) for (let x = 0; x < W; x++) { // bottom-up in one pass: heat reaches the top every frame
      const src = y * W + x, heat = fire[src];
      if (!heat) { fire[src - W] = 0; continue; }
      const r = Math.floor(Math.random() * 3), dst = Math.min(W * H - 1, Math.max(W, src - r + 1));
      fire[dst - W] = heat - (r & 1);
    }
    for (let i = 0; i < W * H; i++) { const c = pal[fire[i]], o = i * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = c[3]; }
    ctx.putImageData(img, 0, 0);
  }, 40);
  const close = () => { clearInterval(timer); box.remove(); };
  box.addEventListener("click", close);
  setTimeout(close, 4400);
}

// ---------- timers ----------

function tickTimers() {
  const now = Date.now();
  if (ui.rest) {
    const left = ui.rest.endAt - now;
    if (left <= 0) { ui.rest = null; beep(); toast("Rest over — next set", false); render(); return; }
    document.querySelectorAll("[data-rtime]").forEach((el) => { el.textContent = mmss(left); });
    document.querySelectorAll("[data-rfill]").forEach((el) => { el.style.width = `${Math.max(0, (100 * left) / ui.rest.total)}%`; });
  }
  if (ui.yoga) {
    const y = ui.yoga;
    const left = y.paused ? y.remaining : y.endAt - now;
    const el = $("#ytime");
    if (!y.paused && left <= 0) { yogaFinish("done", true); return; }
    if (el) el.textContent = mmss(left) + (y.paused ? " (paused)" : "");
  }
}
setInterval(tickTimers, 250);

const stageMs = (i) => L.YOGA_STAGES[i].minutes * 60000;
function yogaFinish(status, chime) {
  const y = ui.yoga, st = L.YOGA_STAGES[y.idx];
  if (L.getDay(S(), y.date).yogaStages?.[st.id]?.status !== status) store.mutate((s) => A.setYogaStage(s, y.date, st.id, status), `${st.label}: ${status}`);
  if (chime) beep();
  if (y.idx + 1 >= L.YOGA_STAGES.length) { ui.yoga = null; toast("Routine finished 🎉", false); render(); return; }
  y.idx++; y.endAt = Date.now() + stageMs(y.idx); y.paused = false; y.remaining = null;
  render();
}

// ---------- long-press ----------

let lpTimer = null, suppress = false, lpStart = null;
document.addEventListener("pointerdown", (e) => {
  const t = e.target.closest("[data-long]");
  if (!t) return;
  lpStart = { x: e.clientX, y: e.clientY };
  lpTimer = setTimeout(() => { lpTimer = null; suppress = true; openLongMenu(t); }, 500);
});
document.addEventListener("pointermove", (e) => { if (lpTimer && lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 10) { clearTimeout(lpTimer); lpTimer = null; } });
for (const ev of ["pointerup", "pointercancel"]) document.addEventListener(ev, () => { clearTimeout(lpTimer); lpTimer = null; setTimeout(() => { suppress = false; }, 350); });
document.addEventListener("contextmenu", (e) => { const t = e.target.closest("[data-long]"); if (t) { e.preventDefault(); if (!suppress) { suppress = true; openLongMenu(t); } } });

function openLongMenu(t) {
  const d = t.dataset, date = ui.date;
  const statuses = (apply, current, clear) => [...(d.a === "set" ? L.CHECK_STATUSES.slice(0, 3) : d.a === "stage" ? [L.CHECK_STATUSES[0], L.CHECK_STATUSES[2]] : L.CHECK_STATUSES).map((s) => ({ label: s.label, fn: () => apply(s.id) })), ...(clear ? [{ label: "Clear (Not logged)", fn: () => apply(null) }] : [])];
  if (d.a === "check") {
    const item = L.CHECKLIST.find((i) => i.id === d.id), has = !!L.getDay(S(), date).checks?.[d.id];
    // setCheck toggles when the same status is re-chosen, so Clear passes null explicitly.
    showMenu(item.label, statuses((st) => act((s) => A.setCheck(s, date, d.id, st), `${item.label}: ${st || "cleared"}`), null, has).map((o) => ({ ...o, fn: () => { closeMenu(); o.fn(); } })));
  } else if (d.a === "set") {
    const ex = L.ALL_EXERCISES().find((e) => e.id === d.ex);
    const has = !!L.getDay(S(), date).sets?.[L.setKey(d.ex, +d.i)];
    showMenu(`${ex.name} — set ${+d.i + 1}`, statuses((st) => act((s) => A.setSet(s, date, d.ex, +d.i, st), `Set ${+d.i + 1}: ${st || "cleared"}`), null, has).map((o) => ({ ...o, fn: () => { closeMenu(); o.fn(); } })));
  } else if (d.a === "prayer") {
    const lab = L.PRAYERS.find((p) => p.id === d.w).label, has = !!L.getDay(S(), date).prayer?.[d.w];
    const ops = [{ label: "Done", st: "done" }, { label: "Skipped", st: "skipped" }, ...(has ? [{ label: "Clear (Not logged)", st: null }] : [])];
    showMenu(lab, ops.map((o) => ({ label: o.label, fn: () => { closeMenu(); act((s) => A.setPrayer(s, date, d.w, o.st), `${lab}: ${o.st || "cleared"}`); } })));
  } else if (d.a === "stage") {
    const st = L.YOGA_STAGES.find((s) => s.id === d.id), has = !!L.getDay(S(), date).yogaStages?.[d.id];
    showMenu(st.label, statuses((status) => act((s) => A.setYogaStage(s, date, d.id, status), `${st.label}: ${status || "cleared"}`), null, has).map((o) => ({ ...o, fn: () => { closeMenu(); o.fn(); } })));
  }
}

// ---------- click handlers ----------

const goTab = (tab) => { ui.tab = tab; saveUi(); render(); window.scrollTo(0, 0); };
const setDate = (d) => { ui.date = d; ui.weightDraft = null; ui.waistDraft = null; ui.loadDraft = {}; render(); };
const wBase = () => ui.weightDraft ?? L.getDay(S(), ui.date).weight?.lb ?? V.lastWeight(S(), ui.date);
const round1 = (n) => Math.round(n * 10) / 10;
const areasOfCheckin = () => (ui.painAreas.length ? ui.painAreas : ["elbow"]);
const tabForCategory = { meal: "today", weighin: "today", workout: "workout", evening: "recovery" };
const stateName = (s) => L.CHECK_STATUSES.find((x) => x.id === s)?.label || s;

const handlers = {
  undo() { if (store.undo()) toast("Undone", false); },
  tab: (d) => goTab(d.v),
  day: (d) => setDate(L.addDays(ui.date, +d.v)),
  today: () => setDate(L.ymd()),

  meal(d) {
    const label = L.SLOTS.find((s) => s.id === d.slot).label, v = +d.v, name = L.PORTIONS.find((p) => p.value === v).label;
    act((s) => A.setMeal(s, ui.date, d.slot, v), `${label}: ${name}`);
  },
  booster(d) {
    const b = S().boosters.find((x) => x.id === d.id);
    if (!b.foods.trim()) { toast("Assign foods to this booster in Settings first.", false); return; }
    act((s) => A.addBooster(s, ui.date, d.id), `+${b.calories} kcal added`);
  },
  rmbooster: (d) => act((s) => A.removeBooster(s, ui.date, d.id), "Booster removed"),
  wstep: (d) => { ui.weightDraft = round1(wBase() + +d.v); render(); },
  wset: (d) => { ui.weightDraft = +d.v; render(); },
  wlog() { const lb = wBase(); ui.weightDraft = null; act((s) => A.setWeight(s, ui.date, lb), `Weight ${lb.toFixed(1)} lb logged`); },
  wclear() { ui.weightDraft = null; act((s) => A.setWeight(s, ui.date, null), "Weight cleared"); },
  sleep: (d) => act((s) => A.setSleep(s, ui.date, d.v), "Sleep updated"),
  list: (d) => { store.mutate((s) => A.setList(s, d.key, d.item), "List item"); },

  check(d) {
    if (suppress) return;
    const item = L.CHECKLIST.find((i) => i.id === d.id), t = item.derive.type;
    if (t === "hydration") return act((s) => A.toggleHydration(s, ui.date, item.derive.n), item.label);
    if (t === "manual") return act((s) => A.setCheck(s, ui.date, item.id, "done"), item.label);
    if (t === "meal") return document.getElementById(`meal-${item.derive.slot}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (t === "weight") return document.getElementById("weight")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (t === "sleep") return document.getElementById("sleep")?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (t === "prayer") return document.getElementById(`prayer-${item.derive.which}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (t === "pain") { ui.painTod = item.derive.tod; return goTab("recovery"); }
    if (t === "workout") return goTab("workout");
    return goTab("recovery");
  },

  override: (d) => act((s) => A.setWorkoutOverride(s, ui.date, d.v || null), "Routine changed"),
  skipworkout() { const cur = !!L.getDay(S(), ui.date).workout?.skipped; act((s) => A.skipWorkout(s, ui.date, !cur), cur ? "Skip undone" : "Workout skipped"); },
  walk(d) { const had = L.walkMinutes(S(), ui.date) === +d.v; act((s) => A.setWalk(s, ui.date, +d.v), had ? "Walk cleared" : `Walk ${d.v} min logged`); },
  set(d) {
    if (suppress) return;
    const was = L.getDay(S(), ui.date).sets?.[L.setKey(d.ex, +d.i)]?.status;
    ui.popFk = d.g ? "guided-go" : `set-${d.ex}-${d.i}`;
    act((s) => { if (was && was !== "done") A.setSet(s, ui.date, d.ex, +d.i, null); A.setSet(s, ui.date, d.ex, +d.i, "done"); }, `Set ${+d.i + 1}`);
    // Marking done (not un-marking) starts the rest timer if enabled.
    if (was !== "done" && ui.autoRest !== false) { ui.rest = { endAt: Date.now() + ui.restLen * 1000, total: ui.restLen * 1000, ex: d.ex }; render(); }
  },
  lstep(d) {
    const cur = ui.loadDraft[d.ex] ?? L.getDay(S(), ui.date).loads?.[d.ex]?.lb ?? L.loadHistory(S(), d.ex, ui.date).last?.lb ?? 0;
    ui.loadDraft[d.ex] = Math.max(0, Math.round((cur + +d.v) * 10) / 10); render();
  },
  llog(d) {
    const draft = ui.loadDraft[d.ex] ?? L.getDay(S(), ui.date).loads?.[d.ex]?.lb ?? L.loadHistory(S(), d.ex, ui.date).last?.lb ?? 0;
    delete ui.loadDraft[d.ex];
    act((s) => A.setLoad(s, ui.date, d.ex, draft), `Load ${draft} lb logged`);
  },
  lclear(d) { delete ui.loadDraft[d.ex]; act((s) => A.setLoad(s, ui.date, d.ex, null), "Load cleared"); },
  gmode(d) { ui.guided = d.v === "1"; saveUi(); render(); },
  gskip() { const n = L.nextSet(S(), ui.date); if (n) act((s) => A.setSet(s, ui.date, n.e.id, n.i, "skipped"), "Set skipped"); },
  gback() { const l = L.lastLoggedSet(S(), ui.date); if (l) act((s) => A.setSet(s, ui.date, l.e.id, l.i, null), "Back one set"); },
  async wshare() {
    const x = L.workoutExport(S(), ui.date);
    if (!x.hasData) return toast("Nothing logged for this day yet.", false);
    if (navigator.share) { try { await navigator.share({ title: `Workout ${ui.date}`, text: x.text }); return; } catch (e) { if (e?.name === "AbortError") return; } }
    handlers.wcopy();
  },
  async wcopy() {
    const x = L.workoutExport(S(), ui.date);
    if (!x.hasData) return toast("Nothing logged for this day yet.", false);
    try { await navigator.clipboard.writeText(x.text); toast("Workout copied", false); } catch { download(`workout-${ui.date}.txt`, x.text, "text/plain"); toast("Couldn't copy, downloaded instead", false); }
  },
  wtxt() { const x = L.workoutExport(S(), ui.date); x.hasData ? download(`workout-${ui.date}.txt`, x.text, "text/plain") : toast("Nothing logged for this day yet.", false); },
  wcsv() { const x = L.workoutExport(S(), ui.date); x.hasData ? download(`workout-${ui.date}.csv`, x.csv, "text/csv") : toast("Nothing logged for this day yet.", false); },
  prayer(d) {
    if (suppress) return;
    const label = L.PRAYERS.find((p) => p.id === d.w).label, had = L.getDay(S(), ui.date).prayer?.[d.w]?.status === "done";
    act((s) => A.setPrayer(s, ui.date, d.w, "done"), had ? `${label} cleared` : `${label} logged`);
  },
  usemeal: (d) => act((s) => A.swapMeal(s, ui.date, d.slot, d.id), "Meal chosen"),
  fsearch(d) { runFoodSearch(d.slot, document.getElementById(`fq-${d.slot}`)?.value ?? ""); },
  usefood(d) {
    const prod = ui.food?.results?.[+d.i];
    if (!prod) return;
    const preset = OFF.productToPreset(prod, d.slot, +d.g);
    ui.food = null;
    act((s) => A.useFood(s, ui.date, d.slot, preset), `${prod.name} chosen`);
  },
  xadd(d) { const f = L.FOODS.find((x) => x.id === d.id); act((s) => A.addExtra(s, ui.date, { foodId: f.id, name: f.name, serving: f.serving, calories: f.calories, protein: f.protein }), `${f.name} added`); },
  xstep: (d) => act((s) => A.stepExtra(s, ui.date, d.id, +d.v), "Servings updated"),
  xrm: (d) => act((s) => A.removeExtra(s, ui.date, d.id), "Removed"),
  ckstep(d) { ui.customKcal = Math.max(0, ui.customKcal + +d.v); render(); },
  cpstep(d) { ui.customProtein = Math.max(0, ui.customProtein + +d.v); render(); },
  xcustom() {
    if (!ui.customKcal && !ui.customProtein) return toast("Set calories or protein first.", false);
    const k = ui.customKcal, p = ui.customProtein;
    act((s) => A.addExtra(s, ui.date, { foodId: "custom", name: "Other food", serving: "", calories: k, protein: p }), `Other food: ${k} kcal added`);
  },
  rstart(d) { ui.rest = { endAt: Date.now() + ui.restLen * 1000, total: ui.restLen * 1000, ex: d.ex }; render(); },
  rstep(d) { ui.restLen = Math.min(300, Math.max(15, ui.restLen + +d.v)); saveUi(); render(); },
  radd() { if (ui.rest) { ui.rest.endAt += 30000; ui.rest.total += 30000; render(); } },
  rskip() { ui.rest = null; render(); },
  rauto() { ui.autoRest = ui.autoRest === false; saveUi(); render(); },
  provoked() { ui.painTod = "after"; ui.rest = null; toast("Stop the workout. Log how it feels below.", false); goTab("recovery"); },

  // pain
  ptod: (d) => { ui.painTod = d.v; render(); },
  parea(d) {
    if (d.v === "none") { ui.painAreas = []; return act((s) => A.painNone(s, ui.date, ui.painTod), "No symptoms logged"); }
    ui.painAreas = d.v === "both" ? ["elbow", "neck"] : [d.v];
    render();
  },
  sev(d) {
    const cur = L.painRows(S(), ui.date, ui.painTod).find((r) => r.area === d.area)?.severity;
    act((s) => A.painSet(s, ui.date, ui.painTod, [d.area], { severity: cur === +d.v ? null : +d.v }), `${L.PAIN.areas.find((a) => a.id === d.area).label}: ${cur === +d.v ? "cleared" : d.v + "/10"}`);
  },
  pain(d) {
    const cur = L.painRows(S(), ui.date, ui.painTod).find((r) => !r.skipped)?.[d.k];
    act((s) => A.painSet(s, ui.date, ui.painTod, areasOfCheckin(), { [d.k]: cur === d.v ? null : d.v }), `${d.k}: ${d.v}`);
  },
  flag(d) {
    const cur = L.painRows(S(), ui.date, ui.painTod).find((r) => !r.skipped)?.redFlags || [];
    let next = cur.includes(d.v) ? cur.filter((f) => f !== d.v) : d.v === "none" ? ["none"] : [...cur.filter((f) => f !== "none"), d.v];
    act((s) => A.painSet(s, ui.date, ui.painTod, areasOfCheckin(), { redFlags: next }), "Warning signs updated");
  },
  pskip: () => act((s) => (L.painRows(S(), ui.date, ui.painTod).some((r) => r.skipped) ? A.painClear(s, ui.date, ui.painTod) : A.painSkip(s, ui.date, ui.painTod)), "Check-in skipped"),
  pclear: () => act((s) => A.painClear(s, ui.date, ui.painTod), "Entry cleared"),

  // yoga
  stage(d) { if (suppress) return; act((s) => A.setYogaStage(s, ui.date, d.id, "done"), "Stage updated"); },
  yogastart() { ui.yoga = { idx: 0, date: ui.date, endAt: Date.now() + stageMs(0), paused: false, remaining: null }; render(); },
  ypause() { const y = ui.yoga; if (y.paused) { y.endAt = Date.now() + y.remaining; y.paused = false; } else { y.remaining = y.endAt - Date.now(); y.paused = true; } render(); },
  yskip: () => yogaFinish("skipped", false),
  ydone: () => yogaFinish("done", false),
  yend() { ui.yoga = null; render(); },

  // review
  rv(d) { const wk = L.weekStartOf(ui.date), cur = S().weeklyReviews[wk]?.[d.k]; act((s) => A.setReview(s, wk, { [d.k]: !cur }), "Review updated"); },
  rvpick(d) { const wk = L.weekStartOf(ui.date), cur = S().weeklyReviews[wk]?.[d.k]; act((s) => A.setReview(s, wk, { [d.k]: cur === d.v ? null : d.v }), "Review updated"); },
  waist(d) {
    const wk = L.weekStartOf(ui.date), r = S().weeklyReviews[wk] || {};
    const prev = Object.keys(S().weeklyReviews).sort().map((k) => S().weeklyReviews[k].waistIn).filter((v) => typeof v === "number").pop();
    ui.waistDraft = Math.round(((ui.waistDraft ?? r.waistIn ?? prev ?? 32) + +d.v) * 100) / 100; render();
  },
  waistlog() { const wk = L.weekStartOf(ui.date), r = S().weeklyReviews[wk] || {}, prev = Object.keys(S().weeklyReviews).sort().map((k) => S().weeklyReviews[k].waistIn).filter((v) => typeof v === "number").pop(); const v = ui.waistDraft ?? r.waistIn ?? prev ?? 32; ui.waistDraft = null; act((s) => A.setReview(s, wk, { waistIn: v }), "Waist logged"); },

  // settings
  pstep(d) { act((s) => { s.profile[d.f] = Math.max(0, Math.round((s.profile[d.f] + +d.v) * 10) / 10); }, "Target updated"); },
  prog(d) {
    const dir = +d.dir, name = L.LADDERS[d.key] ? "this exercise" : (L.ALL_EXERCISES().find((e) => e.id === d.key)?.name || "this exercise");
    if (dir > 0 && !L.canProgress(S(), d.key)) return toast("Already at the top step.", false);
    const go = () => { closeMenu(); act((s) => A.progress(s, d.key, dir), dir > 0 ? "Progressed" : "Backed off"); };
    if (dir < 0) return go();
    showMenu(`Progress ${name}?`, [{ label: "Yes — top of range on every set, 2+ reps left, no elbow/neck symptoms next day", fn: go }]);
  },
  ready: (d) => act((s) => A.setReadiness(s, ui.date, d.id), "Readiness updated"),
  rcat: (d) => act((s) => { s.reminderCategories[d.id] = s.reminderCategories[d.id] === false; }, "Reminder category"),
  ron: (d) => act((s) => { const r = s.reminders.find((x) => x.id === d.id); r.enabled = !r.enabled; }, "Reminder"),
  async notifyperm() { await askPermission(); render(); },
  bsuggest: (d) => act((s) => { const b = s.boosters.find((x) => x.id === d.id); b.foods = d.foods; b.protein = +d.p; }, "Booster assigned"),
  rmpreset(d) {
    const p = S().mealPresets.find((x) => x.id === d.id);
    if (L.presetSlots(p).some((sl) => S().mealPresets.filter((x) => L.inSlot(x, sl)).length < 2)) return toast("Each meal slot needs at least one meal.", false);
    act((s) => { s.mealPresets = s.mealPresets.filter((x) => x.id !== d.id); }, "Preset deleted");
  },
  addidea(d) {
    const m = L.MEAL_IDEAS[+d.i], slot = $("#newslot").value, id = store.uid();
    act((s) => s.mealPresets.push({ id, slot, label: m.name, calories: m.calories, protein: m.protein, ingredients: m.ingredients, amounts: "", isDefault: false }), `${m.name} added to ${L.SLOTS.find((x) => x.id === slot).label}`);
  },
  addpreset() {
    const slot = $("#newslot").value, id = store.uid();
    act((s) => s.mealPresets.push({ id, slot, label: "New preset", calories: 500, protein: 25, ingredients: "", isDefault: false }), "Preset added");
  },

  exportjson: () => download(`gain-tracker-${L.ymd()}.json`, store.exportJson(), "application/json"),
  exportcsv: () => download(`gain-tracker-${L.ymd()}.csv`, toCsv(S()), "text/csv"),
  delday() {
    showMenu(`Delete everything logged on ${ui.date}?`, [{ label: "Delete this day", cls: "danger", fn: () => { closeMenu(); act((s) => A.deleteDay(s, ui.date), "Day deleted"); } }]);
  },
  delall() {
    showMenu("Delete ALL tracker data on this device? This can't be undone (export first).", [{ label: "Delete everything", cls: "danger", fn: () => { closeMenu(); store.resetAll(); ui.date = L.ymd(); toast("All data deleted", false); render(); } }]);
  },

  bopen(d) { const r = S().reminders.find((x) => x.id === d.id); ui.banners = ui.banners.filter((b) => b.id !== d.id); goTab(tabForCategory[r.category]); },
  bsnooze(d) { snooze(store, d.id, +d.m); ui.banners = ui.banners.filter((b) => b.id !== d.id); render(); toast(`Snoozed ${d.m} min`, false); },
  bskip(d) { skipToday(store, d.id); ui.banners = ui.banners.filter((b) => b.id !== d.id); render(); },
  bdismiss(d) { ui.banners = ui.banners.filter((b) => b.id !== d.id); render(); },
};

document.addEventListener("click", (e) => {
  const m = e.target.closest("[data-m]");
  if (m) { const menu = $("#menu"); const i = m.dataset.m; if (i === "cancel") closeMenu(); else menu._items[+i].fn(); return; }
  if (e.target.id === "menu" && Date.now() - ($("#menu")._openedAt || 0) > 400) { closeMenu(); return; }
  const t = e.target.closest("[data-a]");
  if (!t) return;
  if (suppress && t.hasAttribute("data-long")) { e.preventDefault(); return; }
  const fn = handlers[t.dataset.a];
  if (!fn) return;
  if (t.getAttribute("aria-disabled") === "true" && t.dataset.a !== "booster") return;
  fn(t.dataset);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#menu").hidden) closeMenu(); });

async function runFoodSearch(slot, q) {
  q = q.trim();
  if (ui.food?.slot === slot && ui.food.q === q && ui.food.status !== "error") return; // blur + tap on Search fire together
  ui.food = { slot, q, status: q.length >= 2 ? "loading" : "idle", results: [] };
  render();
  if (q.length < 2) return;
  const mine = ui.food;
  try { mine.results = await OFF.lookup(q); mine.status = "done"; } catch (e) { mine.status = "error"; mine.error = e.message; }
  if (ui.food === mine) render();
}

// text / select / date / file inputs
const NUMERIC = new Set(["calories", "protein"]);
document.addEventListener("change", async (e) => {
  const t = e.target.closest("[data-c]");
  if (!t) return;
  const d = t.dataset;
  switch (d.c) {
    case "date": if (t.value) setDate(t.value); break;
    case "start": if (t.value) act((s) => { s.profile.startDate = t.value; }, "Start date updated"); break;
    case "foodq": runFoodSearch(d.slot, t.value); break;
    case "swap": act((s) => A.swapMeal(s, ui.date, d.slot, t.value), "Meal swapped"); break;
    case "rtime": if (t.value) act((s) => { s.reminders.find((r) => r.id === d.id).time = t.value; }, "Reminder time"); else render(); break;
    case "rsnooze": act((s) => { s.reminders.find((r) => r.id === d.id).snoozeMinutes = +t.value; }, "Snooze length"); break;
    case "preset": {
      const val = NUMERIC.has(d.f) ? Math.max(0, Number(t.value) || 0) : t.value;
      if (d.f === "slot") {
        const p = S().mealPresets.find((x) => x.id === d.id);
        if (L.presetSlots(p).some((sl) => S().mealPresets.filter((x) => L.inSlot(x, sl)).length < 2)) { toast("Each meal slot needs at least one meal.", false); render(); break; }
      }
      act((s) => { const pr = s.mealPresets.find((x) => x.id === d.id); pr[d.f] = val; if (d.f === "slot") delete pr.slots; }, "Meal updated");
      break;
    }
    case "booster": act((s) => { const b = s.boosters.find((x) => x.id === d.id); b[d.f] = d.f === "protein" ? Math.max(0, Number(t.value) || 0) : t.value; }, "Booster updated"); break;
    case "import": {
      const f = t.files?.[0]; if (!f) break;
      try { store.importJson(await f.text()); toast("Imported", true); } catch (err) { toast(`Import failed: ${err.message}`, false); }
      t.value = ""; break;
    }
  }
});

// ---------- export ----------

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function toCsv(state) {
  const dates = [...new Set([...Object.keys(state.days), ...state.pain.map((r) => r.date)])].sort();
  const head = ["date", "timezone", "weight_lb", "calories", "protein_g", "meals_logged", "workout_status", "sleep_band", "yoga_stages_done", "meditation_done", "water_checks", "elbow_pain_max", "neck_pain_max", "loads_lb"];
  const rows = dates.map((d) => {
    const day = L.getDay(state, d), t = L.mealTotals(state, d);
    return [d, day.tz, day.weight?.lb, t.calories, t.protein, Object.keys(day.meals || {}).length, L.workoutStatus(state, d),
      day.sleepBand, Object.values(day.yogaStages || {}).filter((s) => s.status === "done").length, day.meditationDone ? 1 : 0,
      Object.keys(day.hydrationChecks || {}).length, L.painDaily(state, d, "elbow"), L.painDaily(state, d, "neck"), Object.entries(day.loads || {}).map(([k, v]) => `${k}:${v.lb}`).join(";")].map(csvCell).join(",");
  });
  return [head.join(","), ...rows].join("\n");
}

// ---------- boot ----------

startScheduler(store, {
  onDue(r) {
    if (!ui.banners.some((b) => b.id === r.id)) ui.banners.push(r);
    notify(r); renderBanners();
  },
});
render();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW registration failed:", err));
