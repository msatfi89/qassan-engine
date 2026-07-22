import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Node runtime: session.ts uses node:crypto, which Edge does not provide.
export const runtime = "nodejs";
// Never cache a page whose visibility depends on a cookie.
export const dynamic = "force-dynamic";

/**
 * The guard for every page under /admin.
 *
 * Placed in a layout rather than middleware because middleware runs on the
 * Edge runtime, where node:crypto is unavailable and the HMAC check could not
 * run. Every /admin page renders inside this layout, so none can skip it.
 *
 * It lives in a (protected) route group so that /admin/login, which must be
 * reachable while logged out, sits outside it. A guard covering the login
 * page would redirect it to itself forever. Route groups add no URL segment,
 * so this still renders at /admin.
 *
 * Route handlers under /api/admin are NOT covered by this and must check for
 * themselves — a layout only guards rendering.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySessionToken(token)) {
    redirect("/admin/login");
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <strong>Qassan</strong>
        <span className="badge">BETA</span>
        <form action="/api/admin/logout" method="post" className="logout">
          <button type="submit">Log out</button>
        </form>
      </header>
      <main>{children}</main>
    </div>
  );
}
