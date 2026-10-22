import type { LocalMoment } from '../time.ts';
import type { DoseEvent, Medication } from './types.ts';

export const DUE_WINDOW_MINUTES = 60;

export type SlotStatus = 'taken' | 'skipped' | 'missed' | 'due' | 'upcoming';

export interface DoseSlot {
  readonly medication: Medication;
  readonly date: string;
  readonly time: string;
  readonly status: SlotStatus;
}

const minutes = (time: string): number => {
  const [hours = 0, mins = 0] = time.split(':').map(Number);
  return hours * 60 + mins;
};

const slotKey = (medicationId: number, date: string, time: string): string =>
  `${String(medicationId)}|${date}|${time}`;

function statusOf(date: string, time: string, now: LocalMoment): SlotStatus {
  if (date > now.date) return 'upcoming';
  if (date < now.date) return 'missed';
  const elapsed = minutes(now.time) - minutes(time);
  if (elapsed < 0) return 'upcoming';
  return elapsed <= DUE_WINDOW_MINUTES ? 'due' : 'missed';
}

export function buildSlots(
  medications: readonly Medication[],
  events: readonly DoseEvent[],
  dates: readonly string[],
  now: LocalMoment,
): DoseSlot[] {
  const recorded = new Map(
    events.map((event) => [slotKey(event.medicationId, event.date, event.time), event.status]),
  );
  return dates.flatMap((date) =>
    medications
      .flatMap((medication) => medication.schedule.map((time) => ({ medication, date, time })))
      .toSorted(
        (a, b) =>
          a.time.localeCompare(b.time) || a.medication.name.localeCompare(b.medication.name),
      )
      .map(({ medication, time }) => ({
        medication,
        date,
        time,
        status: recorded.get(slotKey(medication.id, date, time)) ?? statusOf(date, time, now),
      })),
  );
}

export function pickSlotToLog(
  medication: Medication,
  recordedTimes: ReadonlySet<string>,
  date: string,
  now: LocalMoment,
): string | undefined {
  if (date > now.date || medication.schedule.length === 0) return undefined;
  const cutoff = date === now.date ? minutes(now.time) + DUE_WINDOW_MINUTES : Infinity;
  const reached = medication.schedule.filter((time) => minutes(time) <= cutoff);
  const open = (times: readonly string[]) => times.filter((time) => !recordedTimes.has(time));
  return (
    open(reached).at(-1) ??
    open(medication.schedule).at(0) ??
    reached.at(-1) ??
    medication.schedule.at(0)
  );
}
