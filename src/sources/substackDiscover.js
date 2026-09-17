// Searches Substack by topic using the same internal endpoint Substack's
// own site search (substack.com/search) calls under the hood.
//
// This is NOT a documented/public API: Substack has no official search
// API, so there is no supported alternative for "find publications about
// topic X across all of Substack" short of this. Treat it as best-effort:
// - It can change shape or be rate-limited/blocked without notice.
// - We don't know its exact response schema for certain, so extractPublications()
//   below walks the parsed JSON generically (looking for any object that
//   has a subdomain/custom_domain plus a name) instead of assuming one
//   fixed path like `data.results[].publication`. That makes it resilient
//   to minor shape drift, but if Substack changes field names entirely,
//   this will start returning nothing and need a follow-up patch.
// - If it stops working entirely, the fallback is still there: add feed
//   URLs to SUBSTACK_FEEDS in .env directly.

const SEARCH_URL = "https://substack.com/api/v1/search";
const MAX_NODES_WALKED = 20000;

async function rawSearch(topic, limit) {
  const params = new URLSearchParams({ query: topic, type: "publication", limit: String(limit) });
  const res = await fetch(`${SEARCH_URL}?${params}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TopicFeedApp/1.0; +local)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    throw new Error("response wasn't JSON (endpoint may have changed or started blocking automated requests)");
  }

  return res.json();
}

function extractPublications(data, limit) {
  const seen = new Map();
  let budget = MAX_NODES_WALKED;

  function walk(node) {
    if (budget-- <= 0 || node === null || typeof node !== "object") return;

    if (!Array.isArray(node)) {
      const subdomain = typeof node.subdomain === "string" ? node.subdomain : null;
      const customDomain = typeof node.custom_domain === "string" ? node.custom_domain : null;
      const name = typeof node.name === "string" ? node.name : typeof node.title === "string" ? node.title : null;

      if ((subdomain || customDomain) && name) {
        const url = customDomain ? `https://${customDomain}` : `https://${subdomain}.substack.com`;
        if (!seen.has(url)) {
          const description =
            typeof node.hero_text === "string"
              ? node.hero_text
              : typeof node.description === "string"
                ? node.description
                : typeof node.bio === "string"
                  ? node.bio
                  : "";
          seen.set(url, {
            name,
            url,
            feedUrl: `${url.replace(/\/$/, "")}/feed`,
            description: description.slice(0, 200),
          });
        }
      }
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value);
    }
  }

  walk(data);
  return [...seen.values()].slice(0, limit);
}

export async function discoverSubstack(topic, { limit = 8 } = {}) {
  try {
    const data = await rawSearch(topic, limit);
    const publications = extractPublications(data, limit);

    if (!publications.length) {
      return {
        publications: [],
        error:
          "No publications found (or Substack's search response shape has changed and needs a code update — check server logs).",
      };
    }

    return { publications, error: null };
  } catch (err) {
    return {
      publications: [],
      error: `Substack discovery failed: ${err.message}. This uses an unofficial, undocumented endpoint that can change or be blocked without notice.`,
    };
  }
}
