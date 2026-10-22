import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FamilyAlerts } from '../src/services/family-alerts.ts';
import { disabledNotifier, type Notifier } from '../src/services/notifier.ts';
import { Watchdog } from '../src/services/watchdog.ts';
import { createTestServices } from './support/household.ts';

const FOUR_DAYS_LATER = '2026-10-25T05:00:00.000Z';

function setup(nowIso = FOUR_DAYS_LATER, notifier?: Notifier) {
  const harness = createTestServices();
  harness.clock.set(nowIso);
  const { household } = harness.services;
  const alerts = notifier ? new FamilyAlerts(household, notifier) : harness.services.familyAlerts;
  const watchdog = new Watchdog({
    household,
    alerts,
    logger: harness.services.logger,
    intervalMs: 60_000,
    summaryTime: '21:30',
  });
  return { ...harness, household, alerts, watchdog };
}

describe('Watchdog', () => {
  it('alerts the family about doses that stay unconfirmed, without calling them missed', async () => {
    const { watchdog, notifier } = setup();

    const sent = await watchdog.tick();

    assert.deepEqual(sent.toSorted(), [
      'unconfirmed_doses:Amlodipine',
      'unconfirmed_doses:Metformin',
    ]);
    const amlodipine = notifier.sent.find((message) => message.message.startsWith('Amlodipine'));
    assert.equal(amlodipine?.severity, 'urgent');
    assert.match(amlodipine.message, /may have been taken without telling Kin/);
    assert.match(amlodipine.message, /Kin will ask Mom about it next time they talk/);
    assert.doesNotMatch(amlodipine.message, /missed/i);
  });

  it('sends each concern only once a day', async () => {
    const { watchdog, notifier } = setup();

    await watchdog.tick();
    const again = await watchdog.tick();

    assert.deepEqual(again, []);
    assert.equal(notifier.sent.length, 2);
  });

  it('stays quiet while doses are still inside the confirmation grace period', async () => {
    const { watchdog, notifier, store, clock } = setup('2026-10-22T15:30:00.000Z');
    clock.set('2026-10-23T02:00:00.000Z');
    store.doses.upsert({
      medicationId: 2,
      date: '2026-10-22',
      time: '08:00',
      status: 'taken',
      recordedAt: '2026-10-22T03:00:00.000Z',
    });

    assert.deepEqual(await watchdog.tick(), []);
    assert.equal(notifier.sent.length, 0);
  });

  it('sends a correction when a flagged dose is confirmed later', async () => {
    const { watchdog, alerts, notifier } = setup();
    await watchdog.tick();

    const corrected = await alerts.confirmDose(
      { medicationId: 1, date: '2026-10-23', time: '21:00' },
      'Amlodipine',
    );
    const repeated = await alerts.confirmDose(
      { medicationId: 1, date: '2026-10-23', time: '21:00' },
      'Amlodipine',
    );

    assert.equal(corrected, true);
    assert.equal(repeated, false);
    assert.match(
      notifier.sent.at(-1)?.message ?? '',
      /Mom confirmed taking Amlodipine \(9 PM, Friday, October 23\)\. No need to worry/,
    );
  });

  it('does not send corrections for doses the family was never warned about', async () => {
    const { alerts, notifier } = setup();

    assert.equal(
      await alerts.confirmDose(
        { medicationId: 1, date: '2026-10-23', time: '21:00' },
        'Amlodipine',
      ),
      false,
    );
    assert.equal(notifier.sent.length, 0);
  });

  it('sends one evening summary that separates skipped from unconfirmed doses', async () => {
    const { watchdog, notifier, store, clock } = setup('2026-10-22T10:00:00.000Z');
    store.doses.upsert({
      medicationId: 2,
      date: '2026-10-22',
      time: '08:00',
      status: 'taken',
      recordedAt: '2026-10-22T03:00:00.000Z',
    });
    store.doses.upsert({
      medicationId: 1,
      date: '2026-10-22',
      time: '21:00',
      status: 'skipped',
      recordedAt: '2026-10-22T15:30:00.000Z',
    });
    clock.set('2026-10-22T16:15:00.000Z');

    assert.deepEqual(await watchdog.tick(), ['daily_summary']);
    assert.deepEqual(await watchdog.tick(), []);
    const summary = notifier.sent.at(-1);
    assert.equal(summary?.title, 'Today with Mom');
    assert.match(summary.message, /1 of 3 medicine doses confirmed taken/);
    assert.match(summary.message, /Skipped on purpose: Amlodipine 9 PM/);
    assert.match(summary.message, /Not confirmed yet: Metformin 8 PM\. These may have been taken/);
  });

  it('retries a notice whose delivery failed', async () => {
    let attempts = 0;
    const flaky: Notifier = {
      enabled: true,
      send: () => {
        attempts += 1;
        return Promise.resolve(attempts <= 2 ? 'failed' : 'sent');
      },
    };
    const { watchdog } = setup(FOUR_DAYS_LATER, flaky);

    assert.deepEqual(await watchdog.tick(), []);
    assert.equal((await watchdog.tick()).length, 2);
  });

  it('does nothing when family alerts are not configured', async () => {
    const { watchdog, store } = setup(FOUR_DAYS_LATER, disabledNotifier);

    assert.deepEqual(await watchdog.tick(), []);
    assert.equal(store.alerts.since('2000-01-01').length, 0);
  });
});
