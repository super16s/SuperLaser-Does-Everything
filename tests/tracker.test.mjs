import test from "node:test";
import assert from "node:assert/strict";
import { createStore, actions as A } from "../public/tracker/store.js";
import * as L from "../public/tracker/logic.js";

const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const MON = "2026-10-19", TUE = "2026-10-20", WED = "2026-10-21", SUN = "2026-10-25";
const fresh = (start = MON) => { const s = createStore(mem()); s.mutate((d) => { d.profile.startDate = start; }); return s; };
const run = (store, fn) => store.mutate(fn);
const item = (id) => L.CHECKLIST.find((i) => i.id === id);

test("calendar assumptions used by the tests", () => {
  assert.equal(L.weekdayOf(MON), 1); assert.equal(L.weekdayOf(SUN), 0);
  assert.equal(L.weekStartOf(SUN), MON);
});

test("all five meals Full → 2,825 kcal / 166 g (v3 presets)", () => {
  const st = fresh();
  for (const slot of L.SLOTS) run(st, (s) => A.setMeal(s, MON, slot.id, 1));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 2825, protein: 166 });
});

test("half lunch → 400 kcal / 25 g; untapping removes it", () => {
  const st = fresh();
  run(st, (s) => A.setMeal(s, MON, "lunch", 0.5));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 400, protein: 25 });
  run(st, (s) => A.setMeal(s, MON, "lunch", 0.5));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 0, protein: 0 });
  assert.equal(L.getDay(st.state, MON).meals, undefined);
});

test("None logs zero (not preset default) and is distinct from not-logged", () => {
  const st = fresh();
  run(st, (s) => A.setMeal(s, MON, "dinner", 0));
  assert.equal(L.mealTotals(st.state, MON).calories, 0);
  assert.equal(st.state.days[MON].meals.dinner.status, "skipped");
});

test("editing a preset later does not rewrite already-logged meals", () => {
  const st = fresh();
  run(st, (s) => A.setMeal(s, MON, "lunch", 1));
  run(st, (s) => { s.mealPresets.find((p) => p.id === "lunch-default").calories = 100; });
  assert.equal(L.mealTotals(st.state, MON).calories, 800);
});

test("swap uses the chosen preset's macros", () => {
  const st = fresh();
  run(st, (s) => s.mealPresets.push({ id: "alt", slot: "lunch", label: "Alt", calories: 500, protein: 30, ingredients: "", isDefault: false }));
  run(st, (s) => A.swapMeal(s, MON, "lunch", "alt"));
  run(st, (s) => A.setMeal(s, MON, "lunch", 1));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 500, protein: 30 });
});

test("unassigned boosters add nothing; assigned ones do", () => {
  const st = fresh();
  run(st, (s) => A.addBooster(s, MON, "boost-150"));
  assert.equal(L.mealTotals(st.state, MON).calories, 0);
  run(st, (s) => { Object.assign(s.boosters[0], { foods: "1 cup whole milk", protein: 8 }); });
  run(st, (s) => A.addBooster(s, MON, "boost-150"));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 150, protein: 8 });
});

test("Monday workout does not complete Wednesday; rest days don't lower adherence", () => {
  const st = fresh();
  for (const e of L.WORKOUTS.A) for (let i = 0; i < e.sets; i++) run(st, (s) => A.setSet(s, MON, e.id, i, "done"));
  assert.equal(L.workoutStatus(st.state, MON), "done");
  assert.equal(L.workoutStatus(st.state, WED), null);
  assert.deepEqual(L.adherence(st.state, MON, SUN, SUN), { scheduled: 5, completed: 1, pct: 20 });
  assert.equal(L.adherence(st.state, TUE, TUE, TUE).pct, null);
});

test("today's unlogged workout isn't counted as a miss yet", () => {
  const st = fresh();
  assert.equal(L.adherence(st.state, MON, MON, MON).scheduled, 0);
});

test("workout checklist item only appears on loaded days", () => {
  const st = fresh();
  assert.ok(L.checklistFor(st.state, MON).some((i) => i.id === "workout"));
  assert.ok(!L.checklistFor(st.state, SUN).some((i) => i.id === "workout"));
});

test("upper-body stays locked until clearance AND both flags", () => {
  const st = fresh();
  const id = "u-wall-push";
  assert.equal(L.isExerciseUnlocked(st.state, id), false);
  run(st, (s) => A.setExerciseFlag(s, id, "cleared", true));
  assert.equal(st.state.clearance.exercises[id], undefined);
  run(st, (s) => A.setLadder(s, "iso", true));
  assert.equal(!!st.state.clearance.ladder.iso, false);
  run(st, (s) => A.setLadder(s, "clearance", true));
  run(st, (s) => A.setExerciseFlag(s, id, "cleared", true));
  assert.equal(L.isExerciseUnlocked(st.state, id), false);
  run(st, (s) => A.setExerciseFlag(s, id, "painFree", true));
  assert.equal(L.isExerciseUnlocked(st.state, id), true);
  assert.ok(L.exercisesForDate(st.state, MON).some((e) => e.id === id));
  assert.equal(L.isExerciseUnlocked(st.state, "u-row"), false);
  run(st, (s) => A.setLadder(s, "clearance", false));
  assert.equal(L.isExerciseUnlocked(st.state, id), false);
});

test("ladder is sequential", () => {
  const st = fresh();
  run(st, (s) => A.setLadder(s, "clearance", true));
  run(st, (s) => A.setLadder(s, "iso", true));
  assert.equal(!!st.state.clearance.ladder.iso, false);
  run(st, (s) => A.setLadder(s, "motion", true));
  run(st, (s) => A.setLadder(s, "iso", true));
  assert.ok(st.state.clearance.ladder.iso);
});

test("a single severity tap logs a pain row with no other input", () => {
  const st = fresh();
  run(st, (s) => A.painSet(s, MON, "morning", ["elbow"], { severity: 4 }));
  assert.equal(L.painDaily(st.state, MON, "elbow"), 4);
  assert.equal(L.painDaily(st.state, MON, "neck"), null);
});

test("pain skip doesn't coerce a score; later tap replaces the skip", () => {
  const st = fresh();
  run(st, (s) => A.painSkip(s, MON, "morning"));
  assert.equal(L.painDaily(st.state, MON, "elbow"), null);
  assert.equal(L.derivedStatus(st.state, MON, item("pain-am")), "skipped");
  run(st, (s) => A.painSet(s, MON, "morning", ["elbow"], { severity: 2 }));
  assert.equal(L.painRows(st.state, MON, "morning").length, 1);
});

test("red flags produce advice, never a diagnosis", () => {
  const st = fresh();
  run(st, (s) => A.painSet(s, MON, "morning", ["elbow"], { severity: 6, redFlags: ["pop"] }));
  assert.equal(L.painAdvice(L.painRows(st.state, MON)).level, "red");
});

test("a skipped reminder fabricates no completion", () => {
  const st = fresh();
  st.quiet((s) => { s.reminderState.skipped[`${MON}|meal-lunch`] = true; });
  assert.equal(L.getDay(st.state, MON).meals, undefined);
  assert.equal(L.mealTotals(st.state, MON).calories, 0);
});

test("due reminders fire within grace only, and respect weekday + category toggles", () => {
  const st = fresh();
  const at = L.reminderDate(MON, "12:30");
  const due = (d) => L.dueReminders(st.state, d).map((x) => x.reminder.id);
  assert.ok(due(new Date(+at + 60000)).includes("meal-lunch"));
  assert.ok(!due(new Date(+at + 3600000)).includes("meal-lunch"));
  st.quiet((s) => { s.reminderCategories.meal = false; });
  assert.ok(!due(new Date(+at + 60000)).includes("meal-lunch"));
  assert.ok(!due(new Date(+L.reminderDate(SUN, "17:30") + 1000)).includes("wk-mon"));
});

test("next reminder is in the future and honours skip-today", () => {
  const st = fresh();
  const now = L.reminderDate(MON, "12:00");
  assert.equal(L.nextReminder(st.state, now).reminder.id, "meal-lunch");
  st.quiet((s) => { s.reminderState.skipped[`${MON}|meal-lunch`] = true; });
  assert.equal(L.nextReminder(st.state, now).reminder.id, "meal-shake");
});

test("calorie advice: needs data, then thresholds", () => {
  const st = fresh();
  assert.equal(L.calorieAdvice(st.state, MON).action, "wait");
  const seed = (perWeek) => run(st, (s) => { for (let i = 0; i < 14; i++) A.setWeight(s, L.addDays(MON, i), 159 + (perWeek * i) / 7); });
  const end = L.addDays(MON, 13);
  seed(0.2); assert.equal(L.calorieAdvice(st.state, end).action, "increase");
  seed(0.8); assert.equal(L.calorieAdvice(st.state, end).action, "keep");
  seed(1.4); assert.equal(L.calorieAdvice(st.state, end).action, "decrease");
});

test("7-day average weight series", () => {
  const st = fresh();
  run(st, (s) => { A.setWeight(s, MON, 158); A.setWeight(s, TUE, 160); });
  assert.equal(L.weightAvgSeries(st.state, MON, TUE)[1].avg, 159);
});

test("phase follows the calendar but never unlocks anything by itself", () => {
  const st = fresh();
  assert.equal(L.phaseForDate(st.state, MON).phase.n, 1);
  assert.equal(L.phaseForDate(st.state, L.addDays(MON, 28)).phase.n, 3);
  assert.equal(L.isExerciseUnlocked(st.state, "u-incline-push"), false);
});

test("undo, export/import round-trip, templates untouched, per-day isolation", () => {
  const st = fresh();
  const templateBefore = JSON.stringify(L.CHECKLIST);
  run(st, (s) => A.toggleHydration(s, MON, 1));
  assert.equal(L.checklistStatus(st.state, MON, item("water1")), "done");
  assert.equal(L.checklistStatus(st.state, MON, item("water2")), null);
  assert.equal(L.checklistStatus(st.state, TUE, item("water1")), null);
  st.undo();
  assert.equal(L.getDay(st.state, MON).checks, undefined);
  run(st, (s) => A.setMeal(s, MON, "lunch", 1));
  const other = createStore(mem());
  other.importJson(st.exportJson());
  assert.equal(L.mealTotals(other.state, MON).calories, 800);
  assert.equal(JSON.stringify(L.CHECKLIST), templateBefore);
  assert.throws(() => other.importJson('{"nope":1}'));
});

test("persists across store instances", () => {
  const storage = mem();
  createStore(storage).mutate((s) => A.setMeal(s, MON, "lunch", 2));
  assert.equal(L.mealTotals(createStore(storage).state, MON).calories, 1600);
});

test("a throwing mutation leaves state untouched", () => {
  const st = fresh();
  assert.throws(() => st.mutate((s) => { A.setMeal(s, MON, "lunch", 1); throw new Error("boom"); }));
  assert.equal(L.mealTotals(st.state, MON).calories, 0);
});

test("yoga: four stages = yoga done; meditation separate", () => {
  const st = fresh();
  for (const s of L.YOGA_STAGES.slice(0, 4)) run(st, (d) => A.setYogaStage(d, MON, s.id, "done"));
  assert.equal(L.derivedStatus(st.state, MON, item("yoga")), "done");
  assert.equal(L.derivedStatus(st.state, MON, item("meditation")), null);
  run(st, (d) => A.setYogaStage(d, MON, "meditation", "done"));
  assert.equal(L.derivedStatus(st.state, MON, item("meditation")), "done");
});


test("readiness ticks are per-day and toggle", () => {
  const st = fresh();
  run(st, (s) => A.setReadiness(s, MON, "rom"));
  assert.ok(L.getDay(st.state, MON).readiness.rom);
  assert.equal(L.getDay(st.state, TUE).readiness, undefined);
  run(st, (s) => A.setReadiness(s, MON, "rom"));
  assert.equal(L.getDay(st.state, MON).readiness, undefined);
});







test("load levels for non-ladder exercises go up and down within bounds", () => {
  const st = fresh();
  run(st, (s) => A.progress(s, "g-squat", 1));
  assert.equal(L.exercisesForDate(st.state, MON).find((e) => e.id === "g-squat").level, 1);
  run(st, (s) => { for (let i = 0; i < 20; i++) A.progress(s, "g-squat", 1); });
  assert.equal(L.progressLevel(st.state, "g-squat"), L.MAX_LOAD_LEVEL);
  run(st, (s) => { for (let i = 0; i < 20; i++) A.progress(s, "g-squat", -1); });
  assert.equal(L.progressLevel(st.state, "g-squat"), 0);
});

test("nutrition migration updates untouched older presets only, and keeps user edits", () => {
  const base = structuredClone(createStore(mem()).state);
  delete base.nutritionVersion;
  const setPreset = (state, id, patch) => Object.assign(state.mealPresets.find((p) => p.id === id), patch);
  const load = (state) => { const st = createStore(mem()); st.importJson(JSON.stringify(state)); return st; };
  const get = (st, id) => st.state.mealPresets.find((p) => p.id === id);

  const v1 = structuredClone(base);
  setPreset(v1, "breakfast-default", L.LEGACY_PRESETS["breakfast-default"][0]);
  setPreset(v1, "shake-default", { ...L.LEGACY_PRESETS["shake-default"][0], calories: 999 }); // user edited the shake
  const a = load(v1);
  assert.equal(get(a, "breakfast-default").calories, 765);
  assert.match(get(a, "breakfast-default").ingredients, /soy milk/);
  assert.equal(get(a, "shake-default").calories, 999);
  assert.equal(a.state.nutritionVersion, 3);

  const v2 = structuredClone(base); // full-scoop version that shipped briefly
  setPreset(v2, "shake-default", L.LEGACY_PRESETS["shake-default"][1]);
  const b = load(v2);
  assert.deepEqual([get(b, "shake-default").calories, get(b, "shake-default").protein], [530, 29]);

  const again = createStore(mem()); again.importJson(a.exportJson());
  assert.equal(get(again, "shake-default").calories, 999); // idempotent
});

test("supplement checklist items are manual and per-day", () => {
  const st = fresh();
  const cr = L.CHECKLIST.find((i) => i.id === "creatine");
  run(st, (s) => A.setCheck(s, MON, "creatine", "done"));
  assert.equal(L.checklistStatus(st.state, MON, cr), "done");
  assert.equal(L.checklistStatus(st.state, TUE, cr), null);
});

test("bulk flag needs documented clearance, then unlocks gym lifts but not starters", () => {
  const st = fresh();
  const lifts = L.GYM_LIFTS.map((u) => u.id);
  run(st, (s) => A.flagAllExercises(s, lifts));
  assert.ok(lifts.every((id) => !L.isExerciseUnlocked(st.state, id)));
  run(st, (s) => A.setLadder(s, "clearance", true));
  run(st, (s) => A.flagAllExercises(s, lifts));
  assert.ok(lifts.every((id) => L.isExerciseUnlocked(st.state, id)));
  assert.ok(L.UPPER_BODY.filter((u) => u.starter).every((u) => !L.isExerciseUnlocked(st.state, u.id)));
  assert.ok(L.exercisesForDate(st.state, MON).some((e) => e.id === "u-bench"));
});

test("set wave on gym legs: +0/+1/+2 then deload; rehab items fixed; upper ramps gently", () => {
  const st = fresh();
  const wk = (n) => L.addDays(MON, 7 * n);
  const sets = (date, id) => L.exercisesForDate(st.state, date).find((e) => e.id === id).sets;
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => sets(wk(n), "g-squat")), [3, 4, 8, 3, 3]); // week 3 = density
  assert.deepEqual([0, 1, 2, 3].map((n) => sets(wk(n), "g-legcurl")), [2, 3, 4, 2]);
  assert.equal(L.exercisesForDate(st.state, wk(2)).find((e) => e.id === "g-squat").isDensity, true);
  assert.equal(L.exercisesForDate(st.state, wk(1)).find((e) => e.id === "g-squat").isDensity, false);
  assert.equal(sets(L.addDays(TUE, 14), "a-heel"), 2); // rehab never ramps
  assert.equal(L.waveInfo(st.state, wk(3)).deload, true);
  assert.equal(L.waveInfo(st.state, wk(4)).reps, "10–12");
  run(st, (s) => A.setLadder(s, "clearance", true));
  run(st, (s) => A.flagAllExercises(s, L.GYM_LIFTS.map((u) => u.id)));
  assert.deepEqual([0, 1, 2, 3].map((n) => sets(wk(n), "u-row")), [3, 4, 4, 3]);
  assert.ok(L.exercisesForDate(st.state, wk(2)).filter((e) => e.clearanceRequired).every((e) => !e.isDensity && e.sets <= L.UPPER_BODY.find((u) => u.id === e.id).sets + 1));
});

test("workout B: leg extension is the density lift; sissy squats ramp gently and are gym-B only", () => {
  const st = fresh();
  const wed = (n) => L.addDays(WED, 7 * n);
  const find = (d, id) => L.exercisesForDate(st.state, d).find((e) => e.id === id);
  assert.equal(find(wed(2), "g-ext").sets, 8);
  assert.equal(find(wed(2), "g-split").sets, 5);
  assert.deepEqual([0, 1, 2, 3].map((n) => find(wed(n), "b-sissy").sets), [2, 3, 4, 2]);
  assert.equal(find(wed(2), "b-sissy").isDensity, false);
  assert.equal(find(MON, "b-sissy"), undefined);
  assert.equal(find(L.addDays(TUE, 14), "g-ext"), undefined); // gym lifts never appear on home days
});

test("no curls; gym upper split across A/B; home days use bodyweight + pull-up bar only", () => {
  const st = fresh();
  assert.ok(!L.ALL_EXERCISES().some((u) => /\bcurls?\b/i.test(u.name) && !/leg curl/i.test(u.name)));
  assert.ok(!L.ALL_EXERCISES().some((u) => /chin-?up/i.test(u.name) && !/no chin/i.test(u.name)));
  run(st, (s) => A.setLadder(s, "clearance", true));
  run(st, (s) => A.flagAllExercises(s, L.GYM_LIFTS.map((u) => u.id)));
  const ids = (d) => L.exercisesForDate(st.state, d).map((e) => e.id);
  assert.ok(ids(MON).includes("u-bench") && !ids(MON).some((i) => ["u-incdb", "u-pulldown", "u-ohp"].includes(i)));
  assert.ok(["u-incdb", "u-pulldown", "u-ohp"].every((i) => ids(WED).includes(i)) && !ids(WED).includes("u-bench"));
  for (const d of [MON, WED]) assert.ok(ids(d).includes("u-tri") && ids(d).includes("u-row"));
  assert.ok(ids(TUE).includes("h-close") && !ids(TUE).includes("h-pike"));
  assert.ok(ids(L.addDays(TUE, 2)).includes("h-pike")); // Thursday
  assert.ok(!ids(TUE).some((i) => i.startsWith("u-") || i.startsWith("g-"))); // no gym machines at home
});

test("home schedule: Tue/Thu are loaded routines, Saturday is optional via override", () => {
  const st = fresh();
  assert.equal(L.routineForDate(st.state, TUE), "H1");
  assert.equal(L.routineForDate(st.state, L.addDays(TUE, 2)), "H2");
  const sat = L.addDays(MON, 5);
  assert.equal(L.isLoadedRoutine(L.routineForDate(st.state, sat)), false);
  run(st, (s) => A.setWorkoutOverride(s, sat, "H1"));
  assert.ok(L.exercisesForDate(st.state, sat).length > 0);
});

test("session order: warm-up → main leg → main upper → secondary → accessories; density lift moves first", () => {
  const st = fresh();
  run(st, (s) => A.setLadder(s, "clearance", true));
  run(st, (s) => A.flagAllExercises(s, L.GYM_LIFTS.map((u) => u.id)));
  const ids = (d) => L.exercisesForDate(st.state, d).map((e) => e.id);
  assert.deepEqual(ids(MON), ["g-squat", "u-bench", "g-rdl", "u-row", "g-legcurl", "g-calf", "u-lat-raise", "u-tri"]);
  assert.deepEqual(ids(WED), ["g-split", "u-incdb", "u-pulldown", "u-ohp", "g-thrust", "u-row", "g-ext", "b-sissy", "u-tri", "u-fly", "u-rear", "u-tri-oh"]);
  assert.deepEqual(ids(L.addDays(WED, 14)).slice(0, 2), ["g-ext", "g-split"]); // density lift first while fresh
});

test("push-up ladder shows one variant; progress needs the next to be cleared", () => {
  const st = fresh();
  const flag = (id) => run(st, (s) => { A.setExerciseFlag(s, id, "cleared", true); A.setExerciseFlag(s, id, "painFree", true); });
  run(st, (s) => A.setLadder(s, "clearance", true));
  flag("u-wall-push");
  const pushes = () => L.exercisesForDate(st.state, MON).filter((e) => L.LADDER_OF[e.id]).map((e) => e.id);
  assert.deepEqual(pushes(), ["u-wall-push"]);
  assert.equal(L.canProgress(st.state, "push"), false);
  run(st, (s) => A.progress(s, "push", 1)); // refused: incline not cleared
  assert.deepEqual(pushes(), ["u-wall-push"]);
  flag("u-incline-push"); flag("u-push");
  assert.deepEqual(pushes(), ["u-wall-push"]); // flags alone don't skip steps
  run(st, (s) => A.progress(s, "push", 1));
  assert.deepEqual(pushes(), ["u-incline-push"]);
  run(st, (s) => A.progress(s, "push", 1));
  assert.deepEqual(pushes(), ["u-push"]);
  assert.equal(L.canProgress(st.state, "push"), false);
  run(st, (s) => A.progress(s, "push", -1));
  assert.deepEqual(pushes(), ["u-incline-push"]);
  assert.equal(st.state.progression.push.history.length, 3);
});

test("pull-up ladder: hang → scapular → band-assisted → pull-up, each step must be cleared", () => {
  const st = fresh();
  const flag = (id) => run(st, (s) => { A.setExerciseFlag(s, id, "cleared", true); A.setExerciseFlag(s, id, "painFree", true); });
  run(st, (s) => A.setLadder(s, "clearance", true));
  const pulls = () => L.exercisesForDate(st.state, TUE).filter((e) => L.LADDERS.pull.includes(e.id)).map((e) => e.id);
  assert.deepEqual(pulls(), []); // nothing until you flag it
  flag("h-hang");
  assert.deepEqual(pulls(), ["h-hang"]);
  run(st, (s) => A.progress(s, "pull", 1)); // refused
  assert.deepEqual(pulls(), ["h-hang"]);
  flag("h-scap"); flag("h-assist"); flag("h-pullup");
  for (const want of ["h-scap", "h-assist", "h-pullup"]) { run(st, (s) => A.progress(s, "pull", 1)); assert.deepEqual(pulls(), [want]); }
  assert.equal(L.canProgress(st.state, "pull"), false);
});
