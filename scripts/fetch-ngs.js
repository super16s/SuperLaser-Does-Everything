#!/usr/bin/env node
// Fetches Next Gen Stats (NGS) data via lib/loadNextgenStats.js and writes
// one JSON file per stat type to data/.
//
// Run manually or on a schedule (e.g. GitHub Actions cron):
//   node scripts/fetch-ngs.js
//   node scripts/fetch-ngs.js --stat=rushing

import fs from "node:fs";
import path from "node:path";
import { loadNextgenStats, NEXTGEN_STAT_TYPES } from "../lib/loadNextgenStats.js";

function parseArgs(argv) {
  let stat = "all";
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "stat") stat = value;
  }
  if (stat !== "all" && !NEXTGEN_STAT_TYPES.includes(stat)) {
    throw new Error(`--stat must be "all" or one of ${NEXTGEN_STAT_TYPES.join(", ")} (got "${stat}")`);
  }
  return { statTypes: stat === "all" ? NEXTGEN_STAT_TYPES : [stat] };
}

async function main() {
  const { statTypes } = parseArgs(process.argv.slice(2));

  const outDir = path.join(process.cwd(), "data");
  fs.mkdirSync(outDir, { recursive: true });

  for (const statType of statTypes) {
    console.log(`Fetching NGS ${statType} stats...`);
    const rows = await loadNextgenStats({ statType });
    const outPath = path.join(outDir, `ngs-${statType}.json`);
    fs.writeFileSync(outPath, JSON.stringify(rows));
    console.log(`Saved ${rows.length} rows -> ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
