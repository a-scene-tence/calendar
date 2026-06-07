import { useMemo } from 'react';
import { WEEKDAYS, buildMonthGrid, eventsByDay, isSameDay, isSameMonth, ymd } from '@/lib/date';
import type { CalendarEvent } from '@/lib/types';

const MAX_PILLS = 3;

type Props = {
  year: number;
  month: number;
  events: CalendarEvent[];
  selectedKey: string;
  onSelect: (key: string) => void;
};

export function MonthGrid({ year, month, events, selectedKey, onSelect }: Props) {
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const byDay = useMemo(() => eventsByDay(events), [events]);
  const today = new Date();

  return (
    <>
      <div className="weekdays">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={i === 0 ? 'sun' : ''}>
            {w}
          </div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((d) => {
          const key = ymd(d);
          const out = !isSameMonth(d, year, month);
          const sun = d.getDay() === 0;
          const isToday = isSameDay(d, today);
          const selected = key === selectedKey;
          const dayEvents = byDay.get(key) ?? [];
          const visible = dayEvents.slice(0, MAX_PILLS);
          const more = dayEvents.length - visible.length;
          return (
            <button
              key={key}
              type="button"
              className={[
                'day-cell',
                out ? 'out' : '',
                sun ? 'sun' : '',
                isToday ? 'today' : '',
                selected ? 'selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect(key)}
            >
              <span className="day-num">{d.getDate()}</span>
              <div className="pill-list">
                {visible.map((ev) => (
                  <span key={ev.id} className="pill" title={ev.title}>
                    {ev.title || '(제목 없음)'}
                  </span>
                ))}
                {more > 0 && <span className="more">+{more}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}
