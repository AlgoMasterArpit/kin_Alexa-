import type { Database } from './database.ts';

export class WatchdogNoticeRepository {
  readonly #claim;
  readonly #release;

  constructor(db: Database) {
    this.#claim = db.prepare(
      'INSERT OR IGNORE INTO watchdog_notices (notice_key, local_date, created_at) VALUES (?, ?, ?)',
    );
    this.#release = db.prepare(
      'DELETE FROM watchdog_notices WHERE notice_key = ? AND local_date = ?',
    );
  }

  claim(key: string, localDate: string, at: string): boolean {
    return Number(this.#claim.run(key, localDate, at).changes) === 1;
  }

  release(key: string, localDate: string): void {
    this.#release.run(key, localDate);
  }
}
