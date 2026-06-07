import type { CalendarEvent, Category } from './types';
import { ymd, parseYmd } from './date';

// 그리드 막대 렌더용 — 레인 배정된 캘린더 아이템(메인 앱 CalendarMonth 이식)
export type CalItem = {
  event: CalendarEvent;
  startKey: string; // 포함 첫날 "YYYY-MM-DD"
  endKey: string; // 포함 마지막날 "YYYY-MM-DD"
  isHoliday: boolean;
  holidayName?: string;
  allDay: boolean;
  color: string;
  label: string;
  lane: number;
};

// 한 주 안에서 막대가 차지하는 열 범위
export type Segment = {
  item: CalItem;
  colStart: number; // 0-6
  span: number; // 칸 수
  roundLeft: boolean;
  roundRight: boolean;
};

export const MAX_LANES = 3;
export const HOLIDAY_COLOR = '#ef4444'; // red-500

export function dateKey(d: Date): string {
  return ymd(d);
}

// 일정의 포함 날짜 범위(inclusive). toss 모델은 allDay 종료가 inclusive(메인 앱의 Google
// exclusive 관례와 다름)라 별도 보정 없음.
export function eventRange(ev: CalendarEvent): { startKey: string; endKey: string } {
  const startKey = ev.start.slice(0, 10);
  if (!ev.end) return { startKey, endKey: startKey };
  let endKey = ev.end.slice(0, 10);
  if (endKey < startKey) endKey = startKey;
  return { startKey, endKey };
}

// 보이는 카테고리 일정 + 공휴일을 통합해 전역 레인 배정(주 경계 넘어도 같은 레인 유지)
export function buildItems(
  events: CalendarEvent[],
  categoriesById: Map<string, Category>,
  visibleIds: Set<string>,
  holidays: { key: string; name: string }[]
): CalItem[] {
  const raw: Omit<CalItem, 'lane'>[] = [];

  for (const ev of events) {
    const catId = ev.categoryId ?? '';
    // 카테고리 미지정 일정도 항상 표시(보이는 카테고리가 없을 때 사라지지 않게)
    if (catId && visibleIds.size > 0 && !visibleIds.has(catId)) continue;
    const cat = categoriesById.get(catId);
    const { startKey, endKey } = eventRange(ev);
    raw.push({
      event: ev,
      startKey,
      endKey,
      isHoliday: false,
      allDay: ev.allDay,
      color: ev.color ?? cat?.color ?? '#A8C8EF',
      label: ev.title || '(제목 없음)',
    });
  }

  // 공휴일(단일 날짜, 항상 표시)
  for (const h of holidays) {
    raw.push({
      event: {
        id: `holiday:${h.key}:${h.name}`,
        title: h.name,
        start: h.key,
        end: h.key,
        allDay: true,
      },
      startKey: h.key,
      endKey: h.key,
      isHoliday: true,
      holidayName: h.name,
      allDay: true,
      color: HOLIDAY_COLOR,
      label: h.name,
    });
  }

  // 시작일 오름차순 → 공휴일 우선 → 긴 기간 우선
  raw.sort((a, b) => {
    if (a.startKey !== b.startKey) return a.startKey < b.startKey ? -1 : 1;
    if (a.isHoliday !== b.isHoliday) return a.isHoliday ? -1 : 1;
    return b.endKey.localeCompare(a.endKey);
  });

  // 그리디 레인 배정
  const laneEnds: string[] = [];
  return raw.map((it) => {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= it.startKey) lane++;
    laneEnds[lane] = it.endKey;
    return { ...it, lane };
  });
}

// 한 주(7일)의 막대 레이아웃: 레인별 세그먼트 + 날짜별 숨김(+N) 개수
export function weekLayout(
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

// 배경색 밝기(YIQ)에 따라 대비되는 글씨색
export function barTextColor(bg: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return '#ffffff';
  let hex = m[1];
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? '#1f2937' : '#ffffff';
}

// 주 단위로 6주 분할
export function splitWeeks(gridDays: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let i = 0; i < gridDays.length; i += 7) weeks.push(gridDays.slice(i, i + 7));
  return weeks;
}

// 선택일을 포함하는 아이템(다일이면 중간 날에도)
export function itemsOnDay(items: CalItem[], dayKey: string): CalItem[] {
  return items.filter((it) => it.startKey <= dayKey && dayKey <= it.endKey);
}

export function parseDayKey(key: string): Date {
  return parseYmd(key);
}
