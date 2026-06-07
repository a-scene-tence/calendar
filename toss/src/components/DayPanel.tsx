import { useMemo } from 'react';
import { eventsByDay, formatTime, parseYmd } from '@/lib/date';
import type { CalendarEvent } from '@/lib/types';

type Props = {
  dayKey: string;
  events: CalendarEvent[];
  onEdit: (ev: CalendarEvent) => void;
};

function dayLabel(key: string) {
  const d = parseYmd(key);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
}

export function DayPanel({ dayKey, events, onEdit }: Props) {
  const byDay = useMemo(() => eventsByDay(events), [events]);
  const items = byDay.get(dayKey) ?? [];
  return (
    <section className="day-panel">
      <h2>{dayLabel(dayKey)}</h2>
      {items.length === 0 ? (
        <p className="empty">일정이 없습니다.</p>
      ) : (
        items.map((ev) => (
          <button
            key={ev.id}
            type="button"
            className="event-item"
            onClick={() => onEdit(ev)}
            style={{ width: '100%', textAlign: 'left' }}
          >
            <span className="dot" style={ev.color ? { background: ev.color } : undefined} />
            <span className="body">
              <span className="title">{ev.title || '(제목 없음)'}</span>
              <span className="time">
                {ev.allDay
                  ? '종일'
                  : `${formatTime(ev.start)}${ev.end ? ` – ${formatTime(ev.end)}` : ''}`}
                {ev.location ? ` · ${ev.location}` : ''}
              </span>
            </span>
          </button>
        ))
      )}
    </section>
  );
}
