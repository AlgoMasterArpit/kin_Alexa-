import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { collectDigestInput } from '../../services/digest.ts';
import type { ToolContext } from '../context.ts';
import { reply } from '../results.ts';
import { periodDays } from '../schemas.ts';

const inputSchema = z.object({
  days: periodDays(7),
  send_to_family: z
    .boolean()
    .default(false)
    .describe('Also push the digest to the family. Only when the parent or family asks for it.'),
});

export function registerFamilyDigestTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'family_digest',
    {
      title: 'Family digest',
      description:
        'Writes a short update for the family covering medicines, wellbeing, concerns and what is coming up, and can send it to their phones.',
      inputSchema,
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async (args) => {
      const { household, digestWriter, notifier } = ctx;
      const digest = await digestWriter.write(collectDigestInput(household, args.days));

      let delivery: string | undefined;
      if (args.send_to_family) {
        const title = `Kin weekly update for ${household.parentName}`;
        const status = await notifier.send({ title, message: digest.text, severity: 'info' });
        household.store.alerts.add({
          severity: 'info',
          title,
          message: digest.text,
          delivery: status,
          createdAt: household.timestamp(),
        });
        delivery = status;
      }

      const footer =
        delivery === 'sent'
          ? '\n\nSent to the family.'
          : delivery
            ? '\n\nThe digest could not be sent to the family right now.'
            : '';
      return reply(`${digest.text}${footer}`, {
        digest: digest.text,
        writtenBy: digest.source,
        delivery: delivery ?? null,
      });
    },
  );
}
