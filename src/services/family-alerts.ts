import type { SlotRef } from '../domain/patterns.ts';
import type { AlertDelivery, AlertSeverity } from '../domain/types.ts';
import { describeDate, describeTime } from '../time.ts';
import type { Household } from './household.ts';
import type { Notifier } from './notifier.ts';

export interface FamilyMessage {
  readonly title: string;
  readonly message: string;
  readonly severity: AlertSeverity;
  readonly doses?: readonly SlotRef[] | undefined;
}

export class FamilyAlerts {
  readonly #household: Household;
  readonly #notifier: Notifier;

  constructor(household: Household, notifier: Notifier) {
    this.#household = household;
    this.#notifier = notifier;
  }

  get enabled(): boolean {
    return this.#notifier.enabled;
  }

  async send(message: FamilyMessage): Promise<AlertDelivery> {
    const { store } = this.#household;
    const delivery = await this.#notifier.send(message);
    const alert = store.alerts.add({
      severity: message.severity,
      title: message.title,
      message: message.message,
      delivery,
      createdAt: this.#household.timestamp(),
    });
    if (delivery === 'sent' && message.doses?.length) {
      store.alertDoses.link(alert.id, message.doses);
    }
    return delivery;
  }

  async confirmDose(dose: SlotRef, medicationName: string): Promise<boolean> {
    const { store, parentName } = this.#household;
    if (!store.alertDoses.hasOpenAlert(dose)) return false;
    const delivery = await this.send({
      title: `Update about ${parentName}`,
      message: `${parentName} confirmed taking ${medicationName} (${describeTime(dose.time)}, ${describeDate(dose.date)}). No need to worry about that dose.`,
      severity: 'info',
    });
    if (delivery !== 'sent') return false;
    store.alertDoses.markCorrected(dose, this.#household.timestamp());
    return true;
  }
}
