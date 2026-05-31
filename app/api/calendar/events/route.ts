import { NextRequest, NextResponse } from "next/server";
import { getProviderToken } from "@/lib/auth-token";
import { createClient } from "@/lib/supabase/server";
import { gfetch, readGoogleError } from "@/lib/google-fetch";

const TIME_ZONE = "Asia/Seoul";
const GCAL = "https://www.googleapis.com/calendar/v3/calendars";

function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type EventBody = {
  summary?: string;
  allDay?: boolean;
  date?: string;
  endDate?: string;
  startDateTime?: string;
  endDateTime?: string;
  location?: string;
  description?: string;
};

function buildEventResource(body: EventBody) {
  const resource: Record<string, unknown> = {
    summary: body.summary,
  };
  if (body.location !== undefined) resource.location = body.location;
  if (body.description !== undefined) resource.description = body.description;

  if (body.allDay) {
    if (!body.date) return null;
    resource.start = { date: body.date };
    resource.end = { date: addOneDay(body.endDate || body.date) };
  } else {
    if (!body.startDateTime || !body.endDateTime) return null;
    resource.start = { dateTime: body.startDateTime, timeZone: TIME_ZONE };
    resource.end = { dateTime: body.endDateTime, timeZone: TIME_ZONE };
  }
  return resource;
}

async function failJson(res: Response, fallback: string) {
  const { status, message } = await readGoogleError(res);
  console.warn(`[events] ${fallback}: ${status} ${message}`);
  return NextResponse.json(
    { error: fallback, googleStatus: status, googleMessage: message },
    { status }
  );
}

export async function POST(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;
  const supabase = await createClient();

  const body = await request.json();
  const { calendarId, ...rest } = body as EventBody & { calendarId?: string };
  if (!calendarId || !rest.summary) {
    return NextResponse.json(
      { error: "calendarId, summary 필수" },
      { status: 400 }
    );
  }
  const resource = buildEventResource(rest);
  if (!resource) {
    return NextResponse.json({ error: "날짜/시간이 올바르지 않습니다." }, { status: 400 });
  }

  const { res } = await gfetch(
    supabase,
    auth.token,
    `${GCAL}/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resource),
    }
  );
  if (!res.ok) return failJson(res, "일정 추가 실패");
  return NextResponse.json({ event: await res.json() });
}

export async function PATCH(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;
  const supabase = await createClient();

  const body = await request.json();
  const { calendarId, eventId, ...rest } = body as EventBody & {
    calendarId?: string;
    eventId?: string;
  };
  if (!calendarId || !eventId || !rest.summary) {
    return NextResponse.json(
      { error: "calendarId, eventId, summary 필수" },
      { status: 400 }
    );
  }
  const resource = buildEventResource(rest);
  if (!resource) {
    return NextResponse.json({ error: "날짜/시간이 올바르지 않습니다." }, { status: 400 });
  }

  const { res } = await gfetch(
    supabase,
    auth.token,
    `${GCAL}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(resource),
    }
  );
  if (!res.ok) return failJson(res, "일정 수정 실패");
  return NextResponse.json({ event: await res.json() });
}

export async function DELETE(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;
  const supabase = await createClient();

  const { calendarId, eventId } = (await request.json()) as {
    calendarId?: string;
    eventId?: string;
  };
  if (!calendarId || !eventId) {
    return NextResponse.json(
      { error: "calendarId, eventId 필수" },
      { status: 400 }
    );
  }

  const { res } = await gfetch(
    supabase,
    auth.token,
    `${GCAL}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 410) return failJson(res, "일정 삭제 실패");
  return NextResponse.json({ ok: true });
}
