import type { Order } from '../domain/types.ts';
import type { Database } from './database.ts';

interface OrderRow {
  id: number;
  medication_id: number;
  quantity: number;
  reference: string;
  created_at: string;
}

export type NewOrder = Omit<Order, 'id'>;

const COLUMNS = 'id, medication_id, quantity, reference, created_at';

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    medicationId: row.medication_id,
    quantity: row.quantity,
    reference: row.reference,
    createdAt: row.created_at,
  };
}

export class OrderRepository {
  readonly #insert;
  readonly #since;

  constructor(db: Database) {
    this.#insert = db.prepare(
      `INSERT INTO orders (medication_id, quantity, reference, created_at)
       VALUES (?, ?, ?, ?) RETURNING ${COLUMNS}`,
    );
    this.#since = db.prepare(
      `SELECT ${COLUMNS} FROM orders WHERE created_at >= ? ORDER BY created_at`,
    );
  }

  add(order: NewOrder): Order {
    const row = this.#insert.get(
      order.medicationId,
      order.quantity,
      order.reference,
      order.createdAt,
    ) as OrderRow | undefined;
    if (!row) throw new Error('Failed to record order');
    return toOrder(row);
  }

  since(instant: string): Order[] {
    return (this.#since.all(instant) as unknown as OrderRow[]).map(toOrder);
  }
}
