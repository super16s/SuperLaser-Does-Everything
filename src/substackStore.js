// Persists the list of Substack publications you've chosen to "keep"
// (follow) via the discovery UI, so the topic feed keeps pulling from
// them across restarts without needing SUBSTACK_FEEDS edited by hand.

import fs from "node:fs";
import path from "node:path";

const STORE_PATH = path.join(process.cwd(), "data", "substack-feeds.json");

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return [];
  }
}

function writeStore(list) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(list, null, 2));
}

export function listFollowing() {
  return readStore();
}

export async function followPublication({ name, url, feedUrl, category }) {
  if (!feedUrl) throw new Error("feedUrl is required");

  const res = await fetch(feedUrl);
  if (!res.ok) throw new Error(`Feed at ${feedUrl} returned HTTP ${res.status}`);
  const body = await res.text();
  if (!body.includes("<rss") && !body.includes("<feed")) {
    throw new Error(`${feedUrl} doesn't look like an RSS/Atom feed`);
  }

  const list = readStore();
  if (list.some((p) => p.feedUrl === feedUrl)) return list;
  list.push({
    name: name || feedUrl,
    url: url || feedUrl,
    feedUrl,
    category: category ? category.trim() || null : null,
    addedAt: new Date().toISOString(),
  });
  writeStore(list);
  return list;
}

export function unfollowPublication(feedUrl) {
  const list = readStore().filter((p) => p.feedUrl !== feedUrl);
  writeStore(list);
  return list;
}
