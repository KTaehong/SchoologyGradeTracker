/**
 * Screenshot import (F04, T2.2): turns the text lines read off a photo of a
 * Schoology grades page into assignment rows, and guesses which class and
 * category they belong to.
 *
 * Text readers return lines in reading order, but a grades page has columns:
 * often all the names come first and all the scores after them. So names wait
 * in a queue and each score is given to the oldest waiting name. That works
 * both when each name sits right above its score and when the columns are read
 * one after the other. When the counts do not match, `needsReview` is set and
 * the leftovers are returned so the student can fix them before saving.
 *
 * Plain functions with no phone APIs, so all of it is tested in Jest.
 */

export type RowStatus = 'graded' | 'missing' | 'excused' | 'ungraded';

export type ParsedRow = {
  title: string;
  /** Points earned; `null` when not graded or excused. */
  earned: number | null;
  /** Points possible; `null` when the screenshot did not show it. */
  max: number | null;
  status: RowStatus;
  /** `YYYY-MM-DD` when a due date was read next to the name. */
  dueDate: string | null;
  /** The category heading above this row, as written on the screenshot. */
  category: string | null;
};

export type ParsedScreenshot = {
  rows: ParsedRow[];
  /** Category headings in the order they appeared, e.g. "Tests (40%)" → "Tests". */
  categories: string[];
  /** Text above the first category heading that was not a graded row, like the class name. */
  header: string[];
  /** Names that never got a score, and scores that never got a name. */
  leftoverTitles: string[];
  leftoverScores: string[];
  /** True when something did not line up and the student should check the rows. */
  needsReview: boolean;
};

type Score = { earned: number | null; max: number | null; status: RowStatus; text: string };

// A number as text readers see it: O for 0 and l or I for 1 are common mix-ups,
// but it must hold a real digit so words like "Read/Il" are not scores.
const NUM = String.raw`(?=[\dOoIl]*\d)[\dOoIl]+(?:[.,][\dOo]+)?`;
const FRACTION = new RegExp(String.raw`(${NUM}|[-–—]+)\s*/\s*(${NUM})`);
const FRACTION_AT_END = new RegExp(
  String.raw`(?:^|\s)(${NUM}|[-–—]+)\s*/\s*(${NUM})(?:\s*\(?\d+(?:\.\d+)?\s*%\)?)?\s*$`,
);
const STATUS_WORDS: [RegExp, RowStatus][] = [
  [/^missing$/i, 'missing'],
  [/^excused$/i, 'excused'],
  [/^(?:not graded|ungraded|[-–—]+)$/i, 'ungraded'],
];
const NUMERIC_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b(?:\s+\d{1,2}:\d{2}\s*[ap]\.?m\.?)?/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WORD_DATE =
  /\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b(?:\s+(?:at\s+)?\d{1,2}:\d{2}\s*[ap]\.?m\.?)?/i;
const DUE_PREFIX = /^\s*due[:\s]*/i;
const WEIGHTED_HEADING = /^(.*?\S)\s*\(?\s*(?:weight[:\s]*)?(\d+(?:\.\d+)?)\s*%\s*\)?$/i;
const PERCENT_OR_LETTER = /^(?:\d+(?:\.\d+)?\s*%|[A-F][+-]?|\(?\d+(?:\.\d+)?%\)?\s+[A-F][+-]?|[A-F][+-]?\s+\(?\d+(?:\.\d+)?%\)?)$/;
// Page chrome Schoology shows around the grades list.
const NOISE =
  /^(?:grades?|course grades?|grade|score|due|due date|assignment|assignments|comments?|materials|updates|members|course options|overall|show all|print|\d{1,2}:\d{2}(?:\s*[ap]m)?|[|•·.,:;\-–—_]+)$/i;

function toNumber(text: string): number {
  const fixed = text.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(',', '.');
  return Number(fixed);
}

function readScore(earnedText: string, maxText: string): Score | null {
  const max = toNumber(maxText);
  if (!Number.isFinite(max)) {
    return null;
  }
  const text = `${earnedText}/${maxText}`;
  if (/^[-–—]+$/.test(earnedText)) {
    return { earned: null, max, status: 'ungraded', text };
  }
  const earned = toNumber(earnedText);
  return Number.isFinite(earned) ? { earned, max, status: 'graded', text } : null;
}

/** A line that is only a score, like "18 / 20", "18/20 (90%)", or "Missing". */
function scoreOnly(line: string): Score | null {
  for (const [pattern, status] of STATUS_WORDS) {
    if (pattern.test(line)) {
      return { earned: null, max: null, status, text: line };
    }
  }
  const m = new RegExp(String.raw`^(${NUM}|[-–—]+)\s*/\s*(${NUM})(?:\s*\(?\d+(?:\.\d+)?\s*%\)?)?$`).exec(line);
  return m ? readScore(m[1], m[2]) : null;
}

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Finds a due date in the line and returns it with the line minus the date. */
function takeDate(line: string): { date: string | null; rest: string } {
  const numeric = NUMERIC_DATE.exec(line);
  if (numeric) {
    const year = Number(numeric[3]) + (numeric[3].length === 2 ? 2000 : 0);
    return {
      date: isoDate(year, Number(numeric[1]), Number(numeric[2])),
      rest: line.replace(numeric[0], ' '),
    };
  }
  const word = WORD_DATE.exec(line);
  if (word) {
    const month = MONTHS.indexOf(word[1].toLowerCase()) + 1;
    return { date: isoDate(Number(word[3]), month, Number(word[2])), rest: line.replace(word[0], ' ') };
  }
  return { date: null, rest: line };
}

function cleanTitle(text: string): string {
  return text
    .replace(DUE_PREFIX, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s|•·:\-–—]+|[\s|•·:\-–—]+$/g, '')
    .trim();
}

/** Splits what a text reader returns (it may put several lines in one string) into trimmed lines. */
export function toLines(texts: string[]): string[] {
  return texts
    .flatMap((t) => t.split(/\r?\n/))
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function parseScreenshot(lines: string[]): ParsedScreenshot {
  const rows: ParsedRow[] = [];
  const categories: string[] = [];
  const waiting: ParsedRow[] = [];
  const leftoverScores: string[] = [];
  const header: string[] = [];
  let category: string | null = null;
  let last: ParsedRow | null = null;

  const giveScore = (score: Score) => {
    const row = waiting.shift();
    if (!row) {
      leftoverScores.push(score.text);
      return;
    }
    Object.assign(row, { earned: score.earned, max: score.max, status: score.status });
    rows.push(row);
  };

  for (const raw of toLines(lines)) {
    const line = raw.replace(/\s+/g, ' ');

    const score = scoreOnly(line);
    if (score) {
      giveScore(score);
      continue;
    }
    if (NOISE.test(line) || PERCENT_OR_LETTER.test(line)) {
      continue;
    }

    const { date, rest } = takeDate(line);
    const restClean = cleanTitle(rest);
    if (date && !restClean) {
      // A date on its own line belongs to the name just above it.
      if (last && !last.dueDate) {
        last.dueDate = date;
      }
      continue;
    }

    const heading = WEIGHTED_HEADING.exec(restClean);
    if (heading && !FRACTION.test(restClean)) {
      category = heading[1].replace(/[\s:\-–—]+$/, '');
      if (categories.length === 0) {
        // Names still waiting above the first heading are the page title, not rows.
        header.push(...waiting.splice(0).map((row) => row.title));
      }
      categories.push(category);
      continue;
    }

    // A name with its score on the same line.
    const inline = FRACTION_AT_END.exec(restClean);
    const statusAtEnd = /\s(missing|excused)$/i.exec(restClean);
    let title = restClean;
    let inlineScore: Score | null = null;
    if (inline) {
      inlineScore = readScore(inline[1], inline[2]);
      title = cleanTitle(restClean.slice(0, inline.index));
    } else if (statusAtEnd) {
      inlineScore = scoreOnly(statusAtEnd[1]);
      title = cleanTitle(restClean.slice(0, statusAtEnd.index));
    }
    if (!title) {
      if (inlineScore) {
        giveScore(inlineScore);
      }
      continue;
    }

    const row: ParsedRow = {
      title,
      earned: null,
      max: null,
      status: 'ungraded',
      dueDate: date,
      category,
    };
    last = row;
    if (inlineScore) {
      Object.assign(row, { earned: inlineScore.earned, max: inlineScore.max, status: inlineScore.status });
      rows.push(row);
    } else {
      waiting.push(row);
    }
  }

  const leftoverTitles = waiting.map((row) => row.title);
  return {
    rows,
    categories,
    header,
    leftoverTitles,
    leftoverScores,
    needsReview: leftoverTitles.length > 0 || leftoverScores.length > 0,
  };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * The class whose name shows up in the screenshot text, or `null`. Schoology
 * titles are often "AP Biology: Section 3", so the part before ":" or " - "
 * also counts when it is long enough to be specific.
 */
export function matchCourse<T extends { id: string; name: string }>(
  lines: string[],
  courses: T[],
): T | null {
  const text = ` ${normalize(lines.join(' '))} `;
  const byLength = [...courses].sort((a, b) => b.name.length - a.name.length);
  for (const course of byLength) {
    if (text.includes(` ${normalize(course.name)} `)) {
      return course;
    }
  }
  for (const course of byLength) {
    const head = normalize(course.name.split(/:| - /)[0]);
    if (head.length > 4 && text.includes(` ${head} `)) {
      return course;
    }
  }
  return null;
}

/** The category whose name matches a heading read off the screenshot, or `null`. */
export function matchCategory<T extends { id: string; name: string }>(
  heading: string | null,
  categories: T[],
): T | null {
  if (!heading) {
    return null;
  }
  const h = normalize(heading);
  return (
    categories.find((c) => normalize(c.name) === h) ??
    categories.find((c) => {
      const n = normalize(c.name);
      return n.length > 2 && (h.includes(n) || n.includes(h));
    }) ??
    null
  );
}
