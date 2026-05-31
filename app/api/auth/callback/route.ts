import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const baseUrl = forwardedHost
    ? `${forwardedProto ?? "https"}://${forwardedHost}`
    : origin;

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const session = data.session;
      if (session?.provider_refresh_token) {
        await supabase.from("user_tokens").upsert({
          user_id: session.user.id,
          google_refresh_token: session.provider_refresh_token,
          // 재로그인 시 새 refresh_token으로 교체되므로 이전 access 캐시를 비워
          // 다음 API 호출이 새 토큰을 받도록 한다(stale 캐시 재사용 방지).
          google_access_token: null,
          access_expires_at: null,
          updated_at: new Date().toISOString(),
        });
      }
      return NextResponse.redirect(`${baseUrl}${next}`);
    }
  }

  return NextResponse.redirect(`${baseUrl}/login`);
}
