import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

import { createKinApp, type KinApp } from '../src/app.ts';
import { createTestServices } from './support/household.ts';

const TOKEN = 'test-token-0123456789abcdef0123456789';

async function start(apiToken?: string): Promise<{ app: KinApp; url: string }> {
  const { services } = createTestServices();
  const app = createKinApp({
    services,
    logger: services.logger,
    apiToken,
    allowedHosts: undefined,
  });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const { port } = app.server.address() as AddressInfo;
  return { app, url: `http://127.0.0.1:${String(port)}` };
}

async function stop(app: KinApp): Promise<void> {
  app.server.closeAllConnections();
  app.server.close();
  await app.mcp.close();
}

async function rpc(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(`${url}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = response.headers.get('content-type')?.includes('text/event-stream')
    ? text
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => line.slice('data: '.length))
        .at(-1)
    : text;
  return { status: response.status, body: payload ? (JSON.parse(payload) as unknown) : undefined };
}

describe('HTTP transport', () => {
  let app: KinApp;
  let url: string;

  before(async () => {
    ({ app, url } = await start());
  });

  after(async () => {
    await stop(app);
  });

  it('answers health checks', async () => {
    const response = await fetch(`${url}/healthz`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', version: '0.1.0' });
  });

  it('negotiates MCP 2025-11-25 over Streamable HTTP', async () => {
    const { status, body } = await rpc(url, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'alexa-plus-probe', version: '1.0.0' },
      },
    });

    assert.equal(status, 200);
    const { result } = body as {
      result: { protocolVersion: string; serverInfo: { name: string } };
    };
    assert.equal(result.protocolVersion, '2025-11-25');
    assert.equal(result.serverInfo.name, 'kin');
  });

  it('calls tools statelessly for 2025-11-25 clients', async () => {
    const { body } = await rpc(
      url,
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_today', arguments: {} } },
      { 'MCP-Protocol-Version': '2025-11-25' },
    );

    const { result } = body as { result: { content: { text: string }[] } };
    assert.match(result.content[0]?.text ?? '', /Today is Thursday, October 22\./);
  });

  it('serves the official MCP client end to end', async () => {
    const client = new Client({ name: 'kin-http-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${url}/mcp`)));

    const { tools } = await client.listTools();
    assert.equal(tools.length, 9);
    await client.close();
  });

  it('rejects requests for a foreign Host header', async () => {
    const request = httpRequest(`${url}/mcp`, {
      method: 'POST',
      headers: { Host: 'attacker.example', 'Content-Type': 'application/json' },
    });
    request.end('{}');
    const [response] = (await once(request, 'response')) as [IncomingMessage];
    response.resume();

    assert.equal(response.statusCode, 403);
  });

  it('returns 404 for unknown paths', async () => {
    assert.equal((await fetch(`${url}/admin`)).status, 404);
  });
});

describe('HTTP transport with a bearer token', () => {
  let app: KinApp;
  let url: string;
  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 't', version: '1' },
    },
  };

  before(async () => {
    ({ app, url } = await start(TOKEN));
  });

  after(async () => {
    await stop(app);
  });

  it('rejects requests without the token', async () => {
    const { status } = await rpc(url, initialize);
    assert.equal(status, 401);
  });

  it('rejects a wrong token', async () => {
    const { status } = await rpc(url, initialize, { Authorization: 'Bearer nope' });
    assert.equal(status, 401);
  });

  it('accepts the configured token', async () => {
    const { status } = await rpc(url, initialize, { Authorization: `Bearer ${TOKEN}` });
    assert.equal(status, 200);
  });
});
