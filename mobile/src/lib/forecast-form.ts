/**
 * Checks the forecast form before anything is sent to the server, so the
 * student sees a clear message right away.
 */
import type { NewForecast } from '@/api/grades';

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
  return { ok: true, value: score };
}

export type NewForecastForm = {
  categoryId: string | null;
  title: string;
  maxScore: string;
  forecastScore: string;
  /** Optional, `YYYY-MM-DD`. */
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
  const maxScore = parseScore(form.maxScore);
  if (maxScore === null || maxScore <= 0) {
    return { ok: false, error: 'Points possible must be a number more than 0.' };
  }
  const forecast = validateForecastScore(form.forecastScore);
  if (!forecast.ok) {
    return forecast;
  }
  const dueDate = form.dueDate.trim();
  if (dueDate && !isIsoDate(dueDate)) {
    return { ok: false, error: 'Write the due date as YYYY-MM-DD, or leave it empty.' };
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

function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(text);
}
