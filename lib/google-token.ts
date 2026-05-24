import type { SupabaseClient } from "@supabase/supabase-js";

export async function refreshGoogleToken(
  supabase: SupabaseClient
): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const { data } = await supabase
    .from("user_tokens")
    .select("google_refresh_token")
    .maybeSingle();

  if (!data?.google_refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.google_refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  return (json.access_token as string) ?? null;
}
