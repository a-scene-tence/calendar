"use client";

import { useState } from "react";

export type WritableCalendar = { id: string; name: string; color: string };

export type EventInitial = {
  eventId?: string;
  calendarId: string;
  summary: string;
  allDay: boolean;
  date: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (allDay 종료, 단일이면 date와 동일)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  location: string;
  description: string;
};

export default function EventFormModal({
  mode,
  initial,
  calendars,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: EventInitial;
  calendars: WritableCalendar[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [summary, setSummary] = useState(initial.summary);
  const [calendarId, setCalendarId] = useState(
    initial.calendarId || calendars[0]?.id || ""
  );
  const [allDay, setAllDay] = useState(initial.allDay);
  const [date, setDate] = useState(initial.date);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [location, setLocation] = useState(initial.location);
  const [description, setDescription] = useState(initial.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!summary.trim()) return setError("제목을 입력하세요.");
    if (!calendarId) return setError("캘린더를 선택하세요.");
    setBusy(true);
    setError(null);

    const payload: Record<string, unknown> = {
      calendarId,
      summary: summary.trim(),
      allDay,
      location: location.trim(),
      description: description.trim(),
    };
    if (allDay) {
      payload.date = date;
      payload.endDate = endDate || date;
    } else {
      payload.startDateTime = `${date}T${startTime}:00`;
      payload.endDateTime = `${date}T${endTime}:00`;
    }
    if (mode === "edit") payload.eventId = initial.eventId;

    const res = await fetch("/api/calendar/events", {
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
    if (!initial.eventId) return;
    if (!confirm("이 일정을 삭제할까요?")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/calendar/events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId, eventId: initial.eventId }),
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
          {mode === "edit" ? "일정 수정" : "일정 추가"}
        </h2>

        <div className="space-y-3">
          <Field label="제목">
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="일정 제목"
            />
          </Field>

          <Field label="캘린더">
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            종일
          </label>

          <Field label="날짜">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
              }}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>

          {allDay ? (
            <Field label="종료 날짜">
              <input
                type="date"
                value={endDate}
                min={date}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
          ) : (
            <div className="flex gap-3">
              <Field label="시작">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="종료">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </Field>
            </div>
          )}

          <Field label="장소 (선택)">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </Field>

          <Field label="설명 (선택)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none"
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
