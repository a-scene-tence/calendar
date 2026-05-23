import { createClient } from "@/lib/supabase/server";

type Summary = { income: number; expense: number; balance: number };

async function getMonthSummary(): Promise<Summary | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    ).toISOString();

    const { data, error } = await supabase
      .from("transactions")
      .select("kind, amount")
      .gte("occurred_at", startOfMonth);

    if (error || !data) return null;

    const income = data
      .filter((t) => t.kind === "income")
      .reduce((s, t) => s + Number(t.amount), 0);
    const expense = data
      .filter((t) => t.kind === "expense")
      .reduce((s, t) => s + Number(t.amount), 0);

    return { income, expense, balance: income - expense };
  } catch {
    return null;
  }
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

export default async function BudgetCard() {
  const summary = await getMonthSummary();
  const monthLabel = `${new Date().getMonth() + 1}월`;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
        <span aria-hidden>💰</span> {monthLabel} 가계부
      </h2>

      {summary ? (
        <div className="space-y-2">
          <SummaryRow
            label="수입"
            value={formatKRW(summary.income)}
            className="text-blue-600"
          />
          <SummaryRow
            label="지출"
            value={formatKRW(summary.expense)}
            className="text-red-500"
          />
          <div className="border-t border-gray-100 pt-2 mt-2">
            <SummaryRow
              label="잔액"
              value={formatKRW(summary.balance)}
              className={summary.balance >= 0 ? "text-green-600" : "text-red-600"}
              bold
            />
          </div>
        </div>
      ) : (
        <p className="text-gray-400 text-sm">
          가계부 데이터를 불러올 수 없습니다.{" "}
          <a href="/login" className="underline">
            로그인
          </a>
          하거나 Supabase 연동 후 이용하세요.
        </p>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  className,
  bold,
}: {
  label: string;
  value: string;
  className: string;
  bold?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center ${bold ? "font-semibold" : ""}`}>
      <span className="text-gray-500 text-sm">{label}</span>
      <span className={`text-sm ${className}`}>{value}</span>
    </div>
  );
}
