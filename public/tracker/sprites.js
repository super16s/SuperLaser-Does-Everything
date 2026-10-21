// Pixel-art scene for the workout progress bar: a muscle man pushes a stone along
// the ground as sets get done; at 100% the stones are stacked and he flexes.
// Sprites are lists of [x, y, w, h, colour] rectangles on a tiny grid, scaled up
// with crisp edges so they stay pixelated at any DPI.

const C = { skin: "#f2b27a", shade: "#d98c55", dark: "#2b2b2b", red: "#d9433b", blue: "#2f6fed", blueD: "#234fb0", shoe: "#f4f4f4",
  stone: "#8b8f98", stoneD: "#656972", stoneL: "#b9bdc6" };

function svg(rects, w, h, scale, cls = "") {
  return `<svg class="${cls}" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects.map(([x, y, rw, rh, c]) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${C[c] || c}"/>`).join("")}</svg>`;
}

const head = (x, y) => [[x, y, 6, 6, "skin"], [x, y, 6, 2, "red"], [x + 4, y + 3, 1, 1, "dark"], [x + 1, y + 5, 5, 1, "shade"]];

// Side view, pushing right. Two frames differ in leg position.
function pusher(frame) {
  const legs = frame === 0
    ? [[6, 15, 3, 5, "skin"], [5, 19, 4, 1, "shoe"], [12, 15, 3, 4, "skin"], [12, 19, 4, 1, "shoe"]]
    : [[8, 15, 3, 5, "skin"], [8, 19, 4, 1, "shoe"], [10, 15, 3, 5, "skin"], [10, 19, 4, 1, "shoe"]];
  return [
    ...head(8, 0),
    [10, 6, 3, 1, "shade"],                                // neck
    [5, 7, 10, 3, "skin"], [6, 10, 9, 2, "skin"], [7, 12, 7, 1, "shade"], // torso (wide shoulders, tapering)
    [9, 8, 1, 3, "shade"],                                 // pec line
    [6, 13, 9, 3, "blue"], [6, 15, 9, 1, "blueD"],         // shorts
    ...legs,
    [14, 7, 7, 3, "skin"], [14, 6, 3, 1, "skin"], [14, 9, 6, 1, "shade"], [20, 7, 2, 3, "shade"], // pushing arm + bicep + fist
  ];
}
// Front view, both arms up.
const flex = [
  ...head(8, 0), [9, 6, 4, 1, "shade"],
  [3, 7, 16, 3, "skin"], [5, 10, 12, 2, "skin"], [7, 12, 8, 1, "shade"], [10, 8, 2, 3, "shade"],
  [8, 13, 6, 3, "blue"], [8, 15, 6, 1, "blueD"],
  [8, 16, 2, 4, "skin"], [12, 16, 2, 4, "skin"], [7, 19, 3, 1, "shoe"], [12, 19, 3, 1, "shoe"],
  [0, 4, 4, 3, "skin"], [0, 1, 3, 4, "skin"], [0, 0, 3, 1, "shade"],      // left arm up
  [18, 4, 4, 3, "skin"], [19, 1, 3, 4, "skin"], [19, 0, 3, 1, "shade"],   // right arm up
];
const stone = [
  [2, 0, 7, 1, "stoneL"], [1, 1, 9, 1, "stone"], [0, 2, 11, 4, "stone"], [1, 6, 9, 1, "stoneD"], [2, 7, 7, 1, "stoneD"],
  [2, 2, 3, 1, "stoneL"], [7, 4, 3, 2, "stoneD"],
];
const cairnStone = (w) => [[1, 0, w - 2, 1, "stoneL"], [0, 1, w, 3, "stone"], [1, 4, w - 2, 1, "stoneD"]];

export function scene(pct, key) {
  const S = 2;
  const left = `calc((100% - 120px) * ${pct / 100})`;
  const widths = [18, 15, 12, 9]; // bottom → top
  const complete = pct >= 100;
  return `<div class="scene${complete ? " complete" : ""}" role="progressbar" aria-label="Workout progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
    <div class="pusher" data-key="${key}" data-pct="${pct}" data-prop="push" style="left:${left}">
      <div class="man">${svg(pusher(0), 22, 20, S, "fa")}${svg(pusher(1), 22, 20, S, "fb")}${svg(flex, 22, 20, S, "flex")}</div>
      <div class="rock">${svg(stone, 11, 8, S, "")}</div>
    </div>
    <div class="cairn" aria-hidden="true">${widths.map((w) => svg(cairnStone(w), w, 5, S)).join("")}</div>
    <div class="ground"></div></div>`;
}

// ---------- Celebration icons: one per Today action (14×14 grid) ----------

const P = { white: "#fafafa", yolk: "#f5b301", yolkL: "#fff3b0", yellow: "#ffd84a", yellowD: "#c9a227", brown: "#8a5a2b", brownD: "#5e3b17", brownL: "#b87a3d",
  pink: "#f08bb0", pinkD: "#c95d89", red: "#d9433b", grayL: "#cfd3da", gray: "#8b8f98", gold: "#ffd166", moon: "#ffe9a3", blueL: "#9ec5ff", blueM: "#6fa3f0",
  sleeve: "#8fb4ff", green: "#3fbf94", dark: "#2b2b2b", skin: "#f2b27a", shade: "#d98c55" };

const ICONS = {
  // Sunny-side-up egg
  egg: [[4, 4, 6, 1, "white"], [3, 5, 8, 1, "white"], [2, 6, 10, 3, "white"], [3, 9, 8, 1, "white"], [4, 10, 6, 1, "white"], [6, 6, 3, 3, "yolk"], [6, 6, 1, 1, "yolkL"], [2, 8, 1, 1, "grayL"], [10, 9, 1, 1, "grayL"]],
  // Banana
  banana: [[2, 7, 2, 2, "yellow"], [3, 8, 3, 2, "yellow"], [5, 9, 4, 2, "yellow"], [8, 8, 3, 2, "yellow"], [10, 5, 2, 3, "yellow"], [11, 3, 2, 3, "yellow"], [3, 10, 3, 1, "yellowD"], [5, 11, 4, 1, "yellowD"], [11, 2, 2, 1, "brownD"], [2, 7, 1, 1, "brownD"]],
  // Steaming bowl of rice
  bowl: [[2, 8, 10, 1, "brown"], [3, 9, 8, 1, "brown"], [4, 10, 6, 1, "brownD"], [5, 11, 4, 1, "brownD"], [3, 6, 8, 2, "white"], [4, 5, 6, 1, "white"], [5, 7, 1, 1, "yolk"], [8, 6, 1, 1, "green"], [5, 2, 1, 2, "grayL"], [7, 1, 1, 3, "grayL"], [9, 2, 1, 2, "grayL"]],
  // Shake cup with straw
  shake: [[3, 3, 8, 1, "white"], [4, 4, 6, 3, "pink"], [4, 6, 6, 1, "pinkD"], [5, 7, 4, 3, "pink"], [5, 9, 4, 2, "pinkD"], [8, 0, 1, 4, "red"], [7, 0, 2, 1, "red"]],
  // Drumstick
  drumstick: [[6, 2, 4, 1, "brown"], [5, 3, 6, 3, "brown"], [6, 6, 4, 1, "brown"], [6, 3, 2, 1, "brownL"], [5, 6, 2, 2, "white"], [4, 8, 2, 2, "white"], [3, 9, 2, 2, "white"], [2, 10, 2, 2, "white"], [1, 11, 2, 2, "white"], [3, 12, 2, 1, "white"]],
  // Yogurt cup with spoon
  yogurt: [[5, 3, 4, 1, "white"], [4, 4, 6, 1, "white"], [3, 5, 8, 1, "white"], [4, 6, 6, 4, "blueL"], [5, 10, 4, 1, "blueM"], [9, 0, 1, 5, "gray"], [9, 0, 2, 1, "gray"]],
  // Praying hands with a little glow
  prayer: [[6, 1, 2, 1, "skin"], [5, 2, 2, 3, "skin"], [7, 2, 2, 3, "shade"], [5, 5, 2, 5, "skin"], [7, 5, 2, 5, "shade"], [4, 6, 1, 3, "skin"], [9, 6, 1, 3, "shade"], [4, 10, 6, 1, "shade"], [3, 11, 8, 2, "sleeve"], [2, 3, 1, 1, "gold"], [11, 3, 1, 1, "gold"], [6, 0, 2, 1, "gold"], [1, 6, 1, 1, "gold"], [12, 6, 1, 1, "gold"]],
  // Bathroom scale
  scale: [[2, 3, 10, 1, "gray"], [2, 4, 10, 8, "grayL"], [2, 11, 10, 1, "gray"], [2, 3, 1, 9, "gray"], [11, 3, 1, 9, "gray"], [4, 4, 6, 3, "white"], [7, 4, 1, 3, "red"], [4, 8, 6, 2, "gray"], [3, 12, 2, 1, "dark"], [9, 12, 2, 1, "dark"]],
  // Moon and a Z
  moon: [[5, 1, 4, 1, "moon"], [4, 2, 3, 1, "moon"], [3, 3, 3, 1, "moon"], [3, 4, 3, 1, "moon"], [3, 5, 3, 1, "moon"], [3, 6, 3, 1, "moon"], [3, 7, 3, 1, "moon"], [3, 8, 3, 1, "moon"], [4, 9, 3, 1, "moon"], [5, 10, 4, 1, "moon"], [9, 3, 3, 1, "white"], [11, 4, 1, 1, "white"], [10, 5, 1, 1, "white"], [9, 6, 3, 1, "white"]],
};
export const MEAL_KIND = { breakfast: "egg", snack1: "banana", lunch: "bowl", shake: "shake", dinner: "drumstick", snack: "yogurt" };
// How each celebration plays: particles burst outward or rise, in these colours.
export const CELE = {
  egg: { mode: "burst", colors: ["#f5b301", "#fff3b0", "#fafafa"] },
  banana: { mode: "burst", colors: ["#ffd84a", "#c9a227", "#fff3b0"] },
  bowl: { mode: "rise", colors: ["#cfd3da", "#fafafa", "#e8eaee"] },
  shake: { mode: "burst", colors: ["#f08bb0", "#c95d89", "#fafafa"] },
  drumstick: { mode: "burst", colors: ["#e8742a", "#d9433b", "#ffd166"] },
  yogurt: { mode: "rise", colors: ["#9ec5ff", "#fafafa", "#6fa3f0"] },
  prayer: { mode: "rise", colors: ["#ffd166", "#fff3b0", "#fafafa"] },
  scale: { mode: "burst", colors: ["#3fbf94", "#ffd166", "#fafafa"] },
  moon: { mode: "rise", colors: ["#ffe9a3", "#9ec5ff", "#fafafa"] },
};
export function pixelIcon(kind, scale = 4) {
  const rects = (ICONS[kind] || []).map(([x, y, w, h, c]) => [x, y, w, h, P[c] || c]);
  return `<svg class="pxicon" width="${14 * scale}" height="${14 * scale}" viewBox="0 0 14 14" shape-rendering="crispEdges" aria-hidden="true">${rects.map(([x, y, w, h, c]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`).join("")}</svg>`;
}
