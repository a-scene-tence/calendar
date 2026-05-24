import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const TIME_ZONE = "Asia/Seoul";
const GCAL = "https://www.googleapis.com/calendar/v3/calendars";

type TokenResult = { token: string } | { error: NextResponse };

async function getProviderToken(): Promise<TokenResult> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.provider_token;
  if (!token) {
    return {
      error: NextResponse.json(
        { error: "No Google token. Re-login required." },
        { status: 401 }
      ),
    };
  }
  return { token };
}

function addOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type EventBody = {
  summary?: string;
  allDay?: boolean;
  date?: string; // YYYY-MM-DD (allDay)
  endDate?: string; // YYYY-MM-DD inclusive (allDay, optional)
  startDateTime?: string; // YYYY-MM-DDTHH:mm:ss (timed)
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

export async function POST(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;

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

  const res = await fetch(
    `${GCAL}/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resource),
    }
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: "일정 추가 실패", status: res.status },
      { status: res.status }
    );
  }
  return NextResponse.json({ event: await res.json() });
}

export async function PATCH(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;

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

  const res = await fetch(
    `${GCAL}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      eventId
    )}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${auth.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resource),
    }
  );
  if (!res.ok) {
    return NextResponse.json(
      { error: "일정 수정 실패", status: res.status },
      { status: res.status }
    );
  }
  return NextResponse.json({ event: await res.json() });
}

export async function DELETE(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;

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

  const res = await fetch(
    `${GCAL}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(
      eventId
    )}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${auth.token}` },
    }
  );
  // Google은 삭제 성공 시 204
  if (!res.ok && res.status !== 410) {
    return NextResponse.json(
      { error: "일정 삭제 실패", status: res.status },
      { status: res.status }
    );
  }
  return NextResponse.json({ ok: true });
}
