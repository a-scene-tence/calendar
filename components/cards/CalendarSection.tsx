"use client";

import { useEffect, useState } from "react";

type CalendarEvent = {
  id: string;
  summary: string;
  start: string;
  end?: string;
  location?: string;
};

type Calendar = {
  id: string;
  name: string;
  color: string;
  events: CalendarEvent[];
};

export default function CalendarSection() {
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/calendar")
      .then((r) => r.json())
      .then((data) => {
        setCalendars(data.calendars ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <p className="text-gray-400 text-sm">불러오는 중...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <p className="text-red-400 text-sm">
          캘린더를 불러올 수 없습니다.{" "}
          <a href="/login" className="underline">
            로그인
          </a>{" "}
          후 이용하세요.
        </p>
      </div>
    );
  }

  if (calendars.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <p className="text-gray-400 text-sm">표시할 캘린더가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {calendars.map((cal) => (
        <CalendarCard key={cal.id} calendar={cal} />
      ))}
    </div>
  );
}

function CalendarCard({ calendar }: { calendar: Calendar }) {
  const { name, color, events } = calendar;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="truncate">{name}</span>
        <span className="ml-auto text-xs font-normal text-gray-400">
          {events.length}건
        </span>
      </h2>

      {events.length === 0 ? (
        <p className="text-gray-400 text-sm">이 기간에 일정이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => {
            const past = isPast(e.start);
            return (
              <li
                key={e.id}
                className={`flex items-start gap-3 ${past ? "opacity-50" : ""}`}
              >
                <span className="text-xs text-gray-400 mt-0.5 shrink-0 w-16">
                  {formatStart(e.start)}
                </span>
                <span className="min-w-0">
                  <span className="text-sm leading-snug">{e.summary}</span>
                  {e.location && (
                    <span className="block text-xs text-gray-400 truncate">
                      {e.location}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function isPast(iso: string): boolean {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  return d.getTime() < startOfToday();
}

function formatStart(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const dateLabel = d.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  // 종일 일정(YYYY-MM-DD)은 시간 표시 생략
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return dateLabel;
  const timeLabel = d.toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateLabel} ${timeLabel}`;
}
