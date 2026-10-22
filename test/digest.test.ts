import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type Anthropic from '@anthropic-ai/sdk';
import { pino } from 'pino';

import { BedrockDigestWriter } from '../src/services/bedrock-digest.ts';
import { renderTemplateDigest, type DigestInput } from '../src/services/digest.ts';

const logger = pino({ level: 'silent' });

const input: DigestInput = {
  parentName: 'Mom',
  from: '2026-10-16',
  to: '2026-10-22',
  adherence: [{ medication: 'Amlodipine', taken: 5, scheduled: 7 }],
  checkins: [
    { date: '2026-10-21', mood: 3, sleep: 'fair', ateWell: true, note: null },
    { date: '2026-10-22', mood: 4, sleep: 'good', ateWell: false, note: null },
  ],
  concerns: [{ kind: 'missed_doses', severity: 'info', summary: 'Missed Amlodipine 2 times.' }],
  upcomingReminders: [{ date: '2026-10-23', content: 'Doctor visit at 11' }],
  alertsSent: 1,
  ordersPlaced: [{ medication: 'Amlodipine', quantity: 30 }],
};

const fakeClient = (respond: () => Promise<unknown>) =>
  ({ messages: { create: respond } }) as unknown as Pick<Anthropic, 'messages'>;

describe('renderTemplateDigest', () => {
  it('summarizes concerns, medicines, wellbeing, reminders and orders', () => {
    const text = renderTemplateDigest(input);

    assert.match(text, /Needs attention:\n- Missed Amlodipine 2 times\./);
    assert.match(text, /Amlodipine: 5 of 7 doses \(71%\)/);
    assert.match(text, /2 check-ins, average mood 3\.5 of 5, ate well on 1 days/);
    assert.match(text, /Friday, October 23: Doctor visit at 11/);
    assert.match(text, /Orders: Amlodipine x30\./);
  });

  it('says so when nothing needs attention', () => {
    assert.match(
      renderTemplateDigest({ ...input, concerns: [] }),
      /Nothing needs your attention this week\./,
    );
  });
});

describe('BedrockDigestWriter', () => {
  it('returns the model text when the call succeeds', async () => {
    const writer = new BedrockDigestWriter({
      model: 'anthropic.claude-opus-5-5',
      logger,
      client: fakeClient(() =>
        Promise.resolve({
          stop_reason: 'end_turn',
          content: [
            { type: 'thinking', thinking: '' },
            { type: 'text', text: 'Mom had a steady week.' },
          ],
        }),
      ),
    });

    assert.deepEqual(await writer.write(input), {
      text: 'Mom had a steady week.',
      source: 'bedrock',
    });
  });

  it('falls back to the template when the model declines', async () => {
    const writer = new BedrockDigestWriter({
      model: 'anthropic.claude-opus-5-5',
      logger,
      client: fakeClient(() =>
        Promise.resolve({ stop_reason: 'refusal', stop_details: null, content: [] }),
      ),
    });

    assert.equal((await writer.write(input)).source, 'template');
  });

  it('falls back to the template when Bedrock is unreachable', async () => {
    const writer = new BedrockDigestWriter({
      model: 'anthropic.claude-opus-5-5',
      logger,
      client: fakeClient(() => Promise.reject(new Error('AccessDenied'))),
    });

    const digest = await writer.write(input);
    assert.equal(digest.source, 'template');
    assert.match(digest.text, /Kin weekly update for Mom/);
  });
});
