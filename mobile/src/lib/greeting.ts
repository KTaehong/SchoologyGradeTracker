/** "Good morning" / "Good afternoon" / "Good evening" for the Home title. */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * The first name from the sign-in profile. Email sign-up stores `full_name`;
 * Google and Microsoft send `full_name` or `name`.
 */
export function firstName(metadata: Record<string, unknown> | undefined): string | null {
  const full = metadata?.full_name ?? metadata?.name;
  if (typeof full !== 'string') return null;
  const first = full.trim().split(/\s+/)[0];
  return first || null;
}
