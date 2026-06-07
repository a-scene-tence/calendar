import { useCallback, useEffect, useMemo, useState } from 'react';
import { MonthGrid } from '@/components/MonthGrid';
import { DayPanel } from '@/components/DayPanel';
import { EventModal } from '@/components/EventModal';
import { BackupModal } from '@/components/BackupModal';
import { CategoryManageModal } from '@/components/CategoryManageModal';
import {
  getUiPrefs,
  listCategories,
  listEvents,
  newId,
  removeEvent,
  setUiPrefs,
  upsertEvent,
} from '@/lib/store';
import type { CalendarEvent, Category } from '@/lib/types';
import { ymd } from '@/lib/date';
import { buildItems, type CalItem } from '@/lib/calendar';
import { getHolidaysForYears } from '@/lib/holidays';
import { haptic } from '@/lib/toss';

export default function App() {
  const today = useMemo(() => new Date(), []);
  const [viewDate, setViewDate] = useState({
    year: today.getFullYear(),
    month: today.getMonth(), // 0-11
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(ymd(today));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const initialPrefs = useMemo(() => getUiPrefs(), []);
  const [selectMode, setSelectMode] = useState<'single' | 'multi'>(initialPrefs.selectMode);
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set(initialPrefs.visibleIds));
  const [categoryOrder, setCategoryOrder] = useState<string[]>(initialPrefs.categoryOrder);

  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [creatingForKey, setCreatingForKey] = useState<string | null>(null);
  const [showBackup, setShowBackup] = useState(false);
  const [showManage, setShowManage] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const reload = useCallback(() => {
    setEvents(listEvents());
    setCategories(listCategories());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // UI 선호 영속화
  useEffect(() => {
    setUiPrefs({ selectMode, visibleIds: [...visibleIds], categoryOrder });
  }, [selectMode, visibleIds, categoryOrder]);

  // 카테고리 정렬(사용자 지정 순서 우선)
  const categoriesSorted = useMemo(() => {
    const idx = new Map(categoryOrder.map((id, i) => [id, i]));
    return categories.slice().sort((a, b) => {
      const ia = idx.has(a.id) ? (idx.get(a.id) as number) : Infinity;
      const ib = idx.has(b.id) ? (idx.get(b.id) as number) : Infinity;
      return ia - ib;
    });
  }, [categories, categoryOrder]);

  const categoriesById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );

  // visibleIds 기본값(최초 1개) + 유효성 보장
  useEffect(() => {
    if (categoriesSorted.length === 0) return;
    setVisibleIds((prev) => {
      const valid = new Set([...prev].filter((id) => categoriesSorted.some((c) => c.id === id)));
      if (valid.size === 0 && categoriesSorted[0]) valid.add(categoriesSorted[0].id);
      return valid;
    });
  }, [categoriesSorted]);

  const holidays = useMemo(
    () => getHolidaysForYears([viewDate.year - 1, viewDate.year, viewDate.year + 1]),
    [viewDate.year]
  );

  const items = useMemo<CalItem[]>(
    () => buildItems(events, categoriesById, visibleIds, holidays),
    [events, categoriesById, visibleIds, holidays]
  );

  // 검색 결과(전체 기간, 로컬 필터)
  const searchResults = useMemo<CalItem[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const all = buildItems(events, categoriesById, new Set(), []);
    return all
      .filter((it) => {
        const ev = it.event;
        return (
          ev.title.toLowerCase().includes(q) ||
          (ev.description ?? '').toLowerCase().includes(q) ||
          (ev.location ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.event.start.localeCompare(b.event.start));
  }, [searchQuery, events, categoriesById]);

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

  const defaultCatId = (): string => {
    const visible = categoriesSorted.find((c) => visibleIds.has(c.id));
    return visible?.id ?? categoriesSorted[0]?.id ?? '';
  };
  const openCreate = (key: string | null) => setCreatingForKey(key ?? ymd(today));

  const prevMonth = () => {
    haptic('tickWeak');
    setSelectedKey(null);
    setViewDate((c) =>
      c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }
    );
  };
  const nextMonth = () => {
    haptic('tickWeak');
    setSelectedKey(null);
    setViewDate((c) =>
      c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }
    );
  };
  const goToday = () => {
    setViewDate({ year: today.getFullYear(), month: today.getMonth() });
    setSelectedKey(ymd(today));
  };

  function toggleChip(cat: Category) {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (selectMode === 'single') {
        for (const c of categoriesSorted) next.delete(c.id);
        next.add(cat.id);
      } else if (next.has(cat.id)) {
        next.delete(cat.id);
      } else {
        next.add(cat.id);
      }
      return next;
    });
  }
  function changeMode(mode: 'single' | 'multi') {
    setSelectMode(mode);
    if (mode === 'single') {
      setVisibleIds((prev) => {
        const next = new Set(prev);
        const vis = categoriesSorted.filter((c) => next.has(c.id));
        for (const c of vis.slice(1)) next.delete(c.id);
        return next;
      });
    }
  }

  const runSearch = () => setSearchQuery(searchInput.trim());
  const clearSearch = () => {
    setSearchInput('');
    setSearchQuery('');
  };

  const newEventInitial: CalendarEvent | null = creatingForKey
    ? {
        id: newId(),
        title: '',
        start: `${creatingForKey}T09:00`,
        end: `${creatingForKey}T10:00`,
        allDay: false,
        categoryId: defaultCatId(),
      }
    : null;

  const years = Array.from({ length: 11 }, (_, i) => today.getFullYear() - 5 + i);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Do &amp; Done</h1>
        <button className="btn btn-ghost" onClick={() => setShowBackup(true)}>
          백업
        </button>
      </header>

      <div className="app-body">
        {/* 헤더: 년/월 드롭다운 + 일정/이동 */}
        <div className="cal-top">
          <div className="picker">
            <select
              value={viewDate.year}
              onChange={(e) => {
                setSelectedKey(null);
                setViewDate((v) => ({ ...v, year: Number(e.target.value) }));
              }}
              aria-label="연도 선택"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}년
                </option>
              ))}
            </select>
            <select
              value={viewDate.month}
              onChange={(e) => {
                setSelectedKey(null);
                setViewDate((v) => ({ ...v, month: Number(e.target.value) }));
              }}
              aria-label="월 선택"
            >
              {Array.from({ length: 12 }, (_, i) => i).map((m) => (
                <option key={m} value={m}>
                  {m + 1}월
                </option>
              ))}
            </select>
          </div>
          <div className="nav">
            <button className="add-btn" onClick={() => openCreate(selectedKey)}>
              + 일정
            </button>
            <button className="icon-btn" onClick={prevMonth} aria-label="이전 달">
              ‹
            </button>
            <button className="today-btn" onClick={goToday}>
              오늘
            </button>
            <button className="icon-btn" onClick={nextMonth} aria-label="다음 달">
              ›
            </button>
          </div>
        </div>

        {/* 검색 */}
        <div className="search">
          <div className="search-field">
            <span className="search-ic">⌕</span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runSearch();
              }}
              placeholder="일정 검색 (제목·메모, 전체 기간)"
            />
          </div>
          <button className="search-btn" onClick={runSearch}>
            검색
          </button>
          {searchQuery && (
            <button className="search-x" onClick={clearSearch} aria-label="검색 닫기">
              ✕
            </button>
          )}
        </div>

        {searchQuery ? (
          <div className="search-results animate-pop">
            <h3>
              ‘{searchQuery}’ 검색 결과
              <span className="count">{searchResults.length}건</span>
            </h3>
            {searchResults.length === 0 ? (
              <p className="empty">결과가 없습니다.</p>
            ) : (
              <ul className="day-list">
                {searchResults.map((it) => (
                  <li key={it.event.id}>
                    <button className="event-item" onClick={() => setEditing(it.event)}>
                      <span className="time">{it.startKey.slice(5).replace('-', '/')}</span>
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
          </div>
        ) : (
          <>
            {/* 카테고리: 단일/다중 + 칩 + 관리 */}
            {categoriesSorted.length > 0 && (
              <div className="chips">
                <div className="mode">
                  {(['single', 'multi'] as const).map((m) => (
                    <button
                      key={m}
                      className={selectMode === m ? 'on' : ''}
                      onClick={() => changeMode(m)}
                    >
                      {m === 'single' ? '단일' : '다중'}
                    </button>
                  ))}
                </div>
                {categoriesSorted.map((cat) => {
                  const on = visibleIds.has(cat.id);
                  return (
                    <button
                      key={cat.id}
                      className={`chip ${on ? 'on' : ''}`}
                      onClick={() => toggleChip(cat)}
                    >
                      <span className="dot" style={{ background: cat.color }} />
                      {cat.name}
                    </button>
                  );
                })}
                <button className="manage" onClick={() => setShowManage(true)}>
                  관리
                </button>
              </div>
            )}

            <MonthGrid
              year={viewDate.year}
              month={viewDate.month}
              items={items}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onEditEvent={(it) => setEditing(it.event)}
              onPrev={prevMonth}
              onNext={nextMonth}
            />

            <DayPanel
              dayKey={selectedKey}
              items={items}
              onEdit={(it) => setEditing(it.event)}
              onCreate={() => openCreate(selectedKey)}
            />
          </>
        )}
      </div>

      {(editing || newEventInitial) && (
        <EventModal
          initial={editing ?? newEventInitial!}
          isNew={!editing}
          categories={categoriesSorted}
          onSave={handleSave}
          onDelete={editing ? () => handleDelete(editing.id) : undefined}
          onClose={() => {
            setEditing(null);
            setCreatingForKey(null);
          }}
        />
      )}

      {showBackup && (
        <BackupModal onClose={() => setShowBackup(false)} onImported={reload} />
      )}

      {showManage && (
        <CategoryManageModal
          categories={categoriesSorted}
          onOrderChange={setCategoryOrder}
          onChanged={reload}
          onClose={() => setShowManage(false)}
        />
      )}
    </div>
  );
}
