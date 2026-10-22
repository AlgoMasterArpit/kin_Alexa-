import type { ProtocolEra } from '@modelcontextprotocol/server';

import type { Logger } from '../logger.ts';
import type { DigestWriter } from '../services/digest.ts';
import type { Household } from '../services/household.ts';
import type { FamilyAlerts } from '../services/family-alerts.ts';

export interface KinServices {
  readonly household: Household;
  readonly familyAlerts: FamilyAlerts;
  readonly digestWriter: DigestWriter;
  readonly todayViewHtml: string;
  readonly logger: Logger;
}

export interface ToolContext extends KinServices {
  readonly era: ProtocolEra;
}
