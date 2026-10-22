import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { daysOfSupply, describeMedication, isRunningLow } from '../../domain/medications.ts';
import { addDays, describeDate, describeTime } from '../../time.ts';
import type { ToolContext } from '../context.ts';
import { reply, spokenList } from '../results.ts';
import { TODAY_VIEW_URI } from '../today-view.ts';

const STATUS_PHRASES = {
  taken: 'taken',
  skipped: 'skipped',
  missed: 'not logged yet',
  due: 'due now',
  upcoming: 'coming up',
} as const;

const outputSchema = z.object({
  date: z.string(),
  dateLabel: z.string(),
  parentName: z.string(),
  doses: z.array(
    z.object({
      medication: z.string(),
      dosage: z.string(),
      time: z.string(),
      timeLabel: z.string(),
      status: z.enum(['taken', 'skipped', 'missed', 'due', 'upcoming']),
    }),
  ),
  reminders: z.array(z.object({ date: z.string(), dateLabel: z.string(), content: z.string() })),
  checkin: z.object({ mood: z.int(), sleep: z.string(), ateWell: z.boolean() }).nullable(),
  lowSupply: z.array(z.object({ medication: z.string(), daysLeft: z.int() })),
});

export function registerGetTodayTool(server: McpServer, ctx: ToolContext): void {
  registerAppTool(
    server,
    'get_today',
    {
      title: "Today's plan",
      description:
        "Shows today's medicines with what has been taken, reminders for today and tomorrow, and today's check-in. Call this at the start of every conversation so you can greet the parent with what matters today.",
      outputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: TODAY_VIEW_URI } },
    },
    () => {
      const { household } = ctx;
      const today = household.now().date;
      const slots = household.slotsFor([today]);
      const doses = slots.map((slot) => ({
        medication: slot.medication.name,
        dosage: slot.medication.dosage,
        time: slot.time,
        timeLabel: describeTime(slot.time),
        status: slot.status,
      }));
      const reminders = household.store.memories
        .dueBetween(today, addDays(today, 1))
        .map((memory) => ({
          date: memory.remindOn ?? today,
          dateLabel: memory.remindOn === today ? 'Today' : 'Tomorrow',
          content: memory.content,
        }));
      const latest = household.store.checkins.latestPerDay(today, today).at(0);
      const lowSupply = household.store.medications
        .listActive()
        .filter(isRunningLow)
        .map((medication) => ({
          medication: medication.name,
          daysLeft: daysOfSupply(medication) ?? 0,
        }));

      const output = {
        date: today,
        dateLabel: describeDate(today),
        parentName: household.parentName,
        doses,
        reminders,
        checkin: latest
          ? { mood: latest.mood, sleep: latest.sleep, ateWell: latest.ateWell }
          : null,
        lowSupply,
      };

      const lines = [`Today is ${output.dateLabel}.`];
      lines.push(
        doses.length
          ? `Medicines: ${spokenList(
              slots.map(
                (slot) =>
                  `${describeMedication(slot.medication)} at ${describeTime(slot.time)} (${STATUS_PHRASES[slot.status]})`,
              ),
            )}.`
          : 'No medicines are scheduled today.',
      );
      if (reminders.length) {
        lines.push(
          `Reminders: ${spokenList(reminders.map((item) => `${item.dateLabel.toLowerCase()}, ${item.content}`))}.`,
        );
      }
      lines.push(
        latest
          ? `Today's check-in is done (mood ${String(latest.mood)} of 5).`
          : "Today's check-in has not been done yet.",
      );
      for (const item of lowSupply) {
        lines.push(
          `${item.medication} has about ${String(item.daysLeft)} days left; offer to reorder it.`,
        );
      }

      return reply(lines.join(' '), output);
    },
  );
}
