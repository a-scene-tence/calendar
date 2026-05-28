import { NextRequest, NextResponse } from "next/server";
import { getProviderToken } from "@/lib/auth-token";
import { buildIcs, type IcsEvent } from "@/lib/ics";

const GCAL = "https://www.googleapis.com/calendar/v3/calendars";
const CAL_LIST = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const MAX_PAGES = 20; // 안전망: 2500 * 20 = 50,000건 상한

type GoogleEvent = {
  id: string;
  iCalUID?: string;
  summary?: string;
  location?: string;
  description?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

function sanitizeFileName(name: string): string {
  return name.replace(/[^\p{L}\p{N}\-_]+/gu, "_").slice(0, 60) || "calendar";
}

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Google의 dateTime("YYYY-MM-DDTHH:mm:ss±HH:mm" 또는 ...Z)을
// 내부 표기 "YYYY-MM-DDTHH:mm:ss"로 정규화(시간대 정보 제거, 로컬 시각으로 변환).
function normalizeDateTime(s: string): string {
  // 오프셋이나 Z가 붙은 경우 Date로 파싱해 로컬 시각으로 변환
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    const p = (n: number) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
      `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    );
  }
  // naive면 초까지만 보장하고 그대로
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return s + ":00";
  return s;
}

function googleToIcs(items: GoogleEvent[]): IcsEvent[] {
  const out: IcsEvent[] = [];
  for (const it of items) {
    const startDate = it.start?.date;
    const startDateTime = it.start?.dateTime;
    const endDate = it.end?.date;
    const endDateTime = it.end?.dateTime;

    if (startDate) {
      // 종일. Google의 end.date는 exclusive → inclusive로 -1일 보정.
      let endInclusive: string | undefined;
      if (endDate) {
        const [y, m, d] = endDate.split("-").map(Number);
        const dt = new Date(Date.UTC(y, m - 1, d));
        dt.setUTCDate(dt.getUTCDate() - 1);
        const p = (n: number) => String(n).padStart(2, "0");
        const inc =
          `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
        endInclusive = inc === startDate ? undefined : inc;
      }
      out.push({
        uid: it.iCalUID,
        summary: it.summary ?? "",
        allDay: true,
        start: startDate,
        end: endInclusive,
        location: it.location,
        description: it.description,
      });
    } else if (startDateTime) {
      out.push({
        uid: it.iCalUID,
        summary: it.summary ?? "",
        allDay: false,
        start: normalizeDateTime(startDateTime),
        end: endDateTime ? normalizeDateTime(endDateTime) : undefined,
        location: it.location,
        description: it.description,
      });
    }
  }
  return out;
}

export async function GET(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;

  const calendarId = request.nextUrl.searchParams.get("calendarId");
  if (!calendarId) {
    return NextResponse.json({ error: "calendarId 필수" }, { status: 400 });
  }

  const headers = { Authorization: `Bearer ${auth.token}` };

  // 카테고리 이름 조회(파일명용). 실패해도 export는 진행.
  let calendarName = "calendar";
  try {
    const metaRes = await fetch(
      `${CAL_LIST}/${encodeURIComponent(calendarId)}`,
      { headers }
    );
    if (metaRes.ok) {
      const meta = (await metaRes.json()) as {
        summary?: string;
        summaryOverride?: string;
      };
      calendarName = meta.summaryOverride ?? meta.summary ?? calendarName;
    }
  } catch {
    // 무시 — 기본 이름 사용
  }

  // 전체 기간 이벤트 페이지네이션 수집.
  const allItems: GoogleEvent[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      singleEvents: "true",
      maxResults: "2500",
      orderBy: "startTime",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(
      `${GCAL}/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "이벤트 조회 실패", status: res.status },
        { status: res.status }
      );
    }
    const json = (await res.json()) as {
      items?: GoogleEvent[];
      nextPageToken?: string;
    };
    if (json.items) allItems.push(...json.items);
    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  const ics = buildIcs(googleToIcs(allItems), { calendarName });
  const fileName = `${sanitizeFileName(calendarName)}-${todayIso()}.ics`;

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
