import { McpServer, type McpServerFactory } from '@modelcontextprotocol/server';

import { KIN_VERSION } from '../version.ts';
import type { KinServices, ToolContext } from './context.ts';
import { registerTodayView } from './today-view.ts';
import { registerAlertFamilyTool } from './tools/alert-family.ts';
import { registerDailyCheckinTool } from './tools/daily-checkin.ts';
import { registerFamilyDigestTool } from './tools/family-digest.ts';
import { registerGetTodayTool } from './tools/get-today.ts';
import { registerLogMedicationTool } from './tools/log-medication.ts';
import { registerNoticePatternsTool } from './tools/notice-patterns.ts';
import { registerRecallTool } from './tools/recall.ts';
import { registerRememberTool } from './tools/remember.ts';
import { registerReorderMedicineTool } from './tools/reorder-medicine.ts';

const TOOLS = [
  registerGetTodayTool,
  registerLogMedicationTool,
  registerDailyCheckinTool,
  registerRememberTool,
  registerRecallTool,
  registerNoticePatternsTool,
  registerAlertFamilyTool,
  registerReorderMedicineTool,
  registerFamilyDigestTool,
] as const;

export function serverInstructions(parentName: string): string {
  return `Kin is a companion for ${parentName}, an older adult who lives alone. Everything you say is spoken aloud, so keep replies short, warm and plain, one idea at a time.

Start each conversation with get_today and greet ${parentName} with what is due and any reminders. If get_today lists doses that are not confirmed yet, ask kindly whether they took them and log the answer with log_medication for that date and time. A dose nobody logged is unconfirmed, not missed: never tell ${parentName} or the family that a dose was missed unless ${parentName} says so. Log medicines with log_medication whenever they mention taking, forgetting or skipping one. Do the daily check-in through gentle conversation, then save it with daily_checkin and run notice_patterns.

Never give medical advice or change medicine doses. If ${parentName} reports a fall, chest pain, trouble breathing or feeling very unwell, tell them to call emergency services right away and send an urgent alert_family. Always get a clear yes before reorder_medicine.`;
}

export function createKinServer(context: ToolContext): McpServer {
  const server = new McpServer(
    { name: 'kin', title: 'Kin', version: KIN_VERSION },
    { instructions: serverInstructions(context.household.parentName) },
  );
  registerTodayView(server, context.todayViewHtml);
  for (const register of TOOLS) register(server, context);
  return server;
}

export function kinServerFactory(services: KinServices): McpServerFactory {
  return ({ era }) => createKinServer({ ...services, era });
}
