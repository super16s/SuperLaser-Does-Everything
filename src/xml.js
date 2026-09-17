// Minimal, dependency-free helpers for pulling data out of RSS/Atom feeds
// with regex instead of a full XML parser — good enough for the simple,
// well-formed feeds these sources produce. Shared by any source that
// reads a feed (Substack's RSS, arXiv's Atom).

function stripCdata(raw) {
  const match = raw.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return match ? match[1] : raw;
}

export function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

export function stripHtml(text) {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  return decodeEntities(stripCdata(match[1].trim()));
}

export function extractBlocks(xml, tag) {
  return xml.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, "g")) ?? [];
}
