import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import { isInitializeRequest, type McpServerFactory } from '@modelcontextprotocol/server';

import type { Logger } from '../logger.ts';

export const LEGACY_SESSION_IDLE_MS = 30 * 60_000;
export const MAX_LEGACY_SESSIONS = 1_000;
const SWEEP_INTERVAL_MS = 60_000;

interface LegacySession {
  readonly transport: NodeStreamableHTTPServerTransport;
  lastSeen: number;
}

function rejectRequest(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

export class LegacySessions {
  readonly #sessions = new Map<string, LegacySession>();
  readonly #factory: McpServerFactory;
  readonly #logger: Logger;
  readonly #sweeper: NodeJS.Timeout;

  constructor(factory: McpServerFactory, logger: Logger) {
    this.#factory = factory;
    this.#logger = logger;
    this.#sweeper = setInterval(() => void this.#sweep(), SWEEP_INTERVAL_MS);
    this.#sweeper.unref();
  }

  get size(): number {
    return this.#sessions.size;
  }

  async handle(request: IncomingMessage, response: ServerResponse, body: unknown): Promise<void> {
    const sessionId = request.headers['mcp-session-id'];
    if (typeof sessionId === 'string') {
      const session = this.#sessions.get(sessionId);
      if (!session) {
        rejectRequest(response, 404, 'Session not found. Initialize a new session.');
        return;
      }
      session.lastSeen = Date.now();
      await session.transport.handleRequest(request, response, body);
      return;
    }

    if (request.method !== 'POST' || !isInitializeRequest(body)) {
      rejectRequest(response, 400, 'Bad Request: no valid session ID was provided.');
      return;
    }
    if (this.#sessions.size >= MAX_LEGACY_SESSIONS) {
      rejectRequest(response, 503, 'Too many open sessions. Try again later.');
      return;
    }

    const transport: NodeStreamableHTTPServerTransport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        this.#sessions.set(id, { transport, lastSeen: Date.now() });
        this.#logger.debug({ sessionId: id }, 'legacy MCP session opened');
      },
      onsessionclosed: (id) => {
        this.#sessions.delete(id);
      },
    });
    transport.onclose = () => {
      if (transport.sessionId) this.#sessions.delete(transport.sessionId);
    };

    const server = await this.#factory({ era: 'legacy' });
    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  }

  async closeAll(): Promise<void> {
    clearInterval(this.#sweeper);
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.allSettled(sessions.map((session) => session.transport.close()));
  }

  async #sweep(): Promise<void> {
    const cutoff = Date.now() - LEGACY_SESSION_IDLE_MS;
    const idle = [...this.#sessions].filter(([, session]) => session.lastSeen < cutoff);
    for (const [id] of idle) this.#sessions.delete(id);
    await Promise.allSettled(idle.map(([, session]) => session.transport.close()));
  }
}
