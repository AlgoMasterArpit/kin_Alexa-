import { daysBetween, describeDate, describeTime, type LocalMoment } from '../time.ts';
import { daysOfSupply, isRunningLow } from './medications.ts';
import { minutesSinceSlot, type DoseSlot } from './schedule.ts';
import { similarity } from './text.ts';
import type { AlertSeverity, Checkin, Medication, Question } from './types.ts';

export type ConcernKind =
  | 'skipped_doses'
  | 'unconfirmed_doses'
  | 'low_mood'
  | 'poor_sleep'
  | 'no_checkin'
  | 'repeated_question'
  | 'low_supply';

export interface SlotRef {
  readonly medicationId: number;
  readonly date: string;
  readonly time: string;
}

export interface Concern {
  readonly kind: ConcernKind;
  readonly severity: AlertSeverity;
  readonly summary: string;
  readonly subject?: string | undefined;
  readonly slots?: readonly SlotRef[] | undefined;
}

export interface PatternInput {
  readonly now: LocalMoment;
  readonly windowStart: string;
  readonly slots: readonly DoseSlot[];
  readonly checkins: readonly Checkin[];
  readonly questions: readonly Question[];
  readonly medications: readonly Medication[];
}

export const THRESHOLDS = {
  skippedDoses: 2,
  urgentSkippedDoses: 3,
  unconfirmedDoses: 2,
  urgentUnconfirmedDoses: 3,
  confirmationGraceMinutes: 12 * 60,
  lowMoodAverage: 2,
  poorSleepNights: 3,
  daysWithoutCheckin: 2,
  repeatedQuestions: 3,
  questionSimilarity: 0.5,
} as const;

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

export const concernKey = (concern: Concern): string =>
  concern.subject ? `${concern.kind}:${concern.subject}` : concern.kind;

const toRef = (slot: DoseSlot): SlotRef => ({
  medicationId: slot.medication.id,
  date: slot.date,
  time: slot.time,
});

export function isPastConfirmationGrace(slot: DoseSlot, now: LocalMoment): boolean {
  return (
    slot.status === 'unconfirmed' &&
    minutesSinceSlot(slot.date, slot.time, now) >= THRESHOLDS.confirmationGraceMinutes
  );
}

function doseConcerns(
  slots: readonly DoseSlot[],
  options: {
    kind: 'skipped_doses' | 'unconfirmed_doses';
    minimum: number;
    urgentAt: number;
    describe: (name: string, slots: readonly DoseSlot[]) => string;
  },
): Concern[] {
  return [...Map.groupBy(slots, (slot) => slot.medication.name)]
    .filter(([, group]) => group.length >= options.minimum)
    .map(([name, group]) => ({
      kind: options.kind,
      severity: group.length >= options.urgentAt ? 'urgent' : 'info',
      summary: options.describe(name, group),
      subject: name,
      slots: group.map(toRef),
    }));
}

const describeSlots = (slots: readonly DoseSlot[]): string =>
  slots.map((slot) => `${describeTime(slot.time)} on ${describeDate(slot.date)}`).join(', ');

function skippedDoses(input: PatternInput): Concern[] {
  return doseConcerns(
    input.slots.filter((slot) => slot.status === 'skipped'),
    {
      kind: 'skipped_doses',
      minimum: THRESHOLDS.skippedDoses,
      urgentAt: THRESHOLDS.urgentSkippedDoses,
      describe: (name, slots) =>
        `Said they skipped ${name} ${plural(slots.length, 'time')} since ${describeDate(input.windowStart)}.`,
    },
  );
}

function unconfirmedDoses(input: PatternInput): Concern[] {
  return doseConcerns(
    input.slots.filter((slot) => isPastConfirmationGrace(slot, input.now)),
    {
      kind: 'unconfirmed_doses',
      minimum: THRESHOLDS.unconfirmedDoses,
      urgentAt: THRESHOLDS.urgentUnconfirmedDoses,
      describe: (name, slots) =>
        `${name} was not confirmed ${plural(slots.length, 'time')} (${describeSlots(slots)}). It may have been taken without telling Kin.`,
    },
  );
}
function lowMood(input: PatternInput): Concern[] {
  const recent = input.checkins.slice(-3);
  if (recent.length < 3) return [];
  const moods = recent.map((checkin) => checkin.mood);
  const average = moods.reduce((sum, mood) => sum + mood, 0) / moods.length;
  const falling = moods.every((mood, index) => index === 0 || mood < (moods[index - 1] ?? mood));
  if (!falling && average > THRESHOLDS.lowMoodAverage) return [];
  return [
    {
      kind: 'low_mood',
      severity: moods.at(-1) === 1 ? 'urgent' : 'info',
      summary: falling
        ? `Mood has dropped three check-ins in a row (${moods.join(', then ')} out of 5).`
        : `Mood has averaged ${average.toFixed(1)} out of 5 over the last three check-ins.`,
    },
  ];
}

function poorSleep(input: PatternInput): Concern[] {
  const nights = input.checkins.filter((checkin) => checkin.sleep === 'poor').length;
  return nights >= THRESHOLDS.poorSleepNights
    ? [
        {
          kind: 'poor_sleep',
          severity: 'info',
          summary: `Reported poor sleep on ${plural(nights, 'night')} this period.`,
        },
      ]
    : [];
}

function missingCheckins(input: PatternInput): Concern[] {
  const last = input.checkins.at(-1)?.date ?? input.windowStart;
  const gap = daysBetween(last, input.now.date);
  if (gap < THRESHOLDS.daysWithoutCheckin) return [];
  return [
    {
      kind: 'no_checkin',
      severity: 'info',
      summary: input.checkins.length
        ? `No daily check-in for ${plural(gap, 'day')}.`
        : `No daily check-ins since ${describeDate(input.windowStart)}.`,
    },
  ];
}

function repeatedQuestions(input: PatternInput): Concern[] {
  const clusters: Question[][] = [];
  for (const question of input.questions) {
    const cluster = clusters.find((group) =>
      group.some((other) => similarity(other.text, question.text) >= THRESHOLDS.questionSimilarity),
    );
    if (cluster) cluster.push(question);
    else clusters.push([question]);
  }
  return clusters
    .filter((cluster) => cluster.length >= THRESHOLDS.repeatedQuestions)
    .map((cluster) => ({
      kind: 'repeated_question',
      severity: 'info',
      summary: `Asked "${cluster[0]?.text ?? ''}" ${plural(cluster.length, 'time')} recently.`,
    }));
}

function lowSupply(input: PatternInput): Concern[] {
  return input.medications.filter(isRunningLow).map((medication) => ({
    kind: 'low_supply',
    severity: 'info',
    summary: `${medication.name} will run out in about ${plural(daysOfSupply(medication) ?? 0, 'day')}.`,
  }));
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { urgent: 0, info: 1 };

export function detectConcerns(input: PatternInput): Concern[] {
  return [
    ...skippedDoses(input),
    ...unconfirmedDoses(input),
    ...lowMood(input),
    ...poorSleep(input),
    ...missingCheckins(input),
    ...repeatedQuestions(input),
    ...lowSupply(input),
  ].toSorted((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
