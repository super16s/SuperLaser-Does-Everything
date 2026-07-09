#!/usr/bin/env node
// Fetches Next Gen Stats (NGS) CSV data from the nflverse-data GitHub
// release and writes it to data/ngs-latest.csv.
//
// Run manually or on a schedule (e.g. GitHub Actions cron):
//   node scripts/fetch-ngs.js
//   node scripts/fetch-ngs.js --stat=rushing --season=2025
//
// nflverse renames/adds release assets over time, so instead of hardcoding
// a filename, the release's asset list is queried at runtime and the
// matching CSV is picked from it.

import fs from "node:fs";
import path from "node:path";

const RELEASE_API_URL =
  "https://api.github.com/repos/nflverse/nflverse-data/releases/tags/nextgen_stats";
const VALID_STATS = ["passing", "rushing", "receiving"];

function parseArgs(argv) {
  const args = { stat: "passing", season: null };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "stat") args.stat = value;
    if (key === "season") args.season = value;
  }
  if (!VALID_STATS.includes(args.stat)) {
    throw new Error(`--stat must be one of ${VALID_STATS.join(", ")} (got "${args.stat}")`);
  }
  return args;
}

async function getReleaseAssets() {
  const res = await fetch(RELEASE_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "superlaser-ff-app-fetch-ngs",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch release metadata: ${res.status} ${res.statusText}`);
  }
  const release = await res.json();
  return release.assets;
}

function pickAsset(assets, stat, season) {
  const csvAssets = assets.filter((a) => a.name.endsWith(".csv"));
  const statAssets = csvAssets.filter((a) => a.name.includes(stat));

  if (season) {
    const exact = statAssets.find((a) => a.name.includes(String(season)));
    if (!exact) {
      throw new Error(
        `No NGS ${stat} CSV found for season ${season}. Available: ${statAssets
          .map((a) => a.name)
          .join(", ")}`
      );
    }
    return exact;
  }

  // No season given: prefer a combined "all seasons" file if one exists,
  // otherwise fall back to the most recent season-specific file.
  const combined = statAssets.find((a) => !/\d{4}/.test(a.name));
  if (combined) return combined;

  const bySeasonDesc = statAssets
    .filter((a) => /\d{4}/.test(a.name))
    .sort((a, b) => b.name.localeCompare(a.name));
  if (bySeasonDesc.length > 0) return bySeasonDesc[0];

  throw new Error(`No NGS ${stat} CSV assets found in the nextgen_stats release.`);
}

async function main() {
  const { stat, season } = parseArgs(process.argv.slice(2));

  const assets = await getReleaseAssets();
  const asset = pickAsset(assets, stat, season);

  console.log(`Downloading ${asset.name} ...`);
  const res = await fetch(asset.browser_download_url);
  if (!res.ok) {
    throw new Error(`Failed to download ${asset.name}: ${res.status} ${res.statusText}`);
  }
  const csvText = await res.text();

  const outDir = path.join(process.cwd(), "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "ngs-latest.csv");
  fs.writeFileSync(outPath, csvText);

  console.log(`Saved ${asset.name} -> ${outPath} (${csvText.length} bytes)`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
