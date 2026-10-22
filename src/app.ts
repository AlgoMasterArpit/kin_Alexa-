import type { Server } from 'node:http';

import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';

import { LOOPBACK_HOSTS, createHttpServer } from './http/server.ts';
import type { Logger } from './logger.ts';
import type { KinServices } from './mcp/context.ts';
import { kinServerFactory } from './mcp/server.ts';

export interface KinApp {
  readonly server: Server;
  readonly mcp: McpHttpHandler;
}

export function createKinApp(options: {
  services: KinServices;
  logger: Logger;
  apiToken: string | undefined;
  allowedHosts: readonly string[] | undefined;
}): KinApp {
  const mcp = createMcpHandler(kinServerFactory(options.services), {
    onerror: (error) => {
      options.logger.warn({ err: error }, 'mcp request failed');
    },
  });
  const server = createHttpServer({
    mcp,
    logger: options.logger,
    apiToken: options.apiToken,
    allowedHosts: options.allowedHosts ?? LOOPBACK_HOSTS,
  });
  return { server, mcp };
}
