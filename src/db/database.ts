import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { migrations } from './migrations.ts';

export type Database = DatabaseSync;

export const IN_MEMORY = ':memory:';

export function openDatabase(path: string): Database {
  if (path !== IN_MEMORY) {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  if (path !== IN_MEMORY) {
    db.exec('PRAGMA journal_mode = WAL');
  }
  migrate(db);
  return db;
}

export function transaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function migrate(db: Database): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  for (const [index, sql] of migrations.entries()) {
    if (index < current) continue;
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${String(index + 1)}`);
    });
  }
}
