import type { Calendar, CalendarEvent } from "./calendar-types";

export const HOLIDAY_CALENDAR_ID = "holidays-kr";

// 대한민국 공휴일(2024–2027). 음력 기반(설날·추석·부처님오신날)과 대체공휴일은
// 정부 발표 기준 best-effort. 필요 시 이 표를 직접 수정하면 된다.
const HOLIDAYS: { date: string; name: string }[] = [
  // 2024
  { date: "2024-01-01", name: "신정" },
  { date: "2024-02-09", name: "설날 연휴" },
  { date: "2024-02-10", name: "설날" },
  { date: "2024-02-11", name: "설날 연휴" },
  { date: "2024-02-12", name: "대체공휴일(설날)" },
  { date: "2024-03-01", name: "삼일절" },
  { date: "2024-04-10", name: "제22대 국회의원선거" },
  { date: "2024-05-05", name: "어린이날" },
  { date: "2024-05-06", name: "대체공휴일(어린이날)" },
  { date: "2024-05-15", name: "부처님오신날" },
  { date: "2024-06-06", name: "현충일" },
  { date: "2024-08-15", name: "광복절" },
  { date: "2024-09-16", name: "추석 연휴" },
  { date: "2024-09-17", name: "추석" },
  { date: "2024-09-18", name: "추석 연휴" },
  { date: "2024-10-03", name: "개천절" },
  { date: "2024-10-09", name: "한글날" },
  { date: "2024-12-25", name: "성탄절" },
  // 2025
  { date: "2025-01-01", name: "신정" },
  { date: "2025-01-28", name: "설날 연휴" },
  { date: "2025-01-29", name: "설날" },
  { date: "2025-01-30", name: "설날 연휴" },
  { date: "2025-03-01", name: "삼일절" },
  { date: "2025-03-03", name: "대체공휴일(삼일절)" },
  { date: "2025-05-05", name: "어린이날·부처님오신날" },
  { date: "2025-05-06", name: "대체공휴일" },
  { date: "2025-06-06", name: "현충일" },
  { date: "2025-08-15", name: "광복절" },
  { date: "2025-10-03", name: "개천절" },
  { date: "2025-10-05", name: "추석 연휴" },
  { date: "2025-10-06", name: "추석" },
  { date: "2025-10-07", name: "추석 연휴" },
  { date: "2025-10-08", name: "대체공휴일(추석)" },
  { date: "2025-10-09", name: "한글날" },
  { date: "2025-12-25", name: "성탄절" },
  // 2026
  { date: "2026-01-01", name: "신정" },
  { date: "2026-02-16", name: "설날 연휴" },
  { date: "2026-02-17", name: "설날" },
  { date: "2026-02-18", name: "설날 연휴" },
  { date: "2026-03-01", name: "삼일절" },
  { date: "2026-03-02", name: "대체공휴일(삼일절)" },
  { date: "2026-05-05", name: "어린이날" },
  { date: "2026-05-24", name: "부처님오신날" },
  { date: "2026-05-25", name: "대체공휴일(부처님오신날)" },
  { date: "2026-06-06", name: "현충일" },
  { date: "2026-08-15", name: "광복절" },
  { date: "2026-08-17", name: "대체공휴일(광복절)" },
  { date: "2026-09-24", name: "추석 연휴" },
  { date: "2026-09-25", name: "추석" },
  { date: "2026-09-26", name: "추석 연휴" },
  { date: "2026-10-03", name: "개천절" },
  { date: "2026-10-05", name: "대체공휴일(개천절)" },
  { date: "2026-10-09", name: "한글날" },
  { date: "2026-12-25", name: "성탄절" },
  // 2027
  { date: "2027-01-01", name: "신정" },
  { date: "2027-02-06", name: "설날 연휴" },
  { date: "2027-02-07", name: "설날" },
  { date: "2027-02-08", name: "설날 연휴" },
  { date: "2027-02-09", name: "대체공휴일(설날)" },
  { date: "2027-03-01", name: "삼일절" },
  { date: "2027-05-05", name: "어린이날" },
  { date: "2027-05-13", name: "부처님오신날" },
  { date: "2027-06-06", name: "현충일" },
  { date: "2027-08-15", name: "광복절" },
  { date: "2027-08-16", name: "대체공휴일(광복절)" },
  { date: "2027-09-14", name: "추석 연휴" },
  { date: "2027-09-15", name: "추석" },
  { date: "2027-09-16", name: "추석 연휴" },
  { date: "2027-10-03", name: "개천절" },
  { date: "2027-10-04", name: "대체공휴일(개천절)" },
  { date: "2027-10-09", name: "한글날" },
  { date: "2027-10-11", name: "대체공휴일(한글날)" },
  { date: "2027-12-25", name: "성탄절" },
];

export function buildHolidayCalendar(): Calendar {
  const events: CalendarEvent[] = HOLIDAYS.map((h) => ({
    id: `${HOLIDAY_CALENDAR_ID}:${h.date}`,
    eventId: h.date,
    calendarId: HOLIDAY_CALENDAR_ID,
    summary: h.name,
    start: h.date, // 종일(단일)
  }));
  return {
    id: HOLIDAY_CALENDAR_ID,
    name: "대한민국 공휴일",
    color: "#ef4444",
    isHoliday: true,
    events,
  };
}
