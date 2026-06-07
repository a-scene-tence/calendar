import { useCallback, useEffect, useMemo, useState } from 'react';
import { MonthGrid } from '@/components/MonthGrid';
import { DayPanel } from '@/components/DayPanel';
import { EventModal } from '@/components/EventModal';
import { BackupModal } from '@/components/BackupModal';
import { listCategories, listEvents, removeEvent, upsertEvent, newId } from '@/lib/store';
import type { CalendarEvent, Category } from '@/lib/types';
import { monthLabel, ymd } from '@/lib/date';

export default function App() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() });
  const [selectedKey, setSelectedKey] = useState(ymd(today));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creatingForKey, setCreatingForKey] = useState<string | null>(null);
  const [showBackup, setShowBackup] = useState(false);

  const reload = useCallback(() => {
    setEvents(listEvents());
    setCategories(listCategories());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleSave = (ev: CalendarEvent) => {
    upsertEvent(ev);
    reload();
    setEditing(null);
    setCreatingForKey(null);
  };

  const handleDelete = (id: string) => {
    removeEvent(id);
    reload();
    setEditing(null);
  };

  const handleNew = () => {
    setCreatingForKey(selectedKey);
  };

  const prevMonth = () => {
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }));
  };
  const nextMonth = () => {
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }));
  };
  const goToday = () => {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedKey(ymd(today));
  };

  const newEventInitial: CalendarEvent | null = creatingForKey
    ? {
        id: newId(),
        title: '',
        start: `${creatingForKey}T09:00`,
        end: `${creatingForKey}T10:00`,
        allDay: false,
      }
    : null;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Do &amp; Done</h1>
        <div className="actions">
          <button className="btn btn-ghost" onClick={() => setShowBackup(true)}>
            백업
          </button>
          <button className="btn btn-primary" onClick={handleNew}>
            추가
          </button>
        </div>
      </header>

      <div className="month-bar">
        <button onClick={prevMonth} aria-label="이전 달">
          ‹
        </button>
        <span className="label">{monthLabel(cursor.year, cursor.month)}</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost" onClick={goToday}>
            오늘
          </button>
          <button onClick={nextMonth} aria-label="다음 달">
            ›
          </button>
        </div>
      </div>

      <MonthGrid
        year={cursor.year}
        month={cursor.month}
        events={events}
        selectedKey={selectedKey}
        onSelect={setSelectedKey}
      />

      <DayPanel
        dayKey={selectedKey}
        events={events}
        onEdit={(ev) => setEditing(ev)}
      />

      {(editing || newEventInitial) && (
        <EventModal
          initial={editing ?? newEventInitial!}
          isNew={!editing}
          categories={categories}
          onSave={handleSave}
          onDelete={editing ? () => handleDelete(editing.id) : undefined}
          onClose={() => {
            setEditing(null);
            setCreatingForKey(null);
          }}
        />
      )}

      {showBackup && (
        <BackupModal
          onClose={() => setShowBackup(false)}
          onImported={reload}
        />
      )}
    </div>
  );
}
