import { fetchX } from "./sources/x.js";
import { fetchSubstack } from "./sources/substack.js";
import { fetchMastodon } from "./sources/mastodon.js";

const FETCHERS = {
  x: fetchX,
  substack: fetchSubstack,
  mastodon: fetchMastodon,
};

export const ALL_SOURCES = Object.keys(FETCHERS);

export async function aggregate(topic, sources = ALL_SOURCES, { substackCategory = null } = {}) {
  const selected = sources.filter((s) => s in FETCHERS);

  const results = await Promise.all(
    selected.map(async (source) => {
      try {
        const options = source === "substack" ? { category: substackCategory } : {};
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
