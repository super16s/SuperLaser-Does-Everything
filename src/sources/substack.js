// Fetches posts from Substack publications and filters them by topic.
// Substack has no official public API for search, but every publication
// exposes a standard RSS 2.0 feed at "<publication>/feed" with no auth
// required, so we pull those feeds and match the topic keyword against
// each post's title/description.
//
// The feed list is SUBSTACK_FEEDS (env) plus whatever's been "kept" via
// the discovery UI (persisted in data/substack-feeds.json, see
// substackStore.js) — env feeds are always included, kept ones are
// user-managed at runtime.
//
// Each feed can optionally carry a category tag ("topic-scoped source
// sets") so a search can be narrowed to just that category's
// publications instead of always searching everything. In SUBSTACK_FEEDS,
// tag an entry as "category=https://pub.substack.com/feed"; an entry with
// no "=" has no category and is only included in unfiltered (all-category)
// searches.

import { listFollowing } from "../substackStore.js";

function parseEnvFeeds() {
  return (process.env.SUBSTACK_FEEDS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf("=");
      if (eq === -1) return { url: entry, category: null };
      return { url: entry.slice(eq + 1).trim(), category: entry.slice(0, eq).trim() || null };
    });
}

export function getConfiguredFeeds() {
  const envFeeds = parseEnvFeeds();
  const followedFeeds = listFollowing().map((p) => ({ url: p.feedUrl, category: p.category || null }));

  const byUrl = new Map();
  for (const feed of [...envFeeds, ...followedFeeds]) {
    if (!byUrl.has(feed.url)) byUrl.set(feed.url, feed);
  }
  return [...byUrl.values()];
}

export function listCategories() {
  const categories = getConfiguredFeeds()
    .map((f) => f.category)
    .filter(Boolean);
  return [...new Set(categories)].sort();
}

function stripCdata(raw) {
  const match = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return match ? match[1] : raw;
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function stripHtml(text) {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  return decodeEntities(stripCdata(match[1].trim()));
}

function parseFeedItems(xml) {
  const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  return itemBlocks.map((block) => ({
    title: extractTag(block, "title") ?? "",
    link: extractTag(block, "link") ?? "",
    pubDate: extractTag(block, "pubDate"),
    description: extractTag(block, "description") ?? "",
    creator: extractTag(block, "dc:creator"),
  }));
}

async function fetchFeed(feedUrl) {
  const res = await fetch(feedUrl);
  if (!res.ok) {
    throw new Error(`${feedUrl} -> HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseFeedItems(xml);
}

export async function fetchSubstack(topic, { limit = 10, category = null } = {}) {
  const feeds = getConfiguredFeeds();

  if (!feeds.length) {
    return {
      items: [],
      error: "No Substack sources yet — set SUBSTACK_FEEDS in .env, or use Discover to find and keep publications.",
    };
  }

  const scoped = category ? feeds.filter((f) => f.category === category) : feeds;

  if (!scoped.length) {
    return {
      items: [],
      error: `No Substack sources tagged "${category}".`,
    };
  }

  const feedUrls = scoped.map((f) => f.url);

  const needle = topic.toLowerCase();
  const items = [];
  const failures = [];

  await Promise.all(
    feedUrls.map(async (feedUrl) => {
      try {
        const posts = await fetchFeed(feedUrl);
        for (const post of posts) {
          const haystack = `${post.title} ${stripHtml(post.description)}`.toLowerCase();
          if (!haystack.includes(needle)) continue;
          items.push({
            id: `substack-${post.link}`,
            source: "substack",
            author: post.creator ?? new URL(feedUrl).hostname.replace(".substack.com", ""),
            authorHandle: null,
            text: post.title,
            url: post.link,
            publishedAt: post.pubDate ? new Date(post.pubDate).toISOString() : null,
          });
        }
      } catch (err) {
        failures.push(err.message);
      }
    })
  );

  items.sort((a, b) => new Date(b.publishedAt ?? 0) - new Date(a.publishedAt ?? 0));

  return {
    items: items.slice(0, limit),
    error: failures.length ? `Some feeds failed: ${failures.join("; ")}` : null,
  };
}
