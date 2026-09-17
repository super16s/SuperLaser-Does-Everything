// Fetches papers from arXiv matching a topic, via arXiv's official free
// API (no key, no rate-limit tier, no signup — the one source here with
// zero setup friction). Best fit for the math/science category, though
// it isn't scoped by category the way Substack/Reddit are: arXiv already
// does real full-text search, so there's no "which sources" list needed.

import { decodeEntities, stripHtml, extractTag, extractBlocks } from "../xml.js";

const API_URL = "https://export.arxiv.org/api/query";

export async function fetchArxiv(topic, { limit = 10 } = {}) {
  const params = new URLSearchParams({
    search_query: `all:${topic}`,
    sortBy: "submittedDate",
    sortOrder: "descending",
    max_results: String(limit),
  });

  try {
    const res = await fetch(`${API_URL}?${params}`);
    if (!res.ok) {
      return { items: [], error: `arXiv error: HTTP ${res.status}` };
    }

    const xml = await res.text();
    const entries = extractBlocks(xml, "entry");

    const items = entries.map((block) => {
      const title = decodeEntities(stripHtml(extractTag(block, "title") ?? "")).replace(/\s+/g, " ").trim();
      const id = extractTag(block, "id");
      const published = extractTag(block, "published");
      const firstAuthor = extractTag(block, "name");
      const authorCount = (block.match(/<author>/g) ?? []).length;

      return {
        id: `arxiv-${id}`,
        source: "arxiv",
        author: authorCount > 1 ? `${firstAuthor} et al.` : firstAuthor,
        authorHandle: null,
        text: title,
        url: id,
        publishedAt: published ? new Date(published).toISOString() : null,
      };
    });

    return { items, error: null };
  } catch (err) {
    return { items: [], error: `arXiv error: ${err.message}` };
  }
}
