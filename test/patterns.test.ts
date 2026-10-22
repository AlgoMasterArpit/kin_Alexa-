import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectConcerns, type PatternInput } from '../src/domain/patterns.ts';
import type { DoseSlot } from '../src/domain/schedule.ts';
import type { Checkin, Medication } from '../src/domain/types.ts';

const amlodipine: Medication = {
  id: 1,
  name: 'Amlodipine',
  dosage: '5 mg',
  purpose: 'blood pressure',
  aliases: [],
  schedule: ['21:00'],
  pillsRemaining: 30,
};

const slot = (date: string, status: DoseSlot['status']): DoseSlot => ({
  medication: amlodipine,
  date,
  time: '21:00',
  status,
});

const checkin = (date: string, mood: number, sleep: Checkin['sleep'] = 'good'): Checkin => ({
  id: 0,
  date,
  mood,
  sleep,
  ateWell: true,
  note: null,
  recordedAt: `${date}T03:00:00.000Z`,
});

const base: PatternInput = {
  today: '2026-10-22',
  windowStart: '2026-10-16',
  slots: [],
  checkins: [checkin('2026-10-21', 4), checkin('2026-10-22', 4)],
  questions: [],
  medications: [amlodipine],
};

const kinds = (input: Partial<PatternInput>) =>
  detectConcerns({ ...base, ...input }).map((concern) => `${concern.kind}:${concern.severity}`);

describe('detectConcerns', () => {
  it('stays quiet for a healthy week', () => {
    assert.deepEqual(kinds({ slots: [slot('2026-10-21', 'taken')] }), []);
  });

  it('escalates missed doses with how often they happen', () => {
    assert.deepEqual(
      kinds({ slots: [slot('2026-10-20', 'missed'), slot('2026-10-21', 'skipped')] }),
      ['missed_doses:info'],
    );
    assert.deepEqual(
      kinds({
        slots: [
          slot('2026-10-19', 'missed'),
          slot('2026-10-20', 'missed'),
          slot('2026-10-21', 'skipped'),
        ],
      }),
      ['missed_doses:urgent'],
    );
  });

  it('ignores doses that are still due or upcoming', () => {
    assert.deepEqual(
      kinds({ slots: [slot('2026-10-22', 'due'), slot('2026-10-22', 'upcoming')] }),
      [],
    );
  });

  it('flags a falling mood and makes the lowest mood urgent', () => {
    const falling = [checkin('2026-10-20', 4), checkin('2026-10-21', 3), checkin('2026-10-22', 1)];
    assert.deepEqual(kinds({ checkins: falling }), ['low_mood:urgent']);
  });

  it('flags a consistently low mood', () => {
    const low = [checkin('2026-10-20', 2), checkin('2026-10-21', 2), checkin('2026-10-22', 2)];
    assert.deepEqual(kinds({ checkins: low }), ['low_mood:info']);
  });

  it('flags repeated poor sleep', () => {
    const tired = [
      checkin('2026-10-20', 4, 'poor'),
      checkin('2026-10-21', 4, 'poor'),
      checkin('2026-10-22', 4, 'poor'),
    ];
    assert.deepEqual(kinds({ checkins: tired }), ['poor_sleep:info']);
  });

  it('notices when check-ins stop', () => {
    assert.deepEqual(kinds({ checkins: [checkin('2026-10-19', 4)] }), ['no_checkin:info']);
    assert.deepEqual(kinds({ checkins: [] }), ['no_checkin:info']);
  });

  it('groups similar questions asked again and again', () => {
    const questions = [
      'When is my doctor appointment?',
      'what day is the doctor appointment',
      'When is the appointment with my doctor?',
      'What is for dinner?',
    ].map((text, index) => ({ text, askedAt: `2026-10-2${String(index)}T10:00:00Z` }));
    assert.deepEqual(kinds({ questions }), ['repeated_question:info']);
  });

  it('warns when a medicine is about to run out', () => {
    assert.deepEqual(kinds({ medications: [{ ...amlodipine, pillsRemaining: 5 }] }), [
      'low_supply:info',
    ]);
  });

  it('lists urgent concerns first', () => {
    const concerns = detectConcerns({
      ...base,
      medications: [{ ...amlodipine, pillsRemaining: 2 }],
      slots: [
        slot('2026-10-19', 'missed'),
        slot('2026-10-20', 'missed'),
        slot('2026-10-21', 'missed'),
      ],
    });
    assert.equal(concerns[0]?.severity, 'urgent');
  });
});
