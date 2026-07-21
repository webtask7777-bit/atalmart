"use client";

/**
 * MSG91 OTP Widget loader + promise wrappers.
 *
 * The widget (configured in the MSG91 dashboard — DLT template, sender ID and
 * OTP length all live there) handles sending + verifying the SMS OTP entirely
 * on MSG91's side. On a successful verify it hands back a short-lived JWT
 * ("access token") which our server (/api/auth/msg91) re-verifies against the
 * MSG91 API before minting a Supabase session.
 *
 * widgetId + tokenAuth are intentionally public (NEXT_PUBLIC_*) — MSG91's
 * widget requires them in the browser. The real trust boundary is the
 * server-side verifyAccessToken call, not these values.
 */

const WIDGET_ID = process.env.NEXT_PUBLIC_MSG91_WIDGET_ID || "";
const TOKEN_AUTH = process.env.NEXT_PUBLIC_MSG91_TOKEN_AUTH || "";

interface Msg91Window extends Window {
  initSendOTP?: (cfg: Record<string, unknown>) => void;
  sendOtp?: (
    identifier: string,
    success: (d: unknown) => void,
    failure: (e: unknown) => void,
  ) => void;
  verifyOtp?: (
    otp: string,
    success: (d: unknown) => void,
    failure: (e: unknown) => void,
  ) => void;
  retryOtp?: (
    channel: unknown,
    success: (d: unknown) => void,
    failure: (e: unknown) => void,
  ) => void;
}

/** True when the widget env is configured — lets the UI degrade gracefully. */
export function msg91Configured(): boolean {
  return Boolean(WIDGET_ID && TOKEN_AUTH);
}

let loadPromise: Promise<void> | null = null;

// MSG91 delivers the verified access token to the config-level `success`
// callback on some widget versions and to verifyOtp()'s own callback on
// others. We capture it from the config callback here so verifyOtp() can fall
// back to it and never hang waiting for a token that arrived elsewhere.
let lastConfigToken: string | null = null;

function initWidget(w: Msg91Window) {
  if (!w.initSendOTP) return;
  w.initSendOTP({
    widgetId: WIDGET_ID,
    tokenAuth: TOKEN_AUTH,
    exposeMethods: true,
    success: (d: unknown) => {
      const t = extractToken(d);
      if (t) lastConfigToken = t;
    },
    failure: () => {},
  });
}

/**
 * initSendOTP exposes sendOtp/verifyOtp/retryOtp asynchronously (after the
 * widget finishes its own setup), so we must wait for them rather than call
 * immediately after init. Polls up to ~8s.
 */
function waitForMethods(): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const w = window as Msg91Window;
      if (typeof w.sendOtp === "function" && typeof w.verifyOtp === "function") {
        resolve();
        return;
      }
      if (Date.now() - start > 8000) {
        reject(new Error("SMS service ready hone me time lag gaya — dobara try karein"));
        return;
      }
      setTimeout(tick, 120);
    };
    tick();
  });
}

/** Load the MSG91 provider script (with a fallback host) and init the widget. */
export function loadMsg91(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = new Promise<void>((resolve, reject) => {
    const w = window as Msg91Window;
    if (typeof w.initSendOTP === "function") {
      initWidget(w);
      waitForMethods().then(resolve).catch(reject);
      return;
    }
    const urls = [
      "https://verify.msg91.com/otp-provider.js",
      "https://verify.phone91.com/otp-provider.js",
    ];
    let i = 0;
    const attempt = () => {
      const s = document.createElement("script");
      s.src = urls[i];
      s.async = true;
      s.onload = () => {
        initWidget(window as Msg91Window);
        waitForMethods().then(resolve).catch(reject);
      };
      s.onerror = () => {
        i += 1;
        if (i < urls.length) attempt();
        else reject(new Error("SMS service load nahi ho payi — thodi der baad try karein"));
      };
      document.head.appendChild(s);
    };
    attempt();
  });
  return loadPromise;
}

function readMessage(e: unknown): string | null {
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
  }
  return null;
}

function extractToken(d: unknown): string | null {
  if (typeof d === "string") return d;
  if (d && typeof d === "object") {
    const o = d as Record<string, unknown>;
    for (const k of ["access-token", "accessToken", "message", "authToken", "token"]) {
      const v = o[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
  }
  return null;
}

/** Send an OTP to a 10-digit Indian number (country code added automatically). */
export async function sendOtp(phone10: string): Promise<void> {
  await loadMsg91();
  const w = window as Msg91Window;
  return new Promise<void>((resolve, reject) => {
    if (typeof w.sendOtp !== "function") {
      reject(new Error("SMS service ready nahi hai"));
      return;
    }
    w.sendOtp(
      `91${phone10}`,
      () => resolve(),
      (e) => reject(new Error(readMessage(e) || "OTP bhejne me dikkat — number check karein")),
    );
  });
}

/** Verify the entered OTP; resolves with the MSG91 access token (JWT). */
export async function verifyOtp(otp: string): Promise<string> {
  const w = window as Msg91Window;
  lastConfigToken = null;
  return new Promise<string>((resolve, reject) => {
    if (typeof w.verifyOtp !== "function") {
      reject(new Error("SMS service ready nahi hai — dobara OTP bhejein"));
      return;
    }
    w.verifyOtp(
      otp,
      (d) => {
        // Prefer this callback's payload; fall back to the config-level token.
        const token = extractToken(d) || lastConfigToken;
        if (token) resolve(token);
        else reject(new Error("Verification token nahi mila — dobara try karein"));
      },
      (e) => reject(new Error(readMessage(e) || "Galat OTP")),
    );
  });
}

/** Ask MSG91 to resend the OTP on the same channel. */
export async function retryOtp(): Promise<void> {
  const w = window as Msg91Window;
  return new Promise<void>((resolve, reject) => {
    if (typeof w.retryOtp !== "function") {
      reject(new Error("SMS service ready nahi hai"));
      return;
    }
    w.retryOtp(
      null,
      () => resolve(),
      (e) => reject(new Error(readMessage(e) || "OTP dobara bhejne me dikkat")),
    );
  });
}
