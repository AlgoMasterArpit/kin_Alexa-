import { AlertDoseRepository } from './alert-doses.ts';
import { AlertRepository } from './alerts.ts';
import { CheckinRepository } from './checkins.ts';
import { transaction, type Database } from './database.ts';
import { DoseRepository } from './doses.ts';
import { MedicationRepository } from './medications.ts';
import { MemoryRepository } from './memories.ts';
import { OrderRepository } from './orders.ts';
import { QuestionRepository } from './questions.ts';
import { WatchdogNoticeRepository } from './watchdog-notices.ts';

export interface Store {
  readonly medications: MedicationRepository;
  readonly doses: DoseRepository;
  readonly checkins: CheckinRepository;
  readonly memories: MemoryRepository;
  readonly questions: QuestionRepository;
  readonly orders: OrderRepository;
  readonly alerts: AlertRepository;
  readonly alertDoses: AlertDoseRepository;
  readonly watchdogNotices: WatchdogNoticeRepository;
  transaction<T>(work: () => T): T;
}

export function createStore(db: Database): Store {
  return {
    medications: new MedicationRepository(db),
    doses: new DoseRepository(db),
    checkins: new CheckinRepository(db),
    memories: new MemoryRepository(db),
    questions: new QuestionRepository(db),
    orders: new OrderRepository(db),
    alerts: new AlertRepository(db),
    alertDoses: new AlertDoseRepository(db),
    watchdogNotices: new WatchdogNoticeRepository(db),
    transaction: (work) => transaction(db, work),
  };
}
