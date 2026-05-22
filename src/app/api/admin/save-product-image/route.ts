import { execFile as execFileCb } from "node:child_process";
import { mkdtemp, rm, writeFile, unlink, stat, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { requireRole } from "@/lib/supabase/auth-guard";
import { resolveCwebp } from "@/lib/cwebp";

const execFile = promisify(execFileCb);

const PRODUCTS_DIR = join(process.cwd(), "public", "products");
const DEMO_PRODUCTS_DIR = join(process.cwd(), "src", "lib", "demo-products");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const ALLOWED_EXTS = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const MAX_URL_LEN = 2048;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB hard cap

function isValidProductId(id: string) {
  return /^p\d{1,4}$/.test(id);
}

function normalizeExt(raw: string): string | null {
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ext || ext.length > 5) return null;
  return ALLOWED_EXTS.has(ext) ? ext : null;
}

async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const guard = await requireRole("admin");
  if (!guard.ok) {
    return Response.json({ ok: false, error: guard.error }, { status: guard.status });
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "atalmart-img-"));
  try {
    const contentType = req.headers.get("content-type") || "";
    let productId: string | null = null;
    let inputPath: string | null = null;
    let sourceLabel = "";

    let file: File | null = null;
    let url = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      productId = String(form.get("productId") || "");
      file = form.get("file") as File | null;
      url = form.get("url") ? String(form.get("url")) : "";
    } else {
      const body = (await req.json().catch(() => ({}))) as { productId?: string; url?: string };
      productId = body.productId || null;
      url = body.url || "";
    }

    // Validate productId BEFORE any network/disk work
    if (!productId || !isValidProductId(productId)) {
      return Response.json({ ok: false, error: "Invalid productId (expected p<number>)" }, { status: 400 });
    }
    if (!file && !url) {
      return Response.json({ ok: false, error: "Provide file or url" }, { status: 400 });
    }
    if (url && url.length > MAX_URL_LEN) {
      return Response.json({ ok: false, error: "URL too long" }, { status: 400 });
    }

    if (file && file.size > 0) {
      if (file.size > MAX_FILE_BYTES) {
        return Response.json(
          { ok: false, error: `File too large (>${MAX_FILE_BYTES / 1024 / 1024} MB)` },
          { status: 413 },
        );
      }
      const ext = normalizeExt(file.name.split(".").pop() || "");
      if (!ext) {
        return Response.json(
          { ok: false, error: `Unsupported file type. Allowed: ${[...ALLOWED_EXTS].join(", ")}` },
          { status: 415 },
        );
      }
      inputPath = join(tmpDir, `src.${ext}`);
      const buf = Buffer.from(await file.arrayBuffer());
      await writeFile(inputPath, buf);
      sourceLabel = `upload(${file.name.slice(0, 60)})`;
    } else if (url) {
      try {
        inputPath = await fetchToFile(url, tmpDir);
        sourceLabel = `url(${url.slice(0, 80)})`;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return Response.json({ ok: false, error: msg }, { status: 400 });
      }
    }

    if (!inputPath) {
      return Response.json({ ok: false, error: "Provide file or url" }, { status: 400 });
    }

    const srcStat = await stat(inputPath);
    if (srcStat.size === 0) {
      return Response.json({ ok: false, error: "Source image is empty" }, { status: 400 });
    }

    // Flatten alpha onto white background — Next.js can't serve a JPEG with black corners
    const flatPath = join(tmpDir, "flat.png");
    await execFile("python3", [
      "-c",
      `from PIL import Image
img = Image.open(${JSON.stringify(inputPath)})
if img.mode in ('RGBA', 'LA', 'P'):
    img = img.convert('RGBA')
    bg = Image.new('RGB', img.size, (255, 255, 255))
    bg.paste(img, mask=img.split()[-1])
    bg.save(${JSON.stringify(flatPath)})
else:
    img.convert('RGB').save(${JSON.stringify(flatPath)})`,
    ]);

    const cwebp = await resolveCwebp();
    const outPath = join(PRODUCTS_DIR, `${productId}.webp`);
    await execFile(cwebp, ["-quiet", "-q", "85", "-resize", "1000", "0", flatPath, "-o", outPath]);

    const outStat = await stat(outPath);
    for (const ext of ["png", "jpg", "jpeg"]) {
      const old = join(PRODUCTS_DIR, `${productId}.${ext}`);
      if (await fileExists(old)) await unlink(old);
    }

    await syncDemoData(productId);

    return Response.json({
      ok: true,
      productId,
      path: `/products/${productId}.webp`,
      origBytes: srcStat.size,
      webpBytes: outStat.size,
      reductionPct: Math.max(0, Math.round((1 - outStat.size / srcStat.size) * 100)),
      source: sourceLabel,
      demo: guard.isDemo,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function syncDemoData(productId: string) {
  // Walk the per-category seed files looking for this product id. We can't
  // know the category up-front, so scan them all and edit the one that hits.
  // Non-fatal: if the product isn't a seeded one (e.g. admin Excel import),
  // the runtime store handles the image URL.
  try {
    const { readdir } = await import("fs/promises");
    const files = await readdir(DEMO_PRODUCTS_DIR);
    const newPath = `/products/${productId}.webp`;

    for (const file of files) {
      if (!file.startsWith("cat-") || !file.endsWith(".ts")) continue;
      const filePath = join(DEMO_PRODUCTS_DIR, file);
      const content = await readFile(filePath, "utf8");
      if (!content.includes(`"${productId}"`)) continue;

      let updated = content;
      const replaced = content.replace(
        new RegExp(`/products/${productId}\\.(?:png|jpg|jpeg|webp)`),
        newPath,
      );
      if (replaced !== content) {
        updated = replaced;
      } else {
        const lineRe = new RegExp(`(\\s*p\\("${productId}",[^)]*?)\\)`);
        updated = content.replace(lineRe, (m, head) =>
          head.includes("/products/") ? m : `${head}, "${newPath}")`,
        );
      }
      if (updated !== content) await writeFile(filePath, updated);
      return;
    }
  } catch {
    /* non-fatal — demo-data is optional */
  }
}

/**
 * Returns true if a hostname/IP should be blocked to prevent SSRF —
 * private ranges (RFC1918), link-local, loopback, IPv6 ULA, cloud metadata.
 *
 * Defends against attackers POSTing URLs like http://169.254.169.254/...
 * (AWS/GCP metadata) or http://10.0.0.1 (internal services).
 */
function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // Obvious literals
  if (h === "localhost" || h === "ip6-localhost" || h === "ip6-loopback") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;

  // IPv4 in dotted-quad form
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + AWS metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a >= 224) return true; // 224.0.0.0/4 multicast + reserved
  }

  // IPv6 (basic checks — ::1, fe80::/10, fc00::/7)
  if (h === "::1" || h.startsWith("::ffff:127.")) return true;
  if (h.startsWith("fe80:") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) {
    return true; // link-local
  }
  if (/^fc|^fd/.test(h)) return true; // unique local

  return false;
}

async function fetchToFile(url: string, dir: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs allowed");
  }
  if (isPrivateOrReservedHost(parsed.hostname)) {
    throw new Error("Refusing to fetch from private/reserved address");
  }
  const referer = parsed.origin + "/";

  // AbortController gives us a hard timeout — fetch() default is unbounded.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 15_000);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer, Accept: "image/*,*/*;q=0.8" },
      // Follow redirects but the next hop will hit the same SSRF check via this
      // function's caller — we don't validate intermediate hops here (Next/Node
      // fetch does up to 20 redirects by default). For full safety: redirect:"manual".
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Fetch ${res.status} for ${url}`);

    // Re-validate the FINAL URL after redirects (the response.url field reflects
    // the post-redirect location). Blocks "https://shortener.com → http://169.254.x".
    if (res.url && res.url !== url) {
      try {
        const finalParsed = new URL(res.url);
        if (isPrivateOrReservedHost(finalParsed.hostname)) {
          throw new Error("Redirect landed on private/reserved address");
        }
      } catch {
        // URL parse fail — treat as suspicious
        throw new Error("Invalid final URL after redirect");
      }
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) {
      throw new Error(`Remote image too large (>${MAX_FILE_BYTES / 1024 / 1024} MB)`);
    }

    const rawExt = url.split("?")[0].split(".").pop() || "";
    const ext = normalizeExt(rawExt) || "png";
    const path = join(dir, `src.${ext}`);
    await writeFile(path, buf);
    return path;
  } finally {
    clearTimeout(timeout);
  }
}
