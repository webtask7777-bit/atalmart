/**
 * POST /api/admin/find-images
 *
 * Server-side DuckDuckGo Images search for the admin "Find Images" picker
 * in the product edit modal. Returns ranked candidates with thumbnails so
 * the operator can pick which ones to attach to a product.
 *
 * Auto-pipeline experiments (scripts/bulk-find-images.py) hit fundamental
 * limits at scale — promotional combo banners pass white-background quality
 * gates, and DDG sometimes returns the wrong variant or angle. The picker
 * lets a human do the final visual check, which is ~10 seconds per product
 * and 100% accurate.
 *
 * Request body:
 *   { name: string, unit?: string, min_size?: number, limit?: number }
 *
 * Response:
 *   { ok: true, candidates: [
 *     { image, thumbnail, url, title, host, width, height, score, front_score }
 *   ] }
 */

import { requireRole } from "@/lib/supabase/auth-guard";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ─── Source ranking (mirrors scripts/find-images.py) ─────────────────
// Brand-official top, then well-curated e-commerce, then B2B/social
// at lower priority. Quality gate (post-download) is the real filter
// for bad images; the rank just orders candidates for the picker.
const SOURCE_RANK: Record<string, number> = {
  // Brand-official
  "fortunefoods.com": 95,
  "aashirvaad.com": 95,
  "maggi.in": 95,
  "nestleindia.com": 94,
  "hul.co.in": 94,
  "itcportal.com": 93,
  "britannia.co.in": 93,
  "parleproducts.com": 92,
  "marico.com": 92,
  "amul.com": 92,
  "patanjaliayurved.net": 90,
  "tatatea.com": 90,
  "haldiramonline.com": 90,
  "mtrfoods.com": 90,
  // Open data
  "openfoodfacts.org": 88,
  "openbeautyfacts.org": 88,
  // Indian e-commerce
  "blinkit.com": 70,
  "zeptonow.com": 70,
  "jiomart.com": 68,
  "bigbasket.com": 67,
  "amazon.in": 66,
  "flipkart.com": 64,
  "tirabeauty.com": 60,
  "nykaa.com": 60,
  "1mg.com": 58,
  "tata1mg.com": 58,
  "apollo247.com": 58,
  "pharmeasy.in": 56,
  "netmeds.com": 56,
  "dmart.in": 56,
  // Desertcart kept as a moderate option
  "desertcart.in": 55,
  "desertcart.com": 50,
  // International
  "amazon.com": 50,
  "walmart.com": 40,
};

// CDN host → platform name. DDG sometimes returns image-CDN hosts that
// don't tell you the source platform without this mapping.
const CDN_TO_PLATFORM: Record<string, string> = {
  "m.media-amazon.com": "amazon.in",
  "blinkit-images.blinkit.com": "blinkit.com",
  "cdn.grofers.com": "blinkit.com",
  "cdn.zeptonow.com": "zeptonow.com",
  "www.jiomart.com": "jiomart.com",
  "www.bbassets.com": "bigbasket.com",
  "rukminim2.flixcart.com": "flipkart.com",
  "images.openfoodfacts.org": "openfoodfacts.org",
};

// ─── DuckDuckGo image search ─────────────────────────────────────────
async function ddgGet(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      ...extraHeaders,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`DDG ${res.status} ${url}`);
  return res.text();
}

async function ddgVqd(query: string): Promise<string> {
  // DDG image API requires a per-query "vqd" token from the initial HTML.
  const url =
    "https://duckduckgo.com/?" +
    new URLSearchParams({ q: query, iax: "images", ia: "images" }).toString();
  const html = await ddgGet(url);
  const m = html.match(/vqd=["']?([\d-]+)["']?/);
  if (!m) throw new Error("DDG vqd token not found");
  return m[1];
}

interface DDGHit {
  image: string;
  thumbnail: string;
  url: string;
  title: string;
  width: number;
  height: number;
  source: string;
}

async function ddgImageSearch(query: string, maxResults = 60): Promise<DDGHit[]> {
  const vqd = await ddgVqd(query);
  const params = new URLSearchParams({
    l: "in-en",
    o: "json",
    q: query,
    vqd,
    f: ",,,,,",
    p: "1",
  });
  const body = await ddgGet(`https://duckduckgo.com/i.js?${params}`, {
    Accept: "application/json, text/javascript, */*; q=0.01",
    Referer: "https://duckduckgo.com/",
    "X-Requested-With": "XMLHttpRequest",
  });
  const parsed = JSON.parse(body) as { results?: DDGHit[] };
  return (parsed.results || []).slice(0, maxResults);
}

// ─── Ranking ──────────────────────────────────────────────────────────
function sourceDomain(hit: DDGHit): string {
  let host = "";
  try {
    host = new URL(hit.url).hostname || "";
  } catch {
    /* ignore */
  }
  if (!host) {
    try {
      host = new URL(hit.image).hostname || "";
    } catch {
      /* ignore */
    }
  }
  host = host.replace(/^\.+/, "").toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  return CDN_TO_PLATFORM[host] || host;
}

function frontLikeliness(hit: DDGHit): number {
  // URL/title hints for FoP vs back/side/promo. Mirrors the Python version.
  const url = (hit.image || "").toLowerCase();
  const title = (hit.title || "").toLowerCase();
  let s = 0;
  if (/front|primary|main|packshot|_fop|\/fop-|_pack_|\/pack/.test(url)) s += 40;
  if (/[_/\-](1|01)(?=[._/\-?])/.test(url)) s += 25;
  if (/\b(front|packshot)\b/.test(title)) s += 20;
  if (/back|_bop|\/bop-|rear/.test(url)) s -= 50;
  if (/nutrition|ingredient|label|side|angle/.test(url)) s -= 35;
  if (/back|ingredient|nutrition/.test(title)) s -= 30;
  if (/[_/\-](2|3|4|02|03|04|05)(?=[._/\-?])/.test(url)) s -= 15;
  if (/combo|multipack|multi-pack|bundle|lifestyle/.test(url)) s -= 20;
  if (/combo|buy 2|pack of|50% extra|great deal/.test(title)) s -= 25;
  return s;
}

function rankCandidates(
  hits: DDGHit[],
  query: string,
  minSize: number,
): (DDGHit & { _host: string; _score: number; _front: number })[] {
  const brand = (query.split(/\s+/)[0] || "").toLowerCase();
  return hits
    .map((h) => {
      const w = Number(h.width) || 0;
      const ht = Number(h.height) || 0;
      const host = sourceDomain(h);
      let score = SOURCE_RANK[host] ?? 25;
      // Aspect-ratio penalty: skewed images are usually banners.
      if (w && ht) {
        const ar = Math.max(w, ht) / Math.min(w, ht);
        if (ar > 2.5) score -= 15;
      }
      // URL keyword bonuses
      const ul = (h.image || "").toLowerCase();
      if (/packshot|front|primary|_fop|\/fop-/.test(ul)) score += 6;
      if (/facebook|instagram|pinterest|blogspot|wordpress/.test(host)) score -= 30;
      if (brand && (h.image || "").toLowerCase().includes(brand)) score += 8;
      // Resolution bonus
      if (w && ht) score += Math.min(15, Math.max(0, (Math.min(w, ht) - minSize) / 100));
      return { ...h, _host: host, _score: Math.round(score), _front: frontLikeliness(h), width: w, height: ht };
    })
    .filter((h) => Math.min(h.width, h.height) >= minSize)
    .sort((a, b) => b._score - a._score);
}


// ─── Route ───────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const guard = await requireRole("admin");
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    unit?: string;
    min_size?: number;
    limit?: number;
  };

  const name = (body.name || "").trim();
  const unit = (body.unit || "").trim();
  if (!name) {
    return Response.json({ ok: false, error: "name is required" }, { status: 400 });
  }

  const minSize = Math.max(200, Math.min(800, body.min_size ?? 400));
  const limit = Math.max(4, Math.min(24, body.limit ?? 12));

  // Try the most specific query first (name + unit), fall back to bare name.
  // Most products match on the first try; the fallback covers cases where
  // the e-commerce listing omits pack size in metadata.
  const queries: string[] = [];
  if (unit && !name.toLowerCase().includes(unit.toLowerCase())) {
    queries.push(`${name} ${unit}`);
  }
  queries.push(name);
  const bare = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (bare !== name) queries.push(bare);

  const seen = new Set<string>();
  const allCandidates: (DDGHit & { _host: string; _score: number; _front: number })[] = [];

  for (const q of queries) {
    let hits: DDGHit[] = [];
    try {
      hits = await ddgImageSearch(q, 50);
    } catch (e) {
      // Per-query failures shouldn't kill the whole request — log and move on.
      console.error(`[find-images] DDG query ${JSON.stringify(q)}: ${(e as Error).message}`);
      continue;
    }
    for (const h of rankCandidates(hits, q, minSize)) {
      if (seen.has(h.image)) continue;
      seen.add(h.image);
      allCandidates.push(h);
    }
    if (allCandidates.length >= limit * 2) break;
  }

  allCandidates.sort((a, b) => b._score - a._score);

  return Response.json({
    ok: true,
    candidates: allCandidates.slice(0, limit).map((c) => ({
      image: c.image,
      thumbnail: c.thumbnail,
      url: c.url,
      title: c.title,
      host: c._host,
      width: c.width,
      height: c.height,
      score: c._score,
      front_score: c._front,
    })),
  });
}
