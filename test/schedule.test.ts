import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildSlots, pickSlotToLog } from '../src/domain/schedule.ts';
import type { Medication } from '../src/domain/types.ts';

const metformin: Medication = {
  id: 1,
  name: 'Metformin',
  dosage: '500 mg',
  purpose: null,
  aliases: [],
  schedule: ['08:00', '20:00'],
  pillsRemaining: null,
};

const now = { date: '2026-10-22', time: '08:30' };

describe('buildSlots', () => {
  it('derives slot status from records and the current time', () => {
    const slots = buildSlots(
      [metformin],
      [
        {
          medicationId: 1,
          date: '2026-10-21',
          time: '08:00',
          status: 'taken',
          recordedAt: '2026-10-21T02:40:00Z',
        },
      ],
      ['2026-10-21', '2026-10-22'],
      now,
    );

    assert.deepEqual(
      slots.map((slot) => `${slot.date} ${slot.time} ${slot.status}`),
      [
        '2026-10-21 08:00 taken',
        '2026-10-21 20:00 missed',
        '2026-10-22 08:00 due',
        '2026-10-22 20:00 upcoming',
      ],
    );
  });

  it('marks a slot missed once the due window has passed', () => {
    const [morning] = buildSlots([metformin], [], ['2026-10-22'], {
      date: '2026-10-22',
      time: '09:01',
    });
    assert.equal(morning?.status, 'missed');
  });
});

describe('pickSlotToLog', () => {
  it('picks the latest slot that has already come around today', () => {
    assert.equal(pickSlotToLog(metformin, new Set(), '2026-10-22', now), '08:00');
    assert.equal(
      pickSlotToLog(metformin, new Set(), '2026-10-22', { date: '2026-10-22', time: '21:00' }),
      '20:00',
    );
  });

  it('allows logging a dose up to an hour early', () => {
    assert.equal(
      pickSlotToLog(metformin, new Set(['08:00']), '2026-10-22', {
        date: '2026-10-22',
        time: '19:15',
      }),
      '20:00',
    );
  });

  it('fills the latest open slot for a past day', () => {
    assert.equal(pickSlotToLog(metformin, new Set(['20:00']), '2026-10-21', now), '08:00');
    assert.equal(pickSlotToLog(metformin, new Set(), '2026-10-21', now), '20:00');
  });

  it('refuses to log doses for future days', () => {
    assert.equal(pickSlotToLog(metformin, new Set(), '2026-10-23', now), undefined);
  });
});
