import type { Database } from '../db/database.ts';
import type { Store } from '../db/store.ts';
import type { DoseStatus, SleepQuality } from '../domain/types.ts';
import { addDays, toLocalMoment, type Clock } from '../time.ts';

const MS_PER_DAY = 86_400_000;

const TABLES = [
  'alerts',
  'orders',
  'questions',
  'memories',
  'checkins',
  'dose_events',
  'medications',
] as const;

const MEDICATIONS = [
  {
    name: 'Amlodipine',
    dosage: '5 mg',
    purpose: 'blood pressure',
    aliases: ['BP tablet', 'BP medicine', 'pressure tablet'],
    schedule: ['21:00'],
    pillsRemaining: 24,
  },
  {
    name: 'Metformin',
    dosage: '500 mg',
    purpose: 'diabetes',
    aliases: ['sugar tablet', 'sugar medicine'],
    schedule: ['08:00', '20:00'],
    pillsRemaining: 9,
  },
  {
    name: 'Atorvastatin',
    dosage: '10 mg',
    purpose: 'cholesterol',
    aliases: ['cholesterol tablet'],
    schedule: ['21:00'],
    pillsRemaining: 40,
  },
] as const;

const DOSE_OVERRIDES: readonly {
  readonly medication: string;
  readonly daysAgo: number;
  readonly time?: string;
  readonly status: DoseStatus | 'unlogged';
}[] = [
  { medication: 'Amlodipine', daysAgo: 3, status: 'skipped' },
  { medication: 'Amlodipine', daysAgo: 2, status: 'skipped' },
  { medication: 'Metformin', daysAgo: 1, time: '20:00', status: 'unlogged' },
];

function seededStatus(medication: string, daysAgo: number, time: string): DoseStatus | 'unlogged' {
  return (
    DOSE_OVERRIDES.find(
      (entry) =>
        entry.medication === medication &&
        entry.daysAgo === daysAgo &&
        (entry.time === undefined || entry.time === time),
    )?.status ?? 'taken'
  );
}

const CHECKINS: readonly (readonly [number, number, SleepQuality, boolean, string | null])[] = [
  [6, 4, 'good', true, 'Walked to the temple in the morning.'],
  [5, 4, 'fair', true, null],
  [4, 4, 'good', true, 'Priya called in the evening.'],
  [3, 4, 'fair', true, null],
  [2, 3, 'poor', true, 'Knee was hurting at night.'],
  [1, 2, 'poor', false, 'Did not feel like cooking.'],
];

export function clearDatabase(db: Database): void {
  for (const table of TABLES) db.exec(`DELETE FROM ${table}`);
}

export function seedDemoData(store: Store, clock: Clock, timeZone: string): void {
  const now = clock.now();
  const today = toLocalMoment(now, timeZone).date;
  const daysAgo = (days: number) => new Date(now.getTime() - days * MS_PER_DAY).toISOString();

  store.transaction(() => {
    const medications = MEDICATIONS.map((medication) =>
      store.medications.create({
        ...medication,
        startsOn: addDays(today, -30),
        createdAt: daysAgo(30),
      }),
    );

    for (let days = 6; days >= 1; days -= 1) {
      const date = addDays(today, -days);
      for (const medication of medications) {
        for (const time of medication.schedule) {
          const status = seededStatus(medication.name, days, time);
          if (status === 'unlogged') continue;
          store.doses.upsert({
            medicationId: medication.id,
            date,
            time,
            status,
            recordedAt: daysAgo(days),
          });
        }
      }
    }

    for (const [days, mood, sleep, ateWell, note] of CHECKINS) {
      store.checkins.add({
        date: addDays(today, -days),
        mood,
        sleep,
        ateWell,
        note,
        recordedAt: daysAgo(days),
      });
    }

    store.memories.add({
      content: 'Cardiology follow-up with Dr. Rao at 11 AM at City Hospital',
      remindOn: addDays(today, 1),
      createdAt: daysAgo(5),
    });
    store.memories.add({
      content: 'The spare house key is with Mrs. Sharma next door',
      remindOn: null,
      createdAt: daysAgo(9),
    });
    store.memories.add({
      content: "Priya's birthday dinner on Sunday",
      remindOn: addDays(today, 3),
      createdAt: daysAgo(2),
    });

    for (const days of [3, 2, 1]) {
      store.questions.add({
        text: 'When is my appointment with the doctor?',
        askedAt: daysAgo(days),
      });
    }
  });
}
