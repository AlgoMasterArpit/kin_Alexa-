import type { SlotRef } from '../domain/patterns.ts';
import type { Database } from './database.ts';

export class AlertDoseRepository {
  readonly #link;
  readonly #openAlertsFor;
  readonly #markCorrected;

  constructor(db: Database) {
    this.#link = db.prepare(
      `INSERT OR IGNORE INTO alert_doses (alert_id, medication_id, scheduled_date, scheduled_time)
       VALUES (?, ?, ?, ?)`,
    );
    this.#openAlertsFor = db.prepare(
      `SELECT DISTINCT alert_id FROM alert_doses
       WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ? AND corrected_at IS NULL`,
    );
    this.#markCorrected = db.prepare(
      `UPDATE alert_doses SET corrected_at = ?
       WHERE medication_id = ? AND scheduled_date = ? AND scheduled_time = ? AND corrected_at IS NULL`,
    );
  }

  link(alertId: number, slots: readonly SlotRef[]): void {
    for (const slot of slots) this.#link.run(alertId, slot.medicationId, slot.date, slot.time);
  }

  hasOpenAlert(slot: SlotRef): boolean {
    return this.#openAlertsFor.all(slot.medicationId, slot.date, slot.time).length > 0;
  }

  markCorrected(slot: SlotRef, at: string): void {
    this.#markCorrected.run(at, slot.medicationId, slot.date, slot.time);
  }
}
