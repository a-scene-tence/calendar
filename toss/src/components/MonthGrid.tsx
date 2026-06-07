import { useMemo, useRef } from 'react';
import { WEEKDAYS, buildMonthGrid, ymd } from '@/lib/date';
import {
  barTextColor,
  dateKey,
  splitWeeks,
  weekLayout,
  type CalItem,
} from '@/lib/calendar';

type Props = {
  year: number;
  month: number; // 0-11
  items: CalItem[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onEditEvent: (it: CalItem) => void;
  onPrev: () => void;
  onNext: () => void;
};

export function MonthGrid({
  year,
  month,
  items,
  selectedKey,
  onSelect,
  onEditEvent,
  onPrev,
  onNext,
}: Props) {
  const weeks = useMemo(() => splitWeeks(buildMonthGrid(year, month)), [year, month]);
  const todayKey = ymd(new Date());
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) <= Math.abs(dy)) return;
    if (dx < 0) onNext();
    else onPrev();
  }

  return (
    <div className="cal">
      <div className="cal-weekdays">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>
            {w}
          </div>
        ))}
      </div>

      <div
        key={`${year}-${month}`}
        className="cal-grid animate-month"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {weeks.map((days, wi) => {
          const { lanes, overflow } = weekLayout(days, items);
          const hasOverflow = overflow.some((n) => n > 0);
          return (
            <div key={wi} className="cal-week">
              {/* 배경: 날짜 칸 */}
              {days.map((d) => {
                const key = dateKey(d);
                const inMonth = d.getMonth() === month;
                const isToday = key === todayKey;
                const dow = d.getDay();
                const isHolidayDay = items.some(
                  (it) => it.isHoliday && it.startKey <= key && key <= it.endKey
                );
                const numClass = !inMonth
                  ? 'out'
                  : dow === 0 || isHolidayDay
                    ? 'sun'
                    : dow === 6
                      ? 'sat'
                      : '';
                return (
                  <button key={key} className="cal-cell" onClick={() => onSelect(key)}>
                    <span className={`cal-num ${isToday ? 'today' : numClass}`}>
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}

              {/* 선택 링 */}
              <div className="cal-rings">
                {days.map((d) => {
                  const k = dateKey(d);
                  return <div key={k} className={k === selectedKey ? 'on' : ''} />;
                })}
              </div>

              {/* 막대 레인 */}
              <div className="cal-bars">
                {lanes.map((segs, lane) => (
                  <div key={lane} className="cal-lane">
                    {segs.map((seg) => {
                      const { item, colStart, span } = seg;
                      return (
                        <button
                          key={item.event.id}
                          className="cal-bar"
                          style={{
                            gridColumn: `${colStart + 1} / span ${span}`,
                            backgroundColor: item.color,
                            color: barTextColor(item.color),
                          }}
                          title={item.label}
                          onClick={() =>
                            item.isHoliday
                              ? onSelect(item.startKey)
                              : onEditEvent(item)
                          }
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                ))}
                {hasOverflow && (
                  <div className="cal-overflow">
                    {overflow.map((n, c) =>
                      n > 0 ? (
                        <span key={c} style={{ gridColumn: `${c + 1}` }}>
                          +{n}
                        </span>
                      ) : (
                        <span key={c} style={{ gridColumn: `${c + 1}` }} />
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
