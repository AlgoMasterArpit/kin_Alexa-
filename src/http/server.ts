import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import type { McpHttpHandler } from '@modelcontextprotocol/server';

import type { Logger } from '../logger.ts';
import { KIN_VERSION } from '../version.ts';
import { bearerTokenMatches } from './auth.ts';

export const MCP_PATH = '/mcp';
export const HEALTH_PATH = '/healthz';
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;

export interface HttpServerOptions {
  readonly mcp: McpHttpHandler;
  readonly logger: Logger;
  readonly apiToken: string | undefined;
  readonly allowedHosts: readonly string[];
}

function sendJson(response: ServerResponse, status: number, body: unknown, headers = {}): void {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

function sendJsonRpcError(response: ServerResponse, status: number, message: string): void {
  const headers = status === 401 ? { 'WWW-Authenticate': 'Bearer realm="kin"' } : {};
  sendJson(
    response,
    status,
    { jsonrpc: '2.0', error: { code: -32000, message }, id: null },
    headers,
  );
}

export function createHttpServer(options: HttpServerOptions): Server {
  const { logger, apiToken } = options;
  const validateHost = hostHeaderValidation([...options.allowedHosts]);
  const validateOrigin = originValidation([...options.allowedHosts]);
  const handleMcp = toNodeHandler(options.mcp);

  const route = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const path = new URL(request.url ?? '/', 'http://kin.local').pathname;

    if (path === HEALTH_PATH && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok', version: KIN_VERSION });
      return;
    }
    if (path !== MCP_PATH) {
      sendJson(response, 404, { error: 'Not found' });
      return;
    }
    if (!validateHost(request, response) || !validateOrigin(request, response)) return;
    if (apiToken && !bearerTokenMatches(request, apiToken)) {
      sendJsonRpcError(response, 401, 'Missing or invalid bearer token');
      return;
    }
    await handleMcp(request, response);
  };

  return createServer((request, response) => {
    const startedAt = performance.now();
    response.once('finish', () => {
      logger.debug(
        {
          method: request.method,
          path: request.url,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        },
        'request completed',
      );
    });
    route(request, response).catch((error: unknown) => {
      logger.error({ err: error }, 'unhandled request error');
      if (response.headersSent) response.destroy();
      else sendJsonRpcError(response, 500, 'Internal server error');
    });
  });
}
