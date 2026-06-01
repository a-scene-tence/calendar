"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EventFormModal, {
  EventInitial,
  WritableCalendar,
} from "@/components/EventFormModal";
import CalendarManageModal from "@/components/CalendarManageModal";

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

// 검색 결과(여러 달·전 캘린더)
type SearchResult = {
  id: string;
  eventId: string;
  calendarId: string;
  calendarName: string;
  color: string;
  isHoliday: boolean;
  summary: string;
  start: string;
  end?: string;
  location?: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_LANES = 3; // 칸당 최대 막대 레인 수(초과분은 +N)
const HOLIDAY_COLOR = "#ef4444"; // 공휴일 막대색(red-500)

export default function CalendarMonth() {
  const today = new Date();
  const [viewDate, setViewDate] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1, // 1-12
  });
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [categoryOrder, setCategoryOrder] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState<"single" | "multi">("single");
  const [orderSaveError, setOrderSaveError] = useState<string | null>(null);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const [manageOpen, setManageOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(dateKey(today));
  const [status, setStatus] = useState<Status>("loading");
  const [modal, setModal] = useState<
    { mode: "create" | "edit"; initial: EventInitial } | null
  >(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const orderSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOrderRef = useRef<string[] | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const flushOrderSave = useCallback(async () => {
    if (!orderSaveTimer.current || !pendingOrderRef.current) return;
    clearTimeout(orderSaveTimer.current);
    orderSaveTimer.current = null;
    const body = JSON.stringify({ categoryOrder: pendingOrderRef.current });
    pendingOrderRef.current = null;
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setOrderSaveError(j.error ?? `순서 저장 실패 (${res.status})`);
      } else {
        setOrderSaveError(null);
      }
    } catch {
      setOrderSaveError("순서 저장 실패 (네트워크 오류)");
    }
  }, []);

  const load = useCallback(
    async (opts: { withOrder?: boolean } = {}) => {
      // 사용자 지정 순서를 서버 값으로 동기화하기 전에 디바운스 중인 PUT을 먼저 반영.
      if (opts.withOrder) await flushOrderSave();
      setStatus("loading");
      try {
        const r = await fetch(
          `/api/calendar?year=${viewDate.year}&month=${viewDate.month}`
        );
        if (r.status === 401) {
          setStatus("unauthorized");
          return;
        }
        if (!r.ok) {
          setStatus("error");
          return;
        }
        const data = await r.json();
        setCalendars(data.calendars ?? []);
        if (opts.withOrder && Array.isArray(data.categoryOrder)) {
          setCategoryOrder(data.categoryOrder);
        }
        setStatus("ok");
      } catch {
        setStatus("error");
      }
    },
    [viewDate.year, viewDate.month, flushOrderSave]
  );

  useEffect(() => {
    load({ withOrder: true });
  }, [load]);

  // 카테고리(공휴일 제외) — 사용자 지정 순서(categoryOrder) 우선, 나머지는 Google 기본 순.
  const categoryCalendars = useMemo(() => {
    const cats = calendars.filter((c) => !c.isHoliday);
    const idx = new Map(categoryOrder.map((id, i) => [id, i]));
    return cats.slice().sort((a, b) => {
      const ia = idx.has(a.id) ? (idx.get(a.id) as number) : Infinity;
      const ib = idx.has(b.id) ? (idx.get(b.id) as number) : Infinity;
      if (ia !== ib) return ia - ib;
      return 0;
    });
  }, [calendars, categoryOrder]);

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

  // 칩: 카테고리만(공휴일은 토글 없이 항상 표시)
  const chipCalendars = categoryCalendars;

  // 관리 가능한(소유) 카테고리
  const ownerCategories = useMemo(
    () =>
      categoryCalendars
        .filter((c) => c.accessRole === "owner")
        .map((c) => ({ id: c.id, name: c.name, color: c.color })),
    [categoryCalendars]
  );

  // visibleIds(카테고리만) 유효성 보장 + 최초 기본값(첫 카테고리)
  useEffect(() => {
    if (categoryCalendars.length === 0) return;
    setVisibleIds((prev) => {
      const valid = new Set(
        [...prev].filter((id) => categoryCalendars.some((c) => c.id === id))
      );
      if (valid.size === 0 && categoryCalendars[0]) {
        valid.add(categoryCalendars[0].id);
      }
      return valid;
    });
  }, [categoryCalendars]);

  // 보이는 카테고리 + 모든 공휴일(공휴일은 항상 표시)
  const visibleCalendars = useMemo(
    () => [
      ...categoryCalendars.filter((c) => visibleIds.has(c.id)),
      ...holidayCalendars,
    ],
    [categoryCalendars, holidayCalendars, visibleIds]
  );

  // 보이는 모든 캘린더의 일정을 통합해 전역 레인 배정(주 경계 넘어도 같은 레인 유지)
  const items = useMemo<CalItem[]>(() => {
    const raw: Omit<CalItem, "lane">[] = [];
    for (const cal of visibleCalendars) {
      const color = cal.isHoliday ? HOLIDAY_COLOR : cal.color;
      for (const event of cal.events) {
        const { startKey, endKey } = eventRange(event);
        raw.push({
          event,
          startKey,
          endKey,
          isHoliday: !!cal.isHoliday,
          allDay: isAllDay(event.start),
          color,
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
  }, [visibleCalendars]);

  function toggleChip(cal: Calendar) {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (selectMode === "single") {
        for (const c of categoryCalendars) next.delete(c.id);
        next.add(cal.id);
      } else if (next.has(cal.id)) {
        next.delete(cal.id);
      } else {
        next.add(cal.id);
      }
      return next;
    });
  }
  function changeMode(mode: "single" | "multi") {
    setSelectMode(mode);
    if (mode === "single") {
      setVisibleIds((prev) => {
        const next = new Set(prev);
        const visCats = categoryCalendars.filter((c) => next.has(c.id));
        for (const c of visCats.slice(1)) next.delete(c.id);
        return next;
      });
    }
  }

  // 사용자 지정 카테고리 순서 갱신(낙관적: 즉시 반영 + 디바운스 백그라운드 저장)
  function handleOrderChange(newOrder: string[]) {
    setCategoryOrder(newOrder);
    setOrderSaveError(null);
    pendingOrderRef.current = newOrder;
    if (orderSaveTimer.current) clearTimeout(orderSaveTimer.current);
    orderSaveTimer.current = setTimeout(() => {
      void flushOrderSave();
    }, 250);
  }

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
  function onGridTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onGridTouchEnd(e: React.TouchEvent) {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) goNext();
    else goPrev();
  }
  function goToday() {
    const t = new Date();
    setViewDate({ year: t.getFullYear(), month: t.getMonth() + 1 });
    setSelectedDay(dateKey(t));
  }

  function defaultCalId(): string {
    const visibleWritable = writableCalendars.find((c) => visibleIds.has(c.id));
    return visibleWritable?.id ?? writableCalendars[0]?.id ?? "";
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
    if (searchQuery) runSearch(searchQuery);
  }

  async function runSearch(qStr: string) {
    const q = qStr.trim();
    if (!q) {
      clearSearch();
      return;
    }
    setSearchQuery(q);
    setSearching(true);
    try {
      const r = await fetch(`/api/calendar?q=${encodeURIComponent(q)}`);
      if (r.ok) {
        const d = await r.json();
        setSearchResults(d.results ?? []);
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }
  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
    setSearchResults([]);
    setSearching(false);
  }

  if (status === "unauthorized") {
    return (
      <Card>
        <p className="text-amber-600 text-sm">
          세션이 만료되었습니다(Google 토큰 만료).{" "}
          <a href="/login" className="text-brand font-semibold underline">
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
    .sort((a, b) => {
      const aAll = isAllDay(a.event.start);
      const bAll = isAllDay(b.event.start);
      if (aAll !== bAll) return aAll ? -1 : 1; // 종일/다일 먼저
      return a.event.start.localeCompare(b.event.start);
    });
  const canWrite = writableCalendars.length > 0;

  return (
    <>
      <Card>
        {/* 헤더: 년/월 드롭다운 이동 */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
          <div className="flex items-center gap-1">
            <select
              value={viewDate.year}
              onChange={(e) => {
                setSelectedDay(null);
                setViewDate((v) => ({ ...v, year: Number(e.target.value) }));
              }}
              className="rounded-xl border border-transparent bg-gray-50 px-2.5 py-1 text-sm font-bold text-gray-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
              aria-label="연도 선택"
            >
              {Array.from({ length: 11 }, (_, i) => today.getFullYear() - 5 + i).map(
                (y) => (
                  <option key={y} value={y}>
                    {y}년
                  </option>
                )
              )}
            </select>
            <select
              value={viewDate.month}
              onChange={(e) => {
                setSelectedDay(null);
                setViewDate((v) => ({ ...v, month: Number(e.target.value) }));
              }}
              className="rounded-xl border border-transparent bg-gray-50 px-2.5 py-1 text-sm font-bold text-gray-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
              aria-label="월 선택"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-0.5 ml-auto">
            {canWrite && (
              <button
                onClick={() => openCreate(selectedDay)}
                className="px-2.5 py-1 mr-0.5 text-brand bg-brand-50 hover:bg-brand-100 rounded-xl text-xs font-semibold transition active:scale-95"
              >
                + 일정
              </button>
            )}
            <button
              onClick={goPrev}
              className="h-7 w-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-xl text-base transition active:scale-90"
              aria-label="이전 달"
            >
              ‹
            </button>
            <button
              onClick={goToday}
              className="px-2.5 py-1 text-gray-700 hover:bg-gray-100 rounded-xl text-xs font-semibold transition active:scale-95"
            >
              오늘
            </button>
            <button
              onClick={goNext}
              className="h-7 w-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-xl text-base transition active:scale-90"
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
        </div>

        {/* 검색 */}
        <div className="mb-2.5 flex items-center gap-1.5">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(searchInput);
            }}
            placeholder="일정 검색 (제목·메모, 전체 기간)"
            className="flex-1 min-w-0 rounded-xl border border-transparent bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15"
          />
          <button
            onClick={() => runSearch(searchInput)}
            className="px-3 py-2 rounded-xl bg-brand text-white text-sm font-semibold shrink-0 transition hover:bg-brand-hover active:scale-95"
          >
            검색
          </button>
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="px-2.5 py-2 rounded-xl bg-gray-100 text-gray-500 text-sm shrink-0 transition hover:bg-gray-200 active:scale-95"
              aria-label="검색 닫기"
            >
              ✕
            </button>
          )}
        </div>

        {searchQuery ? (
          <div className="animate-pop">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              ‘{searchQuery}’ 검색 결과
              {searching ? "" : (
                <span className="ml-1.5 text-brand">{searchResults.length}건</span>
              )}
            </h3>
            {searching ? (
              <p className="text-gray-400 text-sm">검색 중…</p>
            ) : searchResults.length === 0 ? (
              <p className="text-gray-400 text-sm">결과가 없습니다.</p>
            ) : (
              <ul className="space-y-0.5">
                {searchResults.map((r) => {
                  const editable =
                    !r.isHoliday &&
                    writableCalendars.some((c) => c.id === r.calendarId);
                  const inner = (
                    <>
                      <span className="text-[11px] font-medium text-gray-500 shrink-0 w-24">
                        {formatResultDate(r.start)}
                      </span>
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{
                          backgroundColor: r.isHoliday ? HOLIDAY_COLOR : r.color,
                        }}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="text-sm font-medium leading-snug text-gray-900">
                          {r.summary}
                        </span>
                        <span className="block text-xs text-gray-400 truncate">
                          {r.calendarName}
                          {r.location ? ` · ${r.location}` : ""}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={r.id}>
                      {editable ? (
                        <button
                          onClick={() => openEdit(r)}
                          className="w-full flex items-start gap-2 rounded-xl p-2 text-left transition hover:bg-gray-50 active:bg-gray-100"
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className="flex items-start gap-2 p-2">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <>
        {/* 카테고리: 단일/다중 + 칩 + 관리 (한 줄 가로 스크롤) */}
        {chipCalendars.length > 0 && (
          <div className="mb-2.5 -mx-3 px-3 sm:-mx-5 sm:px-5 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex p-0.5 rounded-xl bg-gray-100 text-xs shrink-0">
              {(["single", "multi"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => changeMode(m)}
                  className={`px-2.5 py-0.5 rounded-lg font-semibold transition active:scale-95 ${
                    selectMode === m
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500"
                  }`}
                  aria-pressed={selectMode === m}
                >
                  {m === "single" ? "단일" : "다중"}
                </button>
              ))}
            </div>
            {chipCalendars.map((cal) => {
              const on = visibleIds.has(cal.id);
              const color = cal.color;
              return (
                <button
                  key={cal.id}
                  onClick={() => toggleChip(cal)}
                  className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition active:scale-95 ${
                    on
                      ? "border-transparent shadow-sm"
                      : "border-transparent bg-gray-100 text-gray-500"
                  }`}
                  style={
                    on
                      ? { backgroundColor: color, color: barTextColor(color) }
                      : undefined
                  }
                  aria-pressed={on}
                >
                  {!on && (
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                      aria-hidden
                    />
                  )}
                  <span className="truncate max-w-[120px]">{cal.name}</span>
                </button>
              );
            })}
            <button
              onClick={() => setManageOpen(true)}
              className="shrink-0 ml-1 px-2.5 py-1 text-gray-600 hover:bg-gray-100 rounded-full text-xs font-semibold transition active:scale-95"
            >
              관리
            </button>
          </div>
        )}

        {/* 요일 헤더 (일=빨강, 토=파랑) */}
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold mb-1">
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
        <div
          key={`${viewDate.year}-${viewDate.month}`}
          className="flex flex-col gap-px bg-gray-100 rounded-2xl overflow-hidden animate-month"
          onTouchStart={onGridTouchStart}
          onTouchEnd={onGridTouchEnd}
        >
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
                      className="min-h-[68px] sm:min-h-[88px] bg-white pt-1 flex flex-col items-center transition-colors active:bg-gray-50"
                    >
                      <span
                        className={`text-[10px] font-semibold leading-none flex items-center justify-center h-5 w-5 rounded-full transition ${
                          isToday
                            ? "bg-brand text-white"
                            : numberColor
                        }`}
                      >
                        {d.getDate()}
                      </span>
                    </button>
                  );
                })}

                {/* 오버레이: 선택 링(막대 위, 투명 — 막대를 가리지 않음) */}
                <div className="absolute inset-0 grid grid-cols-7 gap-px pointer-events-none z-30">
                  {week.days.map((d) => {
                    const k = dateKey(d);
                    return (
                      <div
                        key={k}
                        className={
                          k === selectedDay
                            ? "ring-2 ring-inset ring-brand rounded-sm transition"
                            : ""
                        }
                      />
                    );
                  })}
                </div>

                {/* 오버레이: 막대 레인 */}
                <div className="absolute inset-x-0 top-[22px] bottom-0 px-px flex flex-col gap-px pointer-events-none z-10">
                  {week.lanes.map((segs, lane) => (
                    <div key={lane} className="grid grid-cols-7 gap-px h-[14px]">
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
                              color: barTextColor(item.color),
                            }}
                            className={`pointer-events-auto h-full min-w-0 px-1 text-[9px] font-semibold leading-[14px] truncate text-left transition active:opacity-80 ${
                              roundLeft ? "rounded-l-md" : ""
                            } ${roundRight ? "rounded-r-md" : ""}`}
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
                            className="text-[9px] font-semibold leading-none text-gray-400 pl-1"
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
        <div className="mt-3 sm:mt-4">
          {!selectedDay ? (
            <p className="text-gray-400 text-xs">날짜를 탭하면 일정이 표시됩니다.</p>
          ) : (
            <div key={selectedDay} className="animate-pop">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-bold text-gray-900">
                  {formatDayHeading(selectedDay)}
                </h3>
                {canWrite && (
                  <button
                    onClick={() => openCreate(selectedDay)}
                    className="text-xs font-semibold text-brand px-2 py-0.5 rounded-lg transition hover:bg-brand-50 active:scale-95"
                  >
                    + 이 날 일정 추가
                  </button>
                )}
              </div>

              {selectedHolidays.length === 0 && selectedEvents.length === 0 ? (
                <p className="text-gray-400 text-sm">일정이 없습니다.</p>
              ) : (
                <ul className="space-y-0.5">
                  {selectedHolidays.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-start gap-2 p-1.5 text-sm text-red-500"
                    >
                      <span className="w-12 shrink-0 text-[11px] font-semibold text-red-400 mt-0.5">
                        공휴일
                      </span>
                      <span className="min-w-0 truncate font-medium">{h.summary}</span>
                    </li>
                  ))}
                  {selectedEvents.map((it) => (
                    <li key={it.event.id}>
                      <button
                        onClick={() => openEdit(it.event)}
                        className="w-full flex items-start gap-2 rounded-xl p-1.5 text-left transition hover:bg-gray-50 active:bg-gray-100"
                      >
                        <span className="text-[11px] font-semibold text-gray-500 mt-0.5 shrink-0 w-12">
                          {formatTime(it.event.start)}
                        </span>
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: it.color }}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="text-sm font-medium leading-snug text-gray-900">
                            {it.event.summary}
                          </span>
                          {it.event.location && (
                            <span className="block text-xs text-gray-400 truncate">
                              {it.event.location}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
          </>
        )}
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

      {manageOpen && (
        <CalendarManageModal
          categories={ownerCategories}
          categoryOrder={categoryOrder}
          onOrderChange={handleOrderChange}
          orderSaveError={orderSaveError}
          onClose={() => setManageOpen(false)}
          onChanged={() => load({ withOrder: true })}
        />
      )}
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-3xl shadow-[0_2px_12px_rgba(0,0,0,0.04)] border border-gray-100 p-3 sm:p-5">
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

// 배경색 밝기(YIQ)에 따라 대비되는 글씨색 반환(밝으면 진회색, 어두우면 흰색)
function barTextColor(bg: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#ffffff";
  let hex = m[1];
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1f2937" : "#ffffff";
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

function formatResultDate(start: string): string {
  if (isAllDay(start)) {
    const [y, m, d] = start.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
  }
  const dt = new Date(start);
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
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
