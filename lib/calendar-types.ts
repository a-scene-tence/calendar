// 로컬 우선 캘린더의 공유 타입. start/end: 종일="YYYY-MM-DD",
// 시간="YYYY-MM-DDTHH:mm:ss". 종일 end는 exclusive(다음 날)로 저장(기존 UI 계약 유지).

export type CalendarEvent = {
  id: string; // `${calendarId}:${eventId}`
  eventId: string;
  calendarId: string;
  summary: string;
  start: string;
  end?: string;
  location?: string;
  description?: string;
};

export type Calendar = {
  id: string;
  name: string;
  color: string;
  isHoliday?: boolean;
  events: CalendarEvent[];
};

export type SearchResult = {
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

// EventFormModal이 보내는 입력(payload) 형태
export type EventInput = {
  eventId?: string;
  calendarId: string;
  summary: string;
  allDay: boolean;
  date?: string;
  endDate?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  description?: string;
};
