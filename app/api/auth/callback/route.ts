import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const errParam = searchParams.get("error");
  const errDesc = searchParams.get("error_description");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const baseUrl = forwardedHost
    ? `${forwardedProto ?? "https"}://${forwardedHost}`
    : origin;

  const fail = (reason: string) => {
    console.error("[auth/callback] fail:", reason);
    return NextResponse.redirect(
      `${baseUrl}/login?auth_error=${encodeURIComponent(reason)}`
    );
  };

  if (errParam) {
    return fail(`${errParam}: ${errDesc ?? ""}`);
  }
  if (!code) {
    return fail("no_code");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return fail(`exchange_failed: ${error.code ?? error.message}`);
  }

  const session = data.session;
  if (session?.provider_refresh_token) {
    await supabase.from("user_tokens").upsert({
      user_id: session.user.id,
      google_refresh_token: session.provider_refresh_token,
      updated_at: new Date().toISOString(),
    });
  }
  return NextResponse.redirect(`${baseUrl}${next}`);
}
