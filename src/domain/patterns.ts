import { daysBetween, describeDate } from '../time.ts';
import { daysOfSupply, isRunningLow } from './medications.ts';
import type { DoseSlot } from './schedule.ts';
import { similarity } from './text.ts';
import type { AlertSeverity, Checkin, Medication, Question } from './types.ts';

export type ConcernKind =
  'missed_doses' | 'low_mood' | 'poor_sleep' | 'no_checkin' | 'repeated_question' | 'low_supply';

export interface Concern {
  readonly kind: ConcernKind;
  readonly severity: AlertSeverity;
  readonly summary: string;
}

export interface PatternInput {
  readonly today: string;
  readonly windowStart: string;
  readonly slots: readonly DoseSlot[];
  readonly checkins: readonly Checkin[];
  readonly questions: readonly Question[];
  readonly medications: readonly Medication[];
}

export const THRESHOLDS = {
  missedDoses: 2,
  urgentMissedDoses: 3,
  lowMoodAverage: 2,
  poorSleepNights: 3,
  daysWithoutCheckin: 2,
  repeatedQuestions: 3,
  questionSimilarity: 0.5,
} as const;

const plural = (count: number, word: string): string =>
  `${String(count)} ${word}${count === 1 ? '' : 's'}`;

function missedDoses(input: PatternInput): Concern[] {
  const missedByMedication = Map.groupBy(
    input.slots.filter((slot) => slot.status === 'missed' || slot.status === 'skipped'),
    (slot) => slot.medication.name,
  );
  return [...missedByMedication]
    .filter(([, slots]) => slots.length >= THRESHOLDS.missedDoses)
    .map(([name, slots]) => ({
      kind: 'missed_doses',
      severity: slots.length >= THRESHOLDS.urgentMissedDoses ? 'urgent' : 'info',
      summary: `Missed ${name} ${plural(slots.length, 'time')} since ${describeDate(input.windowStart)}.`,
    }));
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
  const gap = daysBetween(last, input.today);
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
    ...missedDoses(input),
    ...lowMood(input),
    ...poorSleep(input),
    ...missingCheckins(input),
    ...repeatedQuestions(input),
    ...lowSupply(input),
  ].toSorted((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
