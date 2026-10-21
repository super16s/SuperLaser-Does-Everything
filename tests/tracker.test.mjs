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

test("all five meals Full → 2,825 kcal / 166 g (v4 presets)", () => {
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
  for (const e of L.exercisesForDate(st.state, MON)) for (let i = 0; i < e.sets; i++) run(st, (s) => A.setSet(s, MON, e.id, i, "done"));
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
  assert.equal(a.state.nutritionVersion, 4);

  const v2 = structuredClone(base); // full-scoop version that shipped briefly
  setPreset(v2, "shake-default", L.LEGACY_PRESETS["shake-default"][1]);
  const b = load(v2);
  assert.deepEqual([get(b, "shake-default").calories, get(b, "shake-default").protein], [530, 29]);
  assert.equal(get(b, "shake-default").ingredients, "Soy milk, plant protein, banana, peanut butter, oats");

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


test("home schedule: Tue/Thu are loaded routines, Saturday is optional via override", () => {
  const st = fresh();
  assert.equal(L.routineForDate(st.state, TUE), "H1");
  assert.equal(L.routineForDate(st.state, L.addDays(TUE, 2)), "H2");
  const sat = L.addDays(MON, 5);
  assert.equal(L.isLoadedRoutine(L.routineForDate(st.state, sat)), false);
  run(st, (s) => A.setWorkoutOverride(s, sat, "H1"));
  assert.ok(L.exercisesForDate(st.state, sat).length > 0);
});




test("phase follows the calendar and is only guidance", () => {
  const st = fresh();
  assert.equal(L.phaseForDate(st.state, MON).phase.n, 1);
  assert.equal(L.phaseForDate(st.state, L.addDays(MON, 28)).phase.n, 3);
});

test("no clearance gates: upper-body work is available from week 1", () => {
  const st = fresh();
  const ids = (d) => L.exercisesForDate(st.state, d).map((e) => e.id);
  assert.ok(ids(MON).includes("u-bench") && ids(MON).includes("u-row"));
  assert.equal(st.state.clearance, undefined);
  const withLegacy = createStore(mem());
  withLegacy.importJson(JSON.stringify({ ...JSON.parse(st.exportJson()), clearance: { ladder: { clearance: {} }, exercises: {} } }));
  assert.equal(withLegacy.state.clearance, undefined); // old exports still import
});

test("set wave on gym legs: +0/+1/+2 then deload; rehab items fixed; upper ramps gently", () => {
  const st = fresh();
  const wk = (n) => L.addDays(MON, 7 * n);
  const sets = (date, id) => L.exercisesForDate(st.state, date).find((e) => e.id === id).sets;
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => sets(wk(n), "g-squat")), [3, 4, 8, 3, 3]);
  assert.deepEqual([0, 1, 2, 3].map((n) => sets(wk(n), "g-legcurl")), [2, 3, 4, 2]);
  assert.equal(L.exercisesForDate(st.state, wk(2)).find((e) => e.id === "g-squat").isDensity, true);
  assert.equal(L.exercisesForDate(st.state, wk(1)).find((e) => e.id === "g-squat").isDensity, false);
  assert.equal(sets(L.addDays(TUE, 14), "a-heel"), 2);
  assert.equal(L.waveInfo(st.state, wk(3)).deload, true);
  assert.equal(L.waveInfo(st.state, wk(4)).reps, "10–12");
  assert.deepEqual([0, 1, 2, 3].map((n) => sets(wk(n), "u-row")), [3, 4, 4, 3]);
  assert.ok(L.exercisesForDate(st.state, wk(2)).filter((e) => e.upper).every((e) => !e.isDensity && e.sets <= L.UPPER_BODY.find((u) => u.id === e.id).sets + 1));
});

test("no curls or chin-ups; gym upper split across A/B; home days use bodyweight + pull-up bar only", () => {
  const st = fresh();
  assert.ok(!L.ALL_EXERCISES().some((u) => /\bcurls?\b/i.test(u.name) && !/leg curl/i.test(u.name)));
  assert.ok(!L.ALL_EXERCISES().some((u) => /chin-?up/i.test(u.name) && !/no chin/i.test(u.name)));
  const ids = (d) => L.exercisesForDate(st.state, d).map((e) => e.id);
  assert.ok(ids(MON).includes("u-bench") && !ids(MON).some((i) => ["u-incdb", "u-pulldown", "u-ohp"].includes(i)));
  assert.ok(["u-incdb", "u-pulldown", "u-ohp"].every((i) => ids(WED).includes(i)) && !ids(WED).includes("u-bench"));
  for (const d of [MON, WED]) assert.ok(ids(d).includes("u-tri") && ids(d).includes("u-row"));
  assert.ok(ids(TUE).includes("h-close") && !ids(TUE).includes("h-pike"));
  assert.ok(ids(L.addDays(TUE, 2)).includes("h-pike"));
  const homeOk = new Set([...L.WORKOUTS.H1.map((e) => e.id), ...L.UPPER_BODY.filter((u) => u.days?.includes("H1")).map((e) => e.id)]);
  assert.ok(ids(TUE).every((i) => homeOk.has(i)) && !ids(TUE).some((i) => i.startsWith("g-"))); // nothing needing gym equipment
});

test("session order: warm-up → main leg → main upper → secondary → accessories; density lift moves first", () => {
  const st = fresh();
  const ids = (d) => L.exercisesForDate(st.state, d).map((e) => e.id);
  assert.deepEqual(ids(MON), ["g-squat", "u-bench", "g-rdl", "u-row", "g-legcurl", "g-calf", "u-lat-raise", "u-tri"]);
  assert.deepEqual(ids(WED), ["g-split", "u-incdb", "u-pulldown", "u-ohp", "g-thrust", "u-row", "g-ext", "b-sissy", "u-tri", "u-fly", "u-rear", "u-tri-oh"]);
  assert.deepEqual(ids(L.addDays(WED, 14)).slice(0, 2), ["g-ext", "g-split"]);
});

test("home days: heel slides first, one push-up variant, one pull variant", () => {
  const st = fresh();
  const ids = L.exercisesForDate(st.state, TUE).map((e) => e.id);
  assert.equal(ids[0], "a-heel");
  assert.equal(ids.filter((i) => L.LADDERS.push.includes(i)).length, 1);
  assert.equal(ids.filter((i) => L.LADDERS.pull.includes(i)).length, 1);
});

test("push ladder starts at standard push-ups; pull ladder starts at dead hangs; both step one at a time", () => {
  const st = fresh();
  const variant = (key) => L.exercisesForDate(st.state, TUE).filter((e) => L.LADDERS[key].includes(e.id)).map((e) => e.id);
  assert.deepEqual(variant("push"), ["u-push"]);
  assert.deepEqual(variant("pull"), ["h-hang"]);
  assert.equal(L.canProgress(st.state, "push"), false); // already top
  run(st, (s) => A.progress(s, "push", -1));
  assert.deepEqual(variant("push"), ["u-incline-push"]);
  run(st, (s) => A.progress(s, "push", 1));
  assert.deepEqual(variant("push"), ["u-push"]);
  for (const want of ["h-scap", "h-assist", "h-pullup"]) { run(st, (s) => A.progress(s, "pull", 1)); assert.deepEqual(variant("pull"), [want]); }
  assert.equal(L.canProgress(st.state, "pull"), false);
  run(st, (s) => A.progress(s, "pull", 1)); // refused at the top
  assert.deepEqual(variant("pull"), ["h-pullup"]);
  assert.equal(st.state.progression.pull.history.length, 3);
});

test("loads: logged per day, last and best come from earlier sessions", () => {
  const st = fresh();
  const d = (n) => L.addDays(MON, n);
  run(st, (s) => { A.setLoad(s, d(0), "u-bench", 135); A.setLoad(s, d(4), "u-bench", 145); A.setLoad(s, d(7), "u-bench", 140); });
  assert.deepEqual(L.loadHistory(st.state, "u-bench", d(7)), { last: { date: d(4), lb: 145 }, best: { date: d(4), lb: 145 } });
  assert.deepEqual(L.loadHistory(st.state, "u-bench", d(0)).last, null);
  assert.equal(L.loadHistory(st.state, "u-bench", d(14)).last.lb, 140);
  run(st, (s) => A.setLoad(s, d(7), "u-bench", null));
  assert.equal(L.getDay(st.state, d(7)).loads, undefined);
  assert.ok(L.exercisesForDate(st.state, MON).find((e) => e.id === "u-bench").loaded);
  assert.equal(L.exercisesForDate(st.state, TUE).some((e) => e.loaded), false); // home days carry no loads
});

test("gym days stay fixed: Mon A, Wed B, Fri A every week", () => {
  const st = fresh();
  for (const n of [0, 1, 2, 3]) {
    assert.equal(L.routineForDate(st.state, L.addDays(MON, 7 * n)), "A");
    assert.equal(L.routineForDate(st.state, L.addDays(WED, 7 * n)), "B");
    assert.equal(L.routineForDate(st.state, L.addDays(MON, 7 * n + 4)), "A");
  }
});

test("guided flow: next set walks the session in order; skip/partial count as logged; previous set undoes", () => {
  const st = fresh();
  const exs = L.exercisesForDate(st.state, MON);
  assert.deepEqual([L.nextSet(st.state, MON).e.id, L.nextSet(st.state, MON).i], [exs[0].id, 0]);
  run(st, (s) => A.setSet(s, MON, exs[0].id, 0, "done"));
  assert.equal(L.nextSet(st.state, MON).i, 1);
  run(st, (s) => A.setSet(s, MON, exs[0].id, 1, "skipped"));
  assert.equal(L.nextSet(st.state, MON).i, 2);
  assert.deepEqual([L.lastLoggedSet(st.state, MON).e.id, L.lastLoggedSet(st.state, MON).i], [exs[0].id, 1]);
  run(st, (s) => A.setSet(s, MON, exs[0].id, 1, null));
  assert.equal(L.nextSet(st.state, MON).i, 1);
  // finish everything (fresh state: tapping a done set toggles it off by design)
  const st3 = fresh();
  for (const e of exs) for (let i = 0; i < e.sets; i++) run(st3, (s) => A.setSet(s, MON, e.id, i, "done"));
  assert.equal(L.nextSet(st3.state, MON), null);
  // moves on to the next exercise when one finishes
  const st2 = fresh();
  for (let i = 0; i < exs[0].sets; i++) run(st2, (s) => A.setSet(s, MON, exs[0].id, i, "done"));
  assert.deepEqual([L.nextSet(st2.state, MON).e.id, L.nextSet(st2.state, MON).i], [exs[1].id, 0]);
});

test("workout export: text and CSV reflect sets, loads and status; empty day reports no data", () => {
  const st = fresh();
  assert.equal(L.workoutExport(st.state, MON).hasData, false);
  const exs = L.exercisesForDate(st.state, MON);
  run(st, (s) => { A.setSet(s, MON, exs[0].id, 0, "done"); A.setSet(s, MON, exs[0].id, 1, "skipped"); A.setLoad(s, MON, exs[0].id, 135); A.painSet(s, MON, "after", ["elbow"], { severity: 2 }); });
  const x = L.workoutExport(st.state, MON);
  assert.equal(x.hasData, true);
  assert.match(x.text, /Gym: Workout A/);
  assert.match(x.text, /@ 135 lb/);
  assert.match(x.text, /1:done {2}2:skipped {2}3:—/);
  assert.match(x.text, /Right elbow\/forearm 2\/10 \(after activity\)/);
  assert.match(x.text, /Sets done: 1\/\d+/);
  const lines = x.csv.split("\n");
  assert.equal(lines[0], "date,routine,exercise_id,exercise,set,status,load_lb,logged_at");
  assert.equal(lines.length - 1, exs.reduce((n, e) => n + e.sets, 0));
  assert.match(lines[1], /^2026-10-19,A,g-squat,.*,1,done,135,/);
  assert.match(lines[2], /,2,skipped,135,/);
  assert.equal(L.workoutExport(st.state, SUN).text.includes("No loaded workout scheduled."), true);
});

test("plain-language ingredients: defaults have no measurements; every old default migrates; edits survive", () => {
  const measured = /\b\d+(\.\d+)?\s*(oz|cups?|tbsp|tsp|g|lb)\b|\d\/\d/i;
  for (const p of L.DEFAULT_PRESETS) { assert.ok(!measured.test(p.ingredients), p.ingredients); assert.ok(p.amounts.length > 0); }
  const base = structuredClone(createStore(mem()).state); delete base.nutritionVersion;
  for (const [id, olds] of Object.entries(L.LEGACY_PRESETS)) for (const old of olds) {
    const state = structuredClone(base);
    Object.assign(state.mealPresets.find((p) => p.id === id), old);
    const st = createStore(mem()); st.importJson(JSON.stringify(state));
    const got = st.state.mealPresets.find((p) => p.id === id), want = L.DEFAULT_PRESETS.find((p) => p.id === id);
    assert.deepEqual([got.ingredients, got.calories, got.protein, got.amounts], [want.ingredients, want.calories, want.protein, want.amounts]);
  }
  const edited = structuredClone(base);
  Object.assign(edited.mealPresets.find((p) => p.id === "lunch-default"), L.LEGACY_PRESETS["lunch-default"][0], { ingredients: "my own lunch" });
  const st = createStore(mem()); st.importJson(JSON.stringify(edited));
  assert.equal(st.state.mealPresets.find((p) => p.id === "lunch-default").ingredients, "my own lunch");
});

test("meal ideas are complete and plain", () => {
  assert.ok(L.MEAL_IDEAS.length >= 8);
  for (const m of L.MEAL_IDEAS) assert.ok(m.name && m.ingredients && m.calories > 0 && m.protein > 0, m.name);
  assert.ok(L.MEAL_IDEAS.some((m) => m.name === "Chicken and rice") && L.MEAL_IDEAS.some((m) => m.name === "Beef and eggs"));
});
