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

  const { error } = await supabase
    .from("user_tokens")
    .update({ category_order: order })
    .eq("user_id", user.id);

  if (error) {
    console.warn("[preferences] update failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
