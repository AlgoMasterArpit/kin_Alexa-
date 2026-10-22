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

const SKIPPED: Partial<Record<string, Partial<Record<number, DoseStatus | 'none'>>>> = {
  Amlodipine: { 2: 'skipped', 3: 'none' },
};

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
      store.medications.create({ ...medication, createdAt: daysAgo(30) }),
    );

    for (let days = 6; days >= 1; days -= 1) {
      const date = addDays(today, -days);
      for (const medication of medications) {
        const override = SKIPPED[medication.name]?.[days];
        if (override === 'none') continue;
        for (const time of medication.schedule) {
          store.doses.upsert({
            medicationId: medication.id,
            date,
            time,
            status: override ?? 'taken',
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
