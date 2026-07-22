import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  passwordMatches,
  sessionCookieOptions,
} from "@/lib/session";

// Node runtime, not Edge: session.ts uses node:crypto.
export const runtime = "nodejs";

/**
 * Best-effort rate limiting.
 *
 * HONEST LIMITATION: this Map lives in one serverless instance's memory.
 * Vercel may run several, and they do not share it, so a determined attacker
 * spreading requests across instances gets more than MAX_ATTEMPTS. It raises
 * the cost of casual guessing; it is not a real lockout.
 *
 * The actual defence is a long random ADMIN_PASSWORD compared in constant
 * time. If this ever guards more than one person's beta, move the counter
 * into Postgres where all instances can see it.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0].trim() || "unknown";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait 15 minutes." },
      { status: 429 }
    );
  }

  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!passwordMatches(password)) {
    // Deliberately vague: revealing whether the password was empty, too
    // short, or simply wrong would help an attacker narrow the space.
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions);
  return response;
}
