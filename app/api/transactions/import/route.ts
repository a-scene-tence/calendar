import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NormalizedTx } from "@/lib/ledger-import";

const KST = "+09:00";
const PAGE = 1000;

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

// "YYYY-MM-DD" → 다음날 "YYYY-MM-DD"
function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate()
  )}`;
}

// ISO → KST 기준 "YYYY-MM-DD"
function kstDateKey(iso: string): string {
  const d = new Date(iso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(
    kst.getUTCDate()
  )}`;
}

function dedupKey(
  date: string,
  kind: string,
  amount: number,
  categoryName: string,
  memo: string
): string {
  return `${date}|${kind}|${amount}|${categoryName}|${memo}`;
}

function isValid(t: NormalizedTx): boolean {
  return (
    (t.kind === "income" || t.kind === "expense") &&
    typeof t.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.date) &&
    Number.isFinite(t.amount) &&
    t.amount > 0
  );
}

export async function POST(request: NextRequest) {
  const auth = await getUserId();
  if ("error" in auth) return auth.error;
  const { id: userId, supabase } = auth;

  const body = (await request.json()) as { transactions?: NormalizedTx[] };
  const incoming = (body.transactions ?? []).filter(isValid);
  if (incoming.length === 0) {
    return NextResponse.json({ imported: 0, skipped: 0 });
  }

  // 가져올 데이터의 날짜 범위(KST) 내 기존 거래로 중복 키셋 구성
  const dates = incoming.map((t) => t.date).sort();
  const start = `${dates[0]}T00:00:00${KST}`;
  const end = `${nextDay(dates[dates.length - 1])}T00:00:00${KST}`;

  const existingKeys = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("occurred_at, kind, amount, memo, categories(name)")
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .range(from, from + PAGE - 1);
    if (error) {
      return NextResponse.json(
        { error: "기존 거래 조회 실패" },
        { status: 502 }
      );
    }
    const rows = data ?? [];
    for (const r of rows as Array<{
      occurred_at: string;
      kind: string;
      amount: number | string;
      memo: string | null;
      categories: { name: string } | { name: string }[] | null;
    }>) {
      const cat = Array.isArray(r.categories) ? r.categories[0] : r.categories;
      existingKeys.add(
        dedupKey(
          kstDateKey(r.occurred_at),
          r.kind,
          Number(r.amount),
          cat?.name ?? "",
          r.memo ?? ""
        )
      );
    }
    if (rows.length < PAGE) break;
  }

  // 중복 제거
  const toInsert = incoming.filter(
    (t) =>
      !existingKeys.has(
        dedupKey(t.date, t.kind, t.amount, t.categoryName, t.memo)
      )
  );
  const skipped = incoming.length - toInsert.length;
  if (toInsert.length === 0) {
    return NextResponse.json({ imported: 0, skipped });
  }

  // 카테고리 find-or-create (고유 name|kind 단위로 1회)
  const categoryMap = new Map<string, string | null>();
  for (const t of toInsert) {
    const name = t.categoryName.trim();
    if (!name) continue;
    const key = `${name}|${t.kind}`;
    if (categoryMap.has(key)) continue;
    const { data: existing } = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("name", name)
      .eq("kind", t.kind)
      .maybeSingle();
    if (existing) {
      categoryMap.set(key, existing.id as string);
      continue;
    }
    const { data: created } = await supabase
      .from("categories")
      .insert({ user_id: userId, name, kind: t.kind })
      .select("id")
      .single();
    categoryMap.set(key, (created?.id as string) ?? null);
  }

  const rows = toInsert.map((t) => ({
    user_id: userId,
    kind: t.kind,
    amount: t.amount,
    currency: "KRW",
    occurred_at: `${t.date}T00:00:00${KST}`,
    category_id: t.categoryName.trim()
      ? categoryMap.get(`${t.categoryName.trim()}|${t.kind}`) ?? null
      : null,
    memo: t.memo.trim() || null,
  }));

  const { error } = await supabase.from("transactions").insert(rows);
  if (error) {
    return NextResponse.json({ error: "가져오기 삽입 실패" }, { status: 502 });
  }

  return NextResponse.json({ imported: rows.length, skipped });
}
