// JS port of nflreadr::load_nextgen_stats().
//
// R signature this mirrors:
//   load_nextgen_stats(
//     seasons = TRUE,
//     stat_type = c("passing", "receiving", "rushing"),
//     file_type = getOption("nflreadr.prefer", default = "rds")
//   )
//
// Differences from the R original:
//   - `fileType` defaults to "csv" rather than "rds": rds is R's binary
//     serialization format and has no meaningful JS equivalent. nflverse
//     also publishes "parquet", but parsing it here would mean pulling in
//     a parquet decoder, so only "csv" is implemented for now.
//   - `statType` accepts a single type or an array and loads/concatenates
//     all of them (the R default vector actually only resolves to
//     "passing" due to how rlang::arg_match0 treats an unmodified default).
//     Rows from multiple stat types are tagged with a `stat_type` field
//     since, unlike an R data frame, the source CSVs don't carry one.
import { gunzipSync } from "node:zlib";

const BASE_URL = "https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats";
const STAT_TYPES = ["passing", "receiving", "rushing"];
const FILE_TYPES = ["csv"];
const MIN_SEASON = 2016;

export function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop a trailing blank line produced by a final newline
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }

  const [header, ...dataRows] = rows;
  if (!header) return [];

  return dataRows.map((cells) => {
    const record = {};
    header.forEach((key, idx) => {
      record[key] = coerce(cells[idx]);
    });
    return record;
  });
}

function coerce(value) {
  if (value === undefined || value === "") return null;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d*\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

function normalizeStatTypes(statType) {
  const types = Array.isArray(statType) ? statType : [statType];
  if (types.length === 0) {
    throw new Error(`stat_type must include at least one of ${STAT_TYPES.join(", ")}`);
  }
  for (const type of types) {
    if (!STAT_TYPES.includes(type)) {
      throw new Error(`stat_type must be one of ${STAT_TYPES.join(", ")} (got "${type}")`);
    }
  }
  return types;
}

function buildSeasonFilter(seasons) {
  if (seasons === true) return () => true;

  const wanted = new Set(Array.isArray(seasons) ? seasons : [seasons]);
  for (const season of wanted) {
    if (typeof season !== "number" || !Number.isInteger(season) || season < MIN_SEASON) {
      throw new Error(`seasons must be TRUE or integer season(s) >= ${MIN_SEASON} (got ${season})`);
    }
  }
  return (row) => wanted.has(row.season);
}

async function fetchStatType(statType) {
  const url = `${BASE_URL}/ngs_${statType}.csv.gz`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const gzipped = Buffer.from(await res.arrayBuffer());
  const csvText = gunzipSync(gzipped).toString("utf8");
  return parseCsv(csvText).map((row) => ({ ...row, stat_type: statType }));
}

export async function loadNextgenStats({
  seasons = true,
  statType = STAT_TYPES,
  fileType = "csv",
} = {}) {
  if (!FILE_TYPES.includes(fileType)) {
    throw new Error(
      `file_type "${fileType}" is not supported by this loader (only ${FILE_TYPES.map((t) => `"${t}"`).join(", ")} is implemented; ` +
        `nflverse also publishes "parquet" and "rds" but this JS port doesn't decode those binary formats)`
    );
  }

  const types = normalizeStatTypes(statType);
  const matchesSeason = buildSeasonFilter(seasons);

  const perType = await Promise.all(types.map((type) => fetchStatType(type)));
  return perType.flat().filter(matchesSeason);
}

export const NEXTGEN_STAT_TYPES = STAT_TYPES;
