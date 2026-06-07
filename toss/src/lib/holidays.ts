// 대한민국 공휴일(로컬 내장). 메인 앱은 구글 "대한민국의 휴일" 캘린더를 쓰지만,
// 토스 미니앱은 로컬 전용이라 내장 테이블로 대체. 매년 고정(양력) 공휴일 + 음력/선거/
// 대체공휴일은 2025~2027 정적 테이블로 보강(그 외 연도는 고정 공휴일만).

type Holiday = { key: string; name: string };

// 매년 반복되는 양력 고정 공휴일
const FIXED: { mmdd: string; name: string }[] = [
  { mmdd: '01-01', name: '신정' },
  { mmdd: '03-01', name: '삼일절' },
  { mmdd: '05-05', name: '어린이날' },
  { mmdd: '06-06', name: '현충일' },
  { mmdd: '08-15', name: '광복절' },
  { mmdd: '10-03', name: '개천절' },
  { mmdd: '10-09', name: '한글날' },
  { mmdd: '12-25', name: '성탄절' },
];

// 음력 기반·선거·대체공휴일 등 연도별 추가(양력 환산). 양력 고정과 중복되면 이름 병합.
const EXTRA: Record<number, { mmdd: string; name: string }[]> = {
  2025: [
    { mmdd: '01-27', name: '임시공휴일' },
    { mmdd: '01-28', name: '설날 연휴' },
    { mmdd: '01-29', name: '설날' },
    { mmdd: '01-30', name: '설날 연휴' },
    { mmdd: '03-03', name: '대체공휴일' },
    { mmdd: '05-05', name: '부처님오신날' },
    { mmdd: '05-06', name: '대체공휴일' },
    { mmdd: '10-05', name: '추석 연휴' },
    { mmdd: '10-06', name: '추석' },
    { mmdd: '10-07', name: '추석 연휴' },
    { mmdd: '10-08', name: '대체공휴일' },
  ],
  2026: [
    { mmdd: '02-16', name: '설날 연휴' },
    { mmdd: '02-17', name: '설날' },
    { mmdd: '02-18', name: '설날 연휴' },
    { mmdd: '03-02', name: '대체공휴일' },
    { mmdd: '05-24', name: '부처님오신날' },
    { mmdd: '05-25', name: '대체공휴일' },
    { mmdd: '06-03', name: '지방선거일' },
    { mmdd: '09-24', name: '추석 연휴' },
    { mmdd: '09-25', name: '추석' },
    { mmdd: '09-26', name: '추석 연휴' },
  ],
  2027: [
    { mmdd: '02-06', name: '설날 연휴' },
    { mmdd: '02-07', name: '설날' },
    { mmdd: '02-08', name: '설날 연휴' },
    { mmdd: '02-09', name: '대체공휴일' },
    { mmdd: '05-13', name: '부처님오신날' },
    { mmdd: '06-07', name: '대체공휴일' },
    { mmdd: '08-16', name: '대체공휴일' },
    { mmdd: '09-14', name: '추석 연휴' },
    { mmdd: '09-15', name: '추석' },
    { mmdd: '09-16', name: '추석 연휴' },
    { mmdd: '10-04', name: '대체공휴일' },
  ],
};

const cache = new Map<number, Holiday[]>();

export function getHolidays(year: number): Holiday[] {
  const cached = cache.get(year);
  if (cached) return cached;

  const byKey = new Map<string, string>();
  const add = (mmdd: string, name: string) => {
    const key = `${year}-${mmdd}`;
    const prev = byKey.get(key);
    byKey.set(key, prev && prev !== name ? `${prev}·${name}` : name);
  };

  for (const f of FIXED) add(f.mmdd, f.name);
  for (const e of EXTRA[year] ?? []) add(e.mmdd, e.name);

  const list = [...byKey.entries()].map(([key, name]) => ({ key, name }));
  cache.set(year, list);
  return list;
}

// 화면에 걸친 여러 해(전월/다음월 그리드 포함)의 공휴일을 한 번에
export function getHolidaysForYears(years: number[]): Holiday[] {
  const seen = new Set<number>();
  const out: Holiday[] = [];
  for (const y of years) {
    if (seen.has(y)) continue;
    seen.add(y);
    out.push(...getHolidays(y));
  }
  return out;
}
