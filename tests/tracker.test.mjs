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

test("all five meals Full → 2,860 kcal / 155 g", () => {
  const st = fresh();
  for (const slot of L.SLOTS) run(st, (s) => A.setMeal(s, MON, slot.id, 1));
  assert.deepEqual(L.mealTotals(st.state, MON), { calories: 2860, protein: 155 });
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
  assert.deepEqual(L.adherence(st.state, MON, SUN, SUN), { scheduled: 3, completed: 1, pct: 33 });
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
