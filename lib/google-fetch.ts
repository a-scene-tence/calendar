import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshGoogleToken } from "@/lib/google-token";

// Google API fetch with auto 401 retry (1회). 호출자는 Authorization 헤더를 만들지 말고
// 토큰을 함수에 위임. init.headers의 다른 헤더는 그대로 보존.
export async function gfetch(
  supabase: SupabaseClient,
  token: string,
  url: string,
  init: RequestInit = {}
): Promise<{ res: Response; token: string }> {
  const make = (t: string): Promise<Response> =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${t}` },
    });

  let res = await make(token);
  if (res.status === 401) {
    const fresh = await refreshGoogleToken(supabase, { force: true });
    if (fresh) {
      token = fresh;
      res = await make(token);
    }
  }
  return { res, token };
}

// 실패 응답에서 Google의 error.message를 추출. JSON이 아니면 텍스트 일부 반환.
export async function readGoogleError(
  res: Response
): Promise<{ status: number; message: string }> {
  const status = res.status;
  try {
    const j = (await res.clone().json()) as {
      error?: { message?: string } | string;
    };
    const msg =
      typeof j.error === "string"
        ? j.error
        : j.error?.message ?? "";
    return { status, message: msg };
  } catch {
    const txt = await res.text().catch(() => "");
    return { status, message: txt.slice(0, 200) };
  }
}
