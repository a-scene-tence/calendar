import type { SupabaseClient } from "@supabase/supabase-js";

export async function refreshGoogleToken(
  supabase: SupabaseClient,
  opts: { force?: boolean } = {}
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const { data: row } = await supabase
    .from("user_tokens")
    .select("user_id, google_refresh_token, google_access_token, access_expires_at")
    .maybeSingle();

  if (!row?.google_refresh_token) return null;

  const now = Date.now();
  if (
    !opts.force &&
    row.google_access_token &&
    row.access_expires_at &&
    new Date(row.access_expires_at).getTime() - now > 60_000
  ) {
    return row.google_access_token as string;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.google_refresh_token as string,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    console.warn("[google-token] refresh failed", res.status, await res.text());
    return null;
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  const newAccess = json.access_token ?? null;
  if (!newAccess) return null;
  const expiresIn = json.expires_in ?? 3600;
  const expiresAt = new Date(now + (expiresIn - 60) * 1000).toISOString();

  try {
    await supabase
      .from("user_tokens")
      .update({
        google_access_token: newAccess,
        access_expires_at: expiresAt,
      })
      .eq("user_id", row.user_id);
  } catch (e) {
    console.warn("[google-token] cache update skipped", e);
  }

  return newAccess;
}
