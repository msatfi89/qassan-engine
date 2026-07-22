import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export const runtime = "nodejs";

/**
 * POST, not GET: a GET logout can be triggered by any page that embeds an
 * image pointing at this URL, letting a third-party site sign Med out.
 * The header's logout control is a real form so it posts.
 */
export async function POST(request: Request) {
  const url = new URL("/admin/login", request.url);
  const response = NextResponse.redirect(url, { status: 303 });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
