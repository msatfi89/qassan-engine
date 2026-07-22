"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Sits outside the (protected) group, so it renders while logged out.
 *
 * The password is POSTed to /api/admin/login and never stored client-side.
 * The server replies with an HttpOnly cookie this page cannot read — which is
 * the point: script on the page cannot exfiltrate the session.
 */
export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword("");
        router.replace("/admin");
        router.refresh(); // re-run the server layout so the guard sees the cookie
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "Sign-in failed");
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-wrap">
      <form className="card login" onSubmit={submit}>
        <h1>
          Qassan <span className="badge">BETA</span>
        </h1>
        <p className="muted">Approval dashboard — private</p>

        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          autoComplete="current-password"
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={busy || password.length === 0}>
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
