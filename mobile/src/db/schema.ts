/**
 * The gradebook database on the phone (F13). The tables mirror the Supabase
 * tables (supabase/migrations/*_gradebook.sql) with two sync columns added:
 *
 *   dirty   — 0 when the row matches the cloud. Every local change adds 1, so a
 *             push can tell whether the row changed again while it was sending.
 *   deleted — 1 for a row deleted on this phone whose delete is not pushed yet.
 *
 * Signed out, rows just stay dirty: nothing is sent anywhere.
 */
import type { SqlDb } from './sql';

/** Each entry upgrades the database by one version (PRAGMA user_version). */
const MIGRATIONS: string[] = [
  `
  create table courses (
    id           text primary key not null,
    name         text not null,
    teacher      text,
    grading_mode text not null default 'weighted',
    position     integer not null default 0,
    source       text not null default 'manual',
    archived_at  text,
    dirty        integer not null default 0,
    deleted      integer not null default 0
  );
  create table grading_periods (
    id        text primary key not null,
    course_id text not null,
    name      text not null,
    kind      text not null default 'quarter',
    semester  integer,
    weight    real,
    position  integer not null default 0,
    dirty     integer not null default 0,
    deleted   integer not null default 0
  );
  create index grading_periods_course on grading_periods (course_id);
  create table categories (
    id          text primary key not null,
    period_id   text not null,
    name        text not null,
    weight      real,
    drop_lowest integer not null default 0,
    position    integer not null default 0,
    dirty       integer not null default 0,
    deleted     integer not null default 0
  );
  create index categories_period on categories (period_id);
  create table assignments (
    id             text primary key not null,
    category_id    text not null,
    title          text not null,
    due_date       text,
    max_score      real not null,
    actual_score   real,
    forecast_score real,
    excused        integer not null default 0,
    extra_credit   integer not null default 0,
    is_placeholder integer not null default 0,
    source         text not null default 'manual',
    position       integer not null default 0,
    dirty          integer not null default 0,
    deleted        integer not null default 0
  );
  create index assignments_category on assignments (category_id);
  create table upcoming_items (
    id           text primary key not null,
    course_id    text,
    external_uid text,
    title        text not null,
    due_at       text not null,
    url          text,
    dirty        integer not null default 0,
    deleted      integer not null default 0
  );
  create table meta (
    key   text primary key not null,
    value text
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: SqlDb): Promise<void> {
  const [{ user_version: version }] = await db.all<{ user_version: number }>('pragma user_version');
  for (let v = version; v < MIGRATIONS.length; v++) {
    await db.transaction(async () => {
      await db.exec(MIGRATIONS[v]);
      await db.exec(`pragma user_version = ${v + 1}`);
    });
  }
}
