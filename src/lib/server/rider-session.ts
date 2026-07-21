import crypto from "crypto";

/**
 * Stateless rider session tokens.
 *
 * Riders are NOT Supabase auth users — they live only in the `riders` table
 * and log in with phone + access code. After a successful login the server
 * issues an HMAC-signed token carrying the rider id and an expiry. Every
 * subsequent /api/rider/* call presents this token; the server verifies the
 * signature (no DB round-trip) before using the service role to act on that
 * rider's behalf.
 *
 * Signing secret is derived from SUPABASE_SERVICE_ROLE_KEY (server-only, never
 * shipped to the client). A dedicated RIDER_SESSION_SECRET env var overrides it
 * if set.
 */

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  const s =
    process.env.RIDER_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!s) throw new Error("Rider session secret unavailable");
  return s;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(
    crypto.createHmac("sha256", secret()).update(payload).digest(),
  );
}

/** Issue a signed token for a rider id. */
export function signRiderToken(riderId: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = b64url(Buffer.from(JSON.stringify({ rid: riderId, exp })));
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a token. Returns the rider id when the signature is valid and the
 * token hasn't expired; otherwise null. Uses a constant-time comparison.
 */
export function verifyRiderToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  const expected = sign(payload);
  // Constant-time compare; lengths must match for timingSafeEqual.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(),
    ) as { rid?: string; exp?: number };
    if (!data.rid || !data.exp || Date.now() > data.exp) return null;
    return data.rid;
  } catch {
    return null;
  }
}

/** Pull the bearer token out of an Authorization header. */
export function bearerFrom(req: Request): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}
