import { NextRequest, NextResponse } from "next/server";
import { getProviderToken } from "@/lib/auth-token";
import { createClient } from "@/lib/supabase/server";
import { gfetch } from "@/lib/google-fetch";
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
  const supabase = await createClient();

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
  const calId = encodeURIComponent(body.calendarId);
  const json = { "Content-Type": "application/json" };

  let token = auth.token;
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
        const lookup = await gfetch(
          supabase,
          token,
          `${GCAL}/${calId}/events?iCalUID=${encodeURIComponent(ev.uid)}&showDeleted=false&maxResults=1`
        );
        token = lookup.token;
        if (lookup.res.ok) {
          const { items } = (await lookup.res.json()) as {
            items?: Array<{ id: string }>;
          };
          if (items && items.length > 0) {
            const patch = await gfetch(
              supabase,
              token,
              `${GCAL}/${calId}/events/${encodeURIComponent(items[0].id)}`,
              { method: "PATCH", headers: json, body: JSON.stringify(resource) }
            );
            token = patch.token;
            if (patch.res.ok) updated++;
            else failed++;
            continue;
          }
        }
        const importRes = await gfetch(
          supabase,
          token,
          `${GCAL}/${calId}/events/import`,
          {
            method: "POST",
            headers: json,
            body: JSON.stringify({ ...resource, iCalUID: ev.uid }),
          }
        );
        token = importRes.token;
        if (importRes.res.ok) created++;
        else failed++;
      } else {
        const insertRes = await gfetch(
          supabase,
          token,
          `${GCAL}/${calId}/events`,
          { method: "POST", headers: json, body: JSON.stringify(resource) }
        );
        token = insertRes.token;
        if (insertRes.res.ok) created++;
        else failed++;
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
