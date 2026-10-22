import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { keywords } from '../../domain/text.ts';
import { addDays, describeDate } from '../../time.ts';
import type { ToolContext } from '../context.ts';
import { reply } from '../results.ts';
import { shortText } from '../schemas.ts';

const RESULT_LIMIT = 5;
const UPCOMING_DAYS = 7;

const inputSchema = z.object({
  question: shortText(300).describe("The parent's question, in their own words."),
});

export function registerRecallTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'recall',
    {
      title: 'Recall a memory',
      description:
        'Looks up things the parent asked Kin to remember and their upcoming reminders. Use it for questions like "when is my doctor appointment?" or "where did I keep the spare key?".',
      inputSchema,
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    (args) => {
      const { household } = ctx;
      const { store } = household;
      store.questions.add({ text: args.question, askedAt: household.timestamp() });

      const today = household.now().date;
      const matches = store.memories.search(keywords(args.question), RESULT_LIMIT);
      const upcoming = store.memories.dueBetween(today, addDays(today, UPCOMING_DAYS));

      const describe = (content: string, remindOn: string | null) =>
        remindOn ? `${content} (${describeDate(remindOn)})` : content;

      const text = matches.length
        ? `Here is what I have: ${matches.map((memory) => describe(memory.content, memory.remindOn)).join('; ')}.`
        : upcoming.length
          ? `I don't have anything saved about that. Coming up this week: ${upcoming.map((memory) => describe(memory.content, memory.remindOn)).join('; ')}.`
          : "I don't have anything saved about that.";

      return reply(text, {
        matches: matches.map(({ content, remindOn }) => ({ content, remindOn })),
        upcoming: upcoming.map(({ content, remindOn }) => ({ content, remindOn })),
      });
    },
  );
}
