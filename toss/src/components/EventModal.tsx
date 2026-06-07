import { useState } from 'react';
import type { CalendarEvent, Category } from '@/lib/types';
import { useSwipeToDismiss } from '@/hooks/useSwipeToDismiss';

type Props = {
  initial: CalendarEvent;
  isNew: boolean;
  categories: Category[];
  onSave: (ev: CalendarEvent) => void;
  onDelete?: () => void;
  onClose: () => void;
};

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}
function toTimeInput(iso: string): string {
  return iso.length >= 16 ? iso.slice(11, 16) : '09:00';
}
function combine(dateStr: string, timeStr: string): string {
  return `${dateStr}T${timeStr}`;
}

export function EventModal({ initial, isNew, categories, onSave, onDelete, onClose }: Props) {
  const { sheetRef, sheetStyle } = useSwipeToDismiss(onClose);
  const [title, setTitle] = useState(initial.title);
  const [allDay, setAllDay] = useState(initial.allDay);
  const [startDate, setStartDate] = useState(toDateInput(initial.start));
  const [startTime, setStartTime] = useState(toTimeInput(initial.start));
  const [endDate, setEndDate] = useState(toDateInput(initial.end ?? initial.start));
  const [endTime, setEndTime] = useState(toTimeInput(initial.end ?? initial.start));
  const [location, setLocation] = useState(initial.location ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? categories[0]?.id ?? '');

  const handleSubmit = () => {
    const cat = categories.find((c) => c.id === categoryId);
    const ev: CalendarEvent = {
      id: initial.id,
      title: title.trim(),
      allDay,
      start: allDay ? startDate : combine(startDate, startTime),
      end: allDay ? endDate : combine(endDate, endTime),
      location: location.trim() || undefined,
      description: description.trim() || undefined,
      categoryId: cat?.id,
      color: cat?.color,
    };
    onSave(ev);
  };

  return (
    <div className="modal-backdrop animate-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        style={sheetStyle}
        className="modal animate-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-handle" />
        <h2>{isNew ? '일정 추가' : '일정 수정'}</h2>

        <div className="form-row">
          <label>제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="무엇을 할까요?"
            autoFocus
          />
        </div>

        <div className="form-row">
          <label className="check">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
            />
            종일
          </label>
        </div>

        <div className="form-row">
          <label>시작</label>
          <div className="row-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            {!allDay && (
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="form-row">
          <label>종료</label>
          <div className="row-2">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            {!allDay && (
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            )}
          </div>
        </div>

        {categories.length > 0 && (
          <div className="form-row">
            <label>카테고리</label>
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="form-row">
          <label>장소</label>
          <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>

        <div className="form-row">
          <label>메모</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            취소
          </button>
          {onDelete && (
            <button className="btn btn-danger" onClick={onDelete}>
              삭제
            </button>
          )}
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!title.trim()}>
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
