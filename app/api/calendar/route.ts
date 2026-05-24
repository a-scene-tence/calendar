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

  // 세션의 provider_token 사용, 없으면 DB refresh_token으로 갱신 시도
  let token = session?.provider_token ?? null;
  if (!token) {
    token = await refreshGoogleToken(supabase);
    if (!token) {
      return NextResponse.json(
        { error: "No Google token. Re-login required." },
        { status: 401 }
      );
    }
  }

  // 표시할 월: ?year=&month=(1-12), 없으면 현재 월. 그리드 앞뒤 주를 위해 ±7일 패딩.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const PAD_DAYS = 7;
  const now = new Date();
  const params = request.nextUrl.searchParams;
  const year = Number(params.get("year")) || now.getFullYear();
  const month = Number(params.get("month")) || now.getMonth() + 1; // 1-12
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0); // 해당 월 말일
  const timeMin = new Date(monthStart.getTime() - PAD_DAYS * DAY_MS).toISOString();
  const timeMax = new Date(
    monthEnd.getTime() + (PAD_DAYS + 1) * DAY_MS
  ).toISOString();

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
                start?: { dateTime?: string; date?: string };
                end?: { dateTime?: string; date?: string };
                location?: string;
              }) => ({
                id: `${cal.id}:${item.id}`,
                eventId: item.id,
                calendarId: cal.id,
                summary: item.summary ?? "(제목 없음)",
                start: item.start?.dateTime ?? item.start?.date ?? "",
                end: item.end?.dateTime ?? item.end?.date ?? "",
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

  return NextResponse.json({ calendars: grouped });
}
