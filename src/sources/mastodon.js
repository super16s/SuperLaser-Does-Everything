// Fetches posts from Mastodon matching a topic.
//
// Without an access token we use the public hashtag timeline
// (/api/v1/timelines/tag/:hashtag), which is open on most instances for
// public posts and needs no auth. With MASTODON_ACCESS_TOKEN set, we use
// the full-text search endpoint (/api/v2/search) instead, which covers
// more than just hashtags and works better for multi-word topics.

function toHashtag(topic) {
  return topic
    .trim()
    .replace(/^#/, "")
    .replace(/[^a-zA-Z0-9_]+/g, "");
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeStatus(status) {
  return {
    id: `mastodon-${status.id}`,
    source: "mastodon",
    author: status.account?.display_name || status.account?.username || "Unknown",
    authorHandle: status.account ? `@${status.account.acct}` : null,
    text: stripHtml(status.content ?? ""),
    url: status.url ?? status.uri,
    publishedAt: status.created_at,
  };
}

export async function fetchMastodon(topic, { limit = 10 } = {}) {
  const instance = (process.env.MASTODON_INSTANCE || "https://mastodon.social").replace(/\/$/, "");
  const token = process.env.MASTODON_ACCESS_TOKEN;

  try {
    let statuses;
    if (token) {
      const params = new URLSearchParams({ q: topic, type: "statuses", limit: String(limit) });
      const res = await fetch(`${instance}/api/v2/search?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      statuses = data.statuses ?? [];
    } else {
      const hashtag = toHashtag(topic);
      if (!hashtag) {
        return { items: [], error: "Topic has no usable hashtag characters for Mastodon." };
      }
      const params = new URLSearchParams({ limit: String(limit) });
      const res = await fetch(`${instance}/api/v1/timelines/tag/${hashtag}?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      statuses = await res.json();
    }

    return { items: statuses.map(normalizeStatus), error: null };
  } catch (err) {
    return { items: [], error: `Mastodon error: ${err.message}` };
  }
}
