/** "Just now", "12 min ago", "3 hr ago", or a short date, for when the calendar was last read. */
export function formatRefreshed(at: string | null, now: Date = new Date()): string {
  if (!at) return 'Never';
  const minutes = Math.round((now.getTime() - new Date(at).getTime()) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
