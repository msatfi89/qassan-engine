// Importing this from a client component is a BUILD ERROR. That is the point:
// SUPABASE_SERVICE_KEY bypasses row-level security by design, so it must never
// reach a browser bundle. The design contract line "SUPABASE_SERVICE_KEY stays
// backend-only" is enforced here by the compiler rather than by discipline.
import "server-only";

function config() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_KEY must be set (see web/.env.example)"
    );
  }
  return { url, key };
}

export function isConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

/** GET against PostgREST. Never cached: the approval queue must never be stale. */
export async function sbGet<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const { url, key } = config();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}/rest/v1/${path}?${qs}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    // Include the body: PostgREST puts the real reason there, and a bare
    // status code cost us three debugging rounds on the collector.
    throw new Error(
      `GET ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`
    );
  }
  return res.json() as Promise<T>;
}

/** PATCH against PostgREST. Returns the updated rows. */
export async function sbPatch<T>(
  path: string,
  params: Record<string, string>,
  body: Record<string, unknown>
): Promise<T> {
  const { url, key } = config();
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}/rest/v1/${path}?${qs}`, {
    method: "PATCH",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `PATCH ${path} -> ${res.status}: ${(await res.text()).slice(0, 300)}`
    );
  }
  return res.json() as Promise<T>;
}
