import KoreanLunarCalendar from "korean-lunar-calendar";

// 양력 Date → 음력 {month, day, leap(윤달)}. 변환 실패 시 null.
export function solarToLunar(
  date: Date
): { month: number; day: number; leap: boolean } | null {
  const c = new KoreanLunarCalendar();
  if (!c.setSolarDate(date.getFullYear(), date.getMonth() + 1, date.getDate())) {
    return null;
  }
  const l = c.getLunarCalendar();
  return { month: l.month, day: l.day, leap: !!l.intercalation };
}

// 음력 1일·15일에만 보여줄 짧은 라벨. 그 외 날짜는 null.
// 1일: "윤4월" / "4월", 15일: "15".
export function lunarHighlight(date: Date): string | null {
  const l = solarToLunar(date);
  if (!l) return null;
  if (l.day === 1) return `${l.leap ? "윤" : ""}${l.month}월`;
  if (l.day === 15) return "15";
  return null;
}
