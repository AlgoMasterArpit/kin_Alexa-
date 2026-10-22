import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { daysOfSupply, describeMedication, isRunningLow } from '../../domain/medications.ts';
import { pickSlotToLog } from '../../domain/schedule.ts';
import { DOSE_STATUSES } from '../../domain/types.ts';
import { describeDate, describeTime } from '../../time.ts';
import type { ToolContext } from '../context.ts';
import { lookupMedication } from '../lookup.ts';
import { failure, reply, spokenList } from '../results.ts';
import { clockTime, isoDate, medicationName } from '../schemas.ts';

const inputSchema = z.object({
  medication: medicationName,
  status: z
    .enum(DOSE_STATUSES)
    .default('taken')
    .describe('Whether the dose was taken or deliberately skipped.'),
  date: isoDate
    .optional()
    .describe(
      'Day the dose was meant for, YYYY-MM-DD. Defaults to today; use yesterday\'s date for "last night".',
    ),
  time: clockTime
    .optional()
    .describe(
      'Scheduled HH:MM slot, only if the parent named one. Otherwise Kin picks the right slot.',
    ),
});

export function registerLogMedicationTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'log_medication',
    {
      title: 'Log a medicine dose',
      description:
        'Records that the parent took or skipped a scheduled medicine dose. Use it whenever they mention taking, forgetting or skipping a medicine, including for earlier days.',
      inputSchema,
      annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const { household, familyAlerts } = ctx;
      const { store } = household;
      const lookup = lookupMedication(household, args.medication);
      if (!lookup.found) return lookup.result;
      const { medication } = lookup;

      const now = household.now();
      const date = args.date ?? now.date;
      if (date > now.date) return failure('Doses can only be logged for today or earlier days.');

      if (args.time && !medication.schedule.includes(args.time)) {
        return failure(
          `${medication.name} is scheduled at ${spokenList(medication.schedule.map(describeTime))}, not ${describeTime(args.time)}.`,
        );
      }
      const recorded = new Set(
        store.doses
          .listBetween(date, date)
          .filter((event) => event.medicationId === medication.id)
          .map((event) => event.time),
      );
      const time = args.time ?? pickSlotToLog(medication, recorded, date, now);
      if (!time) return failure(`${medication.name} has no scheduled doses.`);

      store.transaction(() => {
        const previous = store.doses.find(medication.id, date, time)?.status;
        store.doses.upsert({
          medicationId: medication.id,
          date,
          time,
          status: args.status,
          recordedAt: household.timestamp(),
        });
        if (args.status === 'taken' && previous !== 'taken') {
          store.medications.adjustPills(medication.id, -1);
        }
        if (args.status === 'skipped' && previous === 'taken') {
          store.medications.adjustPills(medication.id, 1);
        }
      });

      const when = date === now.date ? 'today' : describeDate(date);
      const lines = [
        args.status === 'taken'
          ? `Noted: ${describeMedication(medication)} taken for the ${describeTime(time)} dose ${when}.`
          : `Noted: the ${describeTime(time)} ${medication.name} dose ${when} was skipped.`,
      ];
      if (args.status === 'taken') {
        const corrected = await familyAlerts.confirmDose(
          { medicationId: medication.id, date, time },
          medication.name,
        );
        if (corrected)
          lines.push(
            'The family was told earlier this dose was not confirmed; Kin has sent them an update.',
          );
      }
      const updated = store.medications.findById(medication.id);
      if (updated && isRunningLow(updated)) {
        lines.push(
          `Only about ${String(daysOfSupply(updated) ?? 0)} days of ${updated.name} are left. Offer to reorder it.`,
        );
      }

      return reply(lines.join(' '), {
        medication: medication.name,
        date,
        time,
        status: args.status,
        pillsRemaining: updated?.pillsRemaining ?? null,
      });
    },
  );
}
