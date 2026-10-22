import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { SLEEP_QUALITIES } from '../../domain/types.ts';
import type { ToolContext } from '../context.ts';
import { reply } from '../results.ts';
import { shortText } from '../schemas.ts';

const LOW_MOOD = 2;

const inputSchema = z.object({
  mood: z.int().min(1).max(5).describe('How they feel today, 1 (very low) to 5 (great).'),
  sleep: z.enum(SLEEP_QUALITIES).describe('How they slept last night.'),
  ate_well: z.boolean().describe('Whether they have been eating properly today.'),
  note: shortText(500).optional().describe('Anything else they shared, in their own words.'),
});

export function registerDailyCheckinTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'daily_checkin',
    {
      title: 'Daily check-in',
      description:
        "Saves the parent's daily wellbeing check-in: mood, sleep, appetite and a short note. Ask about these gently in conversation, then call this once you have the answers.",
      inputSchema,
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    (args) => {
      const { household } = ctx;
      const checkin = household.store.checkins.add({
        date: household.now().date,
        mood: args.mood,
        sleep: args.sleep,
        ateWell: args.ate_well,
        note: args.note ?? null,
        recordedAt: household.timestamp(),
      });

      const lines = ["Today's check-in is saved."];
      if (checkin.mood <= LOW_MOOD) {
        lines.push(
          'Their mood is low today. Be kind, and ask whether they would like you to let the family know.',
        );
      }
      if (!checkin.ateWell) lines.push('Gently encourage a proper meal.');

      return reply(lines.join(' '), {
        date: checkin.date,
        mood: checkin.mood,
        sleep: checkin.sleep,
        ateWell: checkin.ateWell,
      });
    },
  );
}
