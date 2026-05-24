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

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

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
    maxResults: "20",
  });

  const perCalendar = await Promise.all(
    calendars.map(async (cal) => {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
          cal.id
        )}/events?${eventParams}`,
        { headers }
      );
      if (!res.ok) return [];
      const json = await res.json();
      return (json.items ?? []).map(
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
          calendarName: cal.summaryOverride ?? cal.summary ?? "",
          color: cal.backgroundColor ?? "#9ca3af",
        })
      );
    })
  );

  const events = perCalendar
    .flat()
    .filter((e) => e.start)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 15);

  return NextResponse.json({ events });
}
