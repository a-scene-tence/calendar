"use client";

import { useMemo, useState } from "react";

export type Category = { id: string; name: string; kind: "income" | "expense" };

export type TransactionInitial = {
  id?: string;
  kind: "income" | "expense";
  amount: string; // 입력 문자열(숫자)
  date: string; // YYYY-MM-DD
  categoryName: string;
  memo: string;
};

const DEFAULT_CATEGORIES: Record<"income" | "expense", string[]> = {
  expense: ["식비", "교통", "생활", "쇼핑", "의료", "문화", "기타"],
  income: ["급여", "용돈", "부수입", "기타"],
};

const CUSTOM = "__custom__";
const NONE = "";

export default function TransactionFormModal({
  mode,
  initial,
  categories,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: TransactionInitial;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"income" | "expense">(initial.kind);
  const [amount, setAmount] = useState(initial.amount);
  const [date, setDate] = useState(initial.date);
  const [memo, setMemo] = useState(initial.memo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 현재 종류의 카테고리 후보(기본 ∪ 기존, 이름 중복 제거)
  const options = useMemo(() => {
    const names = new Set<string>(DEFAULT_CATEGORIES[kind]);
    for (const c of categories) if (c.kind === kind) names.add(c.name);
    return Array.from(names);
  }, [kind, categories]);

  // 선택된 카테고리: 옵션에 있으면 그 값, 직접입력이면 CUSTOM
  const initialIsKnown = initial.categoryName
    ? DEFAULT_CATEGORIES[initial.kind].includes(initial.categoryName) ||
      categories.some(
        (c) => c.kind === initial.kind && c.name === initial.categoryName
      )
    : true;
  const [selected, setSelected] = useState<string>(
    initial.categoryName ? (initialIsKnown ? initial.categoryName : CUSTOM) : NONE
  );
  const [custom, setCustom] = useState(initialIsKnown ? "" : initial.categoryName);

  function effectiveCategory(): string {
    if (selected === CUSTOM) return custom.trim();
    if (selected === NONE) return "";
    return selected;
  }

  async function save() {
    const amt = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) return setError("금액을 올바르게 입력하세요.");
    if (!date) return setError("날짜를 선택하세요.");
    setBusy(true);
    setError(null);

    const payload: Record<string, unknown> = {
      kind,
      amount: amt,
      date,
      categoryName: effectiveCategory(),
      memo: memo.trim(),
    };
    if (mode === "edit") payload.id = initial.id;

    const res = await fetch("/api/transactions", {
      method: mode === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.status === 401) return setError("세션 만료. 다시 로그인하세요.");
    if (!res.ok) return setError("저장에 실패했습니다.");
    onSaved();
  }

  async function remove() {
    if (!initial.id) return;
    if (!confirm("이 거래를 삭제할까요?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/transactions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: initial.id }),
    });
    setBusy(false);
    if (res.status === 401) return setError("세션 만료. 다시 로그인하세요.");
    if (!res.ok) return setError("삭제에 실패했습니다.");
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-4">
          {mode === "edit" ? "거래 수정" : "거래 추가"}
        </h2>

        <div className="space-y-3">
          {/* 종류 토글 */}
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((k) => {
              const active = kind === k;
              const isExpense = k === "expense";
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setSelected(NONE);
                    setCustom("");
                  }}
                  className={`rounded-lg py-2 text-sm font-medium border transition-colors ${
                    active
                      ? isExpense
                        ? "bg-red-50 border-red-300 text-red-600"
                        : "bg-blue-50 border-blue-300 text-blue-600"
                      : "border-gray-200 text-gray-500"
                  }`}
                  aria-pressed={active}
                >
                  {isExpense ? "지출" : "수입"}
                </button>
              );
            })}
          </div>

          <Field label="금액">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="0"
            />
          </Field>

          <Field label="카테고리 (선택)">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value={NONE}>(선택 안 함)</option>
              {options.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value={CUSTOM}>+ 직접 입력</option>
            </select>
          </Field>

          {selected === CUSTOM && (
            <Field label="새 카테고리 이름">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="예: 경조사"
              />
            </Field>
          )}

          <Field label="날짜">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="메모 (선택)">
            <input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="예: 점심"
            />
          </Field>
        </div>

        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <div className="flex items-center gap-2 mt-5">
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-lg bg-sky-500 text-white py-2.5 text-sm font-medium hover:bg-sky-600 disabled:opacity-50"
          >
            {busy ? "저장 중..." : "저장"}
          </button>
          {mode === "edit" && (
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-lg border border-red-200 text-red-500 px-4 py-2.5 text-sm hover:bg-red-50 disabled:opacity-50"
            >
              삭제
            </button>
          )}
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-200 text-gray-600 px-4 py-2.5 text-sm hover:bg-gray-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block flex-1">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
