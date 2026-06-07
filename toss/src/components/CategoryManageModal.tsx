import { useState } from 'react';
import type { Category } from '@/lib/types';
import {
  PRESET_COLORS,
  newId,
  removeCategory,
  upsertCategory,
} from '@/lib/store';
import { useSwipeToDismiss } from '@/hooks/useSwipeToDismiss';

type Props = {
  categories: Category[]; // 정렬된 순서
  onOrderChange: (order: string[]) => void;
  onChanged: () => void;
  onClose: () => void;
};

export function CategoryManageModal({
  categories,
  onOrderChange,
  onChanged,
  onClose,
}: Props) {
  const { sheetRef, sheetStyle } = useSwipeToDismiss(onClose);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);

  const ids = categories.map((c) => c.id);

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...ids];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onOrderChange(next);
  };

  const rename = (cat: Category, name: string) => {
    upsertCategory({ ...cat, name });
    onChanged();
  };
  const recolor = (cat: Category, color: string) => {
    upsertCategory({ ...cat, color });
    onChanged();
  };
  const del = (cat: Category) => {
    if (categories.length <= 1) return;
    removeCategory(cat.id);
    onOrderChange(ids.filter((id) => id !== cat.id));
    onChanged();
  };
  const add = () => {
    const name = newName.trim();
    if (!name) return;
    upsertCategory({ id: newId(), name, color: newColor });
    setNewName('');
    onChanged();
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

        <ul className="cat-list">
          {categories.map((cat, idx) => (
            <li key={cat.id} className="cat-row">
              <div className="cat-top">
                <span className="dot" style={{ background: cat.color }} />
                <input
                  className="cat-name"
                  value={cat.name}
                  onChange={(e) => rename(cat, e.target.value)}
                />
                <div className="cat-move">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="위로">
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
                <button
                  className="cat-del"
                  onClick={() => del(cat)}
                  disabled={categories.length <= 1}
                >
                  삭제
                </button>
              </div>
              <div className="swatches">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={`swatch ${cat.color.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
                    style={{ background: c }}
                    onClick={() => recolor(cat, c)}
                    aria-label={`색상 ${c}`}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>

        <hr className="rule" />

        <div className="form-row">
          <label>새 카테고리</label>
          <div className="row-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="이름"
            />
            <button className="btn btn-primary" onClick={add} disabled={!newName.trim()}>
              추가
            </button>
          </div>
          <div className="swatches">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                className={`swatch ${newColor.toLowerCase() === c.toLowerCase() ? 'on' : ''}`}
                style={{ background: c }}
                onClick={() => setNewColor(c)}
                aria-label={`색상 ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
