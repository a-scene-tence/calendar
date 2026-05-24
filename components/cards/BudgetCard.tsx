"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import TransactionFormModal, {
  Category,
  TransactionInitial,
} from "@/components/TransactionFormModal";
import { normalizeLedgerJson } from "@/lib/ledger-import";

const LEDGER_URL = process.env.NEXT_PUBLIC_LEDGER_URL;

type Summary = { income: number; expense: number; balance: number };

type Transaction = {
  id: string;
  kind: "income" | "expense";
  amount: number;
  date: string; // YYYY-MM-DD (KST)
  memo: string;
  categoryName: string;
};

type Status = "loading" | "unauthorized" | "error" | "ok";

const RECENT_COUNT = 6;

export default function BudgetCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [modal, setModal] = useState<
    { mode: "create" | "edit"; initial: TransactionInitial } | null
  >(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setStatus("loading");
    return fetch("/api/transactions")
      .then(async (r) => {
        if (r.status === 401) return setStatus("unauthorized");
        if (!r.ok) return setStatus("error");
        const data = await r.json();
        setSummary(data.summary ?? null);
        setTransactions(data.transactions ?? []);
        setCategories(data.categories ?? []);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setModal({
      mode: "create",
      initial: {
        kind: "expense",
        amount: "",
        date: todayKey(),
        categoryName: "",
        memo: "",
      },
    });
  }
  function openEdit(tx: Transaction) {
    setModal({
      mode: "edit",
      initial: {
        id: tx.id,
        kind: tx.kind,
        amount: String(tx.amount),
        date: tx.date,
        categoryName: tx.categoryName,
        memo: tx.memo,
      },
    });
  }
  function onSaved() {
    setModal(null);
    load();
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    setImportMsg(null);

    let records;
    try {
      records = normalizeLedgerJson(JSON.parse(await file.text()));
    } catch {
      setImportMsg("JSON 파일을 읽을 수 없습니다.");
      return;
    }
    if (records.length === 0) {
      setImportMsg("가져올 거래를 찾지 못했습니다.");
      return;
    }
    if (!confirm(`${records.length}건을 가져올까요?`)) return;

    setImporting(true);
    try {
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: records }),
      });
      if (res.status === 401) {
        setImportMsg("세션 만료. 다시 로그인하세요.");
        return;
      }
      if (!res.ok) {
        setImportMsg("가져오기에 실패했습니다.");
        return;
      }
      const { imported, skipped } = await res.json();
      setImportMsg(`${imported}건 추가, ${skipped}건 중복 건너뜀`);
      await load();
    } catch {
      setImportMsg("가져오기 중 오류가 발생했습니다.");
    } finally {
      setImporting(false);
    }
  }

  const monthLabel = `${new Date().getMonth() + 1}월`;

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-wrap items-center gap-y-2 mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2 whitespace-nowrap">
            <span aria-hidden>💰</span> {monthLabel} 가계부
          </h2>
          <div className="flex items-center gap-1 ml-auto">
            {LEDGER_URL && (
              <a
                href={LEDGER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 text-gray-500 hover:bg-gray-100 rounded-lg text-xs font-medium"
              >
                기존 가계부 ↗
              </a>
            )}
            {status === "ok" && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                  className="px-2.5 py-1 text-gray-500 hover:bg-gray-100 rounded-lg text-xs font-medium disabled:opacity-50"
                >
                  {importing ? "가져오는 중…" : "가져오기"}
                </button>
                <button
                  onClick={openCreate}
                  className="px-2.5 py-1 text-sky-600 hover:bg-sky-50 rounded-lg text-xs font-medium"
                >
                  + 거래
                </button>
              </>
            )}
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFilePicked}
          className="hidden"
        />
        {importMsg && (
          <p className="text-xs text-gray-500 mb-3 -mt-1">{importMsg}</p>
        )}

        {status === "loading" && (
          <p className="text-gray-400 text-sm">불러오는 중…</p>
        )}

        {status === "unauthorized" && (
          <p className="text-amber-600 text-sm">
            <a href="/login" className="underline font-medium">
              로그인
            </a>{" "}
            후 가계부를 이용하세요.
          </p>
        )}

        {status === "error" && (
          <p className="text-gray-400 text-sm">
            가계부 데이터를 불러올 수 없습니다. Supabase 테이블(마이그레이션) 적용 여부를
            확인하세요.
          </p>
        )}

        {status === "ok" && summary && (
          <>
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
                  className={
                    summary.balance >= 0 ? "text-green-600" : "text-red-600"
                  }
                  bold
                />
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-xs text-gray-400 mb-1">최근 거래</h3>
              {transactions.length === 0 ? (
                <p className="text-gray-400 text-sm py-2">
                  이번 달 거래가 없습니다.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {transactions.slice(0, RECENT_COUNT).map((tx) => (
                    <li key={tx.id}>
                      <button
                        onClick={() => openEdit(tx)}
                        className="w-full flex items-center gap-2 py-2 text-left hover:bg-gray-50 rounded-lg px-1"
                      >
                        <span className="text-xs text-gray-400 w-10 shrink-0">
                          {shortDate(tx.date)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                          {tx.categoryName || "미분류"}
                          {tx.memo && (
                            <span className="text-gray-400"> · {tx.memo}</span>
                          )}
                        </span>
                        <span
                          className={`text-sm shrink-0 ${
                            tx.kind === "income"
                              ? "text-blue-600"
                              : "text-red-500"
                          }`}
                        >
                          {tx.kind === "income" ? "+" : "-"}
                          {formatKRW(tx.amount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {modal && (
        <TransactionFormModal
          mode={modal.mode}
          initial={modal.initial}
          categories={categories}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </>
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
    <div
      className={`flex justify-between items-center ${bold ? "font-semibold" : ""}`}
    >
      <span className="text-gray-500 text-sm">{label}</span>
      <span className={`text-sm ${className}`}>{value}</span>
    </div>
  );
}

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shortDate(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}
