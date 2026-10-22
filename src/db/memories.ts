import type { Memory } from '../domain/types.ts';
import type { Database } from './database.ts';

interface MemoryRow {
  id: number;
  content: string;
  remind_on: string | null;
  created_at: string;
}

export type NewMemory = Omit<Memory, 'id'>;

const COLUMNS = 'id, content, remind_on, created_at';

function toMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    content: row.content,
    remindOn: row.remind_on,
    createdAt: row.created_at,
  };
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export class MemoryRepository {
  readonly #db: Database;
  readonly #insert;
  readonly #dueBetween;
  readonly #recent;

  constructor(db: Database) {
    this.#db = db;
    this.#insert = db.prepare(
      `INSERT INTO memories (content, remind_on, created_at) VALUES (?, ?, ?) RETURNING ${COLUMNS}`,
    );
    this.#dueBetween = db.prepare(
      `SELECT ${COLUMNS} FROM memories
       WHERE remind_on BETWEEN ? AND ? ORDER BY remind_on, created_at`,
    );
    this.#recent = db.prepare(`SELECT ${COLUMNS} FROM memories ORDER BY created_at DESC LIMIT ?`);
  }

  add(memory: NewMemory): Memory {
    const row = this.#insert.get(memory.content, memory.remindOn, memory.createdAt) as
      MemoryRow | undefined;
    if (!row) throw new Error('Failed to save memory');
    return toMemory(row);
  }

  dueBetween(from: string, to: string): Memory[] {
    return (this.#dueBetween.all(from, to) as unknown as MemoryRow[]).map(toMemory);
  }

  recent(limit: number): Memory[] {
    return (this.#recent.all(limit) as unknown as MemoryRow[]).map(toMemory);
  }

  search(terms: readonly string[], limit: number): Memory[] {
    if (terms.length === 0) return this.recent(limit);
    const score = terms.map(() => "(content LIKE ? ESCAPE '\\')").join(' + ');
    const statement = this.#db.prepare(
      `SELECT ${COLUMNS}, (${score}) AS score FROM memories
       WHERE score > 0 ORDER BY score DESC, created_at DESC LIMIT ?`,
    );
    const patterns = terms.map((term) => `%${escapeLike(term)}%`);
    return (statement.all(...patterns, limit) as unknown as MemoryRow[]).map(toMemory);
  }
}
