// localStorage 기반 데이터 계층(클라이언트 전용). 공휴일 캘린더는 저장하지 않고
// 로드 시 내장 데이터로 주입한다(업데이트 용이 + 용량 절약).

import type {
  Calendar,
  CalendarEvent,
  EventInput,
  SearchResult,
} from "./calendar-types";
import { buildHolidayCalendar, HOLIDAY_CALENDAR_ID } from "./holidays";
import { parseIcs, buildIcs } from "./ics";

const KEY = "calendar.v1";

const DEFAULTS: { name: string; color: string }[] = [
  { name: "할일", color: "#3b82f6" },
  { name: "한일", color: "#10b981" },
  { name: "생활", color: "#f59e0b" },
  { name: "기타", color: "#8b5cf6" },
];

function uid(): string {
  return crypto.randomUUID();
}
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

// 저장된 사용자 캘린더(공휴일 제외)만 읽고 쓴다.
function readUser(): Calendar[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && Array.isArray(data.calendars) ? data.calendars : null;
  } catch {
    return null;
  }
}
function writeUser(cals: Calendar[]): void {
  if (typeof window === "undefined") return;
  const userOnly = cals.filter(
    (c) => !c.isHoliday && c.id !== HOLIDAY_CALENDAR_ID
  );
  window.localStorage.setItem(KEY, JSON.stringify({ calendars: userOnly }));
}
function seed(): Calendar[] {
  const cals: Calendar[] = DEFAULTS.map((d) => ({
    id: uid(),
    name: d.name,
    color: d.color,
    events: [],
  }));
  writeUser(cals);
  return cals;
}

export function loadCalendars(): Calendar[] {
  const user = readUser() ?? seed();
  return [...user, buildHolidayCalendar()];
}

export function createCalendar(name: string, color: string): string {
  const user = readUser() ?? seed();
  const id = uid();
  user.push({ id, name: name.trim(), color, events: [] });
  writeUser(user);
  return id;
}

export function updateCalendar(
  id: string,
  patch: { name?: string; color?: string }
): void {
  const user = readUser() ?? [];
  const c = user.find((x) => x.id === id);
  if (!c) return;
  if (patch.name !== undefined) c.name = patch.name.trim();
  if (patch.color !== undefined) c.color = patch.color;
  writeUser(user);
}

export function deleteCalendar(id: string): void {
  if (id === HOLIDAY_CALENDAR_ID) return;
  writeUser((readUser() ?? []).filter((c) => c.id !== id));
}

function buildFields(input: EventInput): { start: string; end?: string } {
  if (input.allDay) {
    const date = input.date!;
    const endIncl = input.endDate || date;
    return { start: date, end: addOneDay(endIncl) }; // 종일 종료는 exclusive
  }
  return { start: input.startDateTime!, end: input.endDateTime };
}

function makeEvent(
  calendarId: string,
  eventId: string,
  input: EventInput
): CalendarEvent {
  const { start, end } = buildFields(input);
  return {
    id: `${calendarId}:${eventId}`,
    eventId,
    calendarId,
    summary: input.summary.trim(),
    start,
    end,
    location: input.location?.trim() || undefined,
    description: input.description?.trim() || undefined,
  };
}

export function createEvent(input: EventInput): void {
  const user = readUser() ?? seed();
  const cal = user.find((c) => c.id === input.calendarId);
  if (!cal) return;
  cal.events.push(makeEvent(cal.id, uid(), input));
  writeUser(user);
}

export function updateEvent(input: EventInput): void {
  if (!input.eventId) return;
  const user = readUser() ?? [];
  // 기존 이벤트를 어느 캘린더에 있든 제거(카테고리 이동 지원)
  for (const c of user) {
    const i = c.events.findIndex((e) => e.eventId === input.eventId);
    if (i >= 0) c.events.splice(i, 1);
  }
  const target = user.find((c) => c.id === input.calendarId);
  if (target) target.events.push(makeEvent(target.id, input.eventId, input));
  writeUser(user);
}

export function deleteEvent(_calendarId: string, eventId: string): void {
  const user = readUser() ?? [];
  for (const c of user) {
    const i = c.events.findIndex((e) => e.eventId === eventId);
    if (i >= 0) c.events.splice(i, 1);
  }
  writeUser(user);
}

export function searchEvents(q: string): SearchResult[] {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  const out: SearchResult[] = [];
  for (const cal of loadCalendars()) {
    for (const e of cal.events) {
      if (
        e.summary.toLowerCase().includes(term) ||
        e.location?.toLowerCase().includes(term)
      ) {
        out.push({
          id: e.id,
          eventId: e.eventId,
          calendarId: cal.id,
          calendarName: cal.name,
          color: cal.color,
          isHoliday: !!cal.isHoliday,
          summary: e.summary,
          start: e.start,
          end: e.end,
          location: e.location,
        });
      }
    }
  }
  out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return out;
}

export function importIcs(text: string, targetCalendarId: string): number {
  const parsed = parseIcs(text);
  const user = readUser() ?? seed();
  const cal = user.find((c) => c.id === targetCalendarId);
  if (!cal) return 0;
  const existing = new Set(cal.events.map((e) => e.eventId));
  let added = 0;
  for (const p of parsed) {
    const eventId = p.uid || uid();
    if (existing.has(eventId)) continue;
    existing.add(eventId);
    cal.events.push({
      id: `${cal.id}:${eventId}`,
      eventId,
      calendarId: cal.id,
      summary: p.summary,
      start: p.start,
      end: p.end,
      location: p.location,
      description: p.description,
    });
    added++;
  }
  writeUser(user);
  return added;
}

export function exportIcs(calendarIds?: string[]): string {
  const cals = loadCalendars().filter(
    (c) => !c.isHoliday && (!calendarIds || calendarIds.includes(c.id))
  );
  const events = cals.flatMap((c) =>
    c.events.map((e) => ({
      uid: e.eventId,
      summary: e.summary,
      start: e.start,
      end: e.end,
      location: e.location,
    }))
  );
  return buildIcs(events);
}
