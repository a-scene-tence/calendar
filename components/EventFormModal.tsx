"use client";

import { useMemo, useState } from "react";
import { lunarToSolar, solarToLunar } from "@/lib/lunar";

export type WritableCalendar = { id: string; name: string; color: string };

export type EventInitial = {
  eventId?: string;
  calendarId: string;
  summary: string;
  allDay: boolean;
  date: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD (allDay 종료, 단일이면 date와 동일)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  location: string;
  description: string;
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: string;
};

type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type EndMode = "never" | "count" | "until";

// 음력 마커 형식: [음력 M월 D일] | [음력 M월 D일 (윤달)] | [음력 M월 D일 · 매월] | [음력 M월 D일 · 매년×2]
const LUNAR_MARK_RE =
  /^\[음력\s*(\d{1,2})월\s*(\d{1,2})일(?:\s*\(윤달\))?(?:\s*·\s*(매월|매년)(?:×(\d+))?)?\]/;
const LUNAR_YEARS_AHEAD = 50;
const LUNAR_MONTHS_AHEAD = 60;

// description의 음력 마커가 있으면 음력 일정으로 인식.
// hasRdate는 "음력 매월/매년 반복(RDATE)" 케이스의 복원 신호.
// lunarFreqHint는 꼬리표에서 추출한 freq(없으면 YEARLY로 폴백 — 구버전 호환).
function parseLunarFromInitial(initial: EventInitial): {
  isLunar: boolean;
  month: number;
  day: number;
  leap: boolean;
  cleanDesc: string;
  hasRdate: boolean;
  lunarFreqHint: "MONTHLY" | "YEARLY" | null;
  lunarIntervalHint: number;
} {
  const m = LUNAR_MARK_RE.exec(initial.description || "");
  const hasRdate = (initial.recurrence ?? []).some((r) =>
    r.toUpperCase().startsWith("RDATE")
  );
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const leap = /\(윤달\)/.test(m[0]);
    const tag = m[2 + 1]; // "매월" | "매년" | undefined  (m[3])
    const lunarFreqHint: "MONTHLY" | "YEARLY" | null =
      tag === "매월" ? "MONTHLY" : tag === "매년" ? "YEARLY" : null;
    const lunarIntervalHint = Math.max(1, Number(m[4]) || 1);
    const cleanDesc = initial.description.replace(LUNAR_MARK_RE, "").trimStart();
    return {
      isLunar: true,
      month,
      day,
      leap,
      cleanDesc,
      hasRdate,
      lunarFreqHint,
      lunarIntervalHint,
    };
  }
  return {
    isLunar: false,
    month: 1,
    day: 1,
    leap: false,
    cleanDesc: initial.description,
    hasRdate,
    lunarFreqHint: null,
    lunarIntervalHint: 1,
  };
}

function freqLabel(f: Freq): string {
  switch (f) {
    case "DAILY":
      return "일";
    case "WEEKLY":
      return "주";
    case "MONTHLY":
      return "개월";
    case "YEARLY":
      return "년";
  }
}

// RRULE 한 줄을 UI 상태로 파싱. 단순 RRULE만 지원(BYDAY 등은 무시).
function parseRrule(recurrence: string[] | undefined): {
  repeat: boolean;
  freq: Freq;
  interval: number;
  endMode: EndMode;
  count: number;
  until: string;
  advanced: boolean; // 파싱하지 못한 복잡한 규칙
} {
  const def = {
    repeat: false,
    freq: "WEEKLY" as Freq,
    interval: 1,
    endMode: "never" as EndMode,
    count: 10,
    until: "",
    advanced: false,
  };
  const line = (recurrence ?? []).find((r) => r.toUpperCase().startsWith("RRULE"));
  if (!line) return def;
  const parts = line.replace(/^RRULE:/i, "").split(";");
  const map = new Map<string, string>();
  for (const p of parts) {
    const [k, v] = p.split("=");
    if (k && v) map.set(k.toUpperCase(), v);
  }
  const freq = (map.get("FREQ") || "").toUpperCase();
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
    return { ...def, repeat: true, advanced: true };
  }
  // 단순 RRULE 외 키가 있으면 advanced
  const advanced = [...map.keys()].some(
    (k) => !["FREQ", "INTERVAL", "COUNT", "UNTIL", "WKST"].includes(k)
  );
  const interval = Math.max(1, Number(map.get("INTERVAL")) || 1);
  let endMode: EndMode = "never";
  let count = 10;
  let until = "";
  if (map.get("COUNT")) {
    endMode = "count";
    count = Math.max(1, Number(map.get("COUNT")) || 1);
  } else if (map.get("UNTIL")) {
    endMode = "until";
    const u = map.get("UNTIL") as string;
    // YYYYMMDD 또는 YYYYMMDDTHHMMSSZ → YYYY-MM-DD
    until = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
  }
  return {
    repeat: true,
    freq: freq as Freq,
    interval,
    endMode,
    count,
    until,
    advanced,
  };
}

function buildRrule(
  freq: Freq,
  interval: number,
  endMode: EndMode,
  count: number,
  until: string,
  allDay: boolean
): string {
  let s = `RRULE:FREQ=${freq};INTERVAL=${Math.max(1, interval || 1)}`;
  if (endMode === "count") {
    s += `;COUNT=${Math.max(1, count || 1)}`;
  } else if (endMode === "until" && until) {
    const ymd = until.replace(/-/g, "");
    s += allDay ? `;UNTIL=${ymd}` : `;UNTIL=${ymd}T235959Z`;
  }
  return s;
}

// 음력 기준 반복(매월/매년)을 양력 RDATE로 펼침.
// 첫 발생(startYear, startMonth, lunarDay)은 events.date에 들어가므로 RDATE는 두 번째 발생부터 포함.
// 윤달이 없는 해/달은 건너뜀.
function buildLunarRdate(
  startYear: number,
  startMonth: number,
  lunarDay: number,
  leap: boolean,
  freq: "MONTHLY" | "YEARLY",
  interval: number,
  endMode: EndMode,
  count: number,
  until: string
): { firstSolar: Date | null; rdateLine: string | null } {
  const first = lunarToSolar(startYear, startMonth, lunarDay, leap);
  if (!first) return { firstSolar: null, rdateLine: null };
  const step = Math.max(1, interval || 1);
  const untilDate =
    endMode === "until" && until ? new Date(`${until}T23:59:59`) : null;
  // count는 총 발생 횟수(첫 시드 포함). RDATE에 추가될 항목 수는 count - 1.
  const additionalNeeded =
    endMode === "count" ? Math.max(0, (count || 1) - 1) : null;
  const neverLimit =
    endMode === "never"
      ? freq === "YEARLY"
        ? LUNAR_YEARS_AHEAD
        : LUNAR_MONTHS_AHEAD
      : null;

  const dates: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let iter = 0; iter < 2000; iter++) {
    if (freq === "YEARLY") {
      y += step;
    } else {
      m += step;
      while (m > 12) {
        m -= 12;
        y += 1;
      }
    }
    if (y > 2050) break; // 라이브러리 유효 범위 상한
    const d = lunarToSolar(y, m, lunarDay, leap);
    if (!d) continue; // 윤달/없는 음력 날짜는 스킵
    if (untilDate && d > untilDate) break;
    const ymd =
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
        d.getDate()
      ).padStart(2, "0")}`;
    dates.push(ymd);
    if (additionalNeeded !== null && dates.length >= additionalNeeded) break;
    if (neverLimit !== null && dates.length >= neverLimit) break;
  }
  const line = dates.length ? `RDATE;VALUE=DATE:${dates.join(",")}` : null;
  return { firstSolar: first, rdateLine: line };
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function EventFormModal({
  mode,
  initial,
  calendars,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial: EventInitial;
  calendars: WritableCalendar[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // 음력 파싱
  const lunarParsed = useMemo(() => parseLunarFromInitial(initial), [initial]);
  // RRULE 파싱
  const rruleParsed = useMemo(() => parseRrule(initial.recurrence), [initial.recurrence]);

  const isInstance = !!initial.recurringEventId;

  const [summary, setSummary] = useState(initial.summary);
  const [calendarId, setCalendarId] = useState(
    initial.calendarId || calendars[0]?.id || ""
  );
  const [allDay, setAllDay] = useState(initial.allDay);
  const [date, setDate] = useState(initial.date);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [location, setLocation] = useState(initial.location);
  const [description, setDescription] = useState(lunarParsed.cleanDesc);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 반복 상태. 음력+RDATE면 꼬리표에서 freq/interval을 복원(없으면 YEARLY로 폴백).
  const lunarRdate = lunarParsed.isLunar && lunarParsed.hasRdate;
  const [repeat, setRepeat] = useState(rruleParsed.repeat || lunarRdate);
  const [freq, setFreq] = useState<Freq>(
    lunarRdate ? lunarParsed.lunarFreqHint ?? "YEARLY" : rruleParsed.freq
  );
  const [interval, setIntervalN] = useState(
    lunarRdate ? lunarParsed.lunarIntervalHint : rruleParsed.interval
  );
  const [endMode, setEndMode] = useState<EndMode>(rruleParsed.endMode);
  const [count, setCount] = useState(rruleParsed.count);
  const [until, setUntil] = useState(rruleParsed.until);

  // 음력 상태
  const baseLunar = useMemo(() => {
    if (lunarParsed.isLunar) {
      const y = Number((initial.date || "").slice(0, 4)) || new Date().getFullYear();
      return { year: y, month: lunarParsed.month, day: lunarParsed.day, leap: lunarParsed.leap };
    }
    // 새 일정은 선택 날짜의 음력으로 초기값
    const d = new Date(`${initial.date || ymd(new Date())}T00:00:00`);
    const l = solarToLunar(d);
    return l
      ? { year: l.year, month: l.month, day: l.day, leap: l.leap }
      : { year: new Date().getFullYear(), month: 1, day: 1, leap: false };
  }, [initial, lunarParsed]);
  const [lunar, setLunar] = useState(lunarParsed.isLunar);
  const [lunarYear, setLunarYear] = useState(baseLunar.year);
  const [lunarMonth, setLunarMonth] = useState(baseLunar.month);
  const [lunarDay, setLunarDay] = useState(baseLunar.day);
  const [lunarLeap, setLunarLeap] = useState(baseLunar.leap);

  // 인스턴스 수정/삭제 scope
  const [scope, setScope] = useState<"single" | "series">("series");

  // 음력 미리보기(첫 양력 날짜)
  const lunarPreview = useMemo(() => {
    if (!lunar) return null;
    const d = lunarToSolar(lunarYear, lunarMonth, lunarDay, lunarLeap);
    return d ? ymd(d) : null;
  }, [lunar, lunarYear, lunarMonth, lunarDay, lunarLeap]);

  async function save() {
    if (!summary.trim()) return setError("제목을 입력하세요.");
    if (!calendarId) return setError("캘린더를 선택하세요.");
    setBusy(true);
    setError(null);

    const payload: Record<string, unknown> = {
      calendarId,
      summary: summary.trim(),
      location: location.trim(),
    };

    // 음력 모드: 종일 + 음력→양력 시드 + (반복에 따라) RDATE(월/년)/RRULE(일/주)/단발
    if (lunar) {
      const firstSolar = lunarToSolar(lunarYear, lunarMonth, lunarDay, lunarLeap);
      if (!firstSolar) {
        setBusy(false);
        return setError("음력 날짜가 유효하지 않습니다.");
      }
      const startKey = ymd(firstSolar);
      payload.allDay = true;
      payload.date = startKey;
      payload.endDate = startKey;
      // 매월/매년 반복이면 마커 꼬리표에 freq/interval을 저장(편집 시 복원용).
      const useLunarRdate =
        repeat && !rruleParsed.advanced && (freq === "MONTHLY" || freq === "YEARLY");
      const freqTag = useLunarRdate
        ? ` · ${freq === "MONTHLY" ? "매월" : "매년"}${interval > 1 ? `×${interval}` : ""}`
        : "";
      const mark = `[음력 ${lunarMonth}월 ${lunarDay}일${lunarLeap ? " (윤달)" : ""}${freqTag}]`;
      payload.description = description.trim()
        ? `${mark}\n${description.trim()}`
        : mark;

      if (repeat && !rruleParsed.advanced) {
        if (useLunarRdate) {
          // 음력 기준 매월/매년: N년치 양력 RDATE
          const { rdateLine } = buildLunarRdate(
            lunarYear,
            lunarMonth,
            lunarDay,
            lunarLeap,
            freq,
            interval,
            endMode,
            count,
            until
          );
          payload.recurrence = rdateLine ? [rdateLine] : [];
        } else {
          // 일/주: 음력과 양력이 동치(24시간/7일) — 양력 RRULE 그대로
          payload.recurrence = [
            buildRrule(freq, interval, endMode, count, until, true),
          ];
        }
      }
      // repeat=false면 recurrence 미설정 → 단발성 음력 일정
    } else {
      payload.allDay = allDay;
      payload.description = description.trim();
      if (allDay) {
        payload.date = date;
        payload.endDate = endDate || date;
      } else {
        payload.startDateTime = `${date}T${startTime}:00`;
        payload.endDateTime = `${date}T${endTime}:00`;
      }
      if (repeat && !rruleParsed.advanced) {
        payload.recurrence = [
          buildRrule(freq, interval, endMode, count, until, allDay),
        ];
      } else if (!repeat && mode === "edit") {
        // 반복 해제: 빈 배열로 명시 전송(서버는 빈 배열은 무시 → recurrence 미전달과 같음).
        // 진짜 해제는 향후 별도 처리. V1에서는 켜진 상태 그대로 유지.
      }
    }

    if (mode === "edit") {
      payload.eventId = initial.eventId;
      if (isInstance && scope === "single") {
        payload.scope = "single";
        payload.recurringEventId = initial.recurringEventId;
        payload.originalStartTime = initial.originalStartTime;
      }
    }

    const res = await fetch("/api/calendar/events", {
      method: mode === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (res.status === 401) return setError("세션 만료. 다시 로그인하세요.");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return setError(
        `저장 실패 (${j.googleStatus ?? res.status}) ${j.googleMessage ?? ""}`.trim()
      );
    }
    onSaved();
  }

  async function remove() {
    if (!initial.eventId) return;
    const label = isInstance && scope === "single" ? "이 일정만" : "일정";
    if (!confirm(`${label} 삭제할까요?`)) return;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      calendarId,
      eventId: initial.eventId,
    };
    if (isInstance && scope === "single") {
      body.scope = "single";
      body.recurringEventId = initial.recurringEventId;
      body.originalStartTime = initial.originalStartTime;
    }
    const res = await fetch("/api/calendar/events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (res.status === 401) return setError("세션 만료. 다시 로그인하세요.");
    if (!res.ok) return setError("삭제에 실패했습니다.");
    onSaved();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4 animate-backdrop"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-[0_-8px_32px_rgba(0,0,0,0.08)] sm:shadow-[0_8px_40px_rgba(0,0,0,0.12)] p-5 sm:p-6 max-h-[90vh] overflow-y-auto animate-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200 sm:hidden" />
        <h2 className="text-lg font-bold mb-5 tracking-tight">
          {mode === "edit" ? "일정 수정" : "일정 추가"}
        </h2>

        <div className="space-y-3">
          <Field label="제목">
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className={inputClass}
              placeholder="일정 제목"
            />
          </Field>

          <Field label="캘린더">
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              className={inputClass}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          {!lunar && (
            <label className="flex items-center gap-2 text-sm text-gray-700 py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-brand)] cursor-pointer"
              />
              <span className="font-medium">종일</span>
            </label>
          )}

          {!lunar && (
            <>
              <Field label="날짜">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (!endDate || endDate < e.target.value) setEndDate(e.target.value);
                  }}
                  className={inputClass}
                />
              </Field>

              {allDay ? (
                <Field label="종료 날짜">
                  <input
                    type="date"
                    value={endDate}
                    min={date}
                    onChange={(e) => setEndDate(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              ) : (
                <div className="flex gap-3">
                  <Field label="시작">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="종료">
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              )}
            </>
          )}

          {/* 음력 토글 */}
          <label className="flex items-center gap-2 text-sm text-gray-700 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={lunar}
              onChange={(e) => setLunar(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-brand)] cursor-pointer"
            />
            <span className="font-medium">음력으로 입력 (종일)</span>
          </label>

          {lunar && (
            <div className="rounded-xl bg-gray-50 p-3 space-y-3">
              <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
                <Field label="음력 연도">
                  <input
                    type="number"
                    value={lunarYear}
                    min={1000}
                    max={2050}
                    onChange={(e) => setLunarYear(Number(e.target.value) || 0)}
                    className={inputClass}
                  />
                </Field>
                <Field label="월">
                  <select
                    value={lunarMonth}
                    onChange={(e) => setLunarMonth(Number(e.target.value))}
                    className={inputClass}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="일">
                  <select
                    value={lunarDay}
                    onChange={(e) => setLunarDay(Number(e.target.value))}
                    className={inputClass}
                  >
                    {Array.from({ length: 30 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={lunarLeap}
                  onChange={(e) => setLunarLeap(e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-brand)] cursor-pointer"
                />
                <span>윤달</span>
              </label>
              <p className="text-xs text-gray-500 leading-relaxed">
                {!lunarPreview
                  ? "이 음력 날짜는 유효하지 않습니다 (그 해에 해당 윤달이 없을 수 있음)."
                  : !repeat
                  ? `음력 ${lunarMonth}월 ${lunarDay}일 → 양력 ${lunarPreview}`
                  : freq === "YEARLY"
                  ? `${interval === 1 ? "매년" : `${interval}년마다`} 음력 ${lunarMonth}월 ${lunarDay}일 (첫 양력 ${lunarPreview})`
                  : freq === "MONTHLY"
                  ? `${interval === 1 ? "매월" : `${interval}개월마다`} 음력 ${lunarDay}일 (첫 양력 ${lunarPreview})`
                  : `${lunarPreview}부터 ${interval}${freqLabel(freq)}마다 반복`}
              </p>
            </div>
          )}

          {/* 반복 토글 */}
          <label className="flex items-center gap-2 text-sm text-gray-700 py-2 cursor-pointer">
            <input
              type="checkbox"
              checked={repeat}
              onChange={(e) => setRepeat(e.target.checked)}
              disabled={rruleParsed.advanced}
              className="h-4 w-4 accent-[var(--color-brand)] cursor-pointer disabled:opacity-50"
            />
            <span className="font-medium">반복</span>
            {rruleParsed.advanced && (
              <span className="text-xs text-gray-400">(고급 반복 — 편집 불가)</span>
            )}
          </label>

          {repeat && !rruleParsed.advanced && (
            <div className="rounded-xl bg-gray-50 p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="number"
                  min={1}
                  value={interval}
                  onChange={(e) =>
                    setIntervalN(Math.max(1, Number(e.target.value) || 1))
                  }
                  className={`${inputClass} w-16 shrink-0 text-center`}
                />
                <select
                  value={freq}
                  onChange={(e) => setFreq(e.target.value as Freq)}
                  className={`${inputClass} flex-1 min-w-0`}
                >
                  <option value="DAILY">일</option>
                  <option value="WEEKLY">주</option>
                  <option value="MONTHLY">개월</option>
                  <option value="YEARLY">년</option>
                </select>
                <span className="text-gray-600 shrink-0 whitespace-nowrap">마다</span>
              </div>
              <div className="space-y-1 text-sm">
                <span className="block text-xs font-medium text-gray-500">종료</span>
                <label className="flex items-center gap-2 cursor-pointer min-h-[40px] py-1">
                  <input
                    type="radio"
                    checked={endMode === "never"}
                    onChange={() => setEndMode("never")}
                    className="accent-[var(--color-brand)] shrink-0"
                  />
                  <span className="whitespace-nowrap">안 함</span>
                  {lunar && (freq === "MONTHLY" || freq === "YEARLY") && (
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      (최대 {freq === "YEARLY" ? `${LUNAR_YEARS_AHEAD}회` : `${LUNAR_MONTHS_AHEAD}회`})
                    </span>
                  )}
                </label>
                <label className="flex items-center gap-2 cursor-pointer min-h-[40px] py-1">
                  <input
                    type="radio"
                    checked={endMode === "count"}
                    onChange={() => setEndMode("count")}
                    className="accent-[var(--color-brand)] shrink-0"
                  />
                  <input
                    type="number"
                    min={1}
                    value={count}
                    onChange={(e) => {
                      setCount(Math.max(1, Number(e.target.value) || 1));
                      setEndMode("count");
                    }}
                    className={`${inputClass} w-20 shrink-0 text-center`}
                  />
                  <span className="text-gray-700 shrink-0 whitespace-nowrap">회 반복</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer min-h-[40px] py-1">
                  <input
                    type="radio"
                    checked={endMode === "until"}
                    onChange={() => setEndMode("until")}
                    className="accent-[var(--color-brand)] shrink-0"
                  />
                  <input
                    type="date"
                    value={until}
                    onChange={(e) => {
                      setUntil(e.target.value);
                      if (e.target.value) setEndMode("until");
                    }}
                    className={`${inputClass} flex-1 min-w-0`}
                  />
                  <span className="text-gray-700 shrink-0 whitespace-nowrap">까지</span>
                </label>
              </div>
            </div>
          )}

          {/* 인스턴스 scope 선택 */}
          {mode === "edit" && isInstance && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-1.5 text-sm">
              <span className="block text-xs font-medium text-amber-800">
                반복 일정 — 적용 범위
              </span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={scope === "single"}
                  onChange={() => setScope("single")}
                  className="accent-[var(--color-brand)]"
                />
                <span>이 일정만</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={scope === "series"}
                  onChange={() => setScope("series")}
                  className="accent-[var(--color-brand)]"
                />
                <span>전체 시리즈</span>
              </label>
            </div>
          )}

          <Field label="장소 (선택)">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="설명 (선택)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </Field>
        </div>

        {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

        <div className="flex items-center gap-2 mt-6">
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-xl bg-brand text-white py-3 text-sm font-semibold transition hover:bg-brand-hover active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            {busy ? "저장 중..." : "저장"}
          </button>
          {mode === "edit" && (
            <button
              onClick={remove}
              disabled={busy}
              className="rounded-xl bg-red-50 text-red-500 px-4 py-3 text-sm font-semibold transition hover:bg-red-100 active:scale-[0.98] disabled:opacity-50"
            >
              삭제
            </button>
          )}
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl bg-gray-100 text-gray-700 px-4 py-3 text-sm font-semibold transition hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-transparent bg-gray-50 px-3.5 py-3 text-sm text-gray-900 outline-none transition focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand/15";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block flex-1">
      <span className="block text-xs font-medium text-gray-500 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
