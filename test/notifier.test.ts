import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pino } from 'pino';

import { createNotifier, NtfyNotifier } from '../src/services/notifier.ts';

const logger = pino({ level: 'silent' });

describe('NtfyNotifier', () => {
  it('publishes JSON to the configured topic with an urgent priority', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const notifier = new NtfyNotifier({
      baseUrl: 'https://ntfy.example/',
      topic: 'kin-family-test',
      logger,
      fetch: (input, init) => {
        assert.equal(typeof input, 'string');
        assert.equal(typeof init?.body, 'string');
        calls.push({ url: input as string, body: JSON.parse(init?.body as string) });
        return Promise.resolve(new Response('{}', { status: 200 }));
      },
    });

    const delivery = await notifier.send({
      title: 'Kin: Mom needs attention',
      message: 'Missed Amlodipine 3 times.',
      severity: 'urgent',
    });

    assert.equal(delivery, 'sent');
    assert.deepEqual(calls, [
      {
        url: 'https://ntfy.example',
        body: {
          topic: 'kin-family-test',
          title: 'Kin: Mom needs attention',
          message: 'Missed Amlodipine 3 times.',
          priority: 5,
          tags: ['warning', 'house'],
        },
      },
    ]);
  });

  it('reports failure instead of throwing when ntfy is unreachable', async () => {
    const notifier = new NtfyNotifier({
      baseUrl: 'https://ntfy.example',
      topic: 'kin-family-test',
      logger,
      fetch: () => Promise.reject(new Error('offline')),
    });

    assert.equal(await notifier.send({ title: 't', message: 'm', severity: 'info' }), 'failed');
  });

  it('reports failure on a non-success status', async () => {
    const notifier = new NtfyNotifier({
      baseUrl: 'https://ntfy.example',
      topic: 'kin-family-test',
      logger,
      fetch: () => Promise.resolve(new Response('nope', { status: 429 })),
    });

    assert.equal(await notifier.send({ title: 't', message: 'm', severity: 'info' }), 'failed');
  });

  it('is disabled when no topic is configured', async () => {
    const notifier = createNotifier({ baseUrl: 'https://ntfy.sh', topic: undefined, logger });

    assert.equal(notifier.enabled, false);
    assert.equal(await notifier.send({ title: 't', message: 'm', severity: 'info' }), 'disabled');
  });
});
