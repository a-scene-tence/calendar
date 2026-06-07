export type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  location?: string;
  description?: string;
  categoryId?: string;
  color?: string;
};

export type Category = {
  id: string;
  name: string;
  color: string;
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  events: CalendarEvent[];
  categories: Category[];
};
