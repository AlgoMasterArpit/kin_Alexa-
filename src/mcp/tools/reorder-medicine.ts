import { randomUUID } from 'node:crypto';

import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { describeMedication } from '../../domain/medications.ts';
import { requestConfirmation } from '../confirmation.ts';
import type { ToolContext } from '../context.ts';
import { lookupMedication } from '../lookup.ts';
import { reply } from '../results.ts';
import { medicationName } from '../schemas.ts';

const inputSchema = z.object({
  medication: medicationName,
  quantity: z.int().min(1).max(180).default(30).describe('Number of tablets to order.'),
  confirmed: z
    .boolean()
    .default(false)
    .describe(
      'Only for clients without confirmation prompts: set true after the parent has clearly said yes to this exact order.',
    ),
});

const orderReference = (): string => `KIN-${randomUUID().slice(0, 8).toUpperCase()}`;

export function registerReorderMedicineTool(server: McpServer, ctx: ToolContext): void {
  server.registerTool(
    'reorder_medicine',
    {
      title: 'Reorder a medicine',
      description:
        "Places a refill order for one of the parent's medicines after asking them to confirm. Orders are simulated in this build: no payment is taken and nothing ships.",
      inputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async (args, requestContext) => {
      const { household, era } = ctx;
      const lookup = lookupMedication(household, args.medication);
      if (!lookup.found) return lookup.result;
      const { medication } = lookup;

      const summary = `${String(args.quantity)} tablets of ${describeMedication(medication)}`;
      const confirmation = await requestConfirmation(requestContext, era, `Order ${summary}?`);

      switch (confirmation.status) {
        case 'pending':
          return confirmation.result;
        case 'declined':
          return reply('Okay, no order was placed.', { status: 'declined' });
        case 'unsupported':
          if (!args.confirmed) {
            return reply(
              `Ask the parent: "Shall I order ${summary}?" If they say yes, call reorder_medicine again with confirmed set to true.`,
              { status: 'needs_confirmation' },
            );
          }
          break;
        case 'confirmed':
          break;
      }

      const order = household.store.orders.add({
        medicationId: medication.id,
        quantity: args.quantity,
        reference: orderReference(),
        createdAt: household.timestamp(),
      });

      return reply(
        `Order ${order.reference} placed for ${summary}. This is a simulated order, so no payment was taken.`,
        {
          status: 'placed',
          reference: order.reference,
          medication: medication.name,
          quantity: order.quantity,
          simulated: true,
        },
      );
    },
  );
}
