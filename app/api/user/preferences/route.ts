import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_ITEMS = 200;
const MAX_ID_LEN = 256;

export async function PUT(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    categoryOrder?: unknown;
  };
  if (!Array.isArray(body.categoryOrder)) {
    return NextResponse.json({ error: "categoryOrder 배열 필수" }, { status: 400 });
  }
  const order = body.categoryOrder
    .filter((x): x is string => typeof x === "string" && x.length <= MAX_ID_LEN)
    .slice(0, MAX_ITEMS);

  // .select()로 실제 갱신된 행을 돌려받아 0행 갱신(행 부재/RLS)을 표면화한다.
  const { data, error } = await supabase
    .from("user_tokens")
    .update({ category_order: order })
    .eq("user_id", user.id)
    .select("user_id");

  if (error) {
    // 컬럼 미적용(마이그레이션 누락) 등 Postgres 에러 메시지를 그대로 전달.
    console.warn("[preferences] update failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "저장 대상 사용자 행이 없습니다(user_tokens). 재로그인이 필요할 수 있습니다." },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
