import { NextRequest, NextResponse } from "next/server";
import { getProviderToken } from "@/lib/auth-token";
import { parseIcs, type IcsEvent } from "@/lib/ics";

const TIME_ZONE = "Asia/Seoul";
const GCAL = "https://www.googleapis.com/calendar/v3/calendars";

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

// Google API용 이벤트 리소스 생성. events route의 buildEventResource와 동일 분기.
function buildGoogleResource(ev: IcsEvent): Record<string, unknown> | null {
  const resource: Record<string, unknown> = { summary: ev.summary || "(제목 없음)" };
  if (ev.location) resource.location = ev.location;
  if (ev.description) resource.description = ev.description;

  if (ev.allDay) {
    resource.start = { date: ev.start };
    resource.end = { date: addOneDay(ev.end || ev.start) };
  } else {
    if (!ev.end) return null;
    resource.start = { dateTime: ev.start, timeZone: TIME_ZONE };
    resource.end = { dateTime: ev.end, timeZone: TIME_ZONE };
  }
  return resource;
}

export async function POST(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as {
    calendarId?: string;
    icsText?: string;
  };
  if (!body.calendarId || !body.icsText) {
    return NextResponse.json(
      { error: "calendarId, icsText 필수" },
      { status: 400 }
    );
  }

  const parsed = parseIcs(body.icsText);
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    "Content-Type": "application/json",
  };
  const calId = encodeURIComponent(body.calendarId);

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const ev of parsed) {
    try {
      const resource = buildGoogleResource(ev);
      if (!resource) {
        failed++;
        continue;
      }

      if (ev.uid) {
        // 기존 일정 매칭 시도 (iCalUID로 조회)
        const lookup = await fetch(
          `${GCAL}/${calId}/events?iCalUID=${encodeURIComponent(
            ev.uid
          )}&showDeleted=false&maxResults=1`,
          { headers: { Authorization: `Bearer ${auth.token}` } }
        );
        if (lookup.ok) {
          const { items } = (await lookup.json()) as {
            items?: Array<{ id: string }>;
          };
          if (items && items.length > 0) {
            // 업데이트
            const patchRes = await fetch(
              `${GCAL}/${calId}/events/${encodeURIComponent(items[0].id)}`,
              { method: "PATCH", headers, body: JSON.stringify(resource) }
            );
            if (patchRes.ok) {
              updated++;
            } else {
              failed++;
            }
            continue;
          }
        }
        // 없음 → import (iCalUID 보존)
        const withUid = { ...resource, iCalUID: ev.uid };
        const importRes = await fetch(
          `${GCAL}/${calId}/events/import`,
          { method: "POST", headers, body: JSON.stringify(withUid) }
        );
        if (importRes.ok) {
          created++;
        } else {
          failed++;
        }
      } else {
        // UID 없음 → insert (Google이 UID 자동 부여)
        const insertRes = await fetch(`${GCAL}/${calId}/events`, {
          method: "POST",
          headers,
          body: JSON.stringify(resource),
        });
        if (insertRes.ok) {
          created++;
        } else {
          failed++;
        }
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    total: parsed.length,
    created,
    updated,
    failed,
  });
}
