"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import EventFormModal, {
  EventInitial,
  WritableCalendar,
} from "@/components/EventFormModal";

type CalendarEvent = {
  id: string;
  eventId: string;
  calendarId: string;
  summary: string;
  start: string;
  end?: string;
  location?: string;
};

type Calendar = {
  id: string;
  name: string;
  color: string;
  accessRole?: string;
  isHoliday?: boolean;
  events: CalendarEvent[];
};

type Status = "loading" | "unauthorized" | "error" | "ok";

// 레인 배정된 캘린더 아이템 (그리드 막대 렌더용)
type CalItem = {
  event: CalendarEvent;
  startKey: string; // 포함 첫날 "YYYY-MM-DD"
  endKey: string; // 포함 마지막날 "YYYY-MM-DD"
  isHoliday: boolean;
  allDay: boolean;
  color: string;
  lane: number;
};

// 한 주 안에서 막대가 차지하는 열 범위
type Segment = {
  item: CalItem;
  colStart: number; // 0-6
  span: number; // 칸 수
  roundLeft: boolean; // 실제 시작이 이 주 안 → 좌측 둥글게
  roundRight: boolean; // 실제 종료가 이 주 안 → 우측 둥글게
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TAB_ORDER = ["할일", "한일", "생활", "기타"];
const MAX_LANES = 3; // 칸당 최대 막대 레인 수(초과분은 +N)
const HOLIDAY_COLOR = "#ef4444"; // 공휴일 막대색(red-500)

export default function CalendarMonth() {
  const today = new Date();
  const [viewDate, setViewDate] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1, // 1-12
  });
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(dateKey(today));
  const [status, setStatus] = useState<Status>("loading");
  const [modal, setModal] = useState<
    { mode: "create" | "edit"; initial: EventInitial } | null
  >(null);

  const load = useCallback(() => {
    setStatus("loading");
    return fetch(`/api/calendar?year=${viewDate.year}&month=${viewDate.month}`)
      .then(async (r) => {
        if (r.status === 401) return setStatus("unauthorized");
        if (!r.ok) return setStatus("error");
        const data = await r.json();
        setCalendars(data.calendars ?? []);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [viewDate.year, viewDate.month]);

  useEffect(() => {
    load();
  }, [load]);

  // 카테고리(공휴일 제외) 탭 — TAB_ORDER 순서로 정렬, 나머지는 뒤에
  const categoryCalendars = useMemo(() => {
    const cats = calendars.filter((c) => !c.isHoliday);
    return cats.slice().sort((a, b) => {
      const ia = TAB_ORDER.indexOf(a.name);
      const ib = TAB_ORDER.indexOf(b.name);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [calendars]);

  const holidayCalendars = useMemo(
    () => calendars.filter((c) => c.isHoliday),
    [calendars]
  );

  const writableCalendars: WritableCalendar[] = useMemo(
    () =>
      categoryCalendars
        .filter((c) => c.accessRole === "owner" || c.accessRole === "writer")
        .map((c) => ({ id: c.id, name: c.name, color: c.color })),
    [categoryCalendars]
  );

  // activeId 유효성 보장(없거나 사라지면 첫 탭으로)
  useEffect(() => {
    if (categoryCalendars.length === 0) return;
    if (!activeId || !categoryCalendars.some((c) => c.id === activeId)) {
      setActiveId(categoryCalendars[0].id);
    }
  }, [categoryCalendars, activeId]);

  const activeCal = categoryCalendars.find((c) => c.id === activeId) ?? null;

  // 활성 탭 일정 + 공휴일을 통합해 전역 레인 배정(주 경계 넘어도 같은 레인 유지)
  const items = useMemo<CalItem[]>(() => {
    const raw: Omit<CalItem, "lane">[] = [];
    if (activeCal) {
      for (const event of activeCal.events) {
        const { startKey, endKey } = eventRange(event);
        raw.push({
          event,
          startKey,
          endKey,
          isHoliday: false,
          allDay: isAllDay(event.start),
          color: activeCal.color,
        });
      }
    }
    for (const cal of holidayCalendars) {
      for (const event of cal.events) {
        const { startKey, endKey } = eventRange(event);
        raw.push({
          event,
          startKey,
          endKey,
          isHoliday: true,
          allDay: isAllDay(event.start),
          color: HOLIDAY_COLOR,
        });
      }
    }
    // 시작일 오름차순 → 공휴일 우선 → 긴 기간 우선
    raw.sort((a, b) => {
      if (a.startKey !== b.startKey) return a.startKey < b.startKey ? -1 : 1;
      if (a.isHoliday !== b.isHoliday) return a.isHoliday ? -1 : 1;
      return b.endKey.localeCompare(a.endKey);
    });
    // 그리디 레인 배정: 각 레인의 마지막 endKey를 추적, 겹치지 않는 첫 레인에 배치
    const laneEnds: string[] = [];
    return raw.map((it) => {
      let lane = 0;
      while (lane < laneEnds.length && laneEnds[lane] >= it.startKey) lane++;
      laneEnds[lane] = it.endKey;
      return { ...it, lane };
    });
  }, [activeCal, holidayCalendars]);

  const gridDays = useMemo(
    () => buildMonthGrid(viewDate.year, viewDate.month),
    [viewDate.year, viewDate.month]
  );

  // 6주(7일씩)로 분할, 주별 막대 레이아웃 계산
  const weeks = useMemo(() => {
    const result: { days: Date[]; lanes: Segment[][]; overflow: number[] }[] = [];
    for (let i = 0; i < gridDays.length; i += 7) {
      const days = gridDays.slice(i, i + 7);
      result.push({ days, ...weekLayout(days, items) });
    }
    return result;
  }, [gridDays, items]);

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

  function defaultCalId(): string {
    if (activeCal && writableCalendars.some((c) => c.id === activeCal.id)) {
      return activeCal.id;
    }
    return writableCalendars[0]?.id ?? "";
  }
  function openCreate(dayKey: string | null) {
    setModal({
      mode: "create",
      initial: blankEvent(dayKey ?? dateKey(new Date()), defaultCalId()),
    });
  }
  function openEdit(event: CalendarEvent) {
    setModal({ mode: "edit", initial: toEventInitial(event) });
  }
  function onSaved() {
    setModal(null);
    load();
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
  // 선택일을 "포함"하는 일정(다일이면 중간 날에도 표시)
  const selectedItems = selectedDay
    ? items.filter(
        (it) => it.startKey <= selectedDay && selectedDay <= it.endKey
      )
    : [];
  const selectedHolidays = selectedItems
    .filter((it) => it.isHoliday)
    .map((it) => it.event);
  const selectedEvents = selectedItems
    .filter((it) => !it.isHoliday)
    .map((it) => it.event)
    .sort((a, b) => {
      const aAll = isAllDay(a.start);
      const bAll = isAllDay(b.start);
      if (aAll !== bAll) return aAll ? -1 : 1; // 종일/다일 먼저
      return a.start.localeCompare(b.start);
    });
  const canWrite = writableCalendars.length > 0;

  return (
    <>
      <Card>
        {/* 헤더: 월 이동 */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <span aria-hidden>📅</span> {viewDate.year}년 {viewDate.month}월
          </h2>
          <div className="flex items-center gap-1">
            {canWrite && (
              <button
                onClick={() => openCreate(selectedDay)}
                className="px-2.5 py-1 mr-1 text-sky-600 hover:bg-sky-50 rounded-lg text-xs font-medium"
              >
                + 일정
              </button>
            )}
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

        {/* 카테고리 탭 (한 번에 하나만 선택) */}
        {categoryCalendars.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {categoryCalendars.map((cal) => {
              const active = cal.id === activeId;
              return (
                <button
                  key={cal.id}
                  onClick={() => setActiveId(cal.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    active
                      ? "border-transparent text-white"
                      : "border-gray-200 bg-white text-gray-500"
                  }`}
                  style={active ? { backgroundColor: cal.color } : undefined}
                  aria-pressed={active}
                >
                  {!active && (
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cal.color }}
                      aria-hidden
                    />
                  )}
                  <span className="truncate max-w-[100px]">{cal.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 요일 헤더 (일=빨강, 토=파랑) */}
        <div className="grid grid-cols-7 text-center text-xs mb-1">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={
                i === 0
                  ? "text-red-500"
                  : i === 6
                  ? "text-blue-500"
                  : "text-gray-400"
              }
            >
              {w}
            </div>
          ))}
        </div>

        {/* 월 그리드 (주 행 + 막대 오버레이) */}
        <div className="flex flex-col gap-px bg-gray-100 rounded-lg overflow-hidden">
          {weeks.map((week, wi) => {
            const hasOverflow = week.overflow.some((n) => n > 0);
            return (
              <div
                key={wi}
                className="relative grid grid-cols-7 gap-px bg-gray-100"
              >
                {/* 배경: 날짜 칸 */}
                {week.days.map((d) => {
                  const key = dateKey(d);
                  const inMonth = d.getMonth() + 1 === viewDate.month;
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDay;
                  const dow = d.getDay();
                  const isHolidayDay = items.some(
                    (it) =>
                      it.isHoliday &&
                      it.startKey <= key &&
                      key <= it.endKey
                  );
                  const numberColor = !inMonth
                    ? "text-gray-300"
                    : dow === 0 || isHolidayDay
                    ? "text-red-500"
                    : dow === 6
                    ? "text-blue-500"
                    : "text-gray-700";
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDay(key)}
                      className={`min-h-[92px] sm:min-h-[104px] bg-white pt-1 flex flex-col items-center ${
                        isSelected ? "ring-2 ring-inset ring-sky-400 relative z-20" : ""
                      }`}
                    >
                      <span
                        className={`text-xs leading-none flex items-center justify-center h-5 w-5 rounded-full ${
                          isToday
                            ? "bg-sky-500 text-white font-semibold"
                            : numberColor
                        }`}
                      >
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}

                {/* 오버레이: 막대 레인 */}
                <div className="absolute inset-x-0 top-[26px] bottom-0 px-px flex flex-col gap-0.5 pointer-events-none z-10">
                  {week.lanes.map((segs, lane) => (
                    <div key={lane} className="grid grid-cols-7 gap-px h-[15px]">
                      {segs.map((seg) => {
                        const { item, colStart, span, roundLeft, roundRight } = seg;
                        const label =
                          !item.allDay && item.event.start
                            ? `${hhmm(new Date(item.event.start))} ${item.event.summary}`
                            : item.event.summary;
                        return (
                          <button
                            key={item.event.id}
                            onClick={() =>
                              item.isHoliday
                                ? setSelectedDay(item.startKey > dateKey(week.days[0]) ? item.startKey : dateKey(week.days[0]))
                                : openEdit(item.event)
                            }
                            style={{
                              gridColumn: `${colStart + 1} / span ${span}`,
                              backgroundColor: item.color,
                            }}
                            className={`pointer-events-auto h-full min-w-0 px-1 text-[10px] leading-[15px] text-white truncate text-left ${
                              roundLeft ? "rounded-l-sm" : ""
                            } ${roundRight ? "rounded-r-sm" : ""}`}
                            title={item.event.summary}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {hasOverflow && (
                    <div className="grid grid-cols-7 gap-px">
                      {week.overflow.map((n, c) =>
                        n > 0 ? (
                          <span
                            key={c}
                            style={{ gridColumn: `${c + 1}` }}
                            className="text-[9px] leading-none text-gray-400 pl-0.5"
                          >
                            +{n}
                          </span>
                        ) : (
                          <span key={c} style={{ gridColumn: `${c + 1}` }} />
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 선택한 날짜 상세 */}
        <div className="mt-4">
          {!selectedDay ? (
            <p className="text-gray-400 text-sm">날짜를 탭하면 일정이 표시됩니다.</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">
                  {formatDayHeading(selectedDay)}
                </h3>
                {canWrite && (
                  <button
                    onClick={() => openCreate(selectedDay)}
                    className="text-xs text-sky-600 hover:underline"
                  >
                    + 이 날 일정 추가
                  </button>
                )}
              </div>

              {selectedHolidays.length === 0 && selectedEvents.length === 0 ? (
                <p className="text-gray-400 text-sm">일정이 없습니다.</p>
              ) : (
                <ul className="space-y-1">
                  {selectedHolidays.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-start gap-2 p-1.5 text-sm text-red-500"
                    >
                      <span className="w-12 shrink-0 text-xs text-red-400 mt-0.5">
                        공휴일
                      </span>
                      <span className="min-w-0 truncate">{h.summary}</span>
                    </li>
                  ))}
                  {selectedEvents.map((event) => (
                    <li key={event.id}>
                      <button
                        onClick={() => openEdit(event)}
                        className="w-full flex items-start gap-2 rounded-lg p-1.5 text-left hover:bg-gray-50"
                      >
                        <span className="text-xs text-gray-400 mt-0.5 shrink-0 w-12">
                          {formatTime(event.start)}
                        </span>
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: activeCal?.color ?? "#9ca3af" }}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="text-sm leading-snug">{event.summary}</span>
                          {event.location && (
                            <span className="block text-xs text-gray-400 truncate">
                              {event.location}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </Card>

      {modal && (
        <EventFormModal
          mode={modal.mode}
          initial={modal.initial}
          calendars={writableCalendars}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      {children}
    </div>
  );
}

function blankEvent(dayKey: string, calendarId: string): EventInitial {
  return {
    calendarId,
    summary: "",
    allDay: false,
    date: dayKey,
    endDate: dayKey,
    startTime: "09:00",
    endTime: "10:00",
    location: "",
    description: "",
  };
}

function toEventInitial(event: CalendarEvent): EventInitial {
  const base = {
    eventId: event.eventId,
    calendarId: event.calendarId,
    summary: event.summary,
    location: event.location ?? "",
    description: "",
  };
  if (isAllDay(event.start)) {
    let endDate = event.start;
    if (event.end && isAllDay(event.end) && event.end > event.start) {
      endDate = subtractOneDay(event.end); // Google 종일 종료는 exclusive
    }
    return {
      ...base,
      allDay: true,
      date: event.start,
      endDate,
      startTime: "09:00",
      endTime: "10:00",
    };
  }
  const s = new Date(event.start);
  const e = event.end ? new Date(event.end) : new Date(s.getTime() + 3600000);
  return {
    ...base,
    allDay: false,
    date: dateKey(s),
    endDate: dateKey(s),
    startTime: hhmm(s),
    endTime: hhmm(e),
  };
}

function hhmm(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function subtractOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// 일정의 포함 날짜 범위(inclusive) → { startKey, endKey } 둘 다 "YYYY-MM-DD"
function eventRange(event: CalendarEvent): { startKey: string; endKey: string } {
  if (isAllDay(event.start)) {
    let endKey = event.start;
    if (event.end && isAllDay(event.end) && event.end > event.start) {
      endKey = subtractOneDay(event.end); // Google 종일 종료는 exclusive
    }
    return { startKey: event.start, endKey };
  }
  const s = new Date(event.start);
  const startKey = dateKey(s);
  if (!event.end) return { startKey, endKey: startKey };
  const e = new Date(event.end);
  let endKey = dateKey(e);
  // 자정 종료이고 다른 날이면 전날까지로 보정(시작 < 종료일 때만)
  if (
    endKey > startKey &&
    e.getHours() === 0 &&
    e.getMinutes() === 0 &&
    e.getSeconds() === 0
  ) {
    endKey = subtractOneDay(endKey);
  }
  return { startKey, endKey: endKey < startKey ? startKey : endKey };
}

// 한 주(7일)의 막대 레이아웃: 레인별 세그먼트 + 날짜별 숨김(+N) 개수
function weekLayout(
  weekDays: Date[],
  items: CalItem[]
): { lanes: Segment[][]; overflow: number[] } {
  const weekStart = dateKey(weekDays[0]);
  const weekEnd = dateKey(weekDays[6]);
  const lanes: Segment[][] = Array.from({ length: MAX_LANES }, () => []);
  const overflow = new Array(7).fill(0);
  for (const item of items) {
    if (item.endKey < weekStart || item.startKey > weekEnd) continue;
    const segStart = item.startKey > weekStart ? item.startKey : weekStart;
    const segEnd = item.endKey < weekEnd ? item.endKey : weekEnd;
    const colStart = weekDays.findIndex((d) => dateKey(d) === segStart);
    const colEnd = weekDays.findIndex((d) => dateKey(d) === segEnd);
    if (colStart < 0 || colEnd < 0) continue;
    if (item.lane >= MAX_LANES) {
      for (let c = colStart; c <= colEnd; c++) overflow[c]++;
      continue;
    }
    lanes[item.lane].push({
      item,
      colStart,
      span: colEnd - colStart + 1,
      roundLeft: item.startKey >= weekStart,
      roundRight: item.endKey <= weekEnd,
    });
  }
  return { lanes, overflow };
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
