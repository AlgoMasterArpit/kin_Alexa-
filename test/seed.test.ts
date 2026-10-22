import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { IN_MEMORY, openDatabase } from '../src/db/database.ts';
import { createStore } from '../src/db/store.ts';
import { clearDatabase, seedDemoData } from '../src/seed/demo.ts';
import { Household } from '../src/services/household.ts';
import { FakeClock } from './support/household.ts';

describe('demo seed', () => {
  it('produces a week with concerns worth demoing', () => {
    const clock = new FakeClock('2026-10-22T04:30:00.000Z');
    const db = openDatabase(IN_MEMORY);
    const store = createStore(db);
    seedDemoData(store, clock, 'Asia/Kolkata');

    const review = new Household({
      store,
      clock,
      timeZone: 'Asia/Kolkata',
      parentName: 'Mom',
    }).review(7);

    assert.deepEqual(review.concerns.map((concern) => concern.kind).toSorted(), [
      'low_mood',
      'low_supply',
      'missed_doses',
      'repeated_question',
    ]);
  });

  it('can be cleared and seeded again', () => {
    const clock = new FakeClock('2026-10-22T04:30:00.000Z');
    const db = openDatabase(IN_MEMORY);
    const store = createStore(db);
    seedDemoData(store, clock, 'Asia/Kolkata');

    clearDatabase(db);
    seedDemoData(store, clock, 'Asia/Kolkata');

    assert.equal(store.medications.listActive().length, 3);
  });
});
