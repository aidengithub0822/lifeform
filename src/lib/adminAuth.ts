import { createHmac, timingSafeEqual } from "crypto";

// Stateless "developer mode" session token: no DB table needed. The
// DEV_ADMIN_CODE env var doubles as both the code the user types in and the
// HMAC secret used to sign the resulting session cookie, so a valid token
// can only have been minted by someone who correctly entered that code to
// /api/admin/verify. Never hardcode the actual code anywhere in this repo —
// it's public on GitHub — set it only as a Vercel environment variable.

const COOKIE_NAME = "lf_admin";
const SESSION_HOURS = 12;

function secret(): string | null {
  return process.env.DEV_ADMIN_CODE || null;
}

export function adminCookieName() {
  return COOKIE_NAME;
}

export function signAdminToken(): string | null {
  const s = secret();
  if (!s) return null;
  const expiresAt = Date.now() + SESSION_HOURS * 60 * 60 * 1000;
  const payload = String(expiresAt);
  const sig = createHmac("sha256", s).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyAdminToken(token: string | null | undefined): boolean {
  const s = secret();
  if (!s || !token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = createHmac("sha256", s).update(payload).digest("hex");
  try {
    if (expected.length !== sig.length) return false;
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
  } catch {
    return false;
  }
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return true;
}

export function checkAdminCode(code: string): boolean {
  const s = secret();
  if (!s || !code) return false;
  if (s.length !== code.length) return false;
  try {
    return timingSafeEqual(Buffer.from(s), Buffer.from(code));
  } catch {
    return false;
  }
}
