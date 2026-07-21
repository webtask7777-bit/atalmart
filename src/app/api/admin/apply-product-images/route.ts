/**
 * POST /api/admin/apply-product-images
 *
 * Pairs with /api/admin/find-images. The picker returns candidate URLs;
 * this route does the actual work:
 *   1. Downloads each selected image (with SSRF protection).
 *   2. Uploads to Supabase Storage at <product_id>/<role>-<sha8>.<ext>.
 *   3. Patches products.image_url + image_urls[] with the public URLs.
 *
 * Request body:
 *   { productId: string (UUID), urls: string[] }
 *   First URL becomes the FoP (image_url); the rest become image_urls[].
 *
 * Response:
 *   { ok: true, image_url, image_urls, uploaded: N, failed: [{ url, reason }] }
 */

import { createHash } from "node:crypto";
import { requireRole } from "@/lib/supabase/auth-guard";
import { createClient } from "@/lib/supabase/server";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const BUCKET = "product-images";
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_URLS = 8;

// Mirror of the SSRF guard in save-product-image route — keep them in sync.
function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "ip6-localhost" || h === "ip6-loopback") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
  }
  if (h === "::1" || h.startsWith("::ffff:127.")) return true;
  if (/^fe[89ab]/.test(h)) return true;
  if (/^fc|^fd/.test(h)) return true;
  return false;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXT_FROM_CT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

async function fetchImage(url: string): Promise<{ body: Buffer; ext: string; ct: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("invalid_url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("non_http_url");
  }
  if (isPrivateOrReservedHost(parsed.hostname)) {
    throw new Error("private_address");
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: parsed.origin + "/",
        Accept: "image/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`fetch_${res.status}`);
    if (res.url) {
      try {
        const final = new URL(res.url);
        if (isPrivateOrReservedHost(final.hostname)) throw new Error("redirect_private");
      } catch (e) {
        if ((e as Error).message === "redirect_private") throw e;
      }
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_FILE_BYTES) throw new Error("file_too_large");
    const ct = (res.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
    // Derive extension from URL first (more reliable for CDNs that lie about
    // content-type), then from content-type as a fallback.
    let ext = "jpg";
    const urlMatch = url.match(/\.(jpg|jpeg|png|webp|avif)(?:[?#]|$)/i);
    if (urlMatch) {
      ext = urlMatch[1].toLowerCase();
      if (ext === "jpeg") ext = "jpg";
    } else if (EXT_FROM_CT[ct]) {
      ext = EXT_FROM_CT[ct];
    }
    return { body: Buffer.from(ab), ext, ct };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const guard = await requireRole("admin");
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    productId?: string;
    urls?: string[];
  };
  const productId = (body.productId || "").trim();
  const urls = Array.isArray(body.urls) ? body.urls.filter((u) => typeof u === "string") : [];

  if (!UUID_RE.test(productId)) {
    return Response.json({ ok: false, error: "productId must be a UUID" }, { status: 400 });
  }
  if (urls.length === 0) {
    return Response.json({ ok: false, error: "urls is empty" }, { status: 400 });
  }
  if (urls.length > MAX_URLS) {
    return Response.json({ ok: false, error: `Too many URLs (max ${MAX_URLS})` }, { status: 400 });
  }

  if (guard.isDemo) {
    // In demo mode there's no real Supabase storage to write to — just echo
    // back the inputs so the UI feedback loop still works.
    return Response.json({
      ok: true,
      image_url: urls[0],
      image_urls: urls.slice(1),
      uploaded: urls.length,
      failed: [],
      demo: true,
    });
  }

  const supabase = await createClient();
  const uploadedPublic: string[] = [];
  const failed: { url: string; reason: string }[] = [];

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    let fetched: { body: Buffer; ext: string; ct: string };
    try {
      fetched = await fetchImage(url);
    } catch (e) {
      failed.push({ url, reason: (e as Error).message });
      continue;
    }

    // Supabase Storage rejects AVIF — let the client handle conversion if it
    // chose an AVIF. For now, mark as failed with a clear reason so the UI
    // can surface it.
    if (fetched.ext === "avif" || fetched.ct === "image/avif") {
      failed.push({ url, reason: "avif_unsupported" });
      continue;
    }

    const role = i === 0 ? "fop" : String(i + 1).padStart(2, "0");
    const sha = createHash("sha1").update(url).digest("hex").slice(0, 8);
    const path = `${productId}/${role}-${sha}.${fetched.ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, fetched.body, {
        contentType: fetched.ct,
        upsert: true,
        cacheControl: "31536000",
      });
    if (upErr) {
      failed.push({ url, reason: `storage:${upErr.message}` });
      continue;
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    uploadedPublic.push(pub.publicUrl);
  }

  if (uploadedPublic.length === 0) {
    return Response.json(
      { ok: false, error: "All downloads failed", failed },
      { status: 502 },
    );
  }

  const image_url = uploadedPublic[0];
  const image_urls = uploadedPublic.slice(1);

  const { error: dbErr } = await supabase
    .from("products")
    .update({ image_url, image_urls })
    .eq("id", productId);
  if (dbErr) {
    return Response.json(
      { ok: false, error: `db_patch_failed:${dbErr.message}`, failed },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    image_url,
    image_urls,
    uploaded: uploadedPublic.length,
    failed,
  });
}
