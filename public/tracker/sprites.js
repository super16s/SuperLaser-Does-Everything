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
// Front view, victorious: right arm straight up with a fist, left fist on the hip. 22×24 grid (extra headroom for the raised arm).
const victory = [
  ...head(8, 4), [9, 10, 4, 1, "shade"],
  [3, 11, 16, 3, "skin"], [5, 14, 12, 2, "skin"], [7, 16, 8, 1, "shade"], [10, 12, 2, 3, "shade"],
  [8, 17, 6, 3, "blue"], [8, 19, 6, 1, "blueD"],
  [8, 20, 2, 4, "skin"], [12, 20, 2, 4, "skin"], [7, 23, 3, 1, "shoe"], [12, 23, 3, 1, "shoe"],
  [1, 12, 3, 3, "skin"], [1, 15, 3, 3, "skin"], [3, 17, 2, 1, "shade"],      // left arm, fist on hip
  [18, 2, 3, 10, "skin"], [18, 0, 3, 3, "shade"], [17, 7, 1, 4, "shade"],     // right arm straight up, fist, bicep shade
];
export function victorySvg(scale = 7) { return svg(victory, 22, 24, scale, "victory"); }
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
      <div class="man">${svg(pusher(0), 22, 20, S, "fa")}${svg(pusher(1), 22, 20, S, "fb")}${svg(victory, 22, 24, S, "flex")}</div>
      <div class="rock">${svg(stone, 11, 8, S, "")}</div>
    </div>
    <div class="cairn" aria-hidden="true">${widths.map((w) => svg(cairnStone(w), w, 5, S)).join("")}</div>
    <div class="ground"></div></div>`;
}

export const MEAL_KIND = { breakfast: "egg", snack1: "banana", lunch: "bowl", shake: "shake", dinner: "drumstick", snack: "yogurt" };
// How each celebration plays (clean light effects, no icons): sparks burst outward or rise, in these colours.
export const CELE = {
  egg: { mode: "burst", hue: "#f5a800", colors: ["#f5a800", "#fff3b0", "#fafafa"] },
  banana: { mode: "burst", hue: "#e0b100", colors: ["#e0b100", "#c9a227", "#fff3b0"] },
  bowl: { mode: "rise", hue: "#7f93b3", colors: ["#7f93b3", "#fafafa", "#e8eaee"] },
  shake: { mode: "burst", hue: "#e0609a", colors: ["#e0609a", "#c95d89", "#fafafa"] },
  drumstick: { mode: "burst", hue: "#e8742a", colors: ["#e8742a", "#d9433b", "#ffd166"] },
  yogurt: { mode: "rise", hue: "#4f8fe8", colors: ["#4f8fe8", "#fafafa", "#6fa3f0"] },
  prayer: { mode: "rise", hue: "#f2a81d", colors: ["#f2a81d", "#fff3b0", "#fafafa"] },
  scale: { mode: "burst", hue: "#2fb386", colors: ["#2fb386", "#ffd166", "#fafafa"] },
  moon: { mode: "rise", hue: "#6277d4", colors: ["#6277d4", "#9ec5ff", "#fafafa"] },
};
