"use client";

import { useEffect, useMemo, useState } from "react";

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

type Status = "loading" | "unauthorized" | "error" | "ok";

type DayEntry = { calId: string; color: string; name: string; event: CalendarEvent };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export default function CalendarMonth() {
  const today = new Date();
  const [viewDate, setViewDate] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1, // 1-12
  });
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [activeIds, setActiveIds] = useState<Set<string> | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(dateKey(today));
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    fetch(`/api/calendar?year=${viewDate.year}&month=${viewDate.month}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) return setStatus("unauthorized");
        if (!r.ok) return setStatus("error");
        const data = await r.json();
        setCalendars(data.calendars ?? []);
        setStatus("ok");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [viewDate.year, viewDate.month]);

  const allIds = useMemo(() => calendars.map((c) => c.id), [calendars]);
  const isActive = (id: string) => (activeIds ? activeIds.has(id) : true);

  function toggleCalendar(id: string) {
    setActiveIds((prev) => {
      const base = prev ?? new Set(allIds);
      const next = new Set(base);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // 활성 캘린더 일정을 날짜키(YYYY-MM-DD)로 묶기
  const entriesByDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    for (const cal of calendars) {
      if (!isActive(cal.id)) continue;
      for (const event of cal.events) {
        const key = eventDateKey(event.start);
        if (!key) continue;
        const arr = map.get(key) ?? [];
        arr.push({ calId: cal.id, color: cal.color, name: cal.name, event });
        map.set(key, arr);
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars, activeIds]);

  const gridDays = useMemo(
    () => buildMonthGrid(viewDate.year, viewDate.month),
    [viewDate.year, viewDate.month]
  );

  function goPrev() {
    setSelectedDay(null);
    setViewDate(({ year, month }) =>
      month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
    );
  }
  function goNext() {
    setSelectedDay(null);
    setViewDate(({ year, month }) =>
      month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
    );
  }
  function goToday() {
    const t = new Date();
    setViewDate({ year: t.getFullYear(), month: t.getMonth() + 1 });
    setSelectedDay(dateKey(t));
  }

  if (status === "unauthorized") {
    return (
      <Card>
        <p className="text-amber-600 text-sm">
          세션이 만료되었습니다(Google 토큰 만료).{" "}
          <a href="/login" className="underline font-medium">
            다시 로그인
          </a>{" "}
          후 이용하세요.
        </p>
      </Card>
    );
  }
  if (status === "error") {
    return (
      <Card>
        <p className="text-red-400 text-sm">캘린더를 불러올 수 없습니다.</p>
      </Card>
    );
  }

  const todayKey = dateKey(new Date());
  const selectedEntries = selectedDay
    ? (entriesByDay.get(selectedDay) ?? [])
        .slice()
        .sort((a, b) => a.event.start.localeCompare(b.event.start))
    : [];

  return (
    <Card>
      {/* 헤더: 월 이동 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold flex items-center gap-2">
          <span aria-hidden>📅</span> {viewDate.year}년 {viewDate.month}월
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={goPrev}
            className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded-lg text-sm"
            aria-label="이전 달"
          >
            ‹
          </button>
          <button
            onClick={goToday}
            className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-lg text-xs"
          >
            오늘
          </button>
          <button
            onClick={goNext}
            className="px-2 py-1 text-gray-500 hover:bg-gray-100 rounded-lg text-sm"
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
      </div>

      {/* 카테고리 토글 칩 */}
      {calendars.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {calendars.map((cal) => {
            const active = isActive(cal.id);
            return (
              <button
                key={cal.id}
                onClick={() => toggleCalendar(cal.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  active
                    ? "border-gray-200 bg-gray-50 text-gray-700"
                    : "border-gray-100 bg-white text-gray-300"
                }`}
                aria-pressed={active}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: active ? cal.color : "#e5e7eb" }}
                  aria-hidden
                />
                <span className="truncate max-w-[100px]">{cal.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 text-center text-xs text-gray-400 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={i === 0 ? "text-red-400" : i === 6 ? "text-blue-400" : ""}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 월 그리드 */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
        {gridDays.map((d) => {
          const key = dateKey(d);
          const inMonth = d.getMonth() + 1 === viewDate.month;
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          const dayEntries = entriesByDay.get(key) ?? [];
          const colors = uniqueColors(dayEntries);
          return (
            <button
              key={key}
              onClick={() => setSelectedDay(key)}
              className={`min-h-[44px] sm:min-h-[56px] bg-white p-1 flex flex-col items-center gap-1 ${
                isSelected ? "ring-2 ring-inset ring-sky-400" : ""
              }`}
            >
              <span
                className={`text-xs leading-none mt-0.5 flex items-center justify-center h-5 w-5 rounded-full ${
                  isToday ? "bg-sky-500 text-white font-semibold" : ""
                } ${!inMonth ? "text-gray-300" : isToday ? "" : "text-gray-700"}`}
              >
                {d.getDate()}
              </span>
              <span className="flex gap-0.5 flex-wrap justify-center">
                {colors.slice(0, 3).map((c, i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: c }}
                    aria-hidden
                  />
                ))}
                {colors.length > 3 && (
                  <span className="text-[9px] leading-none text-gray-400">
                    +{colors.length - 3}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* 선택한 날짜 일정 목록 */}
      <div className="mt-4">
        {!selectedDay ? (
          <p className="text-gray-400 text-sm">날짜를 탭하면 일정이 표시됩니다.</p>
        ) : (
          <>
            <h3 className="text-sm font-medium text-gray-600 mb-2">
              {formatDayHeading(selectedDay)}
            </h3>
            {selectedEntries.length === 0 ? (
              <p className="text-gray-400 text-sm">일정이 없습니다.</p>
            ) : (
              <ul className="space-y-2">
                {selectedEntries.map(({ event, color, name }) => (
                  <li key={event.id} className="flex items-start gap-2">
                    <span className="text-xs text-gray-400 mt-0.5 shrink-0 w-12">
                      {formatTime(event.start)}
                    </span>
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="text-sm leading-snug">{event.summary}</span>
                      <span className="block text-xs text-gray-400 truncate">
                        {name}
                        {event.location ? ` · ${event.location}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      {children}
    </div>
  );
}

function uniqueColors(entries: DayEntry[]): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const e of entries) {
    if (!seen.has(e.calId)) {
      seen.add(e.calId);
      colors.push(e.color);
    }
  }
  return colors;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 종일 일정은 "YYYY-MM-DD", 시간 일정은 ISO datetime → 로컬 날짜키로 변환
function eventDateKey(start: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return start;
  const d = new Date(start);
  if (isNaN(d.getTime())) return null;
  return dateKey(d);
}

function isAllDay(start: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(start);
}

function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month - 1, 1);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay()); // 직전 일요일
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

function formatTime(start: string): string {
  if (isAllDay(start)) return "종일";
  const d = new Date(start);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

function formatDayHeading(key: string): string {
  const [y, m, day] = key.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  return d.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
