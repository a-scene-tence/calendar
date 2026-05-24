import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
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

  const providerToken = session?.provider_token;
  if (!providerToken) {
    return NextResponse.json(
      { error: "No Google token. Re-login required." },
      { status: 401 }
    );
  }

  const headers = { Authorization: `Bearer ${providerToken}` };

  const DAY_MS = 24 * 60 * 60 * 1000;
  const PAST_DAYS = 7;
  const FUTURE_DAYS = 14;
  const now = new Date();
  const timeMin = new Date(now.getTime() - PAST_DAYS * DAY_MS).toISOString();
  const timeMax = new Date(now.getTime() + FUTURE_DAYS * DAY_MS).toISOString();

  const listRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers }
  );
  if (!listRes.ok) {
    return NextResponse.json({ error: "Calendar API failed" }, { status: 502 });
  }

  const listJson = await listRes.json();
  const calendars: Array<{
    id: string;
    summary?: string;
    summaryOverride?: string;
    backgroundColor?: string;
    selected?: boolean;
  }> = (listJson.items ?? []).filter(
    (c: { selected?: boolean }) => c.selected !== false
  );

  const eventParams = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "50",
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

      return {
        id: cal.id,
        name: cal.summaryOverride ?? cal.summary ?? "(이름 없음)",
        color: cal.backgroundColor ?? "#9ca3af",
        events,
      };
    })
  );

  return NextResponse.json({ calendars: grouped });
}
