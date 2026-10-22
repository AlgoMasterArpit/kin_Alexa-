import type { Store } from '../db/store.ts';
import { detectConcerns, type Concern } from '../domain/patterns.ts';
import { buildSlots, type DoseSlot } from '../domain/schedule.ts';
import type { Checkin, Medication, Question } from '../domain/types.ts';
import { addDays, dateRange, toLocalMoment, type Clock, type LocalMoment } from '../time.ts';

const MS_PER_DAY = 86_400_000;

export interface PeriodReview {
  readonly from: string;
  readonly to: string;
  readonly medications: readonly Medication[];
  readonly slots: readonly DoseSlot[];
  readonly checkins: readonly Checkin[];
  readonly questions: readonly Question[];
  readonly concerns: readonly Concern[];
}

export class Household {
  readonly parentName: string;
  readonly timeZone: string;
  readonly #store: Store;
  readonly #clock: Clock;

  constructor(options: { store: Store; clock: Clock; timeZone: string; parentName: string }) {
    this.#store = options.store;
    this.#clock = options.clock;
    this.timeZone = options.timeZone;
    this.parentName = options.parentName;
  }

  get store(): Store {
    return this.#store;
  }

  instant(): Date {
    return this.#clock.now();
  }

  timestamp(): string {
    return this.#clock.now().toISOString();
  }

  now(): LocalMoment {
    return toLocalMoment(this.#clock.now(), this.timeZone);
  }

  slotsFor(dates: readonly string[]): DoseSlot[] {
    const [first, last] = [dates.at(0), dates.at(-1)];
    if (!first || !last) return [];
    return buildSlots(
      this.#store.medications.listActive(),
      this.#store.doses.listBetween(first, last),
      dates,
      this.now(),
    );
  }

  review(days: number): PeriodReview {
    const now = this.now();
    const today = now.date;
    const from = addDays(today, -(days - 1));
    const medications = this.#store.medications.listActive();
    const slots = buildSlots(
      medications,
      this.#store.doses.listBetween(from, today),
      dateRange(from, today),
      now,
    );
    const checkins = this.#store.checkins.latestPerDay(from, today);
    const questionsSince = new Date(this.#clock.now().getTime() - days * MS_PER_DAY).toISOString();
    const questions = this.#store.questions.since(questionsSince);
    return {
      from,
      to: today,
      medications,
      slots,
      checkins,
      questions,
      concerns: detectConcerns({
        now,
        windowStart: from,
        slots,
        checkins,
        questions,
        medications,
      }),
    };
  }
}
