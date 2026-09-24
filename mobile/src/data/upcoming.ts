import { type UpcomingItem } from './types';

export type UpcomingDay = {
  /** Local calendar date as `YYYY-MM-DD`. */
  date: string;
  items: UpcomingItem[];
};

/** Items due from the start of today onward, grouped by local day, soonest first. */
export function groupUpcomingByDay(items: UpcomingItem[], now: Date = new Date()): UpcomingDay[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const sorted = items
    .filter((item) => new Date(item.dueAt).getTime() >= startOfToday.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  const days: UpcomingDay[] = [];
  for (const item of sorted) {
    const date = localDateKey(new Date(item.dueAt));
    const last = days[days.length - 1];
    if (last && last.date === date) {
      last.items.push(item);
    } else {
      days.push({ date, items: [item] });
    }
  }
  return days;
}

/** "Today", "Tomorrow", or a short date such as "Mon, Oct 5". */
export function formatDayLabel(date: string, now: Date = new Date()): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return target.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDueTime(dueAt: string): string {
  return new Date(dueAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
