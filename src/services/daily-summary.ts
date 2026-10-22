import type { SlotStatus } from '../domain/schedule.ts';
import { describeTime } from '../time.ts';
import type { Household } from './household.ts';

const listDoses = (entries: readonly { name: string; time: string }[]): string =>
  entries.map((entry) => `${entry.name} ${describeTime(entry.time)}`).join(', ');

export function renderDailySummary(household: Household): string {
  const today = household.now().date;
  const slots = household.slotsFor([today]);
  const byStatus = (statuses: readonly SlotStatus[]) =>
    slots
      .filter((slot) => statuses.includes(slot.status))
      .map((slot) => ({ name: slot.medication.name, time: slot.time }));

  const taken = byStatus(['taken']);
  const skipped = byStatus(['skipped']);
  const open = byStatus(['unconfirmed', 'due', 'upcoming']);
  const lines = [
    slots.length
      ? `Today for ${household.parentName}: ${String(taken.length)} of ${String(slots.length)} medicine doses confirmed taken.`
      : `No medicines were scheduled for ${household.parentName} today.`,
  ];
  if (skipped.length) lines.push(`Skipped on purpose: ${listDoses(skipped)}.`);
  if (open.length) {
    lines.push(
      `Not confirmed yet: ${listDoses(open)}. These may have been taken; Kin will ask ${household.parentName} next time they talk.`,
    );
  }

  const checkin = household.store.checkins.latestPerDay(today, today).at(0);
  lines.push(
    checkin
      ? `Check-in: mood ${String(checkin.mood)} of 5, ${checkin.sleep} sleep, ${checkin.ateWell ? 'eating well' : 'not eating well'}.`
      : 'No check-in today.',
  );
  return lines.join(' ');
}
