import type { Checkin, SleepQuality } from '../domain/types.ts';
import type { Database } from './database.ts';

interface CheckinRow {
  id: number;
  local_date: string;
  mood: number;
  sleep: SleepQuality;
  ate_well: number;
  note: string | null;
  recorded_at: string;
}

export type NewCheckin = Omit<Checkin, 'id'>;

const COLUMNS = 'id, local_date, mood, sleep, ate_well, note, recorded_at';

function toCheckin(row: CheckinRow): Checkin {
  return {
    id: row.id,
    date: row.local_date,
    mood: row.mood,
    sleep: row.sleep,
    ateWell: row.ate_well === 1,
    note: row.note,
    recordedAt: row.recorded_at,
  };
}

export class CheckinRepository {
  readonly #insert;
  readonly #listBetween;

  constructor(db: Database) {
    this.#insert = db.prepare(
      `INSERT INTO checkins (local_date, mood, sleep, ate_well, note, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
    );
    this.#listBetween = db.prepare(
      `SELECT ${COLUMNS} FROM checkins
       WHERE local_date BETWEEN ? AND ? ORDER BY local_date, recorded_at`,
    );
  }

  add(checkin: NewCheckin): Checkin {
    const row = this.#insert.get(
      checkin.date,
      checkin.mood,
      checkin.sleep,
      checkin.ateWell ? 1 : 0,
      checkin.note,
      checkin.recordedAt,
    ) as CheckinRow | undefined;
    if (!row) throw new Error('Failed to record check-in');
    return toCheckin(row);
  }

  listBetween(from: string, to: string): Checkin[] {
    return (this.#listBetween.all(from, to) as unknown as CheckinRow[]).map(toCheckin);
  }

  latestPerDay(from: string, to: string): Checkin[] {
    const byDate = new Map<string, Checkin>();
    for (const checkin of this.listBetween(from, to)) {
      byDate.set(checkin.date, checkin);
    }
    return [...byDate.values()];
  }
}
