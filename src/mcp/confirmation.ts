import {
  acceptedContent,
  inputRequired,
  inputResponse,
  type InputRequiredResult,
  type ProtocolEra,
  type ServerContext,
} from '@modelcontextprotocol/server';
import { z } from 'zod';

const RESPONSE_KEY = 'confirm';

const confirmationSchema = z.object({
  confirm: z.boolean().describe('Yes to go ahead, no to cancel.'),
});

export type Confirmation =
  | { readonly status: 'confirmed' }
  | { readonly status: 'declined' }
  | { readonly status: 'pending'; readonly result: InputRequiredResult }
  | { readonly status: 'unsupported' };

function askModernClient(ctx: ServerContext, message: string): Confirmation {
  const response = inputResponse(ctx.mcpReq.inputResponses, RESPONSE_KEY);
  if (response.kind === 'missing') {
    return {
      status: 'pending',
      result: inputRequired({
        inputRequests: {
          [RESPONSE_KEY]: inputRequired.elicit({ message, requestedSchema: confirmationSchema }),
        },
      }),
    };
  }
  const content = acceptedContent(ctx.mcpReq.inputResponses, RESPONSE_KEY, confirmationSchema);
  return content?.confirm === true ? { status: 'confirmed' } : { status: 'declined' };
}

async function askLegacyClient(ctx: ServerContext, message: string): Promise<Confirmation> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the 2025-11-25 era only supports push-style elicitation
    const result = await ctx.mcpReq.elicitInput({
      mode: 'form',
      message,
      requestedSchema: {
        type: 'object',
        properties: {
          confirm: {
            type: 'boolean',
            title: 'Confirm',
            description: 'Yes to go ahead, no to cancel.',
          },
        },
        required: ['confirm'],
      },
    });
    return result.action === 'accept' && result.content?.confirm === true
      ? { status: 'confirmed' }
      : { status: 'declined' };
  } catch {
    return { status: 'unsupported' };
  }
}

export function requestConfirmation(
  ctx: ServerContext,
  era: ProtocolEra,
  message: string,
): Promise<Confirmation> {
  return era === 'modern'
    ? Promise.resolve(askModernClient(ctx, message))
    : askLegacyClient(ctx, message);
}
