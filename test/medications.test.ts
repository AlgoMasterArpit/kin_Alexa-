import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { daysOfSupply, isRunningLow, matchMedication } from '../src/domain/medications.ts';
import type { Medication } from '../src/domain/types.ts';

const medication = (overrides: Partial<Medication> & Pick<Medication, 'id' | 'name'>) => ({
  dosage: '5 mg',
  purpose: null,
  aliases: [],
  schedule: ['09:00'],
  pillsRemaining: null,
  startsOn: '2026-01-01',
  ...overrides,
});

const amlodipine = medication({
  id: 1,
  name: 'Amlodipine',
  purpose: 'blood pressure',
  aliases: ['BP tablet'],
});
const metformin = medication({ id: 2, name: 'Metformin', purpose: 'diabetes' });
const metoprolol = medication({ id: 3, name: 'Metoprolol', purpose: 'heart rate' });
const all = [amlodipine, metformin, metoprolol];

describe('matchMedication', () => {
  it('matches names case-insensitively', () => {
    assert.deepEqual(matchMedication('AMLODIPINE', all), { kind: 'found', medication: amlodipine });
  });

  it('matches spoken aliases and purposes', () => {
    assert.deepEqual(matchMedication('bp tablet', all), { kind: 'found', medication: amlodipine });
    assert.deepEqual(matchMedication('my diabetes medicine', all), {
      kind: 'found',
      medication: metformin,
    });
  });

  it('reports ambiguity instead of guessing', () => {
    const match = matchMedication('met', all);
    assert.equal(match.kind, 'ambiguous');
    assert.deepEqual(
      match.candidates.map((candidate) => candidate.name),
      ['Metformin', 'Metoprolol'],
    );
  });

  it('lists known medications when nothing matches', () => {
    const match = matchMedication('vitamin d', all);
    assert.equal(match.kind, 'not_found');
    assert.equal(match.known.length, 3);
  });
});

describe('supply', () => {
  it('computes whole days of supply from the daily schedule', () => {
    const twiceDaily = medication({
      id: 4,
      name: 'Metformin',
      schedule: ['08:00', '20:00'],
      pillsRemaining: 15,
    });
    assert.equal(daysOfSupply(twiceDaily), 7);
    assert.equal(isRunningLow(twiceDaily), true);
  });

  it('ignores medications without a tracked pill count', () => {
    assert.equal(daysOfSupply(amlodipine), null);
    assert.equal(isRunningLow(amlodipine), false);
  });
});
