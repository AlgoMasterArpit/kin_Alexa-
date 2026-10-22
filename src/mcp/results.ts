import type { CallToolResult } from '@modelcontextprotocol/server';

export function reply(text: string, structuredContent?: Record<string, unknown>): CallToolResult {
  return structuredContent
    ? { content: [{ type: 'text', text }], structuredContent }
    : { content: [{ type: 'text', text }] };
}

export function failure(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

export function spokenList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1) ?? ''}`;
}
