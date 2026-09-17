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

import { listFollowing } from "../substackStore.js";

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

export async function fetchSubstack(topic, { limit = 10 } = {}) {
  const envFeeds = (process.env.SUBSTACK_FEEDS || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const followedFeeds = listFollowing().map((p) => p.feedUrl);

  const feedUrls = [...new Set([...envFeeds, ...followedFeeds])];

  if (!feedUrls.length) {
    return {
      items: [],
      error: "No Substack sources yet — set SUBSTACK_FEEDS in .env, or use Discover to find and keep publications.",
    };
  }

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
