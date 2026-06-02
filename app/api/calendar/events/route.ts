import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  recurrence?: string[];
};

function buildEventResource(body: EventBody) {
  const resource: Record<string, unknown> = {
    summary: body.summary,
  };
  if (body.location !== undefined) resource.location = body.location;
  if (body.description !== undefined) resource.description = body.description;
  if (Array.isArray(body.recurrence) && body.recurrence.length) {
    resource.recurrence = body.recurrence;
  }

  if (body.allDay) {
    if (!body.date) return null;
    // PATCH 머지 시 기존 dateTime이 남아 date와 충돌(400)하지 않도록 명시적으로 null 처리.
    resource.start = { date: body.date, dateTime: null, timeZone: null };
    resource.end = { date: addOneDay(body.endDate || body.date), dateTime: null, timeZone: null };
  } else {
    if (!body.startDateTime || !body.endDateTime) return null;
    // 반대 방향(종일→시간) 전환 시 기존 date가 남지 않도록 null 처리.
    resource.start = { dateTime: body.startDateTime, timeZone: TIME_ZONE, date: null };
    resource.end = { dateTime: body.endDateTime, timeZone: TIME_ZONE, date: null };
  }
  return resource;
}

// 반복 이벤트의 한 인스턴스 ID를 얻는다(originalStartTime이 매개변수와 일치하는 항목).
// Google: GET events/{recurringEventId}/instances?originalStart=<RFC3339 or YYYY-MM-DD>
async function resolveInstanceId(
  supabase: SupabaseClient,
  token: string,
  calendarId: string,
  recurringEventId: string,
  originalStartTime: string
): Promise<string | null> {
  const url =
    `${GCAL}/${encodeURIComponent(calendarId)}/events/` +
    `${encodeURIComponent(recurringEventId)}/instances` +
    `?originalStart=${encodeURIComponent(originalStartTime)}&maxResults=2`;
  const { res } = await gfetch(supabase, token, url);
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: Array<{ id?: string }> };
  return data.items?.[0]?.id ?? null;
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
  const {
    calendarId,
    eventId,
    scope,
    recurringEventId,
    originalStartTime,
    ...rest
  } = body as EventBody & {
    calendarId?: string;
    eventId?: string;
    scope?: "single" | "series";
    recurringEventId?: string;
    originalStartTime?: string;
  };
  if (!calendarId || !eventId || !rest.summary) {
    return NextResponse.json(
      { error: "calendarId, eventId, summary 필수" },
      { status: 400 }
    );
  }

  // 단일 인스턴스 수정: 마스터의 recurrence는 보존, 이 회차만 변경.
  let targetEventId = eventId;
  if (scope === "single") {
    if (!recurringEventId || !originalStartTime) {
      return NextResponse.json(
        { error: "단일 인스턴스 수정에는 recurringEventId, originalStartTime 필요" },
        { status: 400 }
      );
    }
    const id = await resolveInstanceId(
      supabase,
      auth.token,
      calendarId,
      recurringEventId,
      originalStartTime
    );
    if (!id) {
      return NextResponse.json(
        { error: "해당 인스턴스를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    targetEventId = id;
  }

  // 단일 인스턴스 수정 시에는 recurrence를 보내지 않음(시리즈 규칙 보존).
  const patchBody = { ...rest };
  if (scope === "single") delete patchBody.recurrence;
  const resource = buildEventResource(patchBody);
  if (!resource) {
    return NextResponse.json({ error: "날짜/시간이 올바르지 않습니다." }, { status: 400 });
  }

  const { res } = await gfetch(
    supabase,
    auth.token,
    `${GCAL}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(targetEventId)}`,
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

  const { calendarId, eventId, scope, recurringEventId, originalStartTime } =
    (await request.json()) as {
      calendarId?: string;
      eventId?: string;
      scope?: "single" | "series";
      recurringEventId?: string;
      originalStartTime?: string;
    };
  if (!calendarId || !eventId) {
    return NextResponse.json(
      { error: "calendarId, eventId 필수" },
      { status: 400 }
    );
  }

  let targetEventId = eventId;
  if (scope === "single") {
    if (!recurringEventId || !originalStartTime) {
      return NextResponse.json(
        { error: "단일 인스턴스 삭제에는 recurringEventId, originalStartTime 필요" },
        { status: 400 }
      );
    }
    const id = await resolveInstanceId(
      supabase,
      auth.token,
      calendarId,
      recurringEventId,
      originalStartTime
    );
    if (!id) {
      return NextResponse.json(
        { error: "해당 인스턴스를 찾을 수 없습니다." },
        { status: 404 }
      );
    }
    targetEventId = id;
  }

  const { res } = await gfetch(
    supabase,
    auth.token,
    `${GCAL}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(targetEventId)}`,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 410) return failJson(res, "일정 삭제 실패");
  return NextResponse.json({ ok: true });
}
