import type { DoseEvent, DoseStatus } from '../domain/types.ts';
import type { Database } from './database.ts';

interface DoseRow {
  medication_id: number;
  scheduled_date: string;
  scheduled_time: string;
  status: DoseStatus;
  recorded_at: string;
}

const COLUMNS = 'medication_id, scheduled_date, scheduled_time, status, recorded_at';

function toDoseEvent(row: DoseRow): DoseEvent {
  return {
    medicationId: row.medication_id,
    date: row.scheduled_date,
    time: row.scheduled_time,
    status: row.status,
    recordedAt: row.recorded_at,
  };
}

export class DoseRepository {
  readonly #upsert;
  readonly #find;
  readonly #listBetween;

  constructor(db: Database) {
    this.#upsert = db.prepare(
      `INSERT INTO dose_events (${COLUMNS}) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (medication_id, scheduled_date, scheduled_time)
       DO UPDATE SET status = excluded.status, recorded_at = excluded.recorded_at`,
    );
    this.#find = db.prepare(
      `SELECT ${COLUMNS} FROM dose_events
       WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ?`,
    );
    this.#listBetween = db.prepare(
      `SELECT ${COLUMNS} FROM dose_events
       WHERE scheduled_date BETWEEN ? AND ? ORDER BY scheduled_date, scheduled_time`,
    );
  }

  upsert(event: DoseEvent): void {
    this.#upsert.run(event.medicationId, event.date, event.time, event.status, event.recordedAt);
  }

  find(medicationId: number, date: string, time: string): DoseEvent | undefined {
    const row = this.#find.get(medicationId, date, time) as DoseRow | undefined;
    return row && toDoseEvent(row);
  }

  listBetween(from: string, to: string): DoseEvent[] {
    return (this.#listBetween.all(from, to) as unknown as DoseRow[]).map(toDoseEvent);
  }
}
