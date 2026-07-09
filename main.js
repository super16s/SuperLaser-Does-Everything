const STAT_TYPES = ["passing", "receiving", "rushing"];

const COMMON_COLUMNS = [
  { key: "season", label: "Season" },
  { key: "week", label: "Wk" },
  { key: "player_display_name", label: "Player" },
  { key: "player_position", label: "Pos" },
  { key: "team_abbr", label: "Team" },
];

const STAT_COLUMNS = {
  passing: [
    { key: "attempts", label: "Att" },
    { key: "completions", label: "Cmp" },
    { key: "completion_percentage", label: "Cmp%", decimals: 1 },
    { key: "pass_yards", label: "Yds" },
    { key: "pass_touchdowns", label: "TD" },
    { key: "interceptions", label: "INT" },
    { key: "passer_rating", label: "Rtg", decimals: 1 },
    { key: "avg_time_to_throw", label: "TT Throw", decimals: 2 },
    { key: "completion_percentage_above_expectation", label: "CPOE", decimals: 1 },
  ],
  receiving: [
    { key: "targets", label: "Tgt" },
    { key: "receptions", label: "Rec" },
    { key: "catch_percentage", label: "Ctch%", decimals: 1 },
    { key: "yards", label: "Yds" },
    { key: "rec_touchdowns", label: "TD" },
    { key: "avg_separation", label: "Sep", decimals: 1 },
    { key: "avg_yac", label: "YAC", decimals: 1 },
    { key: "avg_yac_above_expectation", label: "YAC+", decimals: 1 },
  ],
  rushing: [
    { key: "rush_attempts", label: "Att" },
    { key: "rush_yards", label: "Yds" },
    { key: "avg_rush_yards", label: "Y/Att", decimals: 1 },
    { key: "rush_touchdowns", label: "TD" },
    { key: "efficiency", label: "Eff", decimals: 2 },
    { key: "rush_yards_over_expected_per_att", label: "RYOE/Att", decimals: 2 },
  ],
};

const state = {
  statType: "passing",
  season: "all",
  search: "",
  rows: [],
  sortKey: "season",
  sortDir: "desc",
};

const els = {
  statType: document.getElementById("statType"),
  season: document.getElementById("season"),
  search: document.getElementById("search"),
  status: document.getElementById("status"),
  head: document.getElementById("tableHead"),
  body: document.getElementById("tableBody"),
  table: document.getElementById("table"),
  empty: document.getElementById("empty"),
};

function columnsFor(statType) {
  return [...COMMON_COLUMNS, ...STAT_COLUMNS[statType]];
}

function formatValue(value, column) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number" && column.decimals !== undefined) {
    return value.toFixed(column.decimals);
  }
  return String(value);
}

async function loadStatType(statType) {
  els.status.textContent = "Loading…";
  els.table.hidden = false;
  els.empty.hidden = true;

  try {
    const res = await fetch(`data/ngs-${statType}.json`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    state.rows = await res.json();
  } catch (err) {
    state.rows = [];
    els.table.hidden = true;
    els.empty.hidden = false;
    els.empty.textContent =
      `No data found for "${statType}" (data/ngs-${statType}.json). ` +
      `Run "npm run fetch:ngs" or wait for the scheduled workflow to populate it.`;
    els.status.textContent = "";
    return;
  }

  populateSeasonOptions();
  render();
}

function populateSeasonOptions() {
  const seasons = [...new Set(state.rows.map((r) => r.season))].sort((a, b) => b - a);
  const current = els.season.value || "all";
  els.season.innerHTML = "";
  const allOpt = document.createElement("option");
  allOpt.value = "all";
  allOpt.textContent = "All seasons";
  els.season.appendChild(allOpt);
  for (const season of seasons) {
    const opt = document.createElement("option");
    opt.value = String(season);
    opt.textContent = String(season);
    els.season.appendChild(opt);
  }
  els.season.value = seasons.includes(Number(current)) || current === "all" ? current : "all";
  state.season = els.season.value;
}

function filteredSortedRows() {
  const columns = columnsFor(state.statType);
  const searchTerm = state.search.trim().toLowerCase();

  let rows = state.rows;
  if (state.season !== "all") {
    const season = Number(state.season);
    rows = rows.filter((r) => r.season === season);
  }
  if (searchTerm) {
    rows = rows.filter((r) => (r.player_display_name ?? "").toLowerCase().includes(searchTerm));
  }

  const dir = state.sortDir === "asc" ? 1 : -1;
  const key = state.sortKey;
  rows = [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av === bv) return 0;
    if (av === null || av === undefined) return 1;
    if (bv === null || bv === undefined) return -1;
    return av > bv ? dir : -dir;
  });

  return { rows, columns };
}

function render() {
  const { rows, columns } = filteredSortedRows();

  els.head.innerHTML = "";
  const headRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column.label;
    if (column.key === state.sortKey) {
      th.classList.add("sorted");
      th.innerHTML = `${column.label} <span class="arrow">${state.sortDir === "asc" ? "↑" : "↓"}</span>`;
    }
    th.addEventListener("click", () => {
      if (state.sortKey === column.key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = column.key;
        state.sortDir = "desc";
      }
      render();
    });
    headRow.appendChild(th);
  }
  els.head.appendChild(headRow);

  els.body.innerHTML = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const td = document.createElement("td");
      td.textContent = formatValue(row[column.key], column);
      tr.appendChild(td);
    }
    els.body.appendChild(tr);
  }

  els.status.textContent = `${rows.length.toLocaleString()} row${rows.length === 1 ? "" : "s"}`;
}

function init() {
  for (const statType of STAT_TYPES) {
    const opt = document.createElement("option");
    opt.value = statType;
    opt.textContent = statType[0].toUpperCase() + statType.slice(1);
    els.statType.appendChild(opt);
  }
  els.statType.value = state.statType;

  els.statType.addEventListener("change", () => {
    state.statType = els.statType.value;
    state.sortKey = "season";
    state.sortDir = "desc";
    loadStatType(state.statType);
  });
  els.season.addEventListener("change", () => {
    state.season = els.season.value;
    render();
  });
  els.search.addEventListener("input", () => {
    state.search = els.search.value;
    render();
  });

  loadStatType(state.statType);
}

init();
