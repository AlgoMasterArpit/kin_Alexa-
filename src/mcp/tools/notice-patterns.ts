import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import type { ToolContext } from '../context.ts';
import { reply } from '../results.ts';
import { periodDays } from '../schemas.ts';

const inputSchema = z.object({ days: periodDays(7) });

export function registerNoticePatternsTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'notice_patterns',
    {
      title: 'Notice patterns',
      description:
        'Reviews recent days for things the family should know: medicines the parent said they skipped, doses that stayed unconfirmed for over 12 hours, falling mood, poor sleep, missing check-ins, the same question asked again and again, and medicines about to run out. Unconfirmed is not the same as missed: ask the parent before treating it as a problem. Call it after a check-in or a skipped dose, and before alert_family.',
      inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => {
      const review = ctx.household.review(args.days);
      const urgent = review.concerns.some((concern) => concern.severity === 'urgent');

      const text = review.concerns.length
        ? [
            ...review.concerns.map(
              (concern) => `${concern.severity === 'urgent' ? 'Urgent: ' : ''}${concern.summary}`,
            ),
            urgent
              ? 'Tell the parent kindly and offer to alert the family with alert_family at urgent severity.'
              : 'Mention these gently; alert the family only if the parent agrees.',
          ].join(' ')
        : 'Everything looks steady. No concerns this period.';

      return reply(text, { from: review.from, to: review.to, concerns: review.concerns });
    },
  );
}
