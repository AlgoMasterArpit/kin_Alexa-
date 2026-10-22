import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import {
  hostHeaderValidation,
  originValidation,
  toNodeHandler,
  toWebRequest,
} from '@modelcontextprotocol/node';
import { isLegacyRequest, type McpHttpHandler } from '@modelcontextprotocol/server';

import type { Logger } from '../logger.ts';
import { KIN_VERSION } from '../version.ts';
import { bearerTokenMatches } from './auth.ts';
import type { LegacySessions } from './legacy-sessions.ts';

export const MCP_PATH = '/mcp';
export const HEALTH_PATH = '/healthz';
export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'] as const;
export const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface HttpServerOptions {
  readonly mcp: McpHttpHandler;
  readonly legacy: LegacySessions;
  readonly logger: Logger;
  readonly apiToken: string | undefined;
  readonly allowedHosts: readonly string[];
}

class PayloadTooLargeError extends Error {
  override readonly name = 'PayloadTooLargeError';
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

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (request.method !== 'POST') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new PayloadTooLargeError('Request body is too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return undefined;
  }
}

export function createHttpServer(options: HttpServerOptions): Server {
  const { logger, apiToken, legacy } = options;
  const validateHost = hostHeaderValidation([...options.allowedHosts]);
  const validateOrigin = originValidation([...options.allowedHosts]);
  const handleModern = toNodeHandler(options.mcp);

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

    const body = await readJsonBody(request);
    if (await isLegacyRequest(await toWebRequest(request, body), body)) {
      await legacy.handle(request, response, body);
    } else {
      await handleModern(request, response, body);
    }
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
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof PayloadTooLargeError) {
        sendJsonRpcError(response, 413, error.message);
        return;
      }
      logger.error({ err: error }, 'unhandled request error');
      sendJsonRpcError(response, 500, 'Internal server error');
    });
  });
}
