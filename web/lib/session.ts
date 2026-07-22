import { createHmac, timingSafeEqual } from "crypto";

/**
 * Admin session handling for the Qassan dashboard.
 *
 * A single shared password, exchanged for an HMAC-signed cookie. PHASE2.md
 * permits this for beta; it is replaceable with Supabase Auth later without
 * touching the queue UI.
 *
 * Nothing here ever runs in the browser: every caller is a server component
 * or a route handler, so SUPABASE_SERVICE_KEY and these secrets stay on the
 * server. That is the design contract line this file exists to honour.
 */

export const SESSION_COOKIE = "qassan_admin";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

function secret(): string {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 32) {
    // Fail loudly at use time rather than silently signing with a weak or
    // empty key, which would make every forged cookie valid.
    throw new Error(
      "ADMIN_SESSION_SECRET is missing or shorter than 32 characters"
    );
  }
  return s;
}

function hmac(input: string): Buffer {
  return createHmac("sha256", secret()).update(input).digest();
}

export function createSessionToken(): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + MAX_AGE_SECONDS * 1000 })
  ).toString("base64url");
  return `${payload}.${hmac(payload).toString("base64url")}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const given = Buffer.from(signature, "base64url");
  const expected = hmac(payload);
  // Length check first: timingSafeEqual throws on a mismatch. Both operands
  // are SHA-256 digests, so a wrong length only means a malformed cookie.
  if (given.length !== expected.length) return false;
  if (!timingSafeEqual(given, expected)) return false;

  try {
    const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof exp === "number" && Date.now() < exp;
  } catch {
    return false;
  }
}

export function passwordMatches(given: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  // Compare HMACs, not the strings: both digests are 32 bytes whatever the
  // inputs, so neither the comparison time nor a length mismatch leaks how
  // much of the password was correct.
  return timingSafeEqual(hmac(given), hmac(expected));
}

export const sessionCookieOptions = {
  httpOnly: true, // unreadable from JavaScript, so XSS cannot exfiltrate it
  secure: process.env.NODE_ENV === "production", // http://localhost in dev
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
