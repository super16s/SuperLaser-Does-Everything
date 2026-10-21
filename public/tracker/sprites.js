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
