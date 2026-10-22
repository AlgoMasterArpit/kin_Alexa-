import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

import { IN_MEMORY, openDatabase } from '../src/db/database.ts';
import { createStore, type Store } from '../src/db/store.ts';

const NOW = '2026-10-22T09:00:00.000Z';

describe('store', () => {
  let store: Store;

  beforeEach(() => {
    store = createStore(openDatabase(IN_MEMORY));
  });

  it('creates medications with sorted schedules and lists active ones by name', () => {
    store.medications.create({
      name: 'Metformin',
      dosage: '500 mg',
      schedule: ['20:00', '08:00'],
      startsOn: '2026-10-22',
      createdAt: NOW,
    });
    store.medications.create({
      name: 'Amlodipine',
      dosage: '5 mg',
      aliases: ['bp tablet'],
      schedule: ['09:00'],
      pillsRemaining: 10,
      startsOn: '2026-10-22',
      createdAt: NOW,
    });

    const [first, second] = store.medications.listActive();
    assert.equal(first?.name, 'Amlodipine');
    assert.deepEqual(first.aliases, ['bp tablet']);
    assert.deepEqual(second?.schedule, ['08:00', '20:00']);
  });

  it('never lets the pill count drop below zero', () => {
    const medication = store.medications.create({
      name: 'Amlodipine',
      dosage: '5 mg',
      schedule: ['09:00'],
      pillsRemaining: 1,
      startsOn: '2026-10-22',
      createdAt: NOW,
    });

    store.medications.adjustPills(medication.id, -3);

    assert.equal(store.medications.findById(medication.id)?.pillsRemaining, 0);
  });

  it('overwrites a dose event when the same slot is recorded again', () => {
    const medication = store.medications.create({
      name: 'Amlodipine',
      dosage: '5 mg',
      schedule: ['09:00'],
      startsOn: '2026-10-22',
      createdAt: NOW,
    });
    const slot = { medicationId: medication.id, date: '2026-10-22', time: '09:00' };

    store.doses.upsert({ ...slot, status: 'skipped', recordedAt: NOW });
    store.doses.upsert({ ...slot, status: 'taken', recordedAt: NOW });

    assert.equal(store.doses.find(medication.id, '2026-10-22', '09:00')?.status, 'taken');
    assert.equal(store.doses.listBetween('2026-10-01', '2026-10-31').length, 1);
  });

  it('ranks memories by how many search terms they match', () => {
    store.memories.add({ content: 'Doctor visit on Friday', remindOn: null, createdAt: NOW });
    store.memories.add({
      content: 'Doctor said walk every morning',
      remindOn: null,
      createdAt: NOW,
    });
    store.memories.add({ content: 'Buy milk', remindOn: null, createdAt: NOW });

    const results = store.memories.search(['doctor', 'friday'], 5);

    assert.deepEqual(
      results.map((memory) => memory.content),
      ['Doctor visit on Friday', 'Doctor said walk every morning'],
    );
  });

  it('treats LIKE wildcards in search terms as literal text', () => {
    store.memories.add({ content: 'Sale is 50% off', remindOn: null, createdAt: NOW });
    store.memories.add({ content: 'Nothing here', remindOn: null, createdAt: NOW });

    assert.equal(store.memories.search(['%'], 5).length, 1);
  });

  it('keeps only the latest check-in per day', () => {
    store.checkins.add({
      date: '2026-10-22',
      mood: 2,
      sleep: 'poor',
      ateWell: false,
      note: null,
      recordedAt: '2026-10-22T03:00:00.000Z',
    });
    store.checkins.add({
      date: '2026-10-22',
      mood: 4,
      sleep: 'good',
      ateWell: true,
      note: 'Feeling better',
      recordedAt: '2026-10-22T09:00:00.000Z',
    });

    const [latest] = store.checkins.latestPerDay('2026-10-22', '2026-10-22');
    assert.equal(latest?.mood, 4);
    assert.equal(latest.ateWell, true);
  });

  it('rolls back every write in a failed transaction', () => {
    assert.throws(() =>
      store.transaction(() => {
        store.memories.add({ content: 'kept?', remindOn: null, createdAt: NOW });
        throw new Error('boom');
      }),
    );
    assert.equal(store.memories.recent(10).length, 0);
  });
});
