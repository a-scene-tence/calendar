import { NextRequest, NextResponse } from "next/server";
import { getProviderToken } from "@/lib/auth-token";
import { createClient } from "@/lib/supabase/server";
import { gfetch, readGoogleError } from "@/lib/google-fetch";

const GCAL = "https://www.googleapis.com/calendar/v3/calendars";
const CAL_LIST = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

// 배경색 밝기(YIQ)로 대비되는 전경색 계산.
// Google calendarList는 colorRgbFormat=true에서도 foregroundColor로 사실상
// #000000 / #ffffff 만 허용한다(그 외 값은 400 "Invalid foreground color").
function foregroundFor(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#ffffff";
  const hex = m[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#000000" : "#ffffff";
}

function normalizeHex(c: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

async function failJson(res: Response, fallback: string) {
  const { status, message } = await readGoogleError(res);
  console.warn(`[calendars] ${fallback}: ${status} ${message}`);
  return NextResponse.json(
    { error: fallback, googleStatus: status, googleMessage: message },
    { status }
  );
}

export async function POST(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;
  const supabase = await createClient();

  const body = (await request.json()) as {
    summary?: string;
    backgroundColor?: string;
  };
  const summary = (body.summary ?? "").trim();
  if (!summary) {
    return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  }

  const { res: createRes, token } = await gfetch(supabase, auth.token, GCAL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary }),
  });
  if (!createRes.ok) return failJson(createRes, "카테고리 추가 실패");
  const created = (await createRes.json()) as { id: string };

  const bg = body.backgroundColor ? normalizeHex(body.backgroundColor) : null;
  if (bg) {
    await gfetch(
      supabase,
      token,
      `${CAL_LIST}/${encodeURIComponent(created.id)}?colorRgbFormat=true`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundColor: bg,
          foregroundColor: foregroundFor(bg),
        }),
      }
    );
  }
  return NextResponse.json({ calendar: { id: created.id, summary } });
}

export async function PATCH(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;
  const supabase = await createClient();

  const body = (await request.json()) as {
    calendarId?: string;
    summary?: string;
    backgroundColor?: string;
  };
  if (!body.calendarId) {
    return NextResponse.json({ error: "calendarId 필수" }, { status: 400 });
  }

  let token = auth.token;

  if (typeof body.summary === "string" && body.summary.trim()) {
    const r = await gfetch(
      supabase,
      token,
      `${GCAL}/${encodeURIComponent(body.calendarId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: body.summary.trim() }),
      }
    );
    token = r.token;
    if (!r.res.ok) return failJson(r.res, "이름 수정 실패");
  }

  const bg = body.backgroundColor ? normalizeHex(body.backgroundColor) : null;
  if (bg) {
    const r = await gfetch(
      supabase,
      token,
      `${CAL_LIST}/${encodeURIComponent(body.calendarId)}?colorRgbFormat=true`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backgroundColor: bg,
          foregroundColor: foregroundFor(bg),
        }),
      }
    );
    if (!r.res.ok) return failJson(r.res, "색상 수정 실패");
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;
  const supabase = await createClient();

  const { calendarId } = (await request.json()) as { calendarId?: string };
  if (!calendarId) {
    return NextResponse.json({ error: "calendarId 필수" }, { status: 400 });
  }

  const { res } = await gfetch(
    supabase,
    auth.token,
    `${GCAL}/${encodeURIComponent(calendarId)}`,
    { method: "DELETE" }
  );
  if (!res.ok && res.status !== 410) {
    return failJson(res, "카테고리 삭제 실패");
  }
  return NextResponse.json({ ok: true });
}
