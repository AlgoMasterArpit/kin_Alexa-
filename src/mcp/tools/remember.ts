import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { describeDate } from '../../time.ts';
import type { ToolContext } from '../context.ts';
import { failure, reply } from '../results.ts';
import { isoDate, shortText } from '../schemas.ts';

const inputSchema = z.object({
  content: shortText(500).describe('What to remember, in a clear sentence.'),
  remind_on: isoDate
    .optional()
    .describe('YYYY-MM-DD date to bring this up again, e.g. the day of an appointment.'),
});

export function registerRememberTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'remember',
    {
      title: 'Remember something',
      description:
        'Saves something the parent wants remembered, such as an appointment, a visit or where they kept something. Add remind_on when it should come up on a particular day.',
      inputSchema,
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    (args) => {
      const { household } = ctx;
      const today = household.now().date;
      if (args.remind_on && args.remind_on < today) {
        return failure('That date has already passed. Ask which upcoming day they meant.');
      }

      const memory = household.store.memories.add({
        content: args.content,
        remindOn: args.remind_on ?? null,
        createdAt: household.timestamp(),
      });

      return reply(
        memory.remindOn
          ? `Saved. I'll bring it up on ${describeDate(memory.remindOn)}.`
          : 'Saved. I will remember that.',
        { id: memory.id, content: memory.content, remindOn: memory.remindOn },
      );
    },
  );
}
