// RFC5545 최소 구현: VCALENDAR/VEVENT 파서와 생성기. 외부 의존성 없음.
// 지원: SUMMARY, DTSTART, DTEND, UID, LOCATION, DESCRIPTION,
//       VALUE=DATE(종일) / DATE-TIME(UTC `Z` / TZID= / naive).
// 비지원(무시): RRULE, EXDATE, UNTIL, ATTENDEE, ORGANIZER 등.

const TZID = "Asia/Seoul";

export type IcsEvent = {
  uid?: string;
  summary: string;
  allDay: boolean;
  start: string; // 종일: YYYY-MM-DD / 시간: YYYY-MM-DDTHH:mm:ss
  end?: string;
  location?: string;
  description?: string;
};

// ───── 공통 헬퍼 ──────────────────────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function subtractOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// ───── 생성기 (buildIcs) ───────────────────────────────────────

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// 75 옥텟 line folding: 다음 줄을 한 칸 공백 prefix.
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  out.push(line.slice(i, i + 75));
  i += 75;
  while (i < line.length) {
    out.push(" " + line.slice(i, i + 74));
    i += 74;
  }
  return out.join("\r\n");
}

function dateToIcsDate(d: string): string {
  // "YYYY-MM-DD" → "YYYYMMDD"
  return d.replace(/-/g, "");
}

function dateTimeToIcsLocal(s: string): string {
  // "YYYY-MM-DDTHH:mm:ss" → "YYYYMMDDTHHMMSS"
  return s.replace(/[-:]/g, "");
}

function newUid(): string {
  const rnd =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${rnd}@calendar.local`;
}

function utcStamp(): string {
  const d = new Date();
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

export function buildIcs(
  events: IcsEvent[],
  opts: { calendarName?: string } = {}
): string {
  const lines: string[] = [];
  const push = (l: string) => lines.push(foldLine(l));

  push("BEGIN:VCALENDAR");
  push("VERSION:2.0");
  push("PRODID:-//calendar-app//ko");
  push("CALSCALE:GREGORIAN");
  if (opts.calendarName) push(`X-WR-CALNAME:${escapeText(opts.calendarName)}`);

  const stamp = utcStamp();

  for (const ev of events) {
    push("BEGIN:VEVENT");
    push(`UID:${ev.uid ?? newUid()}`);
    push(`DTSTAMP:${stamp}`);
    push(`SUMMARY:${escapeText(ev.summary || "")}`);

    if (ev.allDay) {
      push(`DTSTART;VALUE=DATE:${dateToIcsDate(ev.start)}`);
      // 종일 종료는 exclusive. end 없으면 start+1, 있으면 end+1.
      const endInclusive = ev.end || ev.start;
      push(`DTEND;VALUE=DATE:${dateToIcsDate(addOneDay(endInclusive))}`);
    } else {
      push(`DTSTART;TZID=${TZID}:${dateTimeToIcsLocal(ev.start)}`);
      if (ev.end) {
        push(`DTEND;TZID=${TZID}:${dateTimeToIcsLocal(ev.end)}`);
      }
    }
    if (ev.location) push(`LOCATION:${escapeText(ev.location)}`);
    if (ev.description) push(`DESCRIPTION:${escapeText(ev.description)}`);
    push("END:VEVENT");
  }

  push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

// ───── 파서 (parseIcs) ────────────────────────────────────────

function unfoldLines(text: string): string[] {
  // CRLF/LF 정규화 후, 다음 줄이 공백/탭으로 시작하면 이전 줄에 이어붙이기.
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeText(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

// "DTSTART;TZID=Asia/Seoul;VALUE=DATE-TIME" 같은 prop 라인을 분해
function splitPropLine(line: string): {
  name: string;
  params: Record<string, string>;
  value: string;
} | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = head.split(";");
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq > 0) {
      params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
    }
  }
  return { name, params, value };
}

function parseIcsDate(value: string): string {
  // "YYYYMMDD" → "YYYY-MM-DD"
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : value;
}

function parseIcsDateTime(
  value: string,
  params: Record<string, string>
): string {
  // "YYYYMMDDTHHMMSSZ" UTC → 로컬 변환 후 "YYYY-MM-DDTHH:mm:ss"
  // "YYYYMMDDTHHMMSS" TZID 또는 naive → 그대로 (TZID는 무시하고 문자열 보존)
  const utcMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (utcMatch) {
    const [, Y, M, D, h, m, s] = utcMatch;
    const d = new Date(
      Date.UTC(
        Number(Y),
        Number(M) - 1,
        Number(D),
        Number(h),
        Number(m),
        Number(s)
      )
    );
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    );
  }
  const localMatch = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (localMatch) {
    const [, Y, M, D, h, m, s] = localMatch;
    // params["TZID"]는 보존하지 않음(향후 확장 가능). naive로 표기.
    return `${Y}-${M}-${D}T${h}:${m}:${s}`;
  }
  return value;
}

export function parseIcs(text: string): IcsEvent[] {
  const lines = unfoldLines(text);
  const events: IcsEvent[] = [];
  let cur: Partial<IcsEvent> | null = null;
  let curEndExclusiveDate: string | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { allDay: false, summary: "", start: "" };
      curEndExclusiveDate = null;
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.start) {
        // 종일 종료는 exclusive → -1일 보정해 inclusive로
        if (cur.allDay && curEndExclusiveDate) {
          const inclusive = subtractOneDay(curEndExclusiveDate);
          // 단일 일자(start==end-1day)면 end 생략
          cur.end = inclusive === cur.start ? undefined : inclusive;
        }
        events.push({
          uid: cur.uid,
          summary: cur.summary ?? "",
          allDay: !!cur.allDay,
          start: cur.start,
          end: cur.end,
          location: cur.location,
          description: cur.description,
        });
      }
      cur = null;
      curEndExclusiveDate = null;
      continue;
    }
    if (!cur) continue;

    const prop = splitPropLine(line);
    if (!prop) continue;

    switch (prop.name) {
      case "UID":
        cur.uid = prop.value;
        break;
      case "SUMMARY":
        cur.summary = unescapeText(prop.value);
        break;
      case "LOCATION":
        cur.location = unescapeText(prop.value);
        break;
      case "DESCRIPTION":
        cur.description = unescapeText(prop.value);
        break;
      case "DTSTART": {
        const isDate = (prop.params["VALUE"] ?? "").toUpperCase() === "DATE";
        if (isDate) {
          cur.allDay = true;
          cur.start = parseIcsDate(prop.value);
        } else {
          cur.allDay = false;
          cur.start = parseIcsDateTime(prop.value, prop.params);
        }
        break;
      }
      case "DTEND": {
        const isDate = (prop.params["VALUE"] ?? "").toUpperCase() === "DATE";
        if (isDate) {
          curEndExclusiveDate = parseIcsDate(prop.value);
        } else {
          cur.end = parseIcsDateTime(prop.value, prop.params);
        }
        break;
      }
      default:
        // RRULE/EXDATE/ATTENDEE 등은 무시
        break;
    }
  }
  return events;
}
