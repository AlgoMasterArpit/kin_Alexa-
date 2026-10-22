export const DOSE_STATUSES = ['taken', 'skipped'] as const;
export type DoseStatus = (typeof DOSE_STATUSES)[number];

export const SLEEP_QUALITIES = ['poor', 'fair', 'good'] as const;
export type SleepQuality = (typeof SLEEP_QUALITIES)[number];

export const ALERT_SEVERITIES = ['info', 'urgent'] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export type AlertDelivery = 'sent' | 'failed' | 'disabled';

export interface Medication {
  readonly id: number;
  readonly name: string;
  readonly dosage: string;
  readonly purpose: string | null;
  readonly aliases: readonly string[];
  readonly schedule: readonly string[];
  readonly pillsRemaining: number | null;
}

export interface DoseEvent {
  readonly medicationId: number;
  readonly date: string;
  readonly time: string;
  readonly status: DoseStatus;
  readonly recordedAt: string;
}

export interface Checkin {
  readonly id: number;
  readonly date: string;
  readonly mood: number;
  readonly sleep: SleepQuality;
  readonly ateWell: boolean;
  readonly note: string | null;
  readonly recordedAt: string;
}

export interface Memory {
  readonly id: number;
  readonly content: string;
  readonly remindOn: string | null;
  readonly createdAt: string;
}

export interface Question {
  readonly text: string;
  readonly askedAt: string;
}

export interface Order {
  readonly id: number;
  readonly medicationId: number;
  readonly quantity: number;
  readonly reference: string;
  readonly createdAt: string;
}

export interface Alert {
  readonly id: number;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly message: string;
  readonly delivery: AlertDelivery;
  readonly createdAt: string;
}
