import type { Question } from '../domain/types.ts';
import type { Database } from './database.ts';

interface QuestionRow {
  text: string;
  asked_at: string;
}

export class QuestionRepository {
  readonly #insert;
  readonly #since;

  constructor(db: Database) {
    this.#insert = db.prepare('INSERT INTO questions (text, asked_at) VALUES (?, ?)');
    this.#since = db.prepare(
      'SELECT text, asked_at FROM questions WHERE asked_at >= ? ORDER BY asked_at',
    );
  }

  add(question: Question): void {
    this.#insert.run(question.text, question.askedAt);
  }

  since(instant: string): Question[] {
    return (this.#since.all(instant) as unknown as QuestionRow[]).map((row) => ({
      text: row.text,
      askedAt: row.asked_at,
    }));
  }
}
