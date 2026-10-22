import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addDays,
  dateRange,
  daysBetween,
  describeDate,
  describeTime,
  isValidDate,
  toLocalMoment,
} from '../src/time.ts';

describe('time', () => {
  it('converts an instant to the local date and time of a zone', () => {
    const instant = new Date('2026-10-22T20:15:00Z');
    assert.deepEqual(toLocalMoment(instant, 'Asia/Kolkata'), { date: '2026-10-23', time: '01:45' });
    assert.deepEqual(toLocalMoment(instant, 'America/New_York'), {
      date: '2026-10-22',
      time: '16:15',
    });
  });

  it('adds days across month and year boundaries', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });

  it('counts days between dates and builds inclusive ranges', () => {
    assert.equal(daysBetween('2026-10-20', '2026-10-23'), 3);
    assert.deepEqual(dateRange('2026-10-20', '2026-10-22'), [
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ]);
    assert.deepEqual(dateRange('2026-10-22', '2026-10-20'), []);
  });

  it('rejects impossible calendar dates', () => {
    assert.equal(isValidDate('2026-02-29'), false);
    assert.equal(isValidDate('2028-02-29'), true);
    assert.equal(isValidDate('2026-1-5'), false);
  });

  it('describes dates and times for speech', () => {
    assert.equal(describeDate('2026-10-23'), 'Friday, October 23');
    assert.equal(describeTime('08:00'), '8 AM');
    assert.equal(describeTime('20:30'), '8:30 PM');
    assert.equal(describeTime('00:05'), '12:05 AM');
  });
});
