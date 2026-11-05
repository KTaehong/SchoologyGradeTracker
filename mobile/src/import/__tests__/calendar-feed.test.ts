import { describe, expect, it } from '@jest/globals';

import type { GradeCourse } from '@/engine/types';
import {
  CalendarFeedError,
  fetchCalendar,
  matchEventCourse,
  normalizeFeedUrl,
  parseIcal,
  toFeedItems,
} from '@/import/calendar-feed';

const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Schoology Inc//Schoology//EN',
  'BEGIN:VEVENT',
  'UID:sgy-assignment-9002@schoology.com',
  'DTSTART:20261110T045900Z',
  'SUMMARY:Unit 2 Test \\& Lab Practical',
  'URL:https://app.schoology.com/assignment/9002',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:sgy-event-77@schoology.com',
  'DTSTART;VALUE=DATE:20261106',
  'SUMMARY:Club Fair\\, Gym',
  'DESCRIPTION:Bring a friend.\\nAll welcome',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:sgy-assignment-555@schoology.com',
  'DTSTART;TZID=America/New_York:20261112T080000',
  'SUMMARY:Gatsby essay final draft for English 11 - turn in on Turni',
  ' tin',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:no-start@schoology.com',
  'SUMMARY:Broken item',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function course(id: string, name: string, titles: string[]): GradeCourse {
  return {
    id,
    name,
    teacher: null,
    gradingMode: 'points',
    position: 1,
    periods: [
      {
        id: `${id}-p`,
        name: 'Q1',
        kind: 'quarter',
        semester: null,
        weight: null,
        position: 1,
        categories: [
          {
            id: `${id}-k`,
            name: 'All',
            weight: null,
            dropLowest: 0,
            position: 1,
            assignments: titles.map((title, i) => ({
              id: `${id}-a${i}`,
              title,
              dueDate: null,
              maxScore: 10,
              actualScore: null,
              forecastScore: null,
              excused: false,
              extraCredit: false,
              isPlaceholder: false,
              position: i + 1,
            })),
          },
        ],
      },
    ],
  };
}

const courses = [
  course('bio', 'AP Biology: Section 3', ['Unit 2 Test & Lab Practical']),
  course('eng', 'English 11: P4', ['Gatsby Essay Draft']),
];

describe('parseIcal', () => {
  const events = parseIcal(FEED);

  it('reads timed, all-day and TZID events, skips ones with no start, and sorts by due time', () => {
    expect(events.map((e) => e.title)).toEqual([
      'Club Fair, Gym',
      'Unit 2 Test & Lab Practical',
      'Gatsby essay final draft for English 11 - turn in on Turnitin',
    ]);
  });

  it('reads UTC times exactly', () => {
    expect(events[1].dueAt).toBe('2026-11-10T04:59:00.000Z');
    expect(events[1].allDay).toBe(false);
    expect(events[1].url).toBe('https://app.schoology.com/assignment/9002');
    expect(events[1].uid).toBe('sgy-assignment-9002@schoology.com');
  });

  it('puts all-day items at 11:59 PM local time', () => {
    const due = new Date(events[0].dueAt);
    expect(events[0].allDay).toBe(true);
    expect([due.getFullYear(), due.getMonth() + 1, due.getDate(), due.getHours(), due.getMinutes()]).toEqual([
      2026, 11, 6, 23, 59,
    ]);
    expect(events[0].description).toBe('Bring a friend.\nAll welcome');
  });

  it('reads times with a TZID as local time', () => {
    const due = new Date(events[2].dueAt);
    expect([due.getDate(), due.getHours(), due.getMinutes()]).toEqual([12, 8, 0]);
  });

  it('returns nothing for text that is not a calendar', () => {
    expect(parseIcal('hello')).toEqual([]);
  });
});

describe('matchEventCourse', () => {
  it('matches an assignment with the same name', () => {
    expect(matchEventCourse({ title: 'Unit 2 Test & Lab Practical', description: null }, courses)).toBe('bio');
  });

  it('matches a class named in the item', () => {
    expect(
      matchEventCourse({ title: 'Gatsby essay final draft for English 11 - turn in', description: null }, courses),
    ).toBe('eng');
    expect(matchEventCourse({ title: 'Lab', description: 'For AP Biology students' }, courses)).toBe('bio');
  });

  it('matches when one name contains the other', () => {
    expect(matchEventCourse({ title: 'Gatsby Essay Draft (revised)', description: null }, courses)).toBe('eng');
  });

  it('leaves unknown items unfiled', () => {
    expect(matchEventCourse({ title: 'Club Fair', description: null }, courses)).toBeNull();
    expect(matchEventCourse({ title: '   ', description: null }, courses)).toBeNull();
  });
});

describe('toFeedItems', () => {
  it('keeps last week through six months ahead, with prefixed ids and classes', () => {
    const events = parseIcal(FEED);
    const items = toFeedItems(events, courses, new Date('2026-11-04T12:00:00Z'));
    expect(items.map((i) => [i.externalUid, i.courseId])).toEqual([
      ['ical:sgy-event-77@schoology.com', null],
      ['ical:sgy-assignment-9002@schoology.com', 'bio'],
      ['ical:sgy-assignment-555@schoology.com', 'eng'],
    ]);
    expect(toFeedItems(events, courses, new Date('2027-12-01T00:00:00Z'))).toEqual([]);
  });
});

describe('normalizeFeedUrl', () => {
  it('turns webcal links into https', () => {
    expect(normalizeFeedUrl('  webcal://app.schoology.com/calendar/feed/ical/123/abc/ical.ics ')).toBe(
      'https://app.schoology.com/calendar/feed/ical/123/abc/ical.ics',
    );
    expect(normalizeFeedUrl('http://school.schoology.com/ical/1')).toBe('https://school.schoology.com/ical/1');
  });

  it('rejects things that are not links', () => {
    expect(() => normalizeFeedUrl('my calendar')).toThrow(CalendarFeedError);
    expect(() => normalizeFeedUrl('')).toThrow(CalendarFeedError);
  });
});

describe('fetchCalendar', () => {
  const reply = (status: number, body: string) => async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });

  it('returns the parsed events', async () => {
    const events = await fetchCalendar('https://x.test/f', reply(200, FEED));
    expect(events).toHaveLength(3);
  });

  it('explains a rejected link, a server error, a non-calendar reply, and no connection', async () => {
    await expect(fetchCalendar('https://x.test/f', reply(403, ''))).rejects.toThrow(/did not accept/);
    await expect(fetchCalendar('https://x.test/f', reply(500, ''))).rejects.toThrow(/error 500/);
    await expect(fetchCalendar('https://x.test/f', reply(200, '<html>login</html>'))).rejects.toThrow(
      /did not return a calendar/,
    );
    await expect(
      fetchCalendar('https://x.test/f', async () => {
        throw new TypeError('Network request failed');
      }),
    ).rejects.toThrow(/Could not reach Schoology/);
  });
});
