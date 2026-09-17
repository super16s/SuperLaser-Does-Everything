import { fetchX } from "./sources/x.js";
import { fetchSubstack } from "./sources/substack.js";
import { fetchMastodon } from "./sources/mastodon.js";
import { fetchReddit } from "./sources/reddit.js";
import { fetchArxiv } from "./sources/arxiv.js";

const FETCHERS = {
  x: fetchX,
  substack: fetchSubstack,
  mastodon: fetchMastodon,
  reddit: fetchReddit,
  arxiv: fetchArxiv,
};

// Sources whose feed list can be scoped by the category filter.
const CATEGORY_AWARE_SOURCES = new Set(["substack", "reddit"]);

export const ALL_SOURCES = Object.keys(FETCHERS);

export async function aggregate(topic, sources = ALL_SOURCES, { category = null } = {}) {
  const selected = sources.filter((s) => s in FETCHERS);

  const results = await Promise.all(
    selected.map(async (source) => {
      try {
        const options = CATEGORY_AWARE_SOURCES.has(source) ? { category } : {};
        const { items, error } = await FETCHERS[source](topic, options);
        return { source, items, error };
      } catch (err) {
        return { source, items: [], error: err.message };
      }
    })
  );

  const items = results
    .flatMap((r) => r.items)
    .sort((a, b) => new Date(b.publishedAt ?? 0) - new Date(a.publishedAt ?? 0));

  const statuses = Object.fromEntries(results.map((r) => [r.source, { count: r.items.length, error: r.error }]));

  return { topic, items, statuses };
}
