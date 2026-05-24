import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const KST = "+09:00";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function getUserId(): Promise<
  { id: string; supabase: SupabaseClient } | { error: NextResponse }
> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { error: unauthorized() };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: unauthorized() };
  return { id: user.id, supabase };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// KST 기준 월 경계 [start, nextStart)
function monthBoundsKST(year: number, month: number): {
  start: string;
  nextStart: string;
} {
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: `${year}-${pad2(month)}-01T00:00:00${KST}`,
    nextStart: `${nextYear}-${pad2(nextMonth)}-01T00:00:00${KST}`,
  };
}

// ISO → KST 기준 "YYYY-MM-DD"
function kstDateKey(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(
    kst.getUTCDate()
  )}`;
}

type Kind = "income" | "expense";

function isKind(v: unknown): v is Kind {
  return v === "income" || v === "expense";
}

// 카테고리 이름으로 find-or-create → category_id (이름 없으면 null)
async function resolveCategoryId(
  supabase: SupabaseClient,
  userId: string,
  name: string | undefined,
  kind: Kind
): Promise<string | null> {
  const n = (name ?? "").trim();
  if (!n) return null;
  const { data: existing } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .eq("name", n)
    .eq("kind", kind)
    .maybeSingle();
  if (existing) return existing.id as string;
  const { data: created } = await supabase
    .from("categories")
    .insert({ user_id: userId, name: n, kind })
    .select("id")
    .single();
  return (created?.id as string) ?? null;
}

export async function GET(request: NextRequest) {
  const auth = await getUserId();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const now = new Date();
  const params = request.nextUrl.searchParams;
  const year = Number(params.get("year")) || now.getFullYear();
  const month = Number(params.get("month")) || now.getMonth() + 1;
  const { start, nextStart } = monthBoundsKST(year, month);

  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id, kind, amount, occurred_at, memo, category_id, categories(name)")
    .gte("occurred_at", start)
    .lt("occurred_at", nextStart)
    .order("occurred_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "거래를 불러올 수 없습니다." },
      { status: 502 }
    );
  }

  const transactions = (rows ?? []).map(
    (r: {
      id: string;
      kind: string;
      amount: number | string;
      occurred_at: string;
      memo: string | null;
      categories: { name: string } | { name: string }[] | null;
    }) => {
      const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
      return {
        id: r.id,
        kind: r.kind as Kind,
        amount: Number(r.amount),
        occurredAt: r.occurred_at,
        date: kstDateKey(r.occurred_at),
        memo: r.memo ?? "",
        categoryName: cat?.name ?? "",
      };
    }
  );

  const income = transactions
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + t.amount, 0);
  const expense = transactions
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const { data: cats } = await supabase
    .from("categories")
    .select("id, name, kind")
    .order("name");

  return NextResponse.json({
    summary: { income, expense, balance: income - expense },
    transactions,
    categories: cats ?? [],
  });
}

type TxBody = {
  id?: string;
  kind?: unknown;
  amount?: unknown;
  date?: unknown;
  categoryName?: string;
  memo?: string;
};

function parseAmount(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(request: NextRequest) {
  const auth = await getUserId();
  if ("error" in auth) return auth.error;
  const { id: userId, supabase } = auth;

  const body = (await request.json()) as TxBody;
  if (!isKind(body.kind) || typeof body.date !== "string" || !body.date) {
    return NextResponse.json({ error: "kind, date 필수" }, { status: 400 });
  }
  const amount = parseAmount(body.amount);
  if (amount === null) {
    return NextResponse.json({ error: "금액이 올바르지 않습니다." }, { status: 400 });
  }
  const categoryId = await resolveCategoryId(
    supabase,
    userId,
    body.categoryName,
    body.kind
  );

  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    kind: body.kind,
    amount,
    currency: "KRW",
    occurred_at: `${body.date}T00:00:00${KST}`,
    category_id: categoryId,
    memo: body.memo?.trim() || null,
  });
  if (error) {
    return NextResponse.json({ error: "거래 추가 실패" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const auth = await getUserId();
  if ("error" in auth) return auth.error;
  const { id: userId, supabase } = auth;

  const body = (await request.json()) as TxBody;
  if (!body.id || !isKind(body.kind) || typeof body.date !== "string" || !body.date) {
    return NextResponse.json({ error: "id, kind, date 필수" }, { status: 400 });
  }
  const amount = parseAmount(body.amount);
  if (amount === null) {
    return NextResponse.json({ error: "금액이 올바르지 않습니다." }, { status: 400 });
  }
  const categoryId = await resolveCategoryId(
    supabase,
    userId,
    body.categoryName,
    body.kind
  );

  const { error } = await supabase
    .from("transactions")
    .update({
      kind: body.kind,
      amount,
      occurred_at: `${body.date}T00:00:00${KST}`,
      category_id: categoryId,
      memo: body.memo?.trim() || null,
    })
    .eq("id", body.id);
  if (error) {
    return NextResponse.json({ error: "거래 수정 실패" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await getUserId();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { id } = (await request.json()) as { id?: string };
  if (!id) {
    return NextResponse.json({ error: "id 필수" }, { status: 400 });
  }
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "거래 삭제 실패" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
