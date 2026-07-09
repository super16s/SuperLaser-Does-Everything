import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, loadNextgenStats } from "../lib/loadNextgenStats.js";

test("parseCsv coerces integers and floats, keeps strings, maps empty to null", () => {
  const csv = "season,week,player_display_name,avg_time_to_throw\n2016,0,Drew Brees,2.42423774145617\n2016,1,,\n";
  const rows = parseCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    season: 2016,
    week: 0,
    player_display_name: "Drew Brees",
    avg_time_to_throw: 2.42423774145617,
  });
  assert.deepEqual(rows[1], {
    season: 2016,
    week: 1,
    player_display_name: null,
    avg_time_to_throw: null,
  });
});

test("parseCsv handles quoted fields with embedded commas and escaped quotes", () => {
  const csv = 'name,note\n"Last, First","said ""hi"""\n';
  const rows = parseCsv(csv);
  assert.deepEqual(rows, [{ name: "Last, First", note: 'said "hi"' }]);
});

test("parseCsv returns [] for header-only input", () => {
  assert.deepEqual(parseCsv("season,week\n"), []);
});

test("loadNextgenStats rejects unsupported file_type", async () => {
  await assert.rejects(
    () => loadNextgenStats({ fileType: "rds" }),
    /file_type "rds" is not supported/
  );
});

test("loadNextgenStats rejects unknown stat_type", async () => {
  await assert.rejects(
    () => loadNextgenStats({ statType: "kicking" }),
    /stat_type must be one of/
  );
});

test("loadNextgenStats rejects seasons below 2016", async () => {
  await assert.rejects(
    () => loadNextgenStats({ seasons: [2015] }),
    /seasons must be TRUE or integer season/
  );
});
