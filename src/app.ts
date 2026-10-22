import type { Server } from 'node:http';

import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';

import { LegacySessions } from './http/legacy-sessions.ts';
import { LOOPBACK_HOSTS, createHttpServer } from './http/server.ts';
import type { Logger } from './logger.ts';
import type { KinServices } from './mcp/context.ts';
import { kinServerFactory } from './mcp/server.ts';

export interface KinApp {
  readonly server: Server;
  readonly mcp: McpHttpHandler;
  readonly legacy: LegacySessions;
  close(): Promise<void>;
}

export function createKinApp(options: {
  services: KinServices;
  logger: Logger;
  apiToken: string | undefined;
  allowedHosts: readonly string[] | undefined;
}): KinApp {
  const factory = kinServerFactory(options.services);
  const mcp = createMcpHandler(factory, {
    legacy: 'reject',
    onerror: (error) => {
      options.logger.warn({ err: error }, 'mcp request failed');
    },
  });
  const legacy = new LegacySessions(factory, options.logger);
  const server = createHttpServer({
    mcp,
    legacy,
    logger: options.logger,
    apiToken: options.apiToken,
    allowedHosts: options.allowedHosts ?? LOOPBACK_HOSTS,
  });
  return {
    server,
    mcp,
    legacy,
    close: async () => {
      server.close();
      server.closeAllConnections();
      await Promise.allSettled([mcp.close(), legacy.closeAll()]);
    },
  };
}
