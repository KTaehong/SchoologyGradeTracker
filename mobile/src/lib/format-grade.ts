/** `90.00%`, or `—` when nothing is graded yet. */
export function formatPercent(percent: number | null): string {
  return percent === null ? '—' : `${percent.toFixed(2)}%`;
}

/** `90.00% · A-`, or `—` when nothing is graded yet. */
export function formatGrade(grade: { percent: number | null; letter: string | null }): string {
  if (grade.percent === null) {
    return '—';
  }
  return grade.letter ? `${formatPercent(grade.percent)} · ${grade.letter}` : formatPercent(grade.percent);
}

/** `8 / 10`, trimming needless decimals. */
export function formatPoints(score: number, maxScore: number): string {
  return `${formatNumber(score)} / ${formatNumber(maxScore)}`;
}

/** `8.5`, `8`, at most 2 decimals. */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
