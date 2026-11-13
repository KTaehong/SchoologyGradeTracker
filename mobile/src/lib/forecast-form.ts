/**
 * Checks the forecast form before anything is sent to the server, so the
 * student sees a clear message right away.
 */
import type { NewForecast } from '@/api/grades';
import { MAX_SCORE, NAME_LIMITS } from '@/sync/server-limits';

import { DUE_DATE_ERROR, parseDueDate } from './due-date';

export type FormResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** A number typed by the student: digits with an optional `.` or `,` decimal. */
export function parseScore(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

export function validateForecastScore(text: string): FormResult<number> {
  const score = parseScore(text);
  if (score === null) {
    return { ok: false, error: 'Enter the points you expect, for example 8 or 8.5.' };
  }
  if (score > MAX_SCORE) {
    return { ok: false, error: 'That score is too large.' };
  }
  return { ok: true, value: score };
}

export type NewForecastForm = {
  categoryId: string | null;
  title: string;
  maxScore: string;
  forecastScore: string;
  /** Optional, as typed: `11/23`, `Nov 23`, `2026-11-23`… (see parseDueDate). */
  dueDate: string;
};

export function validateNewForecast(form: NewForecastForm): FormResult<NewForecast> {
  if (!form.categoryId) {
    return { ok: false, error: 'Pick the category this work belongs to.' };
  }
  const title = form.title.trim();
  if (!title) {
    return { ok: false, error: 'Give the work a name, for example "Unit 4 Test".' };
  }
  if (title.length > NAME_LIMITS.assignment) {
    return { ok: false, error: `The name is too long (${NAME_LIMITS.assignment} characters at most).` };
  }
  const maxScore = parseScore(form.maxScore);
  if (maxScore === null || maxScore <= 0) {
    return { ok: false, error: 'Points possible must be a number more than 0.' };
  }
  if (maxScore > MAX_SCORE) {
    return { ok: false, error: 'That score is too large.' };
  }
  const forecast = validateForecastScore(form.forecastScore);
  if (!forecast.ok) {
    return forecast;
  }
  const dueDate = parseDueDate(form.dueDate);
  if (dueDate === null) {
    return { ok: false, error: DUE_DATE_ERROR };
  }
  return {
    ok: true,
    value: {
      categoryId: form.categoryId,
      title,
      maxScore,
      forecastScore: forecast.value,
      dueDate: dueDate || null,
    },
  };
}
