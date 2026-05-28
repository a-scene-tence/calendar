import { NextRequest, NextResponse } from "next/server";
import { getProviderToken } from "@/lib/auth-token";

const GCAL = "https://www.googleapis.com/calendar/v3/calendars";
const CAL_LIST = "https://www.googleapis.com/calendar/v3/users/me/calendarList";

// 배경색 밝기(YIQ)로 대비되는 전경색(흑/백) 계산
function foregroundFor(bg: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(bg.trim());
  if (!m) return "#ffffff";
  const hex = m[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#1f2937" : "#ffffff";
}

function normalizeHex(c: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

// calendarList 색상 설정(colorRgbFormat=true 시 background+foreground 둘 다 필요)
async function setColor(token: string, calendarId: string, backgroundColor: string) {
  return fetch(
    `${CAL_LIST}/${encodeURIComponent(calendarId)}?colorRgbFormat=true`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        backgroundColor,
        foregroundColor: foregroundFor(backgroundColor),
      }),
    }
  );
}

export async function POST(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as {
    summary?: string;
    backgroundColor?: string;
  };
  const summary = (body.summary ?? "").trim();
  if (!summary) {
    return NextResponse.json({ error: "이름을 입력하세요." }, { status: 400 });
  }

  const res = await fetch(GCAL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ summary }),
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: "카테고리 추가 실패", status: res.status },
      { status: res.status }
    );
  }
  const created = (await res.json()) as { id: string };

  const bg = body.backgroundColor ? normalizeHex(body.backgroundColor) : null;
  if (bg) {
    await setColor(auth.token, created.id, bg);
  }
  return NextResponse.json({ calendar: { id: created.id, summary } });
}

export async function PATCH(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;

  const body = (await request.json()) as {
    calendarId?: string;
    summary?: string;
    backgroundColor?: string;
  };
  if (!body.calendarId) {
    return NextResponse.json({ error: "calendarId 필수" }, { status: 400 });
  }

  if (typeof body.summary === "string" && body.summary.trim()) {
    const res = await fetch(
      `${GCAL}/${encodeURIComponent(body.calendarId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${auth.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ summary: body.summary.trim() }),
      }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "이름 수정 실패", status: res.status },
        { status: res.status }
      );
    }
  }

  const bg = body.backgroundColor ? normalizeHex(body.backgroundColor) : null;
  if (bg) {
    const res = await setColor(auth.token, body.calendarId, bg);
    if (!res.ok) {
      return NextResponse.json(
        { error: "색상 수정 실패", status: res.status },
        { status: res.status }
      );
    }
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await getProviderToken();
  if ("error" in auth) return auth.error;

  const { calendarId } = (await request.json()) as { calendarId?: string };
  if (!calendarId) {
    return NextResponse.json({ error: "calendarId 필수" }, { status: 400 });
  }

  const res = await fetch(`${GCAL}/${encodeURIComponent(calendarId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  if (!res.ok && res.status !== 410) {
    return NextResponse.json(
      { error: "카테고리 삭제 실패", status: res.status },
      { status: res.status }
    );
  }
  return NextResponse.json({ ok: true });
}
