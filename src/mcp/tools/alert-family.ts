import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { ALERT_SEVERITIES } from '../../domain/types.ts';
import type { ToolContext } from '../context.ts';
import { failure, reply } from '../results.ts';
import { shortText } from '../schemas.ts';

const DUPLICATE_WINDOW_MS = 10 * 60_000;

const inputSchema = z.object({
  message: shortText(500).describe('What the family should know, written for them to read.'),
  severity: z
    .enum(ALERT_SEVERITIES)
    .default('info')
    .describe(
      'Use urgent only for knowingly skipped critical medicines, falls, feeling unwell or distress.',
    ),
});

export function registerAlertFamilyTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'alert_family',
    {
      title: 'Alert the family',
      description:
        "Sends a push notification to the family's phones. Use it when the parent asks, when they report feeling unwell, or when notice_patterns finds an urgent concern. Never use it for small talk.",
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args) => {
      const { household, familyAlerts, logger } = ctx;
      const { store } = household;

      const recentSince = new Date(
        household.instant().getTime() - DUPLICATE_WINDOW_MS,
      ).toISOString();
      const duplicate = store.alerts
        .since(recentSince)
        .some((alert) => alert.message === args.message && alert.delivery === 'sent');
      if (duplicate) return reply('The family already got this message a few minutes ago.');

      const title =
        args.severity === 'urgent'
          ? `Urgent: ${household.parentName} needs you`
          : `Update about ${household.parentName}`;
      const delivery = await familyAlerts.send({
        title,
        message: args.message,
        severity: args.severity,
      });
      logger.info({ severity: args.severity, delivery }, 'family alert processed');

      switch (delivery) {
        case 'sent':
          return reply('The family has been notified.', { delivery });
        case 'disabled':
          return failure(
            'Family alerts are not set up on this Kin yet, so nobody was notified. Suggest calling a family member instead.',
          );
        case 'failed':
          return failure(
            "I couldn't reach the family's phones just now. Suggest calling a family member directly.",
          );
      }
    },
  );
}
