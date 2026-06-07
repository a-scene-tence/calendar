import { useMemo } from 'react';
import { formatTime, parseYmd } from '@/lib/date';
import { itemsOnDay, type CalItem } from '@/lib/calendar';

type Props = {
  dayKey: string | null;
  items: CalItem[];
  onEdit: (it: CalItem) => void;
  onCreate: () => void;
};

function dayLabel(key: string) {
  const d = parseYmd(key);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${['일', '월', '화', '수', '목', '금', '토'][d.getDay()]})`;
}

export function DayPanel({ dayKey, items, onEdit, onCreate }: Props) {
  const dayItems = useMemo(
    () => (dayKey ? itemsOnDay(items, dayKey) : []),
    [items, dayKey]
  );

  if (!dayKey) {
    return <p className="day-hint">날짜를 탭하면 일정이 표시됩니다.</p>;
  }

  const holidays = dayItems.filter((it) => it.isHoliday);
  const events = dayItems
    .filter((it) => !it.isHoliday)
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.event.start.localeCompare(b.event.start);
    });

  return (
    <section className="day-panel animate-pop" key={dayKey}>
      <div className="day-panel-head">
        <h2>{dayLabel(dayKey)}</h2>
        <button className="day-add" onClick={onCreate}>
          + 이 날 일정 추가
        </button>
      </div>

      {holidays.length === 0 && events.length === 0 ? (
        <p className="empty">일정이 없습니다.</p>
      ) : (
        <ul className="day-list">
          {holidays.map((h) => (
            <li key={h.event.id} className="day-holiday">
              <span className="tag">공휴일</span>
              <span className="title">{h.label}</span>
            </li>
          ))}
          {events.map((it) => (
            <li key={it.event.id}>
              <button className="event-item" onClick={() => onEdit(it)}>
                <span className="time">
                  {it.allDay ? '종일' : formatTime(it.event.start)}
                </span>
                <span className="dot" style={{ background: it.color }} />
                <span className="body">
                  <span className="title">{it.label}</span>
                  {it.event.location && <span className="sub">{it.event.location}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
