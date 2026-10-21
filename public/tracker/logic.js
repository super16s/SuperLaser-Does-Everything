// Pure data + calculation helpers for the fitness tracker. No DOM, no storage:
// everything here takes state in and returns values out so it can be unit-tested
// in Node (tests/tracker.test.mjs) and reused by the UI unchanged.

// ---------- Templates (never mutated by daily logging) ----------

export const SLOTS = [
  { id: "breakfast", label: "Breakfast", section: "Morning" },
  { id: "lunch", label: "Lunch", section: "Midday" },
  { id: "shake", label: "Shake", section: "Afternoon / evening" },
  { id: "dinner", label: "Dinner", section: "Afternoon / evening" },
  { id: "snack", label: "Snack", section: "Afternoon / evening" },
];

export const DEFAULT_PRESETS = [
  { id: "breakfast-default", slot: "breakfast", label: "Breakfast", calories: 800, protein: 35,
    ingredients: "1/2 cup dry oats, 1 cup whole milk, 1 banana, 2 tbsp peanut butter, 2 eggs" },
  { id: "lunch-default", slot: "lunch", label: "Lunch", calories: 800, protein: 50,
    ingredients: "5 oz cooked chicken thighs, 1.5 cups cooked rice, 1/2 cup beans, vegetables" },
  { id: "shake-default", slot: "shake", label: "Weight-gain shake", calories: 530, protein: 18,
    ingredients: "1 cup whole milk, 1 banana, 2 tbsp peanut butter, 1/4 cup dry oats" },
  { id: "dinner-default", slot: "dinner", label: "Dinner", calories: 650, protein: 40,
    ingredients: "4 oz cooked ground turkey, 2 oz dry pasta, tomato sauce, vegetables, some olive oil" },
  { id: "snack-default", slot: "snack", label: "Greek yogurt snack", calories: 80, protein: 12,
    ingredients: "1/2 cup plain Greek yogurt" },
];

export const PORTIONS = [
  { value: 0, label: "None" },
  { value: 0.5, label: "Half" },
  { value: 1, label: "Full" },
  { value: 1.5, label: "1.5×" },
  { value: 2, label: "2×" },
];

// Boosters ship with NO foods assigned: the spec says unassigned calories must
// never be added to totals, so the user taps a suggestion (or types their own)
// in Settings before the button becomes usable. Values are rough estimates.
export const DEFAULT_BOOSTERS = [
  { id: "boost-150", calories: 150, protein: 0, foods: "" },
  { id: "boost-200", calories: 200, protein: 0, foods: "" },
];
export const BOOSTER_SUGGESTIONS = {
  "boost-150": [
    { foods: "1 cup whole milk", protein: 8 },
    { foods: "2 large eggs", protein: 12 },
    { foods: "1.5 tbsp peanut butter", protein: 6 },
  ],
  "boost-200": [
    { foods: "2 tbsp peanut butter", protein: 7 },
    { foods: "1 banana + 1 tbsp peanut butter", protein: 4 },
    { foods: "1/4 cup almonds", protein: 7 },
  ],
};

// weekday index: 0 = Sunday … 6 = Saturday (JS Date.getDay)
export const SCHEDULE = {
  1: { routine: "A", label: "Workout A" },
  2: { routine: "walk", label: "Recovery walk + evening routine" },
  3: { routine: "B", label: "Workout B" },
  4: { routine: "walk", label: "Recovery walk + evening routine" },
  5: { routine: "A", label: "Workout A" },
  6: { routine: "walk", label: "Easy walk / gentle mobility" },
  0: { routine: "rest", label: "Rest + meal prep" },
};
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ex(id, name, sets, reps, extra = {}) {
  return { id, name, sets, reps, phase: 1, clearanceRequired: false, ...extra };
}
export const WORKOUTS = {
  A: [
    ex("a-squat", "Slow bodyweight squats", 3, "12–20", { density: true }),
    ex("a-lunge", "Reverse lunges", 3, "8–12 per leg"),
    ex("a-bridge", "Glute bridges", 3, "15–20"),
    ex("a-calf", "Calf raises", 3, "20"),
    ex("a-heel", "Supine heel slides", 2, "10 per leg", { noRamp: true }),
  ],
  B: [
    ex("b-split", "Split squats", 3, "8–12 per leg"),
    ex("b-chair", "Slow chair squats", 3, "12", { density: true }),
    ex("b-sissy", "Sissy squats (assisted, partial range)", 2, "6–10", { cue: "Hold a post lightly with your LEFT hand only; keep the right arm relaxed and your neck neutral. Start shallow, lean back, knees travel forward. Stop if the front of the knee hurts." }),
    ex("b-sl-bridge", "Single-leg glute bridges", 3, "8 per leg"),
    ex("b-wall", "Wall sit", 3, "30–45 sec"),
    ex("b-march", "Supine marching", 2, "12", { noRamp: true }),
  ],
};
// Locked until clinician clearance + per-exercise flags (see isExerciseUnlocked).
// Set/rep numbers are placeholders for a clinician to overwrite, not prescriptions.
export const UPPER_BODY = [
  ex("u-iso", "Light elbow isometrics (clinician-approved)", 2, "as directed", { phase: 2, clearanceRequired: true, noRamp: true }),
  ex("u-band", "Light band work (clinician-approved)", 2, "as directed", { phase: 2, clearanceRequired: true, noRamp: true }),
  ex("u-wall-push", "Wall push-ups", 2, "8–12", { phase: 2, clearanceRequired: true, days: ["A"] }),
  ex("u-incline-push", "Incline push-ups", 2, "6–10", { phase: 3, clearanceRequired: true, days: ["A"] }),
  ex("u-push", "Standard push-ups", 3, "6–12", { phase: 4, clearanceRequired: true, days: ["A"] }),
  ex("u-press", "Dumbbell floor press (neutral grip)", 2, "8–12", { phase: 3, clearanceRequired: true, days: ["A"] }),
  ex("u-tri", "Triceps pushdowns (cable or band)", 2, "10–15", { phase: 3, clearanceRequired: true }),
  ex("u-row", "Light rows (neutral grip, chest-supported if possible)", 2, "8–12", { phase: 3, clearanceRequired: true }),
  ex("u-pulldown", "Lat pulldown (neutral grip, never underhand)", 2, "8–12", { phase: 3, clearanceRequired: true, days: ["B"] }),
  ex("u-ohp", "Light overhead press (neutral grip, stop if neck/traps complain)", 2, "8–10", { phase: 4, clearanceRequired: true, days: ["B"] }),
];

// Quick pre-session check before any cleared upper-body work. Advisory: it
// recommends lower-body only if anything is unticked; it never clears anything.
export const READINESS = [
  { id: "rom", label: "Full elbow range today with no pain" },
  { id: "resist", label: "No pain with light palm-up resistance" },
  { id: "nextday", label: "No symptoms the day after my last upper-body session" },
];

// Progression ladders (easier → harder variants of the same movement). The shown
// variant follows state.progression, but never one that isn't cleared + pain-free.
export const LADDERS = { push: ["u-wall-push", "u-incline-push", "u-push"] };
export const LADDER_OF = Object.fromEntries(Object.entries(LADDERS).flatMap(([k, ids]) => ids.map((id) => [id, k])));
export const MAX_LOAD_LEVEL = 10;

// Session order: 1 warm-up/rehab → 2 main leg lift → 3 main upper push/pull →
// 4 secondary → 5 accessories. A density lift is moved up to 1.5 (fresh legs).
const STAGE = {
  "u-iso": 1, "u-band": 1, "a-heel": 1, "b-march": 1,
  "a-squat": 2, "b-split": 2,
  "u-wall-push": 3, "u-incline-push": 3, "u-push": 3, "u-press": 3, "u-pulldown": 3, "u-ohp": 3,
  "a-lunge": 4, "a-bridge": 4, "b-chair": 4, "b-sl-bridge": 4, "u-row": 4,
  "u-tri": 5, "a-calf": 5, "b-sissy": 5, "b-wall": 5,
};

export const REST_OPTIONS = [45, 60, 90, 120, 180];

export const PHASES = [
  { n: 1, name: "Protect", weeks: "1–2", plan: "Three lower-body/core workouts per week; gentle pain-free elbow/wrist movement; no resisted curls", gate: "Everyday movement comfortable; no worsening symptoms" },
  { n: 2, name: "Reintroduce", weeks: "3–4, if cleared", plan: "Continue legs; clinician-approved very light upper-body isometrics / wall push-ups / band work only if appropriate", gate: "Significant tendon injury excluded; no symptoms during/next day" },
  { n: 3, name: "Build", weeks: "5–8, if tolerated", plan: "Three full-body sessions; gradual incline push-ups, light rows and harder leg work", gate: "Consistent comfortable motion and loading" },
  { n: 4, name: "Progress", weeks: "9–13, if tolerated", plan: "Three progressive full-body sessions; optional fourth short session; add load/reps gradually", gate: "No recurrence of elbow or neck pain" },
];

// requiresClearance: steps that load the elbow/upper body. Ladder steps are also
// sequential — a step can't be ticked before the one above it.
export const LADDER = [
  { id: "clearance", label: "Clinician evaluation / clearance documented (tap Yes only after it occurs)", requiresClearance: false },
  { id: "motion", label: "Gentle pain-free elbow motion tolerated", requiresClearance: false },
  { id: "iso", label: "Clinician-approved light elbow isometrics tolerated", requiresClearance: true },
  { id: "resist", label: "Clinician-approved light elbow resistance tolerated", requiresClearance: true },
  { id: "wall", label: "Wall push-ups tolerated (if appropriate)", requiresClearance: true },
  { id: "incline", label: "Incline push-ups tolerated", requiresClearance: true },
  { id: "rows", label: "Light rows tolerated", requiresClearance: true },
  { id: "normal", label: "Normal resistance training resumed", requiresClearance: true },
  { id: "golf-putt", label: "Return to golf 1: putting", requiresClearance: true },
  { id: "golf-chip", label: "Return to golf 2: short chips", requiresClearance: true },
  { id: "golf-partial", label: "Return to golf 3: partial swings", requiresClearance: true },
  { id: "golf-full", label: "Return to golf 4: full swings (only if tolerated and cleared)", requiresClearance: true },
];

export const SLEEP_BANDS = [
  { id: "lt5", label: "<5 h" }, { id: "5-6", label: "5–6 h" }, { id: "6-7", label: "6–7 h" },
  { id: "7-8", label: "7–8 h" }, { id: "8-9", label: "8–9 h" }, { id: "gt9", label: "9+ h" },
];
export const SLEEP_ON_TARGET = ["7-8", "8-9", "gt9"];

export const YOGA_STAGES = [
  { id: "constructive", label: "Constructive rest, lying on back", minutes: 2 },
  { id: "knee", label: "Gentle knee-to-chest", minutes: 2 },
  { id: "figure4", label: "Reclined figure-four stretch", minutes: 2 },
  { id: "savasana", label: "Supported savasana", minutes: 2 },
  { id: "meditation", label: "Quiet breath-focused meditation", minutes: 4 },
];

export const PAIN = {
  areas: [
    { id: "elbow", label: "Right elbow/forearm" },
    { id: "neck", label: "Neck/trap" },
  ],
  times: [
    { id: "morning", label: "Morning" }, { id: "evening", label: "Evening" },
    { id: "before", label: "Before activity" }, { id: "after", label: "After activity" },
  ],
  qualities: ["None", "Ache", "Sharp", "Electric", "Tight", "Other"],
  triggers: ["Palm-up elbow bend", "Grip", "Forearm rotation", "Neck turn", "Shoulder motion", "Golf", "None"],
  trends: ["Better", "Same", "Worse"],
  redFlags: [
    { id: "bruising", label: "Bruising" }, { id: "pop", label: "Pop" },
    { id: "deformity", label: "Visible deformity" }, { id: "weakness", label: "Weakness" },
    { id: "numbness", label: "Numbness/tingling" },
  ],
};

// section → rendering group. derive tells the UI where the real control lives.
export const CHECKLIST = [
  { id: "weigh", section: "Morning", label: "Weighed in (optional)", derive: { type: "weight" } },
  { id: "m-breakfast", section: "Morning", label: "Breakfast completed", derive: { type: "meal", slot: "breakfast" } },
  { id: "pain-am", section: "Morning", label: "Morning pain check completed", derive: { type: "pain", tod: "morning" } },
  { id: "m-lunch", section: "Midday", label: "Lunch completed", derive: { type: "meal", slot: "lunch" } },
  { id: "water1", section: "Midday", label: "Water check 1 completed", derive: { type: "hydration", n: 1 } },
  { id: "workout", section: "Midday", label: "Workout completed", derive: { type: "workout" }, scheduledOnly: true },
  { id: "m-shake", section: "Afternoon / evening", label: "Weight-gain shake completed", derive: { type: "meal", slot: "shake" } },
  { id: "m-dinner", section: "Afternoon / evening", label: "Dinner completed", derive: { type: "meal", slot: "dinner" } },
  { id: "m-snack", section: "Afternoon / evening", label: "Greek yogurt snack completed", derive: { type: "meal", slot: "snack" } },
  { id: "water2", section: "Afternoon / evening", label: "Water check 2 completed", derive: { type: "hydration", n: 2 } },
  { id: "yoga", section: "Afternoon / evening", label: "Evening yoga (8 minutes) completed", derive: { type: "yoga" } },
  { id: "meditation", section: "Afternoon / evening", label: "Meditation (4 minutes) completed", derive: { type: "meditation" } },
  { id: "pain-pm", section: "Afternoon / evening", label: "Evening pain check completed", derive: { type: "pain", tod: "evening" } },
  { id: "sleep-plan", section: "Afternoon / evening", label: "Sleep plan confirmed", derive: { type: "manual" } },
];
export const CHECK_STATUSES = [
  { id: "done", label: "Done" }, { id: "partial", label: "Partial" },
  { id: "skipped", label: "Skipped" }, { id: "substituted", label: "Substituted" },
];

export const GROCERIES = ["Eggs", "Whole milk", "Oats", "Bananas", "Peanut butter", "Chicken thighs",
  "Ground turkey (or lower-cost equivalent)", "Rice", "Beans", "Pasta", "Tomato sauce", "Frozen vegetables",
  "Plain Greek yogurt", "Olive oil / pantry staples"];
export const MEAL_PREP = ["Cook batch protein", "Cook rice / pasta", "Portion lunches",
  "Prepare shake ingredients", "Check groceries for next 3–4 days"];

export const REVIEW_CALORIE_OPTIONS = ["Keep", "+150", "+200", "-100", "-200"];
export const REVIEW_TRAINING_OPTIONS = ["Maintain", "Progress if cleared", "Deload", "Seek evaluation"];

// Illustrative only — start 159, week 13 ~174. Never framed as pass/fail.
export const MILESTONES = [[0, 159], [2, 161], [4, 163.5], [6, 165.5], [8, 168], [10, 170.5], [13, 174]];

export function defaultReminders() {
  const mk = (id, category, label, time, weekdays) => ({ id, category, label, time, weekdays, enabled: true, snoozeMinutes: 15 });
  const all = [0, 1, 2, 3, 4, 5, 6];
  return [
    mk("weigh", "weighin", "Morning weigh-in", "07:15", all),
    mk("meal-breakfast", "meal", "Breakfast", "07:30", all),
    mk("meal-lunch", "meal", "Lunch", "12:30", all),
    mk("meal-shake", "meal", "Weight-gain shake", "15:30", all),
    mk("meal-dinner", "meal", "Dinner", "18:30", all),
    mk("meal-snack", "meal", "Greek yogurt snack", "20:30", all),
    mk("wk-mon", "workout", "Workout A", "17:30", [1]),
    mk("wk-tue", "workout", "Recovery walk + evening routine", "20:30", [2]),
    mk("wk-wed", "workout", "Workout B", "17:30", [3]),
    mk("wk-thu", "workout", "Recovery walk + evening routine", "20:30", [4]),
    mk("wk-fri", "workout", "Workout A", "17:30", [5]),
    mk("wk-sat", "workout", "Easy walk / gentle mobility", "10:00", [6]),
    mk("wk-sun", "workout", "Rest + meal prep", "16:00", [0]),
    mk("evening", "evening", "Evening yoga + meditation", "21:00", all),
  ];
}
export const REMINDER_CATEGORIES = [
  { id: "weighin", label: "Weigh-in" }, { id: "meal", label: "Meals" },
  { id: "workout", label: "Workout / walk" }, { id: "evening", label: "Yoga + meditation" },
];

// ---------- Dates ----------

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); };
export function addDays(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
export const weekdayOf = (s) => parseYmd(s).getDay();
export const diffDays = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 86400000);
export function weekStartOf(s) { const wd = weekdayOf(s); return addDays(s, -((wd + 6) % 7)); } // Monday
export const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; } };
export const stamp = (now = new Date()) => ({ loggedAt: now.toISOString(), tz: localTz() });

// ---------- State access ----------

const EMPTY_DAY = Object.freeze({});
export const getDay = (state, date) => state.days[date] || EMPTY_DAY;
export const presetById = (state, id) => state.mealPresets.find((p) => p.id === id);
export function currentPreset(state, date, slot) {
  const swapped = getDay(state, date).swaps?.[slot];
  return presetById(state, swapped) || state.mealPresets.find((p) => p.slot === slot && p.isDefault !== false) || state.mealPresets.find((p) => p.slot === slot);
}

// ---------- Nutrition ----------

export function mealTotals(state, date) {
  const day = getDay(state, date);
  let calories = 0, protein = 0;
  for (const m of Object.values(day.meals || {})) {
    if (!m || !(m.multiplier > 0)) continue; // skipped/None logs zero, never the preset default
    calories += m.calories * m.multiplier;
    protein += m.protein * m.multiplier;
  }
  for (const b of day.boosters || []) { calories += b.calories; protein += b.protein || 0; }
  return { calories: Math.round(calories), protein: Math.round(protein) };
}

// ---------- Training ----------

export function routineForDate(state, date) {
  const override = getDay(state, date).workout?.override;
  return override || SCHEDULE[weekdayOf(date)].routine;
}
export const isLoadedRoutine = (r) => r === "A" || r === "B";

export function isExerciseUnlocked(state, id) {
  const ex = state.clearance.exercises[id];
  return !!(state.clearance.ladder.clearance && ex?.cleared && ex?.painFree);
}
// Four-week wave borrowed from the strength plan: add sets for three weeks,
// then deload back to the base. Upper body ramps more gently than legs. The wave
// follows the calendar from the start date, so it is only a set-count suggestion
// and never unlocks anything.
export const WAVE_LOWER = [0, 1, 2, 0];
export const WAVE_UPPER = [0, 1, 1, 0];
export const BLOCK_REPS = ["12–15", "10–12", "8–10", "8–10"];
export function waveInfo(state, date) {
  const weeks = Math.max(0, Math.floor(diffDays(date, state.profile.startDate) / 7));
  const weekInBlock = weeks % 4, block = Math.floor(weeks / 4);
  const deload = weekInBlock === 3;
  return {
    weeks, weekInBlock, block, deload,
    reps: BLOCK_REPS[Math.min(block, BLOCK_REPS.length - 1)],
    rir: deload ? "3+ reps in reserve (deload: same weights, fewer sets)" : weekInBlock === 0 ? "about 3 reps in reserve" : "about 2 reps in reserve",
  };
}
// Week 3 of each block: one lower-body lift per workout becomes a density block
// (8 sets, short rest) borrowed from Gironda-style 8x8. Legs only; never upper body.
export const DENSITY_SETS = 8;
export const isDensityWeek = (state, date) => waveInfo(state, date).weekInBlock === 2;
export function setsFor(state, date, e) {
  if (e.noRamp) return e.sets;
  if (e.density && isDensityWeek(state, date)) return DENSITY_SETS;
  const wave = e.clearanceRequired ? WAVE_UPPER : WAVE_LOWER;
  return e.sets + wave[waveInfo(state, date).weekInBlock];
}
export const progressLevel = (state, key) => state.progression?.[key]?.level ?? 0;
// Which ladder variant to show: the one at the current level if cleared, else the
// nearest cleared one at/above it, else the highest cleared below it.
export function shownLadderVariant(state, key) {
  const ids = LADDERS[key], lvl = progressLevel(state, key);
  const open = ids.map((id, i) => ({ id, i })).filter((v) => isExerciseUnlocked(state, v.id));
  if (!open.length) return null;
  return (open.find((v) => v.i >= lvl) || open[open.length - 1]);
}
export function canProgress(state, key) {
  if (LADDERS[key]) {
    const cur = shownLadderVariant(state, key);
    return !!cur && cur.i + 1 < LADDERS[key].length && isExerciseUnlocked(state, LADDERS[key][cur.i + 1]);
  }
  return progressLevel(state, key) < MAX_LOAD_LEVEL;
}
export function exercisesForDate(state, date) {
  const r = routineForDate(state, date);
  if (!isLoadedRoutine(r)) return [];
  const base = WORKOUTS[r];
  const shown = new Set(Object.keys(LADDERS).map((k) => shownLadderVariant(state, k)?.id).filter(Boolean));
  const upper = UPPER_BODY.filter((u) => isExerciseUnlocked(state, u.id) && (!u.days || u.days.includes(r)) && (!LADDER_OF[u.id] || shown.has(u.id)));
  const dense = isDensityWeek(state, date);
  return [...base, ...upper]
    .map((e) => {
      const key = LADDER_OF[e.id] || e.id;
      return { ...e, sets: setsFor(state, date, e), isDensity: !!(e.density && dense), progKey: key, level: LADDERS[key] ? shownLadderVariant(state, key).i : progressLevel(state, key), ladder: !!LADDERS[key] };
    })
    .map((e, i) => ({ e, i, st: e.isDensity ? 1.5 : STAGE[e.id] ?? 4 }))
    .sort((a, b) => a.st - b.st || a.i - b.i)
    .map((x) => x.e);
}
export function setKey(exId, i) { return `${exId}#${i}`; }
export function workoutProgress(state, date) {
  const exs = exercisesForDate(state, date);
  const sets = getDay(state, date).sets || {};
  let total = 0, done = 0, logged = 0;
  for (const e of exs) for (let i = 0; i < e.sets; i++) {
    total++;
    const s = sets[setKey(e.id, i)];
    if (s) logged++;
    if (s?.status === "done") done++;
  }
  return { total, done, logged };
}
export function workoutStatus(state, date) {
  const w = getDay(state, date).workout;
  if (w?.skipped) return "skipped";
  const p = workoutProgress(state, date);
  if (p.total && p.done === p.total) return "done";
  if (p.done > 0) return "partial";
  return null;
}
// Adherence only counts scheduled loaded workouts on days that have ended (or
// today once any set is logged). Rest/walk days never lower it.
export function adherence(state, from, to, today) {
  let scheduled = 0, completed = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d < state.profile.startDate) continue;
    if (!isLoadedRoutine(routineForDate(state, d))) continue;
    if (d > today) continue;
    if (d === today && workoutProgress(state, d).logged === 0 && !getDay(state, d).workout?.skipped) continue;
    scheduled++;
    if (workoutStatus(state, d) === "done") completed++;
  }
  return { scheduled, completed, pct: scheduled ? Math.round((100 * completed) / scheduled) : null };
}

export function phaseForDate(state, date) {
  const week = Math.floor(diffDays(date, state.profile.startDate) / 7) + 1;
  if (week < 1) return { week, phase: PHASES[0] };
  const n = week <= 2 ? 1 : week <= 4 ? 2 : week <= 8 ? 3 : 4;
  return { week, phase: PHASES[n - 1] };
}

export function ladderStepAvailable(state, idx) {
  const step = LADDER[idx];
  if (idx === 0) return true;
  if (!state.clearance.ladder[LADDER[idx - 1].id]) return false; // sequential
  if (step.requiresClearance && !state.clearance.ladder.clearance) return false;
  return true;
}

// ---------- Weight ----------

export function weightPoints(state, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const w = getDay(state, d).weight;
    if (w) out.push({ date: d, lb: w.lb });
  }
  return out;
}
export function weightAvgSeries(state, from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const pts = weightPoints(state, addDays(d, -6), d);
    if (pts.length) out.push({ date: d, avg: pts.reduce((s, p) => s + p.lb, 0) / pts.length });
  }
  return out;
}
// Rate of change over the trailing 14 days via least-squares slope. A raw
// difference of two weekly means is dominated by day-to-day water noise
// (±1–2 lb), so the slope over all points is steadier. Needs ≥4 weigh-ins
// spanning ≥7 days; otherwise we say "not enough data" rather than guess.
export function weightRatePerWeek(state, date) {
  const pts = weightPoints(state, addDays(date, -13), date);
  if (pts.length < 4) return null;
  const x0 = diffDays(pts[0].date, date);
  const xs = pts.map((p) => diffDays(p.date, date) - x0);
  if (xs[xs.length - 1] < 7) return null;
  const n = pts.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = pts.reduce((a, p) => a + p.lb, 0) / n;
  let num = 0, den = 0;
  pts.forEach((p, i) => { num += (xs[i] - mx) * (p.lb - my); den += (xs[i] - mx) ** 2; });
  return den ? (num / den) * 7 : null;
}
export function calorieAdvice(state, date) {
  const rate = weightRatePerWeek(state, date);
  const reviews = Object.keys(state.weeklyReviews).sort();
  const waists = reviews.map((k) => state.weeklyReviews[k].waistIn).filter((v) => typeof v === "number");
  const waistUp = waists.length >= 2 && waists[waists.length - 1] > waists[waists.length - 2];
  if (rate == null) return { rate: null, action: "wait", text: "Not enough weigh-ins yet (need ≥4 over ≥7 days in the last 2 weeks). Keep current calories.", waistUp };
  const r = Math.round(rate * 100) / 100;
  if (rate < 0.5) return { rate: r, action: "increase", waistUp, text: `Trend ≈ ${r.toFixed(2)} lb/week (under ~0.5). Consider +150–200 kcal/day. Starting calories were an estimate.` };
  if (rate > 1) return { rate: r, action: "decrease", waistUp, text: `Trend ≈ ${r.toFixed(2)} lb/week (over ~1).${waistUp ? " Waist is also up." : ""} Consider −100–200 kcal/day.` };
  return { rate: r, action: "keep", waistUp, text: `Trend ≈ ${r.toFixed(2)} lb/week — within the ~0.5–1 range. Keep calories.` };
}
export function milestoneAt(state, date) {
  const wk = diffDays(date, state.profile.startDate) / 7;
  if (wk < 0 || wk > 13) return null;
  const scale = state.profile.startingWeight - MILESTONES[0][1];
  for (let i = 1; i < MILESTONES.length; i++) {
    const [w1, v1] = MILESTONES[i], [w0, v0] = MILESTONES[i - 1];
    if (wk <= w1) return v0 + ((v1 - v0) * (wk - w0)) / (w1 - w0) + scale;
  }
  return null;
}

// ---------- Pain ----------

export function painRows(state, date, tod) {
  return state.pain.filter((r) => r.date === date && (!tod || r.tod === tod));
}
export function painDaily(state, date, area) {
  const vals = painRows(state, date).filter((r) => r.area === area && typeof r.severity === "number").map((r) => r.severity);
  return vals.length ? Math.max(...vals) : null;
}
export function activeRedFlags(rows) {
  const s = new Set();
  for (const r of rows) for (const f of r.redFlags || []) if (f !== "none") s.add(f);
  return [...s];
}
export function painAdvice(rows) {
  const flags = activeRedFlags(rows);
  if (flags.length) return { level: "red", text: "You flagged a warning sign. This tracker can't diagnose — please get a prompt clinical assessment (a pop, bruising, visible biceps deformity, marked weakness turning the palm up, or worsening numbness/weakness warrants prompt evaluation; progressive neurological weakness is urgent)." };
  const neckElectric = rows.some((r) => (r.area === "neck") && r.quality === "Electric");
  if (neckElectric) return { level: "amber", text: "Electric or locking neck symptoms warrant a clinical assessment, especially if recurrent." };
  return null;
}

// ---------- Checklist status ----------

export function derivedStatus(state, date, item) {
  const day = getDay(state, date);
  const d = item.derive;
  switch (d.type) {
    case "meal": { const m = day.meals?.[d.slot]; return !m ? null : m.status; }
    case "weight": return day.weight ? "done" : null;
    case "hydration": return day.hydrationChecks?.[d.n] ? "done" : null;
    case "pain": {
      const rows = painRows(state, date, d.tod);
      if (!rows.length) return null;
      return rows.every((r) => r.skipped) ? "skipped" : "done";
    }
    case "workout": return workoutStatus(state, date);
    case "yoga": {
      const st = day.yogaStages || {};
      const first4 = YOGA_STAGES.slice(0, 4).map((s) => st[s.id]?.status);
      if (first4.every((s) => s === "done")) return "done";
      if (first4.some((s) => s === "done")) return "partial";
      return first4.every((s) => s === "skipped") ? "skipped" : null;
    }
    case "meditation": return day.meditationDone || day.yogaStages?.meditation?.status === "done" ? "done" : (day.yogaStages?.meditation?.status === "skipped" ? "skipped" : null);
    default: return null;
  }
}
export function checklistStatus(state, date, item) {
  const manual = getDay(state, date).checks?.[item.id];
  return manual?.status || derivedStatus(state, date, item);
}
export function checklistFor(state, date) {
  const r = routineForDate(state, date);
  return CHECKLIST.filter((i) => !i.scheduledOnly || isLoadedRoutine(r));
}

// ---------- Reminders ----------

const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
export function reminderDate(date, time) { const d = parseYmd(date); d.setHours(0, toMin(time), 0, 0); return d; }
export function reminderActive(state, r, date) {
  return r.enabled && state.reminderCategories[r.category] !== false && r.weekdays.includes(weekdayOf(date)) && !state.reminderState.skipped[`${date}|${r.id}`];
}
export function nextReminder(state, now = new Date()) {
  let best = null;
  const today = ymd(now);
  for (let i = 0; i < 8; i++) {
    const date = addDays(today, i);
    for (const r of state.reminders) {
      if (!reminderActive(state, r, date)) continue;
      const at = reminderDate(date, r.time);
      if (at > now && (!best || at < best.at)) best = { reminder: r, at };
    }
  }
  return best;
}
export function dueReminders(state, now = new Date(), graceMin = 10) {
  const today = ymd(now);
  const due = [];
  for (const r of state.reminders) {
    if (!reminderActive(state, r, today)) continue;
    const key = `${today}|${r.id}`;
    if (state.reminderState.fired[key]) continue;
    const at = reminderDate(today, r.time);
    const age = (now - at) / 60000;
    if (age >= 0 && age <= graceMin) due.push({ key, reminder: r });
  }
  return due;
}
