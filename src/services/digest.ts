import type { Concern } from '../domain/patterns.ts';
import type { Checkin } from '../domain/types.ts';
import { addDays, describeDate } from '../time.ts';
import type { Household } from './household.ts';

const UPCOMING_DAYS = 7;

export interface MedicationAdherence {
  readonly medication: string;
  readonly taken: number;
  readonly skipped: number;
  readonly unconfirmed: number;
  readonly scheduled: number;
}

export interface DigestInput {
  readonly parentName: string;
  readonly from: string;
  readonly to: string;
  readonly adherence: readonly MedicationAdherence[];
  readonly checkins: readonly Pick<Checkin, 'date' | 'mood' | 'sleep' | 'ateWell' | 'note'>[];
  readonly concerns: readonly Concern[];
  readonly upcomingReminders: readonly { readonly date: string; readonly content: string }[];
  readonly alertsSent: number;
  readonly ordersPlaced: readonly { readonly medication: string; readonly quantity: number }[];
}

export interface Digest {
  readonly text: string;
  readonly source: 'bedrock' | 'template';
}

export interface DigestWriter {
  write(input: DigestInput): Promise<Digest>;
}

export function collectDigestInput(household: Household, days: number): DigestInput {
  const review = household.review(days);
  const { store } = household;
  const since = `${review.from}T00:00:00.000Z`;
  const settled = review.slots.filter((slot) => slot.status !== 'upcoming');
  const names = new Map(review.medications.map((medication) => [medication.id, medication.name]));

  return {
    parentName: household.parentName,
    from: review.from,
    to: review.to,
    adherence: review.medications.map((medication) => {
      const slots = settled.filter((slot) => slot.medication.id === medication.id);
      return {
        medication: medication.name,
        taken: slots.filter((slot) => slot.status === 'taken').length,
        skipped: slots.filter((slot) => slot.status === 'skipped').length,
        unconfirmed: slots.filter((slot) => slot.status === 'unconfirmed').length,
        scheduled: slots.length,
      };
    }),
    checkins: review.checkins.map(({ date, mood, sleep, ateWell, note }) => ({
      date,
      mood,
      sleep,
      ateWell,
      note,
    })),
    concerns: review.concerns,
    upcomingReminders: store.memories
      .dueBetween(review.to, addDays(review.to, UPCOMING_DAYS))
      .map((memory) => ({ date: memory.remindOn ?? review.to, content: memory.content })),
    alertsSent: store.alerts.since(since).filter((alert) => alert.delivery === 'sent').length,
    ordersPlaced: store.orders.since(since).map((order) => ({
      medication: names.get(order.medicationId) ?? 'Unknown medicine',
      quantity: order.quantity,
    })),
  };
}

function describeGaps(entry: MedicationAdherence): string {
  const gaps = [
    entry.skipped ? `skipped ${String(entry.skipped)}` : '',
    entry.unconfirmed ? `${String(entry.unconfirmed)} not confirmed, may have been taken` : '',
  ].filter(Boolean);
  return gaps.length ? `; ${gaps.join('; ')}` : '';
}

const percent = (taken: number, scheduled: number): string =>
  scheduled === 0 ? 'n/a' : `${String(Math.round((taken / scheduled) * 100))}%`;

export function renderTemplateDigest(input: DigestInput): string {
  const lines = [
    `Kin weekly update for ${input.parentName} (${describeDate(input.from)} to ${describeDate(input.to)})`,
    '',
  ];

  lines.push(
    input.concerns.length
      ? `Needs attention:\n${input.concerns.map((concern) => `- ${concern.summary}`).join('\n')}`
      : 'Nothing needs your attention this week.',
    '',
  );

  if (input.adherence.length) {
    lines.push(
      'Medicines:',
      ...input.adherence.map(
        (entry) =>
          `- ${entry.medication}: ${String(entry.taken)} of ${String(entry.scheduled)} doses confirmed taken (${percent(entry.taken, entry.scheduled)})${describeGaps(entry)}`,
      ),
      '',
    );
  }

  if (input.checkins.length) {
    const average =
      input.checkins.reduce((sum, checkin) => sum + checkin.mood, 0) / input.checkins.length;
    const ateWell = input.checkins.filter((checkin) => checkin.ateWell).length;
    lines.push(
      `Wellbeing: ${String(input.checkins.length)} check-ins, average mood ${average.toFixed(1)} of 5, ate well on ${String(ateWell)} days.`,
      '',
    );
  } else {
    lines.push('Wellbeing: no check-ins were recorded this week.', '');
  }

  if (input.upcomingReminders.length) {
    lines.push(
      'Coming up:',
      ...input.upcomingReminders.map(
        (reminder) => `- ${describeDate(reminder.date)}: ${reminder.content}`,
      ),
      '',
    );
  }

  if (input.ordersPlaced.length) {
    lines.push(
      `Orders: ${input.ordersPlaced.map((order) => `${order.medication} x${String(order.quantity)}`).join(', ')}.`,
    );
  }

  return lines.join('\n').trim();
}

export const templateDigestWriter: DigestWriter = {
  write: (input) => Promise.resolve({ text: renderTemplateDigest(input), source: 'template' }),
};
