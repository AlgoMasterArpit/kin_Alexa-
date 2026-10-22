import { concernKey, type Concern } from '../domain/patterns.ts';
import type { Logger } from '../logger.ts';
import { renderDailySummary } from './daily-summary.ts';
import type { FamilyAlerts, FamilyMessage } from './family-alerts.ts';
import type { Household } from './household.ts';

export const REVIEW_DAYS = 7;
export const DAILY_SUMMARY_KEY = 'daily_summary';

export interface WatchdogOptions {
  readonly household: Household;
  readonly alerts: FamilyAlerts;
  readonly logger: Logger;
  readonly intervalMs: number;
  readonly summaryTime: string;
}

function followUp(concern: Concern, parentName: string): string {
  return concern.kind === 'unconfirmed_doses'
    ? ` Kin will ask ${parentName} about it next time they talk, and will update you if they confirm.`
    : '';
}

export class Watchdog {
  readonly #household: Household;
  readonly #alerts: FamilyAlerts;
  readonly #logger: Logger;
  readonly #intervalMs: number;
  readonly #summaryTime: string;
  #timer: NodeJS.Timeout | undefined;
  #running = false;

  constructor(options: WatchdogOptions) {
    this.#household = options.household;
    this.#alerts = options.alerts;
    this.#logger = options.logger;
    this.#intervalMs = options.intervalMs;
    this.#summaryTime = options.summaryTime;
  }

  start(): void {
    if (this.#timer) return;
    const run = () => {
      this.tick().catch((error: unknown) => {
        this.#logger.error({ err: error }, 'watchdog check failed');
      });
    };
    this.#timer = setInterval(run, this.#intervalMs);
    this.#timer.unref();
    run();
  }

  stop(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  async tick(): Promise<string[]> {
    if (this.#running || !this.#alerts.enabled) return [];
    this.#running = true;
    try {
      const sent: string[] = [];
      const { parentName } = this.#household;
      const urgent = this.#household
        .review(REVIEW_DAYS)
        .concerns.filter((concern) => concern.severity === 'urgent');

      for (const concern of urgent) {
        const notice = await this.#notifyOnce(concernKey(concern), {
          title: `Kin noticed something about ${parentName}`,
          message: `${concern.summary}${followUp(concern, parentName)}`,
          severity: 'urgent',
          doses: concern.slots,
        });
        if (notice) sent.push(notice);
      }

      if (this.#household.now().time >= this.#summaryTime) {
        const notice = await this.#notifyOnce(DAILY_SUMMARY_KEY, {
          title: `Today with ${parentName}`,
          message: renderDailySummary(this.#household),
          severity: 'info',
        });
        if (notice) sent.push(notice);
      }
      return sent;
    } finally {
      this.#running = false;
    }
  }

  async #notifyOnce(key: string, message: FamilyMessage): Promise<string | undefined> {
    const { store } = this.#household;
    const today = this.#household.now().date;
    if (!store.watchdogNotices.claim(key, today, this.#household.timestamp())) return undefined;
    const delivery = await this.#alerts.send(message);
    if (delivery === 'sent') {
      this.#logger.info({ key }, 'watchdog notified the family');
      return key;
    }
    store.watchdogNotices.release(key, today);
    return undefined;
  }
}
