#!/usr/bin/env node
// Fetches Next Gen Stats (NGS) CSV data from the nflverse-data GitHub
// release and writes it to data/ngs-latest.csv.
//
// Each stat type has a single combined CSV covering all seasons since
// 2016 (nflverse updates it in place rather than publishing per-season
// files), at a stable URL matching the one nflreadr::load_nextgen_stats()
// resolves to.
//
// Run manually or on a schedule (e.g. GitHub Actions cron):
//   node scripts/fetch-ngs.js
//   node scripts/fetch-ngs.js --stat=rushing

import fs from "node:fs";
import path from "node:path";

const VALID_STATS = ["passing", "rushing", "receiving"];

function parseArgs(argv) {
  let stat = "passing";
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "stat") stat = value;
  }
  if (!VALID_STATS.includes(stat)) {
    throw new Error(`--stat must be one of ${VALID_STATS.join(", ")} (got "${stat}")`);
  }
  return { stat };
}

async function main() {
  const { stat } = parseArgs(process.argv.slice(2));
  const url = `https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_${stat}.csv`;

  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download NGS data: ${res.status} ${res.statusText}`);
  }
  const csvText = await res.text();

  const outDir = path.join(process.cwd(), "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "ngs-latest.csv");
  fs.writeFileSync(outPath, csvText);

  console.log(`Saved ngs_${stat}.csv -> ${outPath} (${csvText.length} bytes)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
