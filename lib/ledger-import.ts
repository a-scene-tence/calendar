// 기존(Vercel) 가계부 JSON 백업 → 표준 거래 레코드로 정규화.
// 백업 구조: { txs: [{ dir, amount, date, category, desc, ... }], ... }
// 수입/지출 구분은 dir 필드(income|expense)에 있다(type 은 personal/joint 로 무관).

export type NormalizedTx = {
  kind: "income" | "expense";
  amount: number;
  date: string; // YYYY-MM-DD
  categoryName: string;
  memo: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type RawTx = {
  dir?: unknown;
  amount?: unknown;
  date?: unknown;
  category?: unknown;
  desc?: unknown;
};

function extractList(raw: unknown): RawTx[] {
  if (Array.isArray(raw)) return raw as RawTx[];
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.txs)) return obj.txs as RawTx[];
  }
  return [];
}

export function normalizeLedgerJson(raw: unknown): NormalizedTx[] {
  const list = extractList(raw);
  const result: NormalizedTx[] = [];
  for (const t of list) {
    if (!t || typeof t !== "object") continue;

    const date = typeof t.date === "string" ? t.date : "";
    if (!DATE_RE.test(date)) continue;

    const amount = Math.abs(Number(t.amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const kind: "income" | "expense" =
      t.dir === "income" ? "income" : "expense"; // dir 누락/기타 → 지출

    result.push({
      kind,
      amount,
      date,
      categoryName: String(t.category ?? "").trim(),
      memo: String(t.desc ?? "").trim(),
    });
  }
  return result;
}
