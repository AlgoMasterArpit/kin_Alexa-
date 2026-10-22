import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport, type CallToolResult } from '@modelcontextprotocol/server';

import { createKinServer } from '../src/mcp/server.ts';
import { TODAY_VIEW_URI } from '../src/mcp/today-view.ts';
import { createTestServices } from './support/household.ts';

type Harness = ReturnType<typeof createTestServices> & { client: Client };

async function connect(elicitationAnswer?: boolean): Promise<Harness> {
  const harness = createTestServices();
  const server = createKinServer({ ...harness.services, era: 'legacy' });
  const client = new Client(
    { name: 'kin-test', version: '1.0.0' },
    { capabilities: elicitationAnswer === undefined ? {} : { elicitation: { form: {} } } },
  );
  if (elicitationAnswer !== undefined) {
    client.setRequestHandler('elicitation/create', () => ({
      action: 'accept',
      content: { confirm: elicitationAnswer },
    }));
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { ...harness, client };
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<CallToolResult> {
  return (await client.callTool({ name, arguments: args }));
}

const textOf = (result: CallToolResult): string =>
  result.content.map((block) => (block.type === 'text' ? block.text : '')).join('');

describe('Kin MCP server', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await connect();
  });

  afterEach(async () => {
    await harness.client.close();
  });

  it('lists every tool and links get_today to its UI card', async () => {
    const { tools } = await harness.client.listTools();

    assert.deepEqual(tools.map((tool) => tool.name).toSorted(), [
      'alert_family',
      'daily_checkin',
      'family_digest',
      'get_today',
      'log_medication',
      'notice_patterns',
      'recall',
      'remember',
      'reorder_medicine',
    ]);
    const today = tools.find((tool) => tool.name === 'get_today');
    assert.deepEqual(today?._meta?.ui, { resourceUri: TODAY_VIEW_URI });
  });

  it('serves the today card as an MCP Apps resource', async () => {
    const resource = await harness.client.readResource({ uri: TODAY_VIEW_URI });
    const [content] = resource.contents;

    assert.equal(content?.mimeType, 'text/html;profile=mcp-app');
  });

  it("reports today's doses with their status", async () => {
    const result = await call(harness.client, 'get_today');

    assert.equal(result.isError, undefined);
    assert.match(textOf(result), /Today is Thursday, October 22\./);
    assert.deepEqual(
      (result.structuredContent as { doses: { medication: string; status: string }[] }).doses.map(
        (dose) => `${dose.medication} ${dose.status}`,
      ),
      ['Metformin missed', 'Metformin due', 'Amlodipine due'],
    );
  });

  it('logs a dose by nickname and counts the pill', async () => {
    const result = await call(harness.client, 'log_medication', {
      medication: 'BP tablet',
      date: '2026-10-21',
    });

    assert.match(textOf(result), /Amlodipine 5 mg taken for the 9 PM dose Wednesday, October 21/);
    assert.equal(harness.store.medications.listActive()[0]?.pillsRemaining, 19);
  });

  it('does not double count a dose logged twice', async () => {
    await call(harness.client, 'log_medication', { medication: 'metformin', time: '08:00' });
    await call(harness.client, 'log_medication', { medication: 'metformin', time: '08:00' });

    assert.equal(harness.store.medications.listActive()[1]?.pillsRemaining, 59);
  });

  it('rejects a slot the medicine is not scheduled for', async () => {
    const result = await call(harness.client, 'log_medication', {
      medication: 'metformin',
      time: '13:00',
    });

    assert.equal(result.isError, true);
    assert.match(textOf(result), /scheduled at 8 AM and 8 PM, not 1 PM/);
  });

  it('remembers something and recalls it later', async () => {
    await call(harness.client, 'remember', {
      content: 'Doctor appointment with Dr. Rao at 11 AM',
      remind_on: '2026-10-23',
    });

    const result = await call(harness.client, 'recall', { question: 'When is my doctor visit?' });

    assert.match(textOf(result), /Dr\. Rao at 11 AM \(Friday, October 23\)/);
  });

  it('refuses reminders in the past', async () => {
    const result = await call(harness.client, 'remember', {
      content: 'Old news',
      remind_on: '2026-10-01',
    });

    assert.equal(result.isError, true);
  });

  it('flags a low mood during the check-in', async () => {
    const result = await call(harness.client, 'daily_checkin', {
      mood: 2,
      sleep: 'poor',
      ate_well: false,
    });

    assert.match(textOf(result), /mood is low today/);
  });

  it('notices repeatedly missed medicine', async () => {
    harness.clock.set('2026-10-24T17:00:00.000Z');

    const result = await call(harness.client, 'notice_patterns', { days: 3 });

    assert.match(textOf(result), /Urgent: Missed Metformin 6 times/);
  });

  it('pushes alerts to the family and suppresses duplicates', async () => {
    const args = { message: 'Mom skipped her BP tablet last night.', severity: 'urgent' };

    await call(harness.client, 'alert_family', args);
    const second = await call(harness.client, 'alert_family', args);

    assert.equal(harness.notifier.sent.length, 1);
    assert.equal(harness.notifier.sent[0]?.title, 'Urgent: Mom needs you');
    assert.match(textOf(second), /already got this message/);
  });

  it('asks the model to confirm orders when the client cannot prompt', async () => {
    const pending = await call(harness.client, 'reorder_medicine', { medication: 'amlodipine' });
    assert.match(textOf(pending), /Shall I order 30 tablets of Amlodipine 5 mg\?/);
    assert.equal(harness.store.orders.since('2000-01-01').length, 0);

    const placed = await call(harness.client, 'reorder_medicine', {
      medication: 'amlodipine',
      confirmed: true,
    });
    assert.match(textOf(placed), /Order KIN-[0-9A-F]{8} placed for 30 tablets/);
  });

  it('writes and sends the family digest', async () => {
    const result = await call(harness.client, 'family_digest', { send_to_family: true });

    assert.match(textOf(result), /Kin weekly update for Mom/);
    assert.match(textOf(result), /Sent to the family\./);
    assert.equal(harness.notifier.sent[0]?.title, 'Kin weekly update for Mom');
  });
});

describe('Kin MCP server with elicitation', () => {
  it('places the order when the parent confirms', async () => {
    const harness = await connect(true);
    const result = await call(harness.client, 'reorder_medicine', {
      medication: 'metformin',
      quantity: 60,
    });

    assert.match(textOf(result), /placed for 60 tablets of Metformin 500 mg/);
    await harness.client.close();
  });

  it('places nothing when the parent says no', async () => {
    const harness = await connect(false);
    const result = await call(harness.client, 'reorder_medicine', { medication: 'metformin' });

    assert.match(textOf(result), /no order was placed/);
    assert.equal(harness.store.orders.since('2000-01-01').length, 0);
    await harness.client.close();
  });
});
