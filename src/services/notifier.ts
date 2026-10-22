import type { AlertDelivery, AlertSeverity } from '../domain/types.ts';
import type { Logger } from '../logger.ts';

export interface FamilyNotification {
  readonly title: string;
  readonly message: string;
  readonly severity: AlertSeverity;
}

export interface Notifier {
  readonly enabled: boolean;
  send(notification: FamilyNotification): Promise<AlertDelivery>;
}

export const disabledNotifier: Notifier = {
  enabled: false,
  send: () => Promise.resolve('disabled'),
};

const PRIORITY: Record<AlertSeverity, number> = { info: 3, urgent: 5 };
const TAGS: Record<AlertSeverity, string[]> = { info: ['house'], urgent: ['warning', 'house'] };
const TIMEOUT_MS = 5_000;

export class NtfyNotifier implements Notifier {
  readonly enabled = true;
  readonly #baseUrl: string;
  readonly #topic: string;
  readonly #logger: Logger;
  readonly #fetch: typeof fetch;

  constructor(options: { baseUrl: string; topic: string; logger: Logger; fetch?: typeof fetch }) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#topic = options.topic;
    this.#logger = options.logger;
    this.#fetch = options.fetch ?? fetch;
  }

  async send(notification: FamilyNotification): Promise<AlertDelivery> {
    try {
      const response = await this.#fetch(this.#baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: this.#topic,
          title: notification.title,
          message: notification.message,
          priority: PRIORITY[notification.severity],
          tags: TAGS[notification.severity],
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (response.ok) return 'sent';
      this.#logger.warn({ status: response.status }, 'ntfy rejected the notification');
      return 'failed';
    } catch (error) {
      this.#logger.warn({ err: error }, 'ntfy notification failed');
      return 'failed';
    }
  }
}

export function createNotifier(options: {
  baseUrl: string;
  topic: string | undefined;
  logger: Logger;
}): Notifier {
  return options.topic
    ? new NtfyNotifier({ baseUrl: options.baseUrl, topic: options.topic, logger: options.logger })
    : disabledNotifier;
}
