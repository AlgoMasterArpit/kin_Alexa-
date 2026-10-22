import { readFileSync } from 'node:fs';

import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/server';

export const TODAY_VIEW_URI = 'ui://kin/today.html';

const BUILT_VIEW = new URL('../../build/ui/today.html', import.meta.url);

export function loadTodayViewHtml(): string {
  try {
    return readFileSync(BUILT_VIEW, 'utf8');
  } catch (error) {
    throw new Error('The today card is not built yet. Run "npm run build:ui" first.', {
      cause: error,
    });
  }
}

export function registerTodayView(server: McpServer, html: string): void {
  registerAppResource(
    server,
    "Today's plan card",
    TODAY_VIEW_URI,
    { description: "A smart-display card with today's medicines, reminders and check-in." },
    () => ({
      contents: [
        {
          uri: TODAY_VIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: html,
          _meta: { ui: { prefersBorder: false } },
        },
      ],
    }),
  );
}
