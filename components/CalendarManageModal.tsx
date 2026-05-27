"use client";

import { useRef, useState } from "react";
import {
  createCalendar,
  updateCalendar,
  deleteCalendar,
  importIcs,
  exportIcs,
} from "@/lib/local-store";

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
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);
  const [importTarget, setImportTarget] = useState(categories[0]?.id ?? "");
  const fileRef = useRef<HTMLInputElement>(null);

  function add() {
    if (!newName.trim()) return setError("이름을 입력하세요.");
    setError(null);
    createCalendar(newName.trim(), newColor);
    setNewName("");
    setNewColor(PRESET_COLORS[0]);
    onChanged();
  }

  function startEdit(c: ManageCalendar) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color);
  }
  function saveEdit() {
    if (!editName.trim()) return setError("이름을 입력하세요.");
    setError(null);
    updateCalendar(editingId!, { name: editName.trim(), color: editColor });
    setEditingId(null);
    onChanged();
  }

  function remove(c: ManageCalendar) {
    if (
      !confirm(
        `‘${c.name}’ 카테고리와 그 안의 모든 일정이 이 기기에서 삭제됩니다. 계속할까요?`
      )
    )
      return;
    setError(null);
    deleteCalendar(c.id);
    onChanged();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!importTarget) return setError("가져올 카테고리를 선택하세요.");
    setError(null);
    setInfo(null);
    try {
      const text = await file.text();
      const n = importIcs(text, importTarget);
      setInfo(`${n}개 일정을 가져왔습니다.`);
      onChanged();
    } catch {
      setError("ICS 파일을 읽지 못했습니다.");
    }
  }

  function doExport() {
    setError(null);
    const ics = exportIcs();
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendar-${new Date().toISOString().slice(0, 10)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
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
              className="rounded-lg bg-sky-500 text-white px-3 py-2 text-sm font-medium shrink-0 hover:bg-sky-600"
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
                    className="text-sky-600 text-sm font-medium shrink-0"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
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
                    className="text-red-500 text-sm shrink-0 hover:text-red-600"
                  >
                    삭제
                  </button>
                </li>
              )
            )}
          </ul>
        )}

        {/* ICS 가져오기 / 내보내기 */}
        <div className="rounded-lg border border-gray-200 p-3 mt-4">
          <p className="text-xs text-gray-500 mb-2">ICS 파일 (백업·가져오기)</p>
          <div className="flex items-center gap-2 mb-2">
            <select
              value={importTarget}
              onChange={(e) => setImportTarget(e.target.value)}
              className="flex-1 min-w-0 rounded-lg border border-gray-200 px-2 py-2 text-sm bg-white"
              aria-label="가져올 카테고리"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!importTarget}
              className="rounded-lg border border-gray-200 text-gray-700 px-3 py-2 text-sm font-medium shrink-0 hover:bg-gray-50 disabled:opacity-50"
            >
              가져오기
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".ics,text/calendar"
              onChange={onPickFile}
              className="hidden"
            />
          </div>
          <button
            onClick={doExport}
            className="w-full rounded-lg border border-gray-200 text-gray-700 py-2 text-sm font-medium hover:bg-gray-50"
          >
            전체 일정 내보내기 (.ics)
          </button>
        </div>

        {info && <p className="text-emerald-600 text-sm mt-3">{info}</p>}
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
