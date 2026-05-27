// 최소 RFC5545(iCalendar) 파서/생성기. 반복(RRULE)은 무시하고 단일 일정만 처리.

export type ParsedEvent = {
  uid?: string;
  summary: string;
  start: string; // 종일 "YYYY-MM-DD" / 시간 "YYYY-MM-DDTHH:mm:ss"
  end?: string;
  location?: string;
  description?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function escapeText(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

// "YYYYMMDD" 또는 "YYYYMMDDTHHMMSS[Z]" → 내부 형식
function parseDate(
  value: string,
  isDateOnly: boolean
): { value: string; allDay: boolean } | null {
  const v = value.trim();
  const dOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dOnly) {
    return { value: `${dOnly[1]}-${dOnly[2]}-${dOnly[3]}`, allDay: true };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (dt) {
    if (isDateOnly) {
      return { value: `${dt[1]}-${dt[2]}-${dt[3]}`, allDay: true };
    }
    if (dt[7] === "Z") {
      // UTC → 로컬 시간으로 변환
      const utc = new Date(
        Date.UTC(+dt[1], +dt[2] - 1, +dt[3], +dt[4], +dt[5], +dt[6])
      );
      return {
        value: `${utc.getFullYear()}-${pad2(utc.getMonth() + 1)}-${pad2(
          utc.getDate()
        )}T${pad2(utc.getHours())}:${pad2(utc.getMinutes())}:${pad2(
          utc.getSeconds()
        )}`,
        allDay: false,
      };
    }
    // naive(또는 TZID): 그대로 로컬로 취급
    return {
      value: `${dt[1]}-${dt[2]}-${dt[3]}T${dt[4]}:${dt[5]}:${dt[6]}`,
      allDay: false,
    };
  }
  return null;
}

export function parseIcs(text: string): ParsedEvent[] {
  // 줄 unfold(다음 줄이 공백/탭으로 시작하면 이어붙임)
  const raw = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  const events: ParsedEvent[] = [];
  let cur: Partial<ParsedEvent> & { _dtStartAllDay?: boolean } = {};
  let inEvent = false;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur.summary && cur.start) {
        events.push({
          uid: cur.uid,
          summary: cur.summary,
          start: cur.start,
          end: cur.end,
          location: cur.location,
          description: cur.description,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...params] = head.split(";");
    const isDateOnly = params.some((p) => /^VALUE=DATE$/i.test(p));

    switch (name.toUpperCase()) {
      case "UID":
        cur.uid = value.trim();
        break;
      case "SUMMARY":
        cur.summary = unescapeText(value);
        break;
      case "LOCATION":
        cur.location = unescapeText(value);
        break;
      case "DESCRIPTION":
        cur.description = unescapeText(value);
        break;
      case "DTSTART": {
        const p = parseDate(value, isDateOnly);
        if (p) {
          cur.start = p.value;
          cur._dtStartAllDay = p.allDay;
        }
        break;
      }
      case "DTEND": {
        const p = parseDate(value, isDateOnly);
        if (p) cur.end = p.value;
        break;
      }
    }
  }
  return events;
}

function toIcsDate(s: string): { prop: string; val: string } {
  const dOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (dOnly) {
    return { prop: ";VALUE=DATE", val: `${dOnly[1]}${dOnly[2]}${dOnly[3]}` };
  }
  const dt = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (dt) {
    return {
      prop: "",
      val: `${dt[1]}${dt[2]}${dt[3]}T${dt[4]}${dt[5]}${dt[6] ?? "00"}`,
    };
  }
  // fallback: 날짜로
  return { prop: ";VALUE=DATE", val: s.replace(/[-:T]/g, "").slice(0, 8) };
}

// 75옥텟 폴딩(간이)
function fold(line: string): string {
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length) {
    out += "\r\n " + rest.slice(0, 74);
    rest = rest.slice(74);
  }
  return out;
}

export function buildIcs(
  events: { uid: string; summary: string; start: string; end?: string; location?: string }[]
): string {
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(
    now.getUTCDate()
  )}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(
    now.getUTCSeconds()
  )}Z`;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//local-calendar//KO",
    "CALSCALE:GREGORIAN",
  ];
  for (const e of events) {
    const s = toIcsDate(e.start);
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.uid}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(fold(`SUMMARY:${escapeText(e.summary)}`));
    lines.push(`DTSTART${s.prop}:${s.val}`);
    if (e.end) {
      const en = toIcsDate(e.end);
      lines.push(`DTEND${en.prop}:${en.val}`);
    }
    if (e.location) lines.push(fold(`LOCATION:${escapeText(e.location)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
