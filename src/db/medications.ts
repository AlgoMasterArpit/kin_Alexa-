import type { Medication } from '../domain/types.ts';
import type { Database } from './database.ts';

interface MedicationRow {
  id: number;
  name: string;
  dosage: string;
  purpose: string | null;
  aliases: string;
  schedule: string;
  pills_remaining: number | null;
}

export interface NewMedication {
  readonly name: string;
  readonly dosage: string;
  readonly purpose?: string | undefined;
  readonly aliases?: readonly string[] | undefined;
  readonly schedule: readonly string[];
  readonly pillsRemaining?: number | undefined;
  readonly createdAt: string;
}

const COLUMNS = 'id, name, dosage, purpose, aliases, schedule, pills_remaining';

function toMedication(row: MedicationRow): Medication {
  return {
    id: row.id,
    name: row.name,
    dosage: row.dosage,
    purpose: row.purpose,
    aliases: JSON.parse(row.aliases) as string[],
    schedule: (JSON.parse(row.schedule) as string[]).toSorted(),
    pillsRemaining: row.pills_remaining,
  };
}

export class MedicationRepository {
  readonly #insert;
  readonly #listActive;
  readonly #findById;
  readonly #adjustPills;

  constructor(db: Database) {
    this.#insert = db.prepare(
      `INSERT INTO medications (name, dosage, purpose, aliases, schedule, pills_remaining, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
    );
    this.#listActive = db.prepare(
      `SELECT ${COLUMNS} FROM medications WHERE active = 1 ORDER BY name`,
    );
    this.#findById = db.prepare(`SELECT ${COLUMNS} FROM medications WHERE id = ?`);
    this.#adjustPills = db.prepare(
      `UPDATE medications SET pills_remaining = MAX(pills_remaining + ?, 0)
       WHERE id = ? AND pills_remaining IS NOT NULL`,
    );
  }

  create(input: NewMedication): Medication {
    const row = this.#insert.get(
      input.name,
      input.dosage,
      input.purpose ?? null,
      JSON.stringify(input.aliases ?? []),
      JSON.stringify(input.schedule),
      input.pillsRemaining ?? null,
      input.createdAt,
    ) as MedicationRow | undefined;
    if (!row) throw new Error(`Failed to create medication ${input.name}`);
    return toMedication(row);
  }

  listActive(): Medication[] {
    return (this.#listActive.all() as unknown as MedicationRow[]).map(toMedication);
  }

  findById(id: number): Medication | undefined {
    const row = this.#findById.get(id) as MedicationRow | undefined;
    return row && toMedication(row);
  }

  adjustPills(id: number, delta: number): void {
    this.#adjustPills.run(delta, id);
  }
}
