// Pure data + calculation helpers for the fitness tracker. No DOM, no storage:
// everything here takes state in and returns values out so it can be unit-tested
// in Node (tests/tracker.test.mjs) and reused by the UI unchanged.

// ---------- Templates (never mutated by daily logging) ----------

export const SLOTS = [
  { id: "breakfast", label: "Breakfast", section: "Morning" },
  { id: "snack1", label: "Morning snack", section: "Morning" },
  { id: "lunch", label: "Lunch", section: "Midday" },
  { id: "shake", label: "Afternoon shake", section: "Afternoon / evening" },
  { id: "dinner", label: "Dinner", section: "Afternoon / evening" },
  { id: "snack", label: "Evening snack", section: "Afternoon / evening" },
];
export const PRAYERS = [
  { id: "morning", label: "Morning prayer" },
  { id: "evening", label: "Evening prayer" },
];

export const DEFAULT_PRESETS = [
  { id: "breakfast-default", slot: "breakfast", label: "Breakfast", calories: 765, protein: 35,
    ingredients: "Oats, soy milk, banana, peanut butter, eggs",
    amounts: "3/4 cup dry oats, 1 cup soy milk, 1 banana, 2 tbsp peanut butter, 2 eggs" },
  { id: "snack1-default", slot: "snack1", label: "Morning snack", calories: 300, protein: 8,
    ingredients: "Banana and peanut butter",
    amounts: "1 banana, 2 tbsp peanut butter" },
  { id: "lunch-default", slot: "lunch", label: "Lunch", calories: 800, protein: 50,
    ingredients: "Chicken and rice, beans, vegetables",
    amounts: "5 oz cooked chicken thighs, 1.5 cups cooked rice, 1/2 cup beans, vegetables" },
  { id: "shake-default", slot: "shake", label: "Plant-protein shake", calories: 530, protein: 29,
    ingredients: "Soy milk, plant protein, banana, peanut butter, oats",
    amounts: "1 cup soy milk, 1/2 scoop plant protein (pea/rice blend), 1 banana, 2 tbsp peanut butter, 1/4 cup dry oats" },
  { id: "dinner-default", slot: "dinner", label: "Dinner", calories: 650, protein: 40,
    ingredients: "Turkey and pasta with tomato sauce, vegetables, olive oil",
    amounts: "4 oz cooked ground turkey, 2 oz dry pasta, tomato sauce, vegetables, some olive oil" },
  { id: "snack-default", slot: "snack", label: "Greek yogurt snack", calories: 80, protein: 12,
    ingredients: "Plain Greek yogurt",
    amounts: "1/2 cup plain Greek yogurt" },
];

// Common foods for one-off logging on Today ("Anything else you ate"). Rough US
// estimates per the serving shown; the totals only count what you tap.
export const FOOD_GROUPS = ["Protein", "Carbs", "Fats and dairy", "Snacks and drinks", "Eating out"];
export const FOODS = [
  { id: "egg", group: "Protein", name: "Egg", serving: "1 large", calories: 70, protein: 6 },
  { id: "chicken-breast", group: "Protein", name: "Chicken breast", serving: "4 oz cooked", calories: 185, protein: 35 },
  { id: "chicken-thigh", group: "Protein", name: "Chicken thigh", serving: "4 oz cooked", calories: 210, protein: 27 },
  { id: "ground-beef", group: "Protein", name: "Ground beef", serving: "4 oz cooked", calories: 290, protein: 28 },
  { id: "steak", group: "Protein", name: "Steak", serving: "6 oz cooked", calories: 380, protein: 42 },
  { id: "salmon", group: "Protein", name: "Salmon", serving: "5 oz cooked", calories: 290, protein: 32 },
  { id: "tuna", group: "Protein", name: "Tuna", serving: "1 can", calories: 120, protein: 26 },
  { id: "turkey", group: "Protein", name: "Ground turkey", serving: "4 oz cooked", calories: 200, protein: 27 },
  { id: "rice", group: "Carbs", name: "Rice", serving: "1 cup cooked", calories: 205, protein: 4 },
  { id: "pasta", group: "Carbs", name: "Pasta", serving: "1 cup cooked", calories: 200, protein: 7 },
  { id: "potato", group: "Carbs", name: "Potato", serving: "1 medium", calories: 160, protein: 4 },
  { id: "oats", group: "Carbs", name: "Oats", serving: "1/2 cup dry", calories: 150, protein: 5 },
  { id: "bread", group: "Carbs", name: "Bread", serving: "1 slice", calories: 80, protein: 3 },
  { id: "beans", group: "Carbs", name: "Beans", serving: "1/2 cup", calories: 110, protein: 7 },
  { id: "pb", group: "Fats and dairy", name: "Peanut butter", serving: "1 tbsp", calories: 95, protein: 4 },
  { id: "olive-oil", group: "Fats and dairy", name: "Olive oil", serving: "1 tbsp", calories: 120, protein: 0 },
  { id: "avocado", group: "Fats and dairy", name: "Avocado", serving: "1/2", calories: 120, protein: 2 },
  { id: "cheese", group: "Fats and dairy", name: "Cheese", serving: "1 oz", calories: 110, protein: 7 },
  { id: "yogurt", group: "Fats and dairy", name: "Greek yogurt", serving: "3/4 cup", calories: 130, protein: 17 },
  { id: "whole-milk", group: "Fats and dairy", name: "Whole milk", serving: "1 cup", calories: 150, protein: 8 },
  { id: "soy-milk", group: "Fats and dairy", name: "Soy milk", serving: "1 cup", calories: 100, protein: 7 },
  { id: "banana", group: "Snacks and drinks", name: "Banana", serving: "1 medium", calories: 105, protein: 1 },
  { id: "apple", group: "Snacks and drinks", name: "Apple", serving: "1 medium", calories: 95, protein: 0 },
  { id: "almonds", group: "Snacks and drinks", name: "Almonds", serving: "1 oz", calories: 165, protein: 6 },
  { id: "jerky", group: "Snacks and drinks", name: "Beef jerky", serving: "1 oz", calories: 80, protein: 13 },
  { id: "protein-scoop", group: "Snacks and drinks", name: "Plant protein", serving: "1 scoop", calories: 120, protein: 24 },
  { id: "pizza", group: "Eating out", name: "Pizza", serving: "1 slice", calories: 285, protein: 12 },
  { id: "burger", group: "Eating out", name: "Burger", serving: "1 regular", calories: 500, protein: 25 },
  { id: "burrito", group: "Eating out", name: "Burrito", serving: "1 large", calories: 800, protein: 35 },
  { id: "sandwich", group: "Eating out", name: "Sandwich", serving: "1 deli", calories: 450, protein: 25 },
];
export const CUSTOM_KCAL_STEPS = [-100, -50, 50, 100];
export const CUSTOM_PROTEIN_STEPS = [-10, -5, 5, 10];

// One-tap meal ideas for the preset library. Calories/protein are rough starter
// estimates for a typical plate; edit them to match your portions.
export const MEAL_IDEAS = [
  { name: "Chicken and rice", ingredients: "Chicken, rice, vegetables", calories: 700, protein: 45 },
  { name: "Beef and eggs", ingredients: "Ground beef, eggs, toast", calories: 720, protein: 60 },
  { name: "Steak and potatoes", ingredients: "Steak, potatoes, vegetables", calories: 700, protein: 47 },
  { name: "Turkey and pasta", ingredients: "Ground turkey, pasta, tomato sauce", calories: 650, protein: 40 },
  { name: "Salmon and potatoes", ingredients: "Salmon, potatoes, olive oil, vegetables", calories: 700, protein: 38 },
  { name: "Tuna and rice", ingredients: "Tuna, rice, mayo, vegetables", calories: 600, protein: 50 },
  { name: "Burrito bowl", ingredients: "Chicken, rice, beans, cheese, salsa", calories: 750, protein: 50 },
  { name: "Eggs and oats", ingredients: "Eggs, oats, banana, peanut butter", calories: 700, protein: 33 },
  { name: "Yogurt and nuts", ingredients: "Greek yogurt, nuts, honey", calories: 300, protein: 22 },
  { name: "Peanut butter banana toast", ingredients: "Bread, peanut butter, banana", calories: 450, protein: 14 },
];

// Earlier defaults for presets that changed in later nutrition versions (v1: dairy;
// v2: full-scoop plant protein; v3: measured ingredient lists, now plain language). Used only to migrate presets the user never edited.
export const LEGACY_PRESETS = {
  "breakfast-default": [
    { label: "Breakfast", calories: 800, protein: 35, ingredients: "1/2 cup dry oats, 1 cup whole milk, 1 banana, 2 tbsp peanut butter, 2 eggs" },
    { label: "Breakfast", calories: 765, protein: 35, ingredients: "3/4 cup dry oats, 1 cup soy milk, 1 banana, 2 tbsp peanut butter, 2 eggs" },
  ],
  "lunch-default": [
    { label: "Lunch", calories: 800, protein: 50, ingredients: "5 oz cooked chicken thighs, 1.5 cups cooked rice, 1/2 cup beans, vegetables" },
  ],
  "shake-default": [
    { label: "Weight-gain shake", calories: 530, protein: 18, ingredients: "1 cup whole milk, 1 banana, 2 tbsp peanut butter, 1/4 cup dry oats" },
    { label: "Plant-protein shake", calories: 590, protein: 41, ingredients: "1 cup soy milk, 1 scoop plant protein (pea/rice blend), 1 banana, 2 tbsp peanut butter, 1/4 cup dry oats" },
    { label: "Plant-protein shake", calories: 530, protein: 29, ingredients: "1 cup soy milk, 1/2 scoop plant protein (pea/rice blend), 1 banana, 2 tbsp peanut butter, 1/4 cup dry oats" },
  ],
  "dinner-default": [
    { label: "Dinner", calories: 650, protein: 40, ingredients: "4 oz cooked ground turkey, 2 oz dry pasta, tomato sauce, vegetables, some olive oil" },
  ],
  "snack-default": [
    { label: "Greek yogurt snack", calories: 80, protein: 12, ingredients: "1/2 cup plain Greek yogurt" },
  ],
};

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
  1: { routine: "A", label: "Gym: Workout A" },
  2: { routine: "H1", label: "Home workout 1 (bodyweight + pull-up bar)" },
  3: { routine: "B", label: "Gym: Workout B" },
  4: { routine: "H2", label: "Home workout 2 (bodyweight + pull-up bar)" },
  5: { routine: "A", label: "Gym: Workout A" },
  6: { routine: "walk", label: "Easy walk / gentle mobility (optional home workout)" },
  0: { routine: "rest", label: "Rest + meal prep" },
};
export const ROUTINE_LABEL = { A: "Gym A", B: "Gym B", H1: "Home 1", H2: "Home 2", walk: "Walk", rest: "Rest" };
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ex(id, name, sets, reps, extra = {}) {
  return { id, name, sets, reps, phase: 1, upper: false, ...extra };
}
export const WORKOUTS = {
  // Gym days (full gym). Density lifts are chosen to spare the elbow and neck.
  A: [
    ex("g-squat", "Leg press (or goblet / safety-bar squat)", 3, "8–12", { density: true }),
    ex("g-rdl", "Romanian deadlift", 3, "8–12", { cue: "Double-overhand grip or straps. Never a mixed (one palm up) grip: that is the classic way to injure the distal biceps." }),
    ex("g-legcurl", "Seated or lying leg curl", 2, "10–15"),
    ex("g-calf", "Standing or seated calf raise", 3, "10–15"),
  ],
  B: [
    ex("g-split", "Dumbbell split squat", 3, "8–12"),
    ex("g-thrust", "Hip thrust (barbell or machine)", 3, "8–12"),
    ex("g-ext", "Leg extension", 3, "10–15", { density: true }),
    ex("b-sissy", "Sissy squats (assisted, partial range)", 2, "6–10", { cue: "Hold a post lightly with your LEFT hand only; keep the right arm relaxed and your neck neutral. Start shallow, lean back, knees travel forward. Stop if the front of the knee hurts." }),
  ],
  // Home days: bodyweight legs; the upper-body part comes from UPPER_BODY (days H1/H2).
  H1: [
    ex("a-squat", "Slow bodyweight squats", 3, "12–20"),
    ex("a-lunge", "Reverse lunges", 3, "8–12 per leg"),
    ex("a-bridge", "Glute bridges", 3, "15–20"),
    ex("a-calf", "Calf raises", 3, "20"),
    ex("a-heel", "Supine heel slides", 2, "10 per leg", { noRamp: true }),
  ],
  H2: [
    ex("b-split", "Bodyweight split squats", 3, "8–12 per leg"),
    ex("b-chair", "Slow chair squats", 3, "12"),
    ex("b-sl-bridge", "Single-leg glute bridges", 3, "8 per leg"),
    ex("b-wall", "Wall sit", 3, "30–45 sec"),
    ex("b-march", "Supine marching", 2, "12", { noRamp: true }),
  ],
};
export const ALL_EXERCISES = () => [...Object.values(WORKOUTS).flat(), ...UPPER_BODY];
// Set/rep numbers are placeholders for a clinician to overwrite, not prescriptions.
// Full-gym upper-body list. No curls and no underhand pulling, by design.
export const UPPER_BODY = [
  ex("u-wall-push", "Wall push-ups", 2, "8–12", { phase: 1, upper: true, days: ["H1", "H2"] }),
  ex("u-incline-push", "Incline push-ups", 2, "6–10", { phase: 1, upper: true, days: ["H1", "H2"] }),
  ex("u-push", "Standard push-ups", 3, "6–12", { phase: 1, upper: true, days: ["H1", "H2"] }),
  // Home pull-up-bar ladder. Overhand or neutral grip only: no chin-ups, no slow negatives.
  ex("h-hang", "Dead hangs (overhand or neutral grip)", 2, "20–30 sec", { phase: 1, upper: true, days: ["H1", "H2"], noRamp: true }),
  ex("h-scap", "Scapular pull-ups (shoulder blades only, elbows stay straight)", 2, "8–12", { phase: 1, upper: true, days: ["H1", "H2"] }),
  ex("h-assist", "Band-assisted pull-ups (overhand or neutral grip)", 2, "4–8", { phase: 1, upper: true, days: ["H1", "H2"] }),
  ex("h-pullup", "Pull-ups (overhand or neutral grip, no chin-ups)", 2, "3–8", { phase: 1, upper: true, days: ["H1", "H2"] }),
  // Home push accessories
  ex("h-close", "Close-grip push-ups (triceps)", 2, "6–12", { phase: 1, upper: true, days: ["H1"] }),
  ex("h-pike", "Pike push-ups (shoulders; stop if neck/traps complain)", 2, "5–10", { phase: 1, upper: true, days: ["H2"] }),
  // Workout A (Mon, Fri)
  ex("u-bench", "Bench press (barbell, or dumbbells with neutral grip)", 3, "8–12", { phase: 1, upper: true, days: ["A"] }),
  ex("u-lat-raise", "Dumbbell lateral raise", 2, "12–15", { phase: 1, upper: true, days: ["A"] }),
  // Both days
  ex("u-row", "Chest-supported row (neutral grip)", 3, "8–12", { phase: 1, upper: true, days: ["A", "B"] }),
  ex("u-tri", "Triceps pushdowns (cable or band)", 2, "10–15", { phase: 1, upper: true, days: ["A", "B"] }),
  // Workout B (Wed)
  ex("u-incdb", "Incline dumbbell press (neutral grip)", 3, "8–12", { phase: 1, upper: true, days: ["B"] }),
  ex("u-pulldown", "Lat pulldown (neutral grip, never underhand)", 3, "8–12", { phase: 1, upper: true, days: ["B"] }),
  ex("u-ohp", "Seated dumbbell shoulder press (neutral grip; stop if neck/traps complain)", 2, "8–10", { phase: 1, upper: true, days: ["B"] }),
  ex("u-fly", "Cable fly or pec-deck (light, soft elbows)", 2, "12–15", { phase: 1, upper: true, days: ["B"] }),
  ex("u-rear", "Rear-delt fly (cable or machine)", 2, "12–15", { phase: 1, upper: true, days: ["B"] }),
  ex("u-tri-oh", "Overhead cable triceps extension", 2, "10–15", { phase: 1, upper: true, days: ["B"] }),
];

// Quick self-check before upper-body work. Advisory: if anything is unticked it
// recommends lower-body only that day.
export const READINESS = [
  { id: "rom", label: "Full elbow range today with no pain" },
  { id: "resist", label: "No pain with light palm-up resistance" },
  { id: "nextday", label: "No symptoms the day after my last upper-body session" },
];

// Progression ladders (easier → harder variants of the same movement). The shown
// variant follows state.progression (you move up with the Progress button).
export const LADDERS = { push: ["u-wall-push", "u-incline-push", "u-push"], pull: ["h-hang", "h-scap", "h-assist", "h-pullup"] };
export const LADDER_OF = Object.fromEntries(Object.entries(LADDERS).flatMap(([k, ids]) => ids.map((id) => [id, k])));
export const MAX_LOAD_LEVEL = 10;

// Session order: 1 warm-up/rehab → 2 main leg lift → 3 main upper push/pull →
// 4 secondary → 5 accessories. A density lift is moved up to 1.5 (fresh legs).
const STAGE = {
  "a-heel": 1, "b-march": 1,
  "g-squat": 2, "g-split": 2, "a-squat": 2, "b-split": 2,
  "u-wall-push": 3, "u-incline-push": 3, "u-push": 3, "u-bench": 3, "u-incdb": 3, "u-pulldown": 3, "u-ohp": 3,
  "h-hang": 3, "h-scap": 3, "h-assist": 3, "h-pullup": 3,
  "g-rdl": 4, "g-thrust": 4, "a-lunge": 4, "a-bridge": 4, "b-chair": 4, "b-sl-bridge": 4, "u-row": 4,
  "u-tri": 5, "u-tri-oh": 5, "u-lat-raise": 5, "u-fly": 5, "u-rear": 5, "h-close": 5, "h-pike": 5,
  "g-legcurl": 5, "g-ext": 5, "g-calf": 5, "a-calf": 5, "b-sissy": 5, "b-wall": 5,
};

// Exercises where you log a working weight (machines, barbells, dumbbells, cables).
export const LOADED_IDS = new Set(["g-squat", "g-rdl", "g-legcurl", "g-calf", "g-split", "g-thrust", "g-ext",
  "u-bench", "u-lat-raise", "u-row", "u-tri", "u-incdb", "u-pulldown", "u-ohp", "u-fly", "u-rear", "u-tri-oh"]);
export const LOAD_STEPS = [-25, -10, -5, -2.5, 2.5, 5, 10, 25];

export const REST_OPTIONS = [45, 60, 90, 120, 180];

export const PHASES = [
  { n: 1, name: "Protect", weeks: "1–2", plan: "Three full-body workouts per week: legs plus pushing and pulling (neutral grips, no curls). Effort stays at about 3 reps in reserve", gate: "No symptoms during or the day after training; everyday movement comfortable" },
  { n: 2, name: "Reintroduce", weeks: "3–4", plan: "Same sessions; add load in small steps (about 2 reps in reserve) and the first extra set of upper-body work", gate: "No symptoms during/next day; neck and elbow stay quiet at the new loads" },
  { n: 3, name: "Build", weeks: "5–8", plan: "Three full-body sessions; gradual incline push-ups, light rows and harder leg work", gate: "Consistent comfortable motion and loading" },
  { n: 4, name: "Progress", weeks: "9–13", plan: "Three progressive full-body sessions; optional fourth short session; add load/reps gradually", gate: "No recurrence of elbow or neck pain" },
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
  // Morning (same order as the Today screen)
  { id: "prayer-am", section: "Morning", label: "Morning prayer", derive: { type: "prayer", which: "morning" } },
  { id: "weigh", section: "Morning", label: "Weighed in (optional)", derive: { type: "weight" } },
  { id: "sleep", section: "Morning", label: "Sleep recorded", derive: { type: "sleep" } },
  { id: "m-breakfast", section: "Morning", label: "Breakfast completed", derive: { type: "meal", slot: "breakfast" } },
  { id: "m-snack1", section: "Morning", label: "Morning snack completed", derive: { type: "meal", slot: "snack1" } },
  { id: "creatine", section: "Morning", label: "Creatine (3–5 g) taken", derive: { type: "manual" } },
  { id: "liver", section: "Morning", label: "Liver capsules taken", derive: { type: "manual" } },
  { id: "pain-am", section: "Morning", label: "Morning pain check completed", derive: { type: "pain", tod: "morning" } },
  { id: "m-lunch", section: "Midday", label: "Lunch completed", derive: { type: "meal", slot: "lunch" } },
  { id: "water1", section: "Midday", label: "Water check 1 completed", derive: { type: "hydration", n: 1 } },
  { id: "workout", section: "Midday", label: "Workout completed", derive: { type: "workout" }, scheduledOnly: true },
  { id: "m-shake", section: "Afternoon / evening", label: "Afternoon shake completed", derive: { type: "meal", slot: "shake" } },
  { id: "m-dinner", section: "Afternoon / evening", label: "Dinner completed", derive: { type: "meal", slot: "dinner" } },
  { id: "m-snack", section: "Afternoon / evening", label: "Evening snack completed", derive: { type: "meal", slot: "snack" } },
  { id: "water2", section: "Afternoon / evening", label: "Water check 2 completed", derive: { type: "hydration", n: 2 } },
  { id: "yoga", section: "Afternoon / evening", label: "Evening yoga (8 minutes) completed", derive: { type: "yoga" } },
  { id: "meditation", section: "Afternoon / evening", label: "Meditation (4 minutes) completed", derive: { type: "meditation" } },
  { id: "pain-pm", section: "Afternoon / evening", label: "Evening pain check completed", derive: { type: "pain", tod: "evening" } },
  { id: "sleep-plan", section: "Afternoon / evening", label: "Sleep plan confirmed", derive: { type: "manual" } },
  { id: "prayer-pm", section: "Afternoon / evening", label: "Evening prayer", derive: { type: "prayer", which: "evening" } },
];
export const CHECK_STATUSES = [
  { id: "done", label: "Done" }, { id: "partial", label: "Partial" },
  { id: "skipped", label: "Skipped" }, { id: "substituted", label: "Substituted" },
];

export const GROCERIES = ["Eggs", "Unsweetened soy milk", "Oats", "Bananas", "Peanut butter", "Chicken thighs",
  "Ground turkey (or lower-cost equivalent)", "Rice", "Beans", "Pasta", "Tomato sauce", "Frozen vegetables",
  "Plain Greek yogurt", "Olive oil / pantry staples", "Restock when low: plant protein, creatine, liver capsules"];
export const MEAL_PREP = ["Cook batch protein", "Cook rice / pasta", "Portion lunches",
  "Prepare shake ingredients", "Check groceries for next 3–4 days"];

export const REVIEW_CALORIE_OPTIONS = ["Keep", "+150", "+200", "-100", "-200"];
export const REVIEW_TRAINING_OPTIONS = ["Maintain", "Progress", "Deload", "Seek evaluation"];

// Illustrative only — start 159, week 13 ~174. Never framed as pass/fail.
export const MILESTONES = [[0, 159], [2, 161], [4, 163.5], [6, 165.5], [8, 168], [10, 170.5], [13, 174]];

export function defaultReminders() {
  const mk = (id, category, label, time, weekdays) => ({ id, category, label, time, weekdays, enabled: true, snoozeMinutes: 15 });
  const all = [0, 1, 2, 3, 4, 5, 6];
  return [
    mk("weigh", "weighin", "Morning weigh-in", "07:15", all),
    mk("meal-breakfast", "meal", "Breakfast", "07:30", all),
    mk("meal-snack1", "meal", "Morning snack", "10:00", all),
    mk("meal-lunch", "meal", "Lunch", "12:30", all),
    mk("meal-shake", "meal", "Weight-gain shake", "15:30", all),
    mk("meal-dinner", "meal", "Dinner", "18:30", all),
    mk("meal-snack", "meal", "Greek yogurt snack", "20:30", all),
    mk("wk-mon", "workout", "Gym: Workout A", "17:30", [1]),
    mk("wk-tue", "workout", "Home workout 1", "17:30", [2]),
    mk("wk-wed", "workout", "Gym: Workout B", "17:30", [3]),
    mk("wk-thu", "workout", "Home workout 2", "17:30", [4]),
    mk("wk-fri", "workout", "Gym: Workout A", "17:30", [5]),
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
  for (const x of day.extras || []) { calories += x.calories * x.servings; protein += x.protein * x.servings; }
  return { calories: Math.round(calories), protein: Math.round(protein) };
}

// ---------- Training ----------

export function routineForDate(state, date) {
  return getDay(state, date).workout?.override || SCHEDULE[weekdayOf(date)].routine;
}
export function scheduleLabel(state, date) {
  const r = routineForDate(state, date);
  return r === "A" ? "Gym: Workout A" : r === "B" ? "Gym: Workout B" : SCHEDULE[weekdayOf(date)].label;
}
export const isLoadedRoutine = (r) => r === "A" || r === "B" || r === "H1" || r === "H2";

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
  const wave = e.upper ? WAVE_UPPER : WAVE_LOWER;
  return e.sets + wave[waveInfo(state, date).weekInBlock];
}
// Push ladder starts at standard push-ups (you bench anyway); pull ladder starts at
// dead hangs because pull-ups are the loaded elbow-flexor movement.
export const LADDER_DEFAULT = { push: 2, pull: 0 };
export const progressLevel = (state, key) => state.progression?.[key]?.level ?? LADDER_DEFAULT[key] ?? 0;
export function shownLadderVariant(state, key) {
  const ids = LADDERS[key], i = Math.min(progressLevel(state, key), ids.length - 1);
  return { id: ids[i], i };
}
export function canProgress(state, key) {
  if (LADDERS[key]) return shownLadderVariant(state, key).i + 1 < LADDERS[key].length;
  return progressLevel(state, key) < MAX_LOAD_LEVEL;
}
export function exercisesForDate(state, date) {
  const r = routineForDate(state, date);
  if (!isLoadedRoutine(r)) return [];
  const base = WORKOUTS[r];
  const shown = new Set(Object.keys(LADDERS).map((k) => shownLadderVariant(state, k).id));
  const upper = UPPER_BODY.filter((u) => (!u.days || u.days.includes(r)) && (!LADDER_OF[u.id] || shown.has(u.id)));
  const dense = isDensityWeek(state, date);
  return [...base, ...upper]
    .map((e) => {
      const key = LADDER_OF[e.id] || e.id;
      return { ...e, loaded: LOADED_IDS.has(e.id), sets: setsFor(state, date, e), isDensity: !!(e.density && dense), progKey: key, level: LADDERS[key] ? shownLadderVariant(state, key).i : progressLevel(state, key), ladder: !!LADDERS[key] };
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
// Walks (20/30/40 min) count toward the day: a walk day is just the walk (40 min =
// 100%); a home workout is 75% sets + 25% walk, so it only completes with both.
export const WALK_MINUTES = [20, 30, 40];
export const WALK_TARGET = 40;
export const HOME_WALK_SHARE = 0.25;
export const hasWalk = (routine) => routine === "walk" || routine === "H1" || routine === "H2";
export const walkMinutes = (state, date) => getDay(state, date).walk?.minutes ?? 0;
export const walkPct = (state, date) => Math.min(100, Math.round((100 * walkMinutes(state, date)) / WALK_TARGET));
export function dayProgress(state, date) {
  const r = routineForDate(state, date), p = workoutProgress(state, date);
  const walk = walkMinutes(state, date), wPct = walkPct(state, date);
  const setsPct = p.total ? (100 * p.done) / p.total : 0;
  if (r === "walk") return { pct: wPct, complete: wPct === 100, setsPct: 0, walkPct: wPct, walk };
  if (r === "H1" || r === "H2") {
    const pct = Math.round((1 - HOME_WALK_SHARE) * setsPct + HOME_WALK_SHARE * wPct);
    return { pct, complete: p.total > 0 && p.done === p.total && wPct === 100, setsPct, walkPct: wPct, walk };
  }
  return { pct: Math.round(setsPct), complete: p.total > 0 && p.done === p.total, setsPct, walkPct: 0, walk: 0 };
}
export function workoutStatus(state, date) {
  const w = getDay(state, date).workout;
  if (w?.skipped) return "skipped";
  const d = dayProgress(state, date);
  if (d.complete) return "done";
  if (d.pct > 0) return "partial";
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
    case "sleep": return day.sleepBand ? "done" : null;
    case "prayer": return day.prayer?.[d.which]?.status ?? null;
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

// ---------- Loads ----------

// Most recent logged load for an exercise strictly before `date`, and the best ever.
export function loadHistory(state, exId, date) {
  let last = null, best = null;
  for (const d of Object.keys(state.days).sort()) {
    const l = state.days[d].loads?.[exId];
    if (!l) continue;
    if (!best || l.lb > best.lb) best = { date: d, lb: l.lb };
    if (d < date) last = { date: d, lb: l.lb };
  }
  return { last, best };
}

// ---------- Guided workout ----------

// The first set (in session order) with nothing logged yet; skipped/partial count as logged.
export function nextSet(state, date) {
  const sets = getDay(state, date).sets || {};
  const exs = exercisesForDate(state, date);
  for (let xi = 0; xi < exs.length; xi++) for (let i = 0; i < exs[xi].sets; i++) if (!sets[setKey(exs[xi].id, i)]) return { e: exs[xi], i, xi, total: exs.length };
  return null;
}
// The most recently logged set in session order (for the "Previous set" button).
export function lastLoggedSet(state, date) {
  const sets = getDay(state, date).sets || {};
  const exs = exercisesForDate(state, date);
  let last = null;
  for (const e of exs) for (let i = 0; i < e.sets; i++) if (sets[setKey(e.id, i)]) last = { e, i };
  return last;
}

// ---------- Workout export ----------

const STATUS_WORD = { done: "done", partial: "partial", skipped: "skipped" };
// Plain-text + CSV summary of one day's workout, for sharing or saving elsewhere.
export function workoutExport(state, date) {
  const routine = routineForDate(state, date);
  const day = getDay(state, date);
  const exs = exercisesForDate(state, date);
  const prog = workoutProgress(state, date);
  const { week, phase } = phaseForDate(state, date);
  const label = scheduleLabel(state, date);
  const when = parseYmd(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const lines = [`${label} — ${when}`];
  if (isLoadedRoutine(routine)) {
    lines.push(`Week ${waveInfo(state, date).weekInBlock + 1} of 4 wave · program week ${Math.max(week, 1)} (${phase.name})`);
    lines.push(`Sets done: ${prog.done}/${prog.total}${prog.total ? ` (${Math.round((100 * prog.done) / prog.total)}%)` : ""}${day.workout?.skipped ? " · workout skipped" : ""}`);
  } else lines.push("No loaded workout scheduled.");
  const rows = [];
  if (hasWalk(routine)) {
    const wm = walkMinutes(state, date);
    lines.push(`Walk: ${wm ? `${wm} min` : "not logged"}`);
    rows.push([date, routine, "walk", `Walk (${wm || 0} min)`, 1, wm ? "done" : "not logged", "", getDay(state, date).walk?.loggedAt ?? ""]);
  }
  for (const e of exs) {
    const load = day.loads?.[e.id]?.lb;
    const marks = Array.from({ length: e.sets }, (_, i) => {
      const st = day.sets?.[setKey(e.id, i)];
      rows.push([date, routine, e.id, e.name, i + 1, st ? STATUS_WORD[st.status] || st.status : "not logged", load ?? "", st?.loggedAt ?? ""]);
      return `${i + 1}:${st ? STATUS_WORD[st.status] || st.status : "—"}`;
    });
    lines.push("", `${e.name} — ${e.sets} × ${e.reps}${load != null ? ` @ ${load} lb` : ""}${e.isDensity ? " (density block)" : ""}`, `  Sets ${marks.join("  ")}`);
  }
  const rd = day.readiness ? READINESS.filter((r) => day.readiness[r.id]).map((r) => r.label) : [];
  if (rd.length) lines.push("", `Pre-session check ticked: ${rd.join("; ")}`);
  const pain = painRows(state, date).filter((r) => !r.skipped && typeof r.severity === "number");
  if (pain.length) lines.push("", "Symptoms: " + pain.map((r) => `${PAIN.areas.find((a) => a.id === r.area)?.label} ${r.severity}/10 (${PAIN.times.find((t) => t.id === r.tod)?.label.toLowerCase()})`).join(", "));
  const q = (v) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const csv = [["date", "routine", "exercise_id", "exercise", "set", "status", "load_lb", "logged_at"].join(","), ...rows.map((r) => r.map(q).join(","))].join("\n");
  return { text: lines.join("\n"), csv, hasData: prog.logged > 0 || walkMinutes(state, date) > 0 || exs.some((e) => day.loads?.[e.id]) };
}
