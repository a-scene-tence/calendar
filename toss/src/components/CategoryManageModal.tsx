import { useRef, useState } from 'react';
import type { CalendarEvent, Category } from '@/lib/types';
import {
  listEvents,
  newId,
  PRESET_COLORS,
  removeCategory,
  upsertCategory,
  upsertEvent,
} from '@/lib/store';
import { buildIcs, parseIcs, type IcsEvent } from '@/lib/ics';
import { saveTextFileViaToss } from '@/lib/toss';
import { useSwipeToDismiss } from '@/hooks/useSwipeToDismiss';

type Props = {
  categories: Category[];
  onOrderChange: (order: string[]) => void;
  onChanged: () => void;
  onClose: () => void;
};

type IoMsg = { kind: 'ok' | 'error'; text: string } | null;

export function CategoryManageModal({
  categories,
  onOrderChange,
  onChanged,
  onClose,
}: Props) {
  const { sheetRef, sheetStyle } = useSwipeToDismiss(onClose);
  const fileRef = useRef<HTMLInputElement>(null);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);

  const [ioCategoryId, setIoCategoryId] = useState<string>(categories[0]?.id ?? '');
  const [ioBusy, setIoBusy] = useState(false);
  const [ioMsg, setIoMsg] = useState<IoMsg>(null);

  const ids = categories.map((c) => c.id);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...ids];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onOrderChange(next);
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    upsertCategory({ id: newId(), name, color: newColor });
    setNewName('');
    onChanged();
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditColor(cat.color);
  };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = (cat: Category) => {
    const name = editName.trim();
    if (!name) return;
    upsertCategory({ ...cat, name, color: editColor });
    setEditingId(null);
    onChanged();
  };

  const del = (cat: Category) => {
    if (categories.length <= 1) return;
    removeCategory(cat.id);
    onOrderChange(ids.filter((id) => id !== cat.id));
    if (ioCategoryId === cat.id) setIoCategoryId(ids.find((id) => id !== cat.id) ?? '');
    onChanged();
  };

  // ── .ics 내보내기 / 가져오기 ─────────────────────────────────
  const fileName = (catName: string) =>
    `${catName || 'calendar'}-${new Date().toISOString().slice(0, 10)}.ics`;

  const downloadInBrowser = (text: string, name: string) => {
    const blob = new Blob([text], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const eventToIcs = (ev: CalendarEvent): IcsEvent => ({
    uid: ev.id,
    summary: ev.title,
    allDay: ev.allDay,
    start: ev.allDay ? ev.start.slice(0, 10) : ensureSeconds(ev.start),
    end: ev.end ? (ev.allDay ? ev.end.slice(0, 10) : ensureSeconds(ev.end)) : undefined,
    location: ev.location,
    description: ev.description,
  });

  const exportIcs = async () => {
    if (ioBusy) return;
    const cat = categories.find((c) => c.id === ioCategoryId);
    if (!cat) {
      setIoMsg({ kind: 'error', text: '카테고리를 선택하세요.' });
      return;
    }
    setIoBusy(true);
    setIoMsg(null);
    try {
      const filtered = listEvents().filter((e) => e.categoryId === cat.id);
      const ics = buildIcs(filtered.map(eventToIcs), { calendarName: cat.name });
      const name = fileName(cat.name);
      try {
        await saveTextFileViaToss(name, ics, 'text/calendar');
      } catch {
        downloadInBrowser(ics, name);
      }
      setIoMsg({ kind: 'ok', text: `'${cat.name}' ${filtered.length}건 내보내기 완료` });
    } catch (e) {
      setIoMsg({ kind: 'error', text: e instanceof Error ? e.message : '내보내기 실패' });
    } finally {
      setIoBusy(false);
    }
  };

  const triggerImport = () => {
    if (!ioCategoryId) {
      setIoMsg({ kind: 'error', text: '카테고리를 선택하세요.' });
      return;
    }
    setIoMsg(null);
    fileRef.current?.click();
  };

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const cat = categories.find((c) => c.id === ioCategoryId);
    if (!cat) return;
    setIoBusy(true);
    setIoMsg(null);
    try {
      const text = await file.text();
      const items = parseIcs(text);
      let count = 0;
      for (const it of items) {
        const id = it.uid?.trim() || newId();
        const start = it.allDay ? it.start : ensureMinutes(it.start);
        const end = it.end ? (it.allDay ? it.end : ensureMinutes(it.end)) : undefined;
        upsertEvent({
          id,
          title: it.summary || '(제목 없음)',
          start,
          end,
          allDay: it.allDay,
          location: it.location,
          description: it.description,
          categoryId: cat.id,
          color: cat.color,
        });
        count++;
      }
      setIoMsg({ kind: 'ok', text: `'${cat.name}': ${count}개 추가/업데이트` });
      onChanged();
    } catch (err) {
      setIoMsg({ kind: 'error', text: err instanceof Error ? err.message : '가져오기 실패' });
    } finally {
      setIoBusy(false);
    }
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
        <h2>카테고리 관리</h2>

        {/* 새 카테고리 추가 */}
        <div className="cat-section">
          <p className="cat-section-label">새 카테고리 추가</p>
          <div className="cat-add-row">
            <ColorPicker value={newColor} onChange={setNewColor} />
            <input
              className="cat-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="카테고리 이름"
            />
            <button className="btn-add" onClick={add} disabled={!newName.trim()}>
              추가
            </button>
          </div>
        </div>

        {/* 목록 */}
        <ul className="cat-list">
          {categories.map((cat, idx) =>
            editingId === cat.id ? (
              <li key={cat.id} className="cat-row cat-row-edit">
                <ColorPicker value={editColor} onChange={setEditColor} />
                <input
                  className="cat-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <button className="cat-save" onClick={() => saveEdit(cat)}>
                  저장
                </button>
                <button className="cat-cancel" onClick={cancelEdit}>
                  취소
                </button>
              </li>
            ) : (
              <li key={cat.id} className="cat-row">
                <span className="cat-color" style={{ background: cat.color }} aria-hidden />
                <span className="cat-name">{cat.name}</span>
                <div className="cat-move">
                  <button
                    onClick={() => move(idx, -1)}
                    disabled={idx === 0}
                    aria-label="위로"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(idx, 1)}
                    disabled={idx === categories.length - 1}
                    aria-label="아래로"
                  >
                    ↓
                  </button>
                </div>
                <button className="cat-edit" onClick={() => startEdit(cat)}>
                  수정
                </button>
                <button
                  className="cat-del"
                  onClick={() => del(cat)}
                  disabled={categories.length <= 1}
                >
                  삭제
                </button>
              </li>
            )
          )}
        </ul>

        {/* .ics 가져오기 / 내보내기 */}
        <div className="cat-section">
          <p className="cat-section-label">가져오기 / 내보내기 (.ics)</p>
          <select
            className="cat-input cat-io-select"
            value={ioCategoryId}
            onChange={(e) => setIoCategoryId(e.target.value)}
            disabled={ioBusy || categories.length === 0}
          >
            {categories.length === 0 ? (
              <option value="">카테고리 없음</option>
            ) : (
              categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          <div className="cat-io-buttons">
            <button
              className="btn-io-secondary"
              onClick={triggerImport}
              disabled={ioBusy || categories.length === 0}
            >
              가져오기
            </button>
            <button
              className="btn-io-primary"
              onClick={exportIcs}
              disabled={ioBusy || categories.length === 0}
            >
              내보내기
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            style={{ display: 'none' }}
            onChange={onFilePicked}
          />
          {ioMsg && <p className={`io-msg ${ioMsg.kind}`}>{ioMsg.text}</p>}
          <p className="io-hint">
            내보내기는 선택한 카테고리의 전체 일정을 .ics로 다운로드합니다. 가져오기 시 같은
            UID의 일정은 업데이트되어 중복이 생기지 않습니다.
          </p>
        </div>

        <div className="modal-actions">
          <button className="btn-close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <label className="color-picker" style={{ background: value }} aria-label="색상 선택">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// store의 CalendarEvent.start/end 는 "YYYY-MM-DDTHH:mm" (분 단위). ics buildIcs는 초 단위 기대.
function ensureSeconds(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}
// parseIcs는 초 포함 문자열 반환 → store는 분 단위 사용. 초 잘라냄.
function ensureMinutes(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 16);
  return s;
}
