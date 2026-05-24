"use client";

import { useEffect, useState } from "react";

type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  calendarName?: string;
  color?: string;
};

export default function CalendarCard() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((data) => {
        setEvents(data.events ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
        <span aria-hidden>📅</span> 이번 주 일정
      </h2>

      {loading && (
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      )}

      {error && (
        <p className="text-red-400 text-sm">
          캘린더를 불러올 수 없습니다.{" "}
          <a href="/login" className="underline">
            로그인
          </a>{" "}
          후 이용하세요.
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="text-gray-400 text-sm">이번 주 일정이 없습니다.</p>
      )}

      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-3">
            <span className="text-xs text-gray-400 mt-0.5 shrink-0 w-16">
              {formatStart(e.start)}
            </span>
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: e.color ?? "#9ca3af" }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="text-sm leading-snug">{e.summary}</span>
              {e.calendarName && (
                <span className="block text-xs text-gray-400 truncate">
                  {e.calendarName}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatStart(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}
