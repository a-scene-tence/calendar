import { createClient } from "@/lib/supabase/server";
import { refreshGoogleToken } from "@/lib/google-token";
import { NextRequest, NextResponse } from "next/server";

const EXCLUDED_NAMES = new Set(["재경본부"]);
const HOLIDAY_NAME = "대한민국의 휴일";
const HOLIDAY_ID_PART = "holiday@group.v.calendar.google.com";

export async function GET(request: NextRequest) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  // 캐시된 refresh 토큰을 우선 사용(만료 임박 시 자동 갱신),
  // 실패 시 세션의 provider_token(최초 로그인 1시간 이내)으로 폴백.
  let token = await refreshGoogleToken(supabase);
  if (!token) token = session?.provider_token ?? null;
  if (!token) {
    return NextResponse.json(
      { error: "No Google token. Re-login required." },
      { status: 401 }
    );
  }

  // 표시할 월: ?year=&month=(1-12), 없으면 현재 월. 그리드 앞뒤 주를 위해 ±7일 패딩.
  // 검색: ?q= 가 있으면 현재 기준 ±6개월 범위에서 전 캘린더 검색.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const PAD_DAYS = 7;
  const now = new Date();
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim();

  let timeMin: string;
  let timeMax: string;
  if (q) {
    // 전체 기간 검색
    timeMin = "2000-01-01T00:00:00Z";
    timeMax = "2100-01-01T00:00:00Z";
  } else {
    const year = Number(params.get("year")) || now.getFullYear();
    const month = Number(params.get("month")) || now.getMonth() + 1; // 1-12
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0); // 해당 월 말일
    timeMin = new Date(monthStart.getTime() - PAD_DAYS * DAY_MS).toISOString();
    timeMax = new Date(
      monthEnd.getTime() + (PAD_DAYS + 1) * DAY_MS
    ).toISOString();
  }

  let listRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${token}` } }
  );

  // 토큰 만료(401) 시 갱신 후 재시도 1회
  if (listRes.status === 401) {
    const refreshed = await refreshGoogleToken(supabase);
    if (!refreshed) {
      return NextResponse.json(
        { error: "Token expired. Re-login required." },
        { status: 401 }
      );
    }
    token = refreshed;
    listRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      { headers: { Authorization: `Bearer ${token}` } }
    );
  }

  if (!listRes.ok) {
    return NextResponse.json({ error: "Calendar API failed" }, { status: 502 });
  }

  const headers = { Authorization: `Bearer ${token}` };

  const listJson = await listRes.json();
  const calendars: Array<{
    id: string;
    summary?: string;
    summaryOverride?: string;
    backgroundColor?: string;
    selected?: boolean;
    accessRole?: string;
  }> = (listJson.items ?? [])
    .filter((c: { selected?: boolean }) => c.selected !== false)
    .filter((c: { summary?: string; summaryOverride?: string }) => {
      const name = c.summaryOverride ?? c.summary ?? "";
      return !EXCLUDED_NAMES.has(name); // 재경본부만 완전 제외(공휴일은 포함)
    });

  // 검색 모드: 전 캘린더에서 q 매칭 일정을 평면 목록으로 반환
  if (q) {
    const searchParams = new URLSearchParams({
      timeMin,
      timeMax,
      q,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const perCal = await Promise.all(
      calendars.map(async (cal) => {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            cal.id
          )}/events?${searchParams}`,
          { headers }
        );
        if (!res.ok) return [];
        const name = cal.summaryOverride ?? cal.summary ?? "(이름 없음)";
        const isHoliday =
          name === HOLIDAY_NAME || cal.id.includes(HOLIDAY_ID_PART);
        const color = cal.backgroundColor ?? "#9ca3af";
        return ((await res.json()).items ?? [])
          .map(
            (item: {
              id: string;
              summary?: string;
              description?: string;
              start?: { dateTime?: string; date?: string };
              end?: { dateTime?: string; date?: string };
              originalStartTime?: { dateTime?: string; date?: string };
              recurringEventId?: string;
              recurrence?: string[];
              location?: string;
            }) => ({
              id: `${cal.id}:${item.id}`,
              eventId: item.id,
              calendarId: cal.id,
              calendarName: name,
              color,
              isHoliday,
              summary: item.summary ?? "(제목 없음)",
              description: item.description,
              start: item.start?.dateTime ?? item.start?.date ?? "",
              end: item.end?.dateTime ?? item.end?.date ?? "",
              originalStartTime:
                item.originalStartTime?.dateTime ??
                item.originalStartTime?.date,
              recurringEventId: item.recurringEventId,
              recurrence: item.recurrence,
              location: item.location,
            })
          )
          .filter((e: { start: string }) => e.start);
      })
    );
    const results = perCal
      .flat()
      .sort((a, b) => a.start.localeCompare(b.start));
    return NextResponse.json({ results });
  }

  const eventParams = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "100",
  });

  const grouped = await Promise.all(
    calendars.map(async (cal) => {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          cal.id
        )}/events?${eventParams}`,
        { headers }
      );

      if (!res.ok) {
        console.warn(
          `[calendar] events fetch failed: ${cal.summary ?? cal.id} → ${res.status}`
        );
      }

      const events = res.ok
        ? ((await res.json()).items ?? [])
            .map(
              (item: {
                id: string;
                summary?: string;
                description?: string;
                start?: { dateTime?: string; date?: string };
                end?: { dateTime?: string; date?: string };
                originalStartTime?: { dateTime?: string; date?: string };
                recurringEventId?: string;
                recurrence?: string[];
                location?: string;
              }) => ({
                id: `${cal.id}:${item.id}`,
                eventId: item.id,
                calendarId: cal.id,
                summary: item.summary ?? "(제목 없음)",
                description: item.description,
                start: item.start?.dateTime ?? item.start?.date ?? "",
                end: item.end?.dateTime ?? item.end?.date ?? "",
                originalStartTime:
                  item.originalStartTime?.dateTime ??
                  item.originalStartTime?.date,
                recurringEventId: item.recurringEventId,
                recurrence: item.recurrence,
                location: item.location,
              })
            )
            .filter((e: { start: string }) => e.start)
            .sort((a: { start: string }, b: { start: string }) =>
              a.start.localeCompare(b.start)
            )
        : [];

      const name = cal.summaryOverride ?? cal.summary ?? "(이름 없음)";
      return {
        id: cal.id,
        name,
        color: cal.backgroundColor ?? "#9ca3af",
        accessRole: cal.accessRole ?? "reader",
        isHoliday: name === HOLIDAY_NAME || cal.id.includes(HOLIDAY_ID_PART),
        events,
      };
    })
  );

  // 사용자 지정 카테고리 순서 (컬럼 미적용 환경에서도 안전)
  let categoryOrder: string[] = [];
  try {
    const { data: prefs } = await supabase
      .from("user_tokens")
      .select("category_order")
      .maybeSingle();
    if (Array.isArray(prefs?.category_order)) {
      categoryOrder = (prefs.category_order as unknown[]).filter(
        (x): x is string => typeof x === "string"
      );
    }
  } catch {
    // 무시 — 빈 배열
  }

  return NextResponse.json({ calendars: grouped, categoryOrder });
}
