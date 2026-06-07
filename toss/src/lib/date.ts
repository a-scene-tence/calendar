import type { CalendarEvent } from './types';

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseYmd(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 월 그리드의 6주 셀(일요일 시작) — 항상 42칸
export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

export function isSameMonth(d: Date, year: number, month: number): boolean {
  return d.getFullYear() === year && d.getMonth() === month;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// 일정 시작/끝 ISO/YYYY-MM-DD를 일 단위 키 범위로 변환
function eventDayRange(ev: CalendarEvent): { startKey: string; endKey: string } {
  const startKey = ev.start.slice(0, 10);
  if (!ev.end) return { startKey, endKey: startKey };
  // end가 다음날 00:00이면 같은 날로 취급(allDay 종료 관례)
  const endDate = new Date(ev.end);
  if (ev.allDay) {
    const ek = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    return { startKey, endKey: ymd(ek) };
  }
  return { startKey, endKey: ev.end.slice(0, 10) };
}

export function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const { startKey, endKey } = eventDayRange(ev);
    const start = parseYmd(startKey);
    const end = parseYmd(endKey);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = ymd(d);
      const arr = map.get(k) ?? [];
      arr.push(ev);
      map.set(k, arr);
    }
  }
  // 정렬: 종일 먼저, 그 다음 시작 시각순
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.start.localeCompare(b.start);
    });
  }
  return map;
}

export function monthLabel(year: number, month: number): string {
  return `${year}년 ${month + 1}월`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
