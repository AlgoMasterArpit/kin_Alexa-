import type { Alert, AlertDelivery, AlertSeverity } from '../domain/types.ts';
import type { Database } from './database.ts';

interface AlertRow {
  id: number;
  severity: AlertSeverity;
  title: string;
  message: string;
  delivery: AlertDelivery;
  created_at: string;
}

export type NewAlert = Omit<Alert, 'id'>;

const COLUMNS = 'id, severity, title, message, delivery, created_at';

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    severity: row.severity,
    title: row.title,
    message: row.message,
    delivery: row.delivery,
    createdAt: row.created_at,
  };
}

export class AlertRepository {
  readonly #insert;
  readonly #since;

  constructor(db: Database) {
    this.#insert = db.prepare(
      `INSERT INTO alerts (severity, title, message, delivery, created_at)
       VALUES (?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
    );
    this.#since = db.prepare(
      `SELECT ${COLUMNS} FROM alerts WHERE created_at >= ? ORDER BY created_at`,
    );
  }

  add(alert: NewAlert): Alert {
    const row = this.#insert.get(
      alert.severity,
      alert.title,
      alert.message,
      alert.delivery,
      alert.createdAt,
    ) as AlertRow | undefined;
    if (!row) throw new Error('Failed to record alert');
    return toAlert(row);
  }

  since(instant: string): Alert[] {
    return (this.#since.all(instant) as unknown as AlertRow[]).map(toAlert);
  }
}
