import { useState } from 'react';

import { FormError, FormSheet } from '@/components/form-sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Row, Section, TextField } from '@/components/ui';
import { useGradebook } from '@/data/gradebook-store';
import type { FeedSaveResult } from '@/db/gradebook-repo';
import { formatRefreshed } from '@/lib/calendar-label';
import { confirmAction } from '@/lib/coming-soon';
import { useSave } from '@/lib/use-save';

function resultLine(r: FeedSaveResult): string {
  const parts = [`${r.added} new`, `${r.updated} changed`, `${r.removed} removed`];
  return `Calendar updated: ${parts.join(', ')}.`;
}

/** Connect, refresh or disconnect the Schoology calendar feed (F11). */
export default function CalendarFeedScreen() {
  const { calendar, connectCalendar, refreshCalendar, disconnectCalendar } = useGradebook();
  const [link, setLink] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { busy, error, save } = useSave();

  const connect = () =>
    save(
      () => connectCalendar(link),
      (r) => {
        // Stay here: the screen switches to the connected view and shows what was found.
        setLink('');
        setMessage(resultLine(r));
      },
    );

  if (calendar.connected) {
    return (
      <FormSheet>
        <Section footer="Your calendar link stays on this phone, in secure storage.">
          <Row label="Status" detail="Connected to your Schoology calendar" />
          <Row label="Last updated" detail={calendar.refreshing ? 'Updating…' : formatRefreshed(calendar.refreshedAt)} />
        </Section>
        {calendar.error ? <ThemedText themeColor="danger">{calendar.error}</ThemedText> : null}
        {message ? <ThemedText themeColor="textSecondary">{message}</ThemedText> : null}
        <FormError error={error} />
        <Button
          label={calendar.refreshing ? 'Updating…' : 'Update now'}
          variant="primary"
          disabled={busy || calendar.refreshing}
          onPress={() => save(refreshCalendar, (r) => setMessage(resultLine(r)))}
        />
        <Button
          label="Disconnect"
          disabled={busy}
          onPress={() =>
            confirmAction(
              'Disconnect your calendar?',
              'This forgets the calendar link and removes its items from Upcoming. Your grades are not changed.',
              'Disconnect',
              () => save(disconnectCalendar, () => setMessage(null)),
            )
          }
        />
      </FormSheet>
    );
  }

  return (
    <FormSheet>
      <ThemedText themeColor="textSecondary">
        Upcoming can show what is due from your Schoology calendar. To get your calendar link:
        {'\n\n'}1. Open Schoology in a web browser and go to Calendar.
        {'\n'}2. Click the gear (or the ⋯ menu) and choose &quot;iCal Feed&quot;.
        {'\n'}3. Copy the link (it starts with webcal://) and paste it here.
      </ThemedText>
      <TextField
        label="Calendar link"
        value={link}
        onChangeText={setLink}
        placeholder="webcal://app.schoology.com/calendar/feed/ical/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        autoFocus
      />
      <ThemedText type="small" themeColor="textSecondary">
        The link works like a password: anyone with it can see your calendar. It stays on this phone, in
        secure storage, and is only sent to Schoology.
      </ThemedText>
      <FormError error={error} />
      <Button
        label={busy ? 'Connecting…' : 'Connect'}
        variant="primary"
        disabled={busy || link.trim().length === 0}
        onPress={connect}
      />
    </FormSheet>
  );
}
