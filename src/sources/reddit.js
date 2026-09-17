// Fetches posts from Reddit matching a topic, using Reddit's public JSON
// endpoints (no API key required for light, non-commercial use — Reddit
// tightened API terms in 2023 for commercial/high-volume use, so treat
// this as fine for personal use but not guaranteed indefinitely).
//
// REDDIT_SUBREDDITS (env) optionally tags specific subreddits with a
// category, same "category=subreddit" format as SUBSTACK_FEEDS. When a
// category is selected and subreddits are tagged with it, the search is
// restricted to just those subreddits (Reddit supports multi-subreddit
// paths joined by "+"). With no category, or no subreddits configured for
// one, it falls back to a normal site-wide search — unlike Substack,
// Reddit has real full-text search, so there's always something useful to
// do even with zero configuration.

const USER_AGENT = "SuperLaserSocialApp/1.0 (topic feed aggregator; personal use)";

function parseEnvSubreddits() {
  return (process.env.REDDIT_SUBREDDITS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const eq = entry.indexOf("=");
      if (eq === -1) return { subreddit: entry, category: null };
      return { subreddit: entry.slice(eq + 1).trim(), category: entry.slice(0, eq).trim() || null };
    });
}

export function listCategories() {
  const categories = parseEnvSubreddits()
    .map((s) => s.category)
    .filter(Boolean);
  return [...new Set(categories)].sort();
}

export async function fetchReddit(topic, { limit = 10, category = null } = {}) {
  const configured = parseEnvSubreddits();
  const scoped = category ? configured.filter((s) => s.category === category) : [];

  const subredditPath = scoped.length ? `/r/${scoped.map((s) => s.subreddit).join("+")}` : "";
  const params = new URLSearchParams({ q: topic, sort: "new", limit: String(limit) });
  if (scoped.length) params.set("restrict_sr", "on");

  try {
    const res = await fetch(`https://www.reddit.com${subredditPath}/search.json?${params}`, {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!res.ok) {
      return { items: [], error: `Reddit error: HTTP ${res.status}` };
    }

    const data = await res.json();
    const items = (data.data?.children ?? []).map(({ data: post }) => ({
      id: `reddit-${post.id}`,
      source: "reddit",
      author: post.author,
      authorHandle: `u/${post.author}`,
      text: post.title,
      url: `https://reddit.com${post.permalink}`,
      publishedAt: new Date(post.created_utc * 1000).toISOString(),
    }));

    return { items, error: null };
  } catch (err) {
    return { items: [], error: `Reddit error: ${err.message}` };
  }
}
