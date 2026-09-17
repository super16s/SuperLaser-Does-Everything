// Fetches recent posts from X (Twitter) matching a topic, via the official
// X API v2 "recent search" endpoint. Requires a developer account and a
// Bearer token (X API v2 access is paid; there is no free/legal scraping
// substitute). Recent search only covers roughly the last 7 days.
//
// Docs: https://developer.x.com/en/docs/x-api/tweets/search/api-reference/get-tweets-search-recent

const API_URL = "https://api.twitter.com/2/tweets/search/recent";

export async function fetchX(topic, { limit = 10 } = {}) {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    return { items: [], error: "Not configured: set TWITTER_BEARER_TOKEN to enable X." };
  }

  const params = new URLSearchParams({
    query: `${topic} -is:retweet`,
    max_results: String(Math.min(Math.max(limit, 10), 100)),
    "tweet.fields": "created_at,author_id",
    expansions: "author_id",
    "user.fields": "username,name",
  });

  const res = await fetch(`${API_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { items: [], error: `X API error ${res.status}: ${body.slice(0, 200)}` };
  }

  const data = await res.json();
  const users = new Map((data.includes?.users ?? []).map((u) => [u.id, u]));
  const items = (data.data ?? []).map((tweet) => {
    const user = users.get(tweet.author_id);
    return {
      id: `x-${tweet.id}`,
      source: "x",
      author: user?.name ?? "Unknown",
      authorHandle: user ? `@${user.username}` : null,
      text: tweet.text,
      url: user ? `https://x.com/${user.username}/status/${tweet.id}` : `https://x.com/i/status/${tweet.id}`,
      publishedAt: tweet.created_at,
    };
  });

  return { items, error: null };
}
