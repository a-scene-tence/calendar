"use client";

import { useState } from "react";

export type ManageCalendar = { id: string; name: string; color: string };

const PRESET_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#6b7280",
];

export default function CalendarManageModal({
  categories,
  onClose,
  onChanged,
}: {
  categories: ManageCalendar[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);

  async function call(
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/calendar/calendars", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        setError("세션 만료. 다시 로그인하세요.");
        return false;
      }
      if (!res.ok) {
        setError("요청에 실패했습니다.");
        return false;
      }
      onChanged();
      return true;
    } catch {
      setError("오류가 발생했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!newName.trim()) return setError("이름을 입력하세요.");
    const ok = await call("POST", {
      summary: newName.trim(),
      backgroundColor: newColor,
    });
    if (ok) {
      setNewName("");
      setNewColor(PRESET_COLORS[0]);
    }
  }

  function startEdit(c: ManageCalendar) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color);
  }
  async function saveEdit() {
    if (!editName.trim()) return setError("이름을 입력하세요.");
    const ok = await call("PATCH", {
      calendarId: editingId,
      summary: editName.trim(),
      backgroundColor: editColor,
    });
    if (ok) setEditingId(null);
  }

  async function remove(c: ManageCalendar) {
    if (
      !confirm(
        `‘${c.name}’ 캘린더와 그 안의 모든 일정이 Google에서 영구 삭제됩니다. 계속할까요?`
      )
    )
      return;
    await call("DELETE", { calendarId: c.id });
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
        <h2 className="text-base font-semibold mb-4">카테고리 관리</h2>

        {/* 추가 */}
        <div className="rounded-lg border border-gray-200 p-3 mb-4">
          <p className="text-xs text-gray-500 mb-2">새 카테고리 추가</p>
          <div className="flex items-center gap-2">
            <ColorPicker value={newColor} onChange={setNewColor} />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="카테고리 이름"
              className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
            <button
              onClick={add}
              disabled={busy}
              className="rounded-lg bg-sky-500 text-white px-3 py-2 text-sm font-medium shrink-0 hover:bg-sky-600 disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </div>

        {/* 목록 */}
        {categories.length === 0 ? (
          <p className="text-gray-400 text-sm">관리할 수 있는 카테고리가 없습니다.</p>
        ) : (
          <ul className="space-y-1">
            {categories.map((c) =>
              editingId === c.id ? (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-lg bg-gray-50 p-2"
                >
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={saveEdit}
                    disabled={busy}
                    className="text-sky-600 text-sm font-medium shrink-0 disabled:opacity-50"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                    className="text-gray-500 text-sm shrink-0"
                  >
                    취소
                  </button>
                </li>
              ) : (
                <li key={c.id} className="flex items-center gap-2 p-2">
                  <span
                    className="h-3.5 w-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                    aria-hidden
                  />
                  <span className="flex-1 min-w-0 truncate text-sm text-gray-700">
                    {c.name}
                  </span>
                  <button
                    onClick={() => startEdit(c)}
                    className="text-gray-500 text-sm shrink-0 hover:text-gray-700"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => remove(c)}
                    disabled={busy}
                    className="text-red-500 text-sm shrink-0 hover:text-red-600 disabled:opacity-50"
                  >
                    삭제
                  </button>
                </li>
              )
            )}
          </ul>
        )}

        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <div className="mt-5">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-200 text-gray-600 py-2.5 text-sm hover:bg-gray-50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <label
      className="relative h-8 w-8 shrink-0 rounded-lg border border-gray-200 cursor-pointer"
      style={{ backgroundColor: value }}
      aria-label="색상 선택"
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
      />
    </label>
  );
}

export { PRESET_COLORS };
