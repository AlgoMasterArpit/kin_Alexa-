import { pino } from 'pino';

import { IN_MEMORY, openDatabase } from '../../src/db/database.ts';
import { createStore } from '../../src/db/store.ts';
import type { KinServices } from '../../src/mcp/context.ts';
import { templateDigestWriter } from '../../src/services/digest.ts';
import { FamilyAlerts } from '../../src/services/family-alerts.ts';
import { Household } from '../../src/services/household.ts';
import type { FamilyNotification, Notifier } from '../../src/services/notifier.ts';
import type { Clock } from '../../src/time.ts';

export class FakeClock implements Clock {
  #now: Date;

  constructor(iso: string) {
    this.#now = new Date(iso);
  }

  now(): Date {
    return new Date(this.#now);
  }

  set(iso: string): void {
    this.#now = new Date(iso);
  }
}

export class RecordingNotifier implements Notifier {
  readonly enabled = true;
  readonly sent: FamilyNotification[] = [];

  send(notification: FamilyNotification): Promise<'sent'> {
    this.sent.push(notification);
    return Promise.resolve('sent');
  }
}

export function createTestServices(nowIso = '2026-10-22T15:30:00.000Z') {
  const clock = new FakeClock(nowIso);
  const store = createStore(openDatabase(IN_MEMORY));
  const household = new Household({
    store,
    clock,
    timeZone: 'Asia/Kolkata',
    parentName: 'Mom',
  });
  const notifier = new RecordingNotifier();
  const services: KinServices = {
    household,
    familyAlerts: new FamilyAlerts(household, notifier),
    digestWriter: templateDigestWriter,
    todayViewHtml: '<!doctype html><title>Today</title>',
    logger: pino({ level: 'silent' }),
  };
  store.medications.create({
    name: 'Amlodipine',
    dosage: '5 mg',
    purpose: 'blood pressure',
    aliases: ['BP tablet'],
    schedule: ['21:00'],
    pillsRemaining: 20,
    startsOn: household.now().date,
    createdAt: clock.now().toISOString(),
  });
  store.medications.create({
    name: 'Metformin',
    dosage: '500 mg',
    purpose: 'diabetes',
    schedule: ['08:00', '20:00'],
    pillsRemaining: 60,
    startsOn: household.now().date,
    createdAt: clock.now().toISOString(),
  });
  return { services, clock, store, notifier };
}
