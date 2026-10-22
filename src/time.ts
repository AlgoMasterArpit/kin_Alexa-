export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const MS_PER_DAY = 86_400_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export interface LocalMoment {
  readonly date: string;
  readonly time: string;
}

export function toLocalMoment(instant: Date, timeZone: string): LocalMoment {
  const parts = Object.fromEntries(
    partsFormatter(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${String(parts.year)}-${String(parts.month)}-${String(parts.day)}`,
    time: `${String(parts.hour)}:${String(parts.minute)}`,
  };
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}

export function dateRange(from: string, to: string): string[] {
  const length = daysBetween(from, to) + 1;
  return Array.from({ length: Math.max(length, 0) }, (_, offset) => addDays(from, offset));
}

export function isValidDate(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export function describeDate(date: string): string {
  return weekdayFormatter.format(new Date(`${date}T00:00:00Z`));
}

export function describeTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  const suffix = hours < 12 ? 'AM' : 'PM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${displayHour} ${suffix}`
    : `${displayHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
