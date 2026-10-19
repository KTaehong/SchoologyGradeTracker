/**
 * Reads and writes the gradebook in the phone's database (F13).
 *
 * Every write here is a local change: it bumps the row's `dirty` counter so
 * the sync engine (src/sync/) knows to push it. Rows that come down from the
 * cloud are written by the sync engine instead, with `dirty = 0`.
 */
import type { NewForecast } from '@/api/grades';
import type { UpcomingItem } from '@/data/types';
import type {
  GradeAssignment,
  GradeCategory,
  GradeCourse,
  GradePeriod,
  GradingMode,
  PeriodKind,
} from '@/engine/types';

import { first, type SqlDb } from './sql';
import { CHILDREN, SYNC_TABLES, type SyncTable } from './tables';

export type Source = 'manual' | 'screenshot' | 'report' | 'sample';

type CourseRow = {
  id: string;
  name: string;
  teacher: string | null;
  grading_mode: GradingMode;
  position: number;
  source: Source;
};
type PeriodRow = {
  id: string;
  course_id: string;
  name: string;
  kind: PeriodKind;
  semester: number | null;
  weight: number | null;
  position: number;
};
type CategoryRow = {
  id: string;
  period_id: string;
  name: string;
  weight: number | null;
  drop_lowest: number;
  position: number;
};
type AssignmentRow = {
  id: string;
  category_id: string;
  title: string;
  due_date: string | null;
  max_score: number;
  actual_score: number | null;
  forecast_score: number | null;
  excused: number;
  extra_credit: number;
  is_placeholder: number;
  position: number;
};
type UpcomingRow = {
  id: string;
  course_id: string | null;
  title: string;
  due_at: string;
  url: string | null;
};

function groupBy<T, K extends keyof T>(rows: T[], key: K): Map<T[K], T[]> {
  const groups = new Map<T[K], T[]>();
  for (const row of rows) {
    const list = groups.get(row[key]);
    if (list) list.push(row);
    else groups.set(row[key], [row]);
  }
  return groups;
}

/** Every course (not archived or deleted), nested for the grade engine, in display order. */
export async function readCourses(db: SqlDb): Promise<GradeCourse[]> {
  const courses = await db.all<CourseRow>(
    'select * from courses where deleted = 0 and archived_at is null order by position, name',
  );
  const periods = groupBy(
    await db.all<PeriodRow>('select * from grading_periods where deleted = 0 order by position, name'),
    'course_id',
  );
  const categories = groupBy(
    await db.all<CategoryRow>('select * from categories where deleted = 0 order by position, name'),
    'period_id',
  );
  const assignments = groupBy(
    await db.all<AssignmentRow>('select * from assignments where deleted = 0 order by position, title'),
    'category_id',
  );

  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    teacher: c.teacher,
    gradingMode: c.grading_mode,
    position: c.position,
    periods: (periods.get(c.id) ?? []).map(
      (p): GradePeriod => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        semester: p.semester,
        weight: p.weight,
        position: p.position,
        categories: (categories.get(p.id) ?? []).map(
          (k): GradeCategory => ({
            id: k.id,
            name: k.name,
            weight: k.weight,
            dropLowest: k.drop_lowest,
            position: k.position,
            assignments: (assignments.get(k.id) ?? []).map(
              (a): GradeAssignment => ({
                id: a.id,
                title: a.title,
                dueDate: a.due_date,
                maxScore: a.max_score,
                actualScore: a.actual_score,
                forecastScore: a.forecast_score,
                excused: a.excused === 1,
                extraCredit: a.extra_credit === 1,
                isPlaceholder: a.is_placeholder === 1,
                position: a.position,
              }),
            ),
          }),
        ),
      }),
    ),
  }));
}

export async function readUpcoming(db: SqlDb): Promise<UpcomingItem[]> {
  const rows = await db.all<UpcomingRow>('select * from upcoming_items where deleted = 0 order by due_at');
  return rows.map((r) => ({ id: r.id, title: r.title, courseId: r.course_id, dueAt: r.due_at, url: r.url }));
}

const bool = (value: boolean) => (value ? 1 : 0);

/** Adds whole courses (for example the sample, or an import). */
export async function insertCourses(db: SqlDb, courses: GradeCourse[], source: Source): Promise<void> {
  await db.transaction(async () => {
    for (const c of courses) {
      await db.run(
        `insert into courses (id, name, teacher, grading_mode, position, source, dirty)
         values (?, ?, ?, ?, ?, ?, 1)`,
        [c.id, c.name, c.teacher, c.gradingMode, c.position, source],
      );
      for (const p of c.periods) {
        await db.run(
          `insert into grading_periods (id, course_id, name, kind, semester, weight, position, dirty)
           values (?, ?, ?, ?, ?, ?, ?, 1)`,
          [p.id, c.id, p.name, p.kind, p.semester, p.weight, p.position],
        );
        for (const k of p.categories) {
          await db.run(
            `insert into categories (id, period_id, name, weight, drop_lowest, position, dirty)
             values (?, ?, ?, ?, ?, ?, 1)`,
            [k.id, p.id, k.name, k.weight, k.dropLowest, k.position],
          );
          for (const a of k.assignments) {
            await db.run(
              `insert into assignments (id, category_id, title, due_date, max_score, actual_score,
                 forecast_score, excused, extra_credit, is_placeholder, source, position, dirty)
               values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
              [
                a.id,
                k.id,
                a.title,
                a.dueDate,
                a.maxScore,
                a.actualScore,
                a.forecastScore,
                bool(a.excused),
                bool(a.extraCredit),
                bool(a.isPlaceholder),
                source,
                a.position,
              ],
            );
          }
        }
      }
    }
  });
}

export async function insertUpcoming(
  db: SqlDb,
  items: (Omit<UpcomingItem, 'url'> & { url?: string | null; externalUid?: string })[],
): Promise<void> {
  await db.transaction(async () => {
    for (const item of items) {
      await db.run(
        `insert into upcoming_items (id, course_id, external_uid, title, due_at, url, dirty)
         values (?, ?, ?, ?, ?, ?, 1)`,
        [item.id, item.courseId, item.externalUid ?? item.id, item.title, item.dueAt, item.url ?? null],
      );
    }
  });
}

/**
 * Deletes every course and upcoming item. With `keepTombstones` (signed in),
 * the rows stay marked deleted until the deletes are pushed to the cloud.
 */
export async function eraseGradebook(db: SqlDb, keepTombstones: boolean): Promise<void> {
  await db.transaction(async () => {
    for (const table of SYNC_TABLES) {
      if (keepTombstones) {
        await db.run(`update ${table} set deleted = 1, dirty = dirty + 1 where deleted = 0`);
      } else {
        await db.run(`delete from ${table}`);
      }
    }
  });
}

/** Deletes everything on this phone with no tombstones (sign-out, switching accounts). */
export async function wipeLocalData(db: SqlDb): Promise<void> {
  await db.transaction(async () => {
    for (const table of SYNC_TABLES) {
      await db.run(`delete from ${table}`);
    }
    await db.run(`delete from meta where key in ('account_id', 'sync_cursor', 'last_synced_at')`);
  });
}

/** Marks a row deleted (to push), and deletes its children here (the server cascades). */
async function deleteRow(db: SqlDb, table: SyncTable, id: string): Promise<void> {
  await db.run(`update ${table} set deleted = 1, dirty = dirty + 1 where id = ?`, [id]);
  for (const child of CHILDREN[table] ?? []) {
    const rows = await db.all<{ id: string }>(`select id from ${child.table} where ${child.column} = ?`, [id]);
    for (const row of rows) {
      await deleteRow(db, child.table, row.id);
    }
  }
}

export class NotFoundError extends Error {}

async function requireAssignment(db: SqlDb, id: string) {
  const row = await first<AssignmentRow>(db, 'select * from assignments where id = ? and deleted = 0', [id]);
  if (!row) {
    throw new NotFoundError('That assignment is no longer in your gradebook.');
  }
  return row;
}

/** Sets or changes the forecast on an assignment (F08). */
export async function setForecast(db: SqlDb, assignmentId: string, score: number): Promise<void> {
  await db.transaction(async () => {
    await requireAssignment(db, assignmentId);
    await db.run('update assignments set forecast_score = ?, dirty = dirty + 1 where id = ?', [
      score,
      assignmentId,
    ]);
  });
}

/** Forecasts work that is not in Schoology yet, as a placeholder assignment. */
export async function addForecast(db: SqlDb, id: string, forecast: NewForecast): Promise<void> {
  await db.transaction(async () => {
    const category = await first<{ id: string }>(
      db,
      'select id from categories where id = ? and deleted = 0',
      [forecast.categoryId],
    );
    if (!category) {
      throw new NotFoundError('That category is no longer in your gradebook.');
    }
    const next = await first<{ position: number }>(
      db,
      'select coalesce(max(position), 0) + 1 as position from assignments where category_id = ?',
      [forecast.categoryId],
    );
    await db.run(
      `insert into assignments (id, category_id, title, due_date, max_score, forecast_score,
         is_placeholder, source, position, dirty)
       values (?, ?, ?, ?, ?, ?, 1, 'manual', ?, 1)`,
      [
        id,
        forecast.categoryId,
        forecast.title,
        forecast.dueDate ?? null,
        forecast.maxScore,
        forecast.forecastScore,
        next?.position ?? 1,
      ],
    );
  });
}

/** Deletes a forecast-only item, or clears the forecast on a real assignment. */
export async function removeForecast(db: SqlDb, assignmentId: string): Promise<void> {
  await db.transaction(async () => {
    const row = await requireAssignment(db, assignmentId);
    if (row.is_placeholder === 1) {
      await deleteRow(db, 'assignments', assignmentId);
    } else {
      await db.run('update assignments set forecast_score = null, dirty = dirty + 1 where id = ?', [
        assignmentId,
      ]);
    }
  });
}

// -----------------------------------------------------------------------------
// Manual entry (F06): classes, categories and assignments typed in by hand
// -----------------------------------------------------------------------------

export type CourseFields = { name: string; teacher: string | null; gradingMode: GradingMode };
export type NewPeriod = { name: string; kind: PeriodKind };
export type CategoryFields = { name: string; weight: number | null; dropLowest: number };
export type AssignmentFields = {
  title: string;
  dueDate: string | null;
  maxScore: number;
  /** `null` = not graded yet. */
  actualScore: number | null;
  excused: boolean;
  extraCredit: boolean;
};

async function nextPosition(db: SqlDb, table: SyncTable, parentColumn?: string, parentId?: string) {
  const where = parentColumn ? `where ${parentColumn} = ?` : '';
  const row = await first<{ position: number }>(
    db,
    `select coalesce(max(position), 0) + 1 as position from ${table} ${where}`,
    parentId ? [parentId] : [],
  );
  return row?.position ?? 1;
}

async function requireRow(db: SqlDb, table: SyncTable, id: string, what: string) {
  const row = await first<{ id: string }>(db, `select id from ${table} where id = ? and deleted = 0`, [id]);
  if (!row) {
    throw new NotFoundError(`That ${what} is no longer in your gradebook.`);
  }
}

/** Adds an empty class with its grading periods. `newId` makes each row's id. */
export async function addCourse(
  db: SqlDb,
  newId: () => string,
  fields: CourseFields,
  periods: NewPeriod[],
): Promise<string> {
  const courseId = newId();
  await db.transaction(async () => {
    await db.run(
      `insert into courses (id, name, teacher, grading_mode, position, source, dirty)
       values (?, ?, ?, ?, ?, 'manual', 1)`,
      [courseId, fields.name, fields.teacher, fields.gradingMode, await nextPosition(db, 'courses')],
    );
    for (const [index, p] of periods.entries()) {
      await db.run(
        `insert into grading_periods (id, course_id, name, kind, position, dirty)
         values (?, ?, ?, ?, ?, 1)`,
        [newId(), courseId, p.name, p.kind, index + 1],
      );
    }
  });
  return courseId;
}

export async function updateCourse(db: SqlDb, courseId: string, fields: CourseFields): Promise<void> {
  await db.transaction(async () => {
    await requireRow(db, 'courses', courseId, 'class');
    await db.run(
      'update courses set name = ?, teacher = ?, grading_mode = ?, dirty = dirty + 1 where id = ?',
      [fields.name, fields.teacher, fields.gradingMode, courseId],
    );
  });
}

/** Deletes a class and everything in it. Its upcoming items stay, unfiled (as on the server). */
export async function deleteCourse(db: SqlDb, courseId: string): Promise<void> {
  await db.transaction(async () => {
    await requireRow(db, 'courses', courseId, 'class');
    await deleteRow(db, 'courses', courseId);
    await db.run(
      'update upcoming_items set course_id = null, dirty = dirty + 1 where course_id = ? and deleted = 0',
      [courseId],
    );
  });
}

export async function addCategory(
  db: SqlDb,
  id: string,
  periodId: string,
  fields: CategoryFields,
): Promise<void> {
  await db.transaction(async () => {
    await requireRow(db, 'grading_periods', periodId, 'grading period');
    await db.run(
      `insert into categories (id, period_id, name, weight, drop_lowest, position, dirty)
       values (?, ?, ?, ?, ?, ?, 1)`,
      [
        id,
        periodId,
        fields.name,
        fields.weight,
        fields.dropLowest,
        await nextPosition(db, 'categories', 'period_id', periodId),
      ],
    );
  });
}

export async function updateCategory(db: SqlDb, id: string, fields: CategoryFields): Promise<void> {
  await db.transaction(async () => {
    await requireRow(db, 'categories', id, 'category');
    await db.run(
      'update categories set name = ?, weight = ?, drop_lowest = ?, dirty = dirty + 1 where id = ?',
      [fields.name, fields.weight, fields.dropLowest, id],
    );
  });
}

/** Deletes a category and its assignments. */
export async function deleteCategory(db: SqlDb, id: string): Promise<void> {
  await db.transaction(async () => {
    await requireRow(db, 'categories', id, 'category');
    await deleteRow(db, 'categories', id);
  });
}

export async function addAssignment(
  db: SqlDb,
  id: string,
  categoryId: string,
  fields: AssignmentFields,
): Promise<void> {
  await db.transaction(async () => {
    await requireRow(db, 'categories', categoryId, 'category');
    await db.run(
      `insert into assignments (id, category_id, title, due_date, max_score, actual_score,
         excused, extra_credit, source, position, dirty)
       values (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, 1)`,
      [
        id,
        categoryId,
        fields.title,
        fields.dueDate,
        fields.maxScore,
        fields.actualScore,
        bool(fields.excused),
        bool(fields.extraCredit),
        await nextPosition(db, 'assignments', 'category_id', categoryId),
      ],
    );
  });
}

/**
 * Changes an assignment. Giving a forecast-only item a real score turns it
 * into a regular assignment (the server allows no score on a placeholder).
 */
export async function updateAssignment(db: SqlDb, id: string, fields: AssignmentFields): Promise<void> {
  await db.transaction(async () => {
    const row = await requireAssignment(db, id);
    const isPlaceholder = row.is_placeholder === 1 && fields.actualScore === null;
    await db.run(
      `update assignments set title = ?, due_date = ?, max_score = ?, actual_score = ?,
         excused = ?, extra_credit = ?, is_placeholder = ?, dirty = dirty + 1
       where id = ?`,
      [
        fields.title,
        fields.dueDate,
        fields.maxScore,
        fields.actualScore,
        bool(fields.excused),
        bool(fields.extraCredit),
        bool(isPlaceholder),
        id,
      ],
    );
  });
}

export async function deleteAssignment(db: SqlDb, id: string): Promise<void> {
  await db.transaction(async () => {
    await requireAssignment(db, id);
    await deleteRow(db, 'assignments', id);
  });
}

/** Rows changed on this phone and not yet in the cloud. */
export async function countPendingChanges(db: SqlDb): Promise<number> {
  let total = 0;
  for (const table of SYNC_TABLES) {
    const row = await first<{ n: number }>(db, `select count(*) as n from ${table} where dirty > 0`);
    total += row?.n ?? 0;
  }
  return total;
}

/** Whether there is anything besides the sample gradebook (worth uploading on sign-in). */
export async function hasOwnCourses(db: SqlDb): Promise<boolean> {
  const row = await first<{ n: number }>(
    db,
    "select count(*) as n from courses where deleted = 0 and source <> 'sample'",
  );
  return (row?.n ?? 0) > 0;
}

export async function getMeta(db: SqlDb, key: string): Promise<string | null> {
  const row = await first<{ value: string | null }>(db, 'select value from meta where key = ?', [key]);
  return row?.value ?? null;
}

export async function setMeta(db: SqlDb, key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db.run('delete from meta where key = ?', [key]);
  } else {
    await db.run('insert into meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value', [
      key,
      value,
    ]);
  }
}
