import type { BackupPayload, CalendarEvent, Category } from './types';

const EVENTS_KEY = 'ddoss:events:v1';
const CATS_KEY = 'ddoss:categories:v1';
const UI_KEY = 'ddoss:ui:v1';

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'todo', name: '할일', color: '#A8C8EF' },
  { id: 'done', name: '한일', color: '#8A8A8E' },
  { id: 'life', name: '생활', color: '#F59E0B' },
  { id: 'exercise', name: '운동', color: '#EC4899' },
];

export const PRESET_COLORS = [
  '#A8C8EF',
  '#8A8A8E',
  '#F59E0B',
  '#EC4899',
  '#10B981',
  '#8B5CF6',
  '#14B8A6',
  '#1A1A1A',
];

export type UiPrefs = {
  selectMode: 'single' | 'multi';
  visibleIds: string[];
  categoryOrder: string[];
};

function read<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function listEvents(): CalendarEvent[] {
  return read<CalendarEvent[]>(EVENTS_KEY, []);
}

export function listCategories(): Category[] {
  const cats = read<Category[]>(CATS_KEY, []);
  if (cats.length === 0) {
    write(CATS_KEY, DEFAULT_CATEGORIES);
    return DEFAULT_CATEGORIES;
  }
  return cats;
}

export function upsertEvent(ev: CalendarEvent): CalendarEvent {
  const items = listEvents();
  const idx = items.findIndex((e) => e.id === ev.id);
  if (idx >= 0) items[idx] = ev;
  else items.push(ev);
  write(EVENTS_KEY, items);
  return ev;
}

export function removeEvent(id: string) {
  const items = listEvents().filter((e) => e.id !== id);
  write(EVENTS_KEY, items);
}

export function upsertCategory(cat: Category): Category {
  const items = listCategories();
  const idx = items.findIndex((c) => c.id === cat.id);
  if (idx >= 0) items[idx] = cat;
  else items.push(cat);
  write(CATS_KEY, items);
  return cat;
}

export function removeCategory(id: string) {
  const items = listCategories().filter((c) => c.id !== id);
  write(CATS_KEY, items);
}

export function getUiPrefs(): UiPrefs {
  return read<UiPrefs>(UI_KEY, { selectMode: 'single', visibleIds: [], categoryOrder: [] });
}

export function setUiPrefs(prefs: UiPrefs) {
  write(UI_KEY, prefs);
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function exportJson(): string {
  const payload: BackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    events: listEvents(),
    categories: listCategories(),
  };
  return JSON.stringify(payload, null, 2);
}

export type ImportMode = 'replace' | 'merge';

export function importJson(text: string, mode: ImportMode = 'merge'): {
  importedEvents: number;
  importedCategories: number;
} {
  const data = JSON.parse(text) as BackupPayload;
  if (!data || data.version !== 1) {
    throw new Error('지원하지 않는 백업 형식입니다.');
  }
  if (mode === 'replace') {
    write(EVENTS_KEY, data.events ?? []);
    write(CATS_KEY, data.categories ?? DEFAULT_CATEGORIES);
    return {
      importedEvents: data.events?.length ?? 0,
      importedCategories: data.categories?.length ?? 0,
    };
  }
  // merge: 동일 id는 가져온 값으로 덮어쓰기
  const existingEvents = new Map(listEvents().map((e) => [e.id, e]));
  for (const e of data.events ?? []) existingEvents.set(e.id, e);
  write(EVENTS_KEY, Array.from(existingEvents.values()));

  const existingCats = new Map(listCategories().map((c) => [c.id, c]));
  for (const c of data.categories ?? []) existingCats.set(c.id, c);
  write(CATS_KEY, Array.from(existingCats.values()));

  return {
    importedEvents: data.events?.length ?? 0,
    importedCategories: data.categories?.length ?? 0,
  };
}
