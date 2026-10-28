// Open Food Facts lookups (https://world.openfoodfacts.org). Crowdsourced data, per 100 g.
// No custom headers on purpose: a plain GET stays a "simple" CORS request, and nothing
// personal (no email, no account) is ever sent. Search is limited to 10 requests/min,
// so it only runs when asked (Enter / Search button), never per keystroke.
const FIELDS = "code,product_name,brands,nutriments,serving_quantity,serving_size";
const SEARCH = "https://search.openfoodfacts.org/search";
const LEGACY = "https://world.openfoodfacts.org/cgi/search.pl";
const PRODUCT = "https://world.openfoodfacts.org/api/v2/product/";

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null; };
const r1 = (n) => Math.round(n * 10) / 10;

// One API product -> { id, name, brand, per100:{calories,protein}, servingG, servingText } or null when unusable.
export function parseProduct(p) {
  if (!p || typeof p !== "object") return null;
  const n = p.nutriments || {};
  let kcal = num(n["energy-kcal_100g"]);
  if (kcal === null) { const kj = num(n["energy_100g"]); kcal = kj === null ? null : kj / 4.184; }
  const name = String(p.product_name || "").trim();
  if (kcal === null || !name) return null; // never invent calories for a product that has none
  const brand = String(Array.isArray(p.brands) ? p.brands[0] : (p.brands || "").split(",")[0] || "").trim();
  const sq = num(p.serving_quantity);
  return {
    id: String(p.code || name), name, brand,
    per100: { calories: r1(kcal), protein: r1(num(n["proteins_100g"]) ?? 0) },
    servingG: sq && sq > 0 ? sq : null, servingText: String(p.serving_size || "").trim(),
  };
}

export const barcodeQuery = (q) => /^\d{8,14}$/.test(q.trim());
export const searchUrl = (q) => `${SEARCH}?q=${encodeURIComponent(q.trim())}&page_size=8&fields=${FIELDS}`;
export const legacyUrl = (q) => `${LEGACY}?search_terms=${encodeURIComponent(q.trim())}&search_simple=1&action=process&json=1&page_size=8&fields=${FIELDS}`;
export const productUrl = (code) => `${PRODUCT}${encodeURIComponent(code.trim())}.json?fields=${FIELDS}`;

const getJson = async (f, url) => { const r = await f(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const rows = (j) => (j?.hits || j?.products || []).map(parseProduct).filter(Boolean);

// Small per-session cache so repeat searches don't spend the 10/min allowance.
const cache = new Map();
export function clearCache() { cache.clear(); }

// Returns parsed products. Barcode -> product endpoint. Text -> Search-a-licious, falling back to the legacy search.
export async function lookup(q, f = (...a) => globalThis.fetch(...a)) { // not a bare reference: browsers throw "Illegal invocation" on a detached fetch
  const key = q.trim().toLowerCase();
  if (!key) return [];
  if (cache.has(key)) return cache.get(key);
  let out;
  if (barcodeQuery(key)) {
    const j = await getJson(f, productUrl(key));
    out = j?.status === 0 || !j?.product ? [] : [parseProduct({ code: key, ...j.product })].filter(Boolean);
  } else {
    try { out = rows(await getJson(f, searchUrl(key))); }
    catch { out = rows(await getJson(f, legacyUrl(key))); }
  }
  cache.set(key, out);
  return out;
}

// A product at a given gram weight -> a meal-preset-shaped entry (macros per 1× portion).
export function productToPreset(prod, slot, grams) {
  const g = grams || prod.servingG || 100, k = g / 100;
  const label = `${prod.brand ? prod.brand + " " : ""}${prod.name}`.slice(0, 60);
  return {
    id: `off-${prod.id}-${Math.round(g)}`, slot, label: `${label} (${Math.round(g)} g)`,
    calories: Math.round(prod.per100.calories * k), protein: r1(prod.per100.protein * k),
    ingredients: `${prod.name}${prod.brand ? ", " + prod.brand : ""} · ${Math.round(g)} g`,
    amounts: `Open Food Facts (crowdsourced, per 100 g: ${prod.per100.calories} kcal, ${prod.per100.protein} g protein). Check the label if it matters.`,
    isDefault: false, source: "off",
  };
}
