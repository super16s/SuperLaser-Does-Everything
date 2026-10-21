// State container: one JSON document, persisted to localStorage (or any
// {getItem,setItem,removeItem} you inject — tests pass an in-memory one).
// All writes go through mutate(), which snapshots first so every change is undoable.

import {
  DEFAULT_PRESETS, DEFAULT_BOOSTERS, defaultReminders, REMINDER_CATEGORIES, YOGA_STAGES,
  ymd, localTz, stamp, getDay, currentPreset, setKey, PAIN,
  LEGACY_PRESETS, LADDERS, MAX_LOAD_LEVEL, canProgress, shownLadderVariant, progressLevel as L_progressLevel,
} from "./logic.js";

const KEY = "superlaser-tracker-v1";
const MAX_UNDO = 25;

export function defaultState(now = new Date()) {
  return {
    version: 1,
    nutritionVersion: 3,
    profile: { startingWeight: 159, goalWeight: 174, calorieTarget: 2850, proteinTarget: 150, startDate: ymd(now), timezone: localTz() },
    mealPresets: structuredClone(DEFAULT_PRESETS),
    boosters: structuredClone(DEFAULT_BOOSTERS),
    reminders: defaultReminders(),
    reminderCategories: Object.fromEntries(REMINDER_CATEGORIES.map((c) => [c.id, true])),
    reminderState: { fired: {}, skipped: {}, snoozedUntil: {} },
    progression: {}, // key → { level, changedAt, history }
    days: {},
    pain: [],
    weeklyReviews: {},
    lists: {}, // grocery / meal-prep ticks keyed by "grocery|<weekStart>" etc.
  };
}

function normalize(s) {
  const d = defaultState();
  const migrateNutrition = s.nutritionVersion !== 3;
  const out = { ...d, ...s, nutritionVersion: 3 };
  for (const k of ["profile", "reminderCategories", "reminderState"]) out[k] = { ...d[k], ...(s[k] || {}) };
  delete out.clearance; // legacy: clinician-clearance gates were removed
  for (const k of ["fired", "skipped", "snoozedUntil"]) out.reminderState[k] ||= {};
  for (const k of ["days", "weeklyReviews", "lists", "progression"]) out[k] ||= {};
  for (const k of ["mealPresets", "boosters", "reminders", "pain"]) if (!Array.isArray(out[k])) out[k] = d[k];
  if (migrateNutrition) {
    // Swap in the current breakfast / shake only where the user never edited an earlier default.
    for (const nd of d.mealPresets) {
      const legacy = LEGACY_PRESETS[nd.id], i = out.mealPresets.findIndex((p) => p.id === nd.id);
      if (!legacy || i < 0) continue;
      const cur = out.mealPresets[i];
      if (legacy.some((old) => Object.keys(old).every((k) => cur[k] === old[k]))) out.mealPresets[i] = { ...cur, ...nd };
    }
  }
  return out;
}

export function createStore(storage = globalThis.localStorage) {
  let state;
  let undoStack = [];
  const listeners = new Set();
  let persistError = null;

  const read = () => { try { const raw = storage?.getItem(KEY); return raw ? normalize(JSON.parse(raw)) : null; } catch { return null; } };
  const write = () => {
    try { storage?.setItem(KEY, JSON.stringify(state)); persistError = null; }
    catch (e) { persistError = e; }
  };
  state = read() || defaultState();

  const emit = () => listeners.forEach((fn) => fn(state));
  const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const api = {
    get state() { return state; },
    get persistError() { return persistError; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Mutations run on a clone, so a throwing mutation can't half-apply.
    mutate(fn, label = "Change") {
      const next = structuredClone(state);
      fn(next);
      undoStack.push({ label, snapshot: state });
      if (undoStack.length > MAX_UNDO) undoStack.shift();
      state = next;
      write(); emit();
    },
    // Runtime bookkeeping (reminder fired flags) — persisted but not undoable.
    quiet(fn) { fn(state); write(); },
    canUndo: () => undoStack.length > 0,
    lastLabel: () => undoStack[undoStack.length - 1]?.label,
    undo() {
      const u = undoStack.pop();
      if (!u) return false;
      state = u.snapshot; write(); emit(); return true;
    },
    exportJson: () => JSON.stringify(state, null, 2),
    importJson(text) {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || parsed.version !== 1 || typeof parsed.days !== "object") throw new Error("Not a SuperLaser tracker export.");
      undoStack.push({ label: "Import", snapshot: state });
      state = normalize(parsed); write(); emit();
    },
    resetAll() { undoStack = []; state = defaultState(); try { storage?.removeItem(KEY); } catch {} emit(); },
    uid,
  };
  return api;
}

// ---------- Actions (all take the mutable draft `s`) ----------

function day(s, date) {
  const d = (s.days[date] ||= {});
  d.tz ||= localTz();
  return d;
}
const prune = (s, date) => { const d = s.days[date]; if (d && Object.keys(d).every((k) => k === "tz")) delete s.days[date]; };

export const actions = {
  // Meals. Tapping the active chip again clears it back to "Not logged".
  setMeal(s, date, slot, multiplier) {
    const d = day(s, date);
    d.meals ||= {};
    const cur = d.meals[slot];
    if (cur && cur.multiplier === multiplier) { delete d.meals[slot]; if (!Object.keys(d.meals).length) delete d.meals; return prune(s, date); }
    const p = currentPreset(s, date, slot);
    d.meals[slot] = {
      presetId: p.id, multiplier, calories: p.calories, protein: p.protein,
      status: multiplier === 0 ? "skipped" : multiplier < 1 ? "partial" : "done", ...stamp(),
    };
  },
  swapMeal(s, date, slot, presetId) {
    const d = day(s, date);
    d.swaps ||= {};
    d.swaps[slot] = presetId;
    const m = d.meals?.[slot], p = s.mealPresets.find((x) => x.id === presetId);
    if (m && p) Object.assign(m, { presetId, calories: p.calories, protein: p.protein });
  },
  addBooster(s, date, boosterId) {
    const b = s.boosters.find((x) => x.id === boosterId);
    if (!b || !b.foods.trim()) return; // unassigned calories are never counted
    const d = day(s, date);
    (d.boosters ||= []).push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, boosterId, calories: b.calories, protein: b.protein || 0, foods: b.foods, ...stamp() });
  },
  removeBooster(s, date, id) {
    const d = day(s, date);
    d.boosters = (d.boosters || []).filter((b) => b.id !== id);
    if (!d.boosters.length) delete d.boosters;
    prune(s, date);
  },
  // Generic tri-state for checklist items (manual items and overrides of derived ones).
  setCheck(s, date, id, status) {
    const d = day(s, date);
    d.checks ||= {};
    if (!status || d.checks[id]?.status === status) { delete d.checks[id]; if (!Object.keys(d.checks).length) delete d.checks; return prune(s, date); }
    d.checks[id] = { status, ...stamp() };
  },
  setSet(s, date, exId, i, status) {
    const d = day(s, date);
    d.sets ||= {};
    const k = setKey(exId, i);
    if (!status || d.sets[k]?.status === status) { delete d.sets[k]; if (!Object.keys(d.sets).length) delete d.sets; return prune(s, date); }
    d.sets[k] = { status, ...stamp() };
  },
  setWorkoutOverride(s, date, override) {
    const d = day(s, date);
    d.workout ||= {};
    if (override) d.workout.override = override; else delete d.workout.override;
    if (!Object.keys(d.workout).length) delete d.workout;
    prune(s, date);
  },
  skipWorkout(s, date, skipped) {
    const d = day(s, date);
    d.workout ||= {};
    if (skipped) d.workout.skipped = true; else delete d.workout.skipped;
    if (!Object.keys(d.workout).length) delete d.workout;
    prune(s, date);
  },
  setWeight(s, date, lb) {
    const d = day(s, date);
    if (lb == null) { delete d.weight; return prune(s, date); }
    d.weight = { lb: Math.round(lb * 10) / 10, ...stamp() };
  },
  setSleep(s, date, band) {
    const d = day(s, date);
    if (d.sleepBand === band) delete d.sleepBand; else d.sleepBand = band;
    prune(s, date);
  },
  toggleHydration(s, date, n) {
    const d = day(s, date);
    d.hydrationChecks ||= {};
    if (d.hydrationChecks[n]) delete d.hydrationChecks[n]; else d.hydrationChecks[n] = stamp();
    if (!Object.keys(d.hydrationChecks).length) delete d.hydrationChecks;
    prune(s, date);
  },
  setYogaStage(s, date, stageId, status) {
    const d = day(s, date);
    d.yogaStages ||= {};
    if (!status || d.yogaStages[stageId]?.status === status) delete d.yogaStages[stageId];
    else d.yogaStages[stageId] = { status, ...stamp() };
    if (!Object.keys(d.yogaStages).length) delete d.yogaStages;
    if (stageId === "meditation") { if (status === "done" && d.yogaStages?.meditation) d.meditationDone = true; else delete d.meditationDone; }
    prune(s, date);
  },

  // Pain: rows are upserted per (date, time-of-day, area) so a single tap logs.
  painSet(s, date, tod, areas, patch) {
    s.pain = s.pain.filter((r) => !(r.date === date && r.tod === tod && r.skipped));
    for (const area of areas) {
      let row = s.pain.find((r) => r.date === date && r.tod === tod && r.area === area);
      if (!row) {
        row = { id: `${date}|${tod}|${area}`, date, tod, area, severity: null, quality: null, trigger: null, trend: null, redFlags: [], skipped: false, ...stamp() };
        s.pain.push(row);
      }
      Object.assign(row, patch, { skipped: false }, stamp());
    }
    // Shared descriptors apply to every row of this check-in.
    const shared = {};
    for (const k of ["quality", "trigger", "trend", "redFlags"]) if (k in patch) shared[k] = patch[k];
    if (Object.keys(shared).length) for (const r of s.pain) if (r.date === date && r.tod === tod) Object.assign(r, shared);
  },
  painNone(s, date, tod) {
    s.pain = s.pain.filter((r) => !(r.date === date && r.tod === tod));
    for (const area of PAIN.areas) s.pain.push({ id: `${date}|${tod}|${area.id}`, date, tod, area: area.id, severity: 0, quality: "None", trigger: "None", trend: null, redFlags: ["none"], skipped: false, ...stamp() });
  },
  painSkip(s, date, tod) {
    s.pain = s.pain.filter((r) => !(r.date === date && r.tod === tod));
    s.pain.push({ id: `${date}|${tod}|skip`, date, tod, area: null, severity: null, quality: null, trigger: null, trend: null, redFlags: [], skipped: true, ...stamp() });
  },
  painClear(s, date, tod) { s.pain = s.pain.filter((r) => !(r.date === date && r.tod === tod)); },

  setLoad(s, date, exId, lb) {
    const d = day(s, date);
    d.loads ||= {};
    if (lb == null) delete d.loads[exId]; else d.loads[exId] = { lb: Math.round(lb * 10) / 10, ...stamp() };
    if (!Object.keys(d.loads).length) delete d.loads;
    prune(s, date);
  },
  setReadiness(s, date, id) {
    const d = day(s, date);
    d.readiness ||= {};
    if (d.readiness[id]) delete d.readiness[id]; else d.readiness[id] = stamp();
    if (!Object.keys(d.readiness).length) delete d.readiness;
    prune(s, date);
  },

  // dir +1 / -1. Ladders stop at their last step; load levels stop at MAX_LOAD_LEVEL.
  progress(s, key, dir) {
    const cur = L_progressLevel(s, key);
    let next;
    if (LADDERS[key]) {
      const v = shownLadderVariant(s, key);
      if (!v) return;
      if (dir > 0 && !canProgress(s, key)) return;
      next = Math.max(0, Math.min(LADDERS[key].length - 1, v.i + dir));
    } else {
      if (dir > 0 && !canProgress(s, key)) return;
      next = Math.max(0, Math.min(MAX_LOAD_LEVEL, cur + dir));
    }
    const p = (s.progression[key] ||= { level: 0, history: [] });
    p.history.push({ from: LADDERS[key] ? shownLadderVariant(s, key).i : cur, to: next, ...stamp() });
    p.level = next; p.changedAt = new Date().toISOString();
  },

  setList(s, key, item) {
    const l = (s.lists[key] ||= {});
    if (l[item]) delete l[item]; else l[item] = true;
  },
  setReview(s, weekStart, patch) { s.weeklyReviews[weekStart] = { ...(s.weeklyReviews[weekStart] || {}), ...patch, ...stamp() }; },
  deleteDay(s, date) { delete s.days[date]; s.pain = s.pain.filter((r) => r.date !== date); },
};
export { getDay, YOGA_STAGES };
