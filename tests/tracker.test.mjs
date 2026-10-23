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

test("all six meals Full → 2,555 kcal / 164 g (v6 library defaults)", () => {
  const st = fresh();
  for (const slot of L.SLOTS) run(st, (s) => A.setMeal(s, MON, slot.id, 1));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 2555, protein: 164 });
});

test("half lunch → 275 kcal / 24 g; untapping removes it", () => {
  const st = fresh();
  run(st, (s) => A.setMeal(s, MON, "lunch", 0.5));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 275, protein: 24 });
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
  run(st, (s) => { s.mealPresets.find((p) => p.id === "ln-chickrice").calories = 100; });
  assert.equal(L.mealTotals(st.state, MON).calories, 550);
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
  assert.equal(L.mealTotals(other.state, MON).calories, 550);
  assert.equal(JSON.stringify(L.CHECKLIST), templateBefore);
  assert.throws(() => other.importJson('{"nope":1}'));
});

test("persists across store instances", () => {
  const storage = mem();
  createStore(storage).mutate((s) => A.setMeal(s, MON, "lunch", 2));
  assert.equal(L.mealTotals(createStore(storage).state, MON).calories, 1100);
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


test("meal ideas are complete and plain", () => {
  assert.ok(L.MEAL_IDEAS.length >= 8);
  for (const m of L.MEAL_IDEAS) assert.ok(m.name && m.ingredients && m.calories > 0 && m.protein > 0, m.name);
  assert.ok(L.MEAL_IDEAS.some((m) => m.name === "Chicken and rice") && L.MEAL_IDEAS.some((m) => m.name === "Beef and eggs"));
});

test("walk day: 20/30/40 min = 50/75/100% and 40 completes the day; tap again clears", () => {
  const st = fresh();
  const sat = L.addDays(MON, 5);
  assert.equal(L.routineForDate(st.state, sat), "walk");
  assert.deepEqual([L.dayProgress(st.state, sat).pct, L.workoutStatus(st.state, sat)], [0, null]);
  const at = (m) => { run(st, (s) => A.setWalk(s, sat, m)); return [L.dayProgress(st.state, sat).pct, L.workoutStatus(st.state, sat)]; };
  assert.deepEqual(at(20), [50, "partial"]);
  assert.deepEqual(at(30), [75, "partial"]);
  assert.deepEqual(at(40), [100, "done"]);
  assert.equal(L.dayProgress(st.state, sat).complete, true);
  assert.deepEqual(at(40), [0, null]); // same minutes again clears
  assert.equal(L.getDay(st.state, sat).walk, undefined);
});

test("home workout: 75% sets + 25% walk; complete only with every set and a 40-min walk", () => {
  const st = fresh();
  const exs = L.exercisesForDate(st.state, TUE);
  assert.equal(L.routineForDate(st.state, TUE), "H1");
  for (const e of exs) for (let i = 0; i < e.sets; i++) run(st, (s) => A.setSet(s, TUE, e.id, i, "done"));
  assert.deepEqual([L.dayProgress(st.state, TUE).pct, L.workoutStatus(st.state, TUE)], [75, "partial"]); // sets only
  run(st, (s) => A.setWalk(s, TUE, 20));
  assert.deepEqual([L.dayProgress(st.state, TUE).pct, L.workoutStatus(st.state, TUE)], [88, "partial"]); // 75 + 12.5
  run(st, (s) => A.setWalk(s, TUE, 30));
  assert.equal(L.dayProgress(st.state, TUE).pct, 94);
  run(st, (s) => A.setWalk(s, TUE, 40));
  assert.deepEqual([L.dayProgress(st.state, TUE).pct, L.workoutStatus(st.state, TUE)], [100, "done"]);
  // a walk alone is a partial home workout, never complete
  const st2 = fresh();
  run(st2, (s) => A.setWalk(s, TUE, 40));
  assert.deepEqual([L.dayProgress(st2.state, TUE).pct, L.workoutStatus(st2.state, TUE)], [25, "partial"]);
});

test("gym days ignore walks; walk shows in the export", () => {
  const st = fresh();
  run(st, (s) => A.setWalk(s, MON, 40));
  assert.equal(L.dayProgress(st.state, MON).pct, 0);
  assert.equal(L.hasWalk("A"), false);
  const sat = L.addDays(MON, 5);
  run(st, (s) => A.setWalk(s, sat, 30));
  const x = L.workoutExport(st.state, sat);
  assert.equal(x.hasData, true);
  assert.match(x.text, /Walk: 30 min/);
  assert.match(x.csv, /walk,Walk \(30 min\),1,done/);
});

test("every screen renders without throwing, on every kind of day, in both workout views", async () => {
  const V = await import("../public/tracker/views.js");
  const st = fresh();
  run(st, (s) => { A.setMeal(s, MON, "lunch", 1); A.setWeight(s, MON, 159.5); A.setLoad(s, MON, "g-squat", 135); A.setWalk(s, L.addDays(MON, 5), 30); A.painSet(s, MON, "morning", ["elbow"], { severity: 3, redFlags: ["pop"] }); });
  const exsMon = L.exercisesForDate(st.state, MON);
  run(st, (s) => A.setSet(s, MON, exsMon[0].id, 0, "done"));
  const base = { tab: "today", date: MON, painTod: "morning", painAreas: ["elbow"], weightDraft: null, waistDraft: null, loadDraft: {}, rest: null, restLen: 60, yoga: null, banners: [], guided: true };
  for (let i = 0; i < 14; i++) {                       // two full weeks: gym, home, walk and rest days
    const date = L.addDays(MON, i);
    for (const guided of [true, false]) {
      const ui = { ...base, date, guided };
      for (const [name, fn] of Object.entries({ today: V.today, workout: V.workout, recovery: V.recovery, progress: V.progressView, settings: V.settings })) {
        const html = fn(st.state, ui);
        assert.equal(typeof html, "string", `${name} on ${date}`);
        assert.ok(html.length > 50, `${name} on ${date} is empty`);
      }
      assert.ok(V.header(st.state, ui, true).includes("Gain Tracker"));
    }
  }
  assert.match(V.workout(st.state, { ...base, date: MON }), /Guided: tap through/);
  assert.match(V.workout(st.state, { ...base, date: L.addDays(MON, 5) }), /Today's walk/);
  assert.match(V.workout(st.state, { ...base, date: TUE }), /class="card"><h2>Walk/);
});


test("prayer: tap logs, same tap clears, feeds the checklist; sleep and weight feed it too", () => {
  const st = fresh();
  const item = (id) => L.CHECKLIST.find((i) => i.id === id);
  assert.equal(L.checklistStatus(st.state, MON, item("prayer-am")), null);
  run(st, (s) => A.setPrayer(s, MON, "morning", "done"));
  assert.equal(L.checklistStatus(st.state, MON, item("prayer-am")), "done");
  assert.equal(L.checklistStatus(st.state, MON, item("prayer-pm")), null);
  assert.equal(L.checklistStatus(st.state, TUE, item("prayer-am")), null);
  run(st, (s) => A.setPrayer(s, MON, "evening", "skipped"));
  assert.equal(L.checklistStatus(st.state, MON, item("prayer-pm")), "skipped");
  run(st, (s) => A.setPrayer(s, MON, "morning", "done"));
  assert.equal(L.getDay(st.state, MON).prayer.morning, undefined);
  run(st, (s) => { A.setSleep(s, MON, "7-8"); A.setWeight(s, MON, 159); A.setMeal(s, MON, "snack1", 1); });
  assert.deepEqual(["sleep", "weigh", "m-snack1"].map((id) => L.checklistStatus(st.state, MON, item(id))), ["done", "done", "done"]);
});

test("checklist follows the Today order: prayer, weight, sleep, breakfast, snack, lunch, shake, dinner, snack, prayer", () => {
  const order = L.CHECKLIST.map((i) => i.id);
  const seq = ["prayer-am", "weigh", "sleep", "m-breakfast", "m-snack1", "m-lunch", "m-shake", "m-dinner", "m-snack", "prayer-pm"];
  let at = -1;
  for (const id of seq) { const i = order.indexOf(id); assert.ok(i > at, `${id} out of order`); at = i; }
});

test("one-off foods: tap adds a serving, repeat adds more, half steps, custom entries, removal; per-day", () => {
  const st = fresh();
  const egg = L.FOODS.find((f) => f.id === "egg");
  const add = (f) => run(st, (s) => A.addExtra(s, MON, { foodId: f.id, name: f.name, serving: f.serving, calories: f.calories, protein: f.protein }));
  add(egg); add(egg);
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 140, protein: 12 });
  assert.equal(L.getDay(st.state, MON).extras.length, 1);          // merged, not duplicated
  const id = L.getDay(st.state, MON).extras[0].id;
  run(st, (s) => A.stepExtra(s, MON, id, 0.5));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 175, protein: 15 });
  run(st, (s) => A.stepExtra(s, MON, id, -0.5));
  run(st, (s) => A.addExtra(s, MON, { foodId: "custom", name: "Other food", calories: 250, protein: 10 }));
  run(st, (s) => A.addExtra(s, MON, { foodId: "custom", name: "Other food", calories: 100, protein: 0 }));
  assert.equal(L.getDay(st.state, MON).extras.length, 3);          // custom entries never merge
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 490, protein: 22 });
  assert.deepEqual(L.mealTotals(st.state, TUE), { calories: 0, protein: 0 });
  run(st, (s) => A.stepExtra(s, MON, id, -4));                     // below half a serving removes it
  assert.equal(L.getDay(st.state, MON).extras.length, 2);
  for (const x of [...L.getDay(st.state, MON).extras]) run(st, (s) => A.removeExtra(s, MON, x.id));
  assert.equal(L.getDay(st.state, MON).extras, undefined);
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 0, protein: 0 });
});

test("food list is complete and plain", () => {
  assert.ok(L.FOODS.length >= 25);
  for (const f of L.FOODS) { assert.ok(f.name && f.serving && f.calories >= 0 && f.protein >= 0 && L.FOOD_GROUPS.includes(f.group), f.id); }
  assert.equal(new Set(L.FOODS.map((f) => f.id)).size, L.FOODS.length);
});

test("extras work alongside presets and boosters in the day total, and render", async () => {
  const V = await import("../public/tracker/views.js");
  const st = fresh();
  run(st, (s) => { A.setMeal(s, MON, "lunch", 1); A.addExtra(s, MON, { foodId: "pb", name: "Peanut butter", serving: "1 tbsp", calories: 95, protein: 4 }); });
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 645, protein: 52 });
  const html = V.today(st.state, { tab: "today", date: MON, painTod: "morning", painAreas: ["elbow"], weightDraft: null, waistDraft: null, loadDraft: {}, customKcal: 200, customProtein: 10 });
  assert.match(html, /Anything else you ate/);
  assert.match(html, /Peanut butter/);
});

test("workout screen: progress scene sits above the tiles; rest timer lives inside the tiles, not at the top", async () => {
  const V = await import("../public/tracker/views.js");
  const st = fresh();
  const exs = L.exercisesForDate(st.state, MON);
  const base = { tab: "workout", date: MON, painTod: "morning", painAreas: ["elbow"], weightDraft: null, waistDraft: null, loadDraft: {}, rest: null, restLen: 60, autoRest: true, yoga: null, banners: [], guided: false, customKcal: 200, customProtein: 10 };
  const list = V.workout(st.state, base);
  assert.ok(!/Auto-rest after a set|id="rest-box"/.test(list), "old global timer is gone");
  assert.equal((list.match(/class="reststrip/g) || []).length, exs.length, "one rest strip per exercise tile");
  const at = (html, re) => html.search(re);
  assert.ok(at(list, /class="alert info"/) < at(list, /class="hero/) && at(list, /class="hero/) < at(list, /class="exblock/), "week note → progress scene → tiles");
  const guided = V.workout(st.state, { ...base, guided: true });
  assert.equal((guided.match(/class="reststrip/g) || []).length, 1, "guided mode: one strip, on the card");
  assert.ok(at(guided, /class="hero/) < at(guided, /class="strip"/) && at(guided, /class="strip"/) < at(guided, /class="guided/), "scene → section bar → card");
  assert.match(guided, /Auto-rest after each set: On/);
  assert.match(V.workout(st.state, { ...base, guided: true, autoRest: false }), /Auto-rest after each set: Off/);
  assert.match(list, /⏱ Rest 1 min/);
  assert.match(V.workout(st.state, { ...base, restLen: 90 }), /⏱ Rest 1:30/);
  // running timer shows only in the tile where the last set was tapped (list) and on the card (guided)
  const run = { endAt: Date.now() + 45000, total: 60000, ex: exs[1].id };
  const listRun = V.workout(st.state, { ...base, rest: run });
  assert.equal((listRun.match(/class="reststrip running/g) || []).length, 1);
  assert.match(listRun, /data-rtime>0:4[45]</);
  assert.equal((V.workout(st.state, { ...base, guided: true, rest: run }).match(/class="reststrip running/g) || []).length, 1);
  // walk day: scene still comes first, then the walk card
  const sat = V.workout(st.state, { ...base, date: L.addDays(MON, 5) });
  assert.ok(at(sat, /class="hero/) < at(sat, /<h2>Walk/));
});

test("meal library: right options per slot, snacks shared by three slots, defaults per slot", () => {
  const st = fresh();
  const names = (slot) => st.state.mealPresets.filter((p) => L.inSlot(p, slot)).map((p) => p.label);
  assert.deepEqual(names("breakfast"), ["Bacon, egg and cheese sandwich", "Oatmeal, banana and yogurt", "Eggs and beef", "Breakfast tacos (2)"]);
  assert.deepEqual(names("lunch"), ["Chicken and rice", "Chicken and pasta", "Pasta with meat sauce", "Chicken soup", "Turkey sandwich", "Grilled chicken salad"]);
  assert.deepEqual(names("dinner"), ["Chicken quesadilla", "Pasta with meat sauce", "Salmon, rice and vegetables", "Chicken and rice", "Chinese takeout (entree and rice)", "Sushi rolls (2 rolls)", "Pizza (2 slices)"]);
  const snacks = ["Greek yogurt", "Banana and peanut butter", "Almonds", "Cheese and crackers", "Yogurt with no-grain granola", "Fruit", "Vegetables"];
  for (const slot of ["snack1", "snack"]) assert.deepEqual(names(slot), snacks);
  assert.deepEqual(names("shake"), [...snacks, "Plant-protein shake"]);
  const dflt = (slot) => L.currentPreset(st.state, MON, slot).label;
  assert.deepEqual(["breakfast", "snack1", "lunch", "shake", "dinner", "snack"].map(dflt), ["Bacon, egg and cheese sandwich", "Banana and peanut butter", "Chicken and rice", "Plant-protein shake", "Chicken quesadilla", "Greek yogurt"]);
});

test("meal library data: plain ingredients, calories and protein present, unique ids", () => {
  const measured = /\b\d+(\.\d+)?\s*(oz|cups?|tbsp|tsp|g|lb)\b|\d\/\d/i;
  const ids = new Set();
  for (const p of L.DEFAULT_PRESETS) {
    assert.ok(p.label && p.calories > 0 && p.protein >= 0 && p.ingredients && p.amounts, p.id);
    assert.ok(!measured.test(p.ingredients), `${p.id}: ${p.ingredients}`);
    assert.ok(!ids.has(p.id), `duplicate ${p.id}`); ids.add(p.id);
  }
});

test("picking a meal from the dropdown changes today, is remembered for new days, and recalculates a logged meal", () => {
  const st = fresh();
  run(st, (s) => A.setMeal(s, MON, "lunch", 1));
  assert.equal(L.mealTotals(st.state, MON).calories, 550);
  run(st, (s) => A.swapMeal(s, MON, "lunch", "ln-soup"));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 250, protein: 18 }); // logged meal follows the pick
  assert.equal(L.currentPreset(st.state, TUE, "lunch").id, "ln-soup");           // remembered tomorrow
  assert.equal(L.currentPreset(st.state, TUE, "dinner").id, "dn-quesadilla");    // other slots untouched
  run(st, (s) => A.setMeal(s, TUE, "lunch", 2));
  assert.equal(L.mealTotals(st.state, TUE).calories, 500);
  run(st, (s) => A.swapMeal(s, TUE, "snack1", "sn-almonds")); // shared snack list works in every snack slot
  assert.equal(L.currentPreset(st.state, WED, "snack1").id, "sn-almonds");
  assert.equal(L.currentPreset(st.state, WED, "snack").id, "sn-yogurt");
});

test("saved states: unedited old defaults give way to the library; edited ones stay; slots never empty", () => {
  const base = JSON.parse(createStore(mem()).exportJson());
  const slotOf = { "breakfast-default": "breakfast", "lunch-default": "lunch", "dinner-default": "dinner", "snack1-default": "snack1", "snack-default": "snack" };
  const oldState = (edit) => {
    const o = structuredClone(base); o.nutritionVersion = 5; delete o.lastChoice;
    const shake = o.mealPresets.find((p) => p.id === "shake-default");
    o.mealPresets = [...Object.entries(slotOf).map(([id, slot]) => { const l = L.LEGACY_PRESETS[id]; return { id, slot, ...l[l.length - 1], amounts: "", isDefault: true }; }), shake];
    if (edit) edit(o);
    const st = createStore(mem()); st.importJson(JSON.stringify(o)); return st.state;
  };
  const a = oldState();
  assert.ok(Object.keys(slotOf).every((id) => !a.mealPresets.some((p) => p.id === id)), "old defaults replaced");
  assert.equal(a.mealPresets.filter((p) => L.inSlot(p, "lunch")).length, 6);
  assert.equal(a.nutritionVersion, 6);
  const b = oldState((o) => { o.mealPresets.find((p) => p.id === "lunch-default").calories = 999; });
  assert.ok(b.mealPresets.some((p) => p.id === "lunch-default" && p.calories === 999), "edited meal kept");
  assert.equal(b.mealPresets.filter((p) => L.inSlot(p, "lunch")).length, 7);
  for (const st of [a, b]) for (const slot of L.SLOTS) assert.ok(st.mealPresets.some((p) => L.inSlot(p, slot.id)), slot.id);
  // v1 states (whole milk, measured ingredients) migrate the same way
  const v1 = oldState((o) => { o.nutritionVersion = 1; Object.assign(o.mealPresets.find((p) => p.id === "breakfast-default"), L.LEGACY_PRESETS["breakfast-default"][0]); });
  assert.ok(!v1.mealPresets.some((p) => p.id === "breakfast-default"));
  // the shake keeps working, and is the afternoon default
  assert.equal(L.currentPreset({ ...a, days: {} }, MON, "shake").label, "Plant-protein shake");
});

test("v5 migration still adds the morning snack reminder and raises an untouched 2,850 target only", () => {
  const base = JSON.parse(createStore(mem()).exportJson());
  const asOld = (patch = {}) => {
    const o = structuredClone(base); o.nutritionVersion = 4;
    o.reminders = o.reminders.filter((r) => r.id !== "meal-snack1");
    o.profile.calorieTarget = 2850; Object.assign(o.profile, patch);
    const st = createStore(mem()); st.importJson(JSON.stringify(o)); return st.state;
  };
  const a = asOld();
  assert.ok(a.mealPresets.some((p) => L.inSlot(p, "snack1")));
  assert.ok(a.reminders.some((r) => r.id === "meal-snack1" && r.time === "10:00"));
  assert.equal(a.profile.calorieTarget, 3100);
  assert.equal(asOld({ calorieTarget: 2950 }).profile.calorieTarget, 2950);
});
