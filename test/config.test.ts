import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ConfigError, loadConfig } from '../src/config.ts';

const TOKEN = 'x'.repeat(32);

describe('loadConfig', () => {
  it('uses safe local defaults', () => {
    const config = loadConfig({});

    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 8787);
    assert.equal(config.timeZone, 'Asia/Kolkata');
    assert.equal(config.ntfy.topic, undefined);
    assert.equal(config.bedrock.enabled, false);
  });

  it('parses lists and booleans from the environment', () => {
    const config = loadConfig({
      HOST: '0.0.0.0',
      KIN_API_TOKEN: TOKEN,
      KIN_ALLOWED_HOSTS: 'kin.example.com, localhost',
      BEDROCK_ENABLED: 'true',
      BEDROCK_REGION: 'ap-south-1',
    });

    assert.deepEqual(config.allowedHosts, ['kin.example.com', 'localhost']);
    assert.equal(config.bedrock.enabled, true);
  });

  it('treats blank values from a copied .env.example as unset', () => {
    const config = loadConfig({ KIN_API_TOKEN: '', KIN_ALLOWED_HOSTS: '', NTFY_TOPIC: ' ' });

    assert.equal(config.apiToken, undefined);
    assert.equal(config.allowedHosts, undefined);
    assert.equal(config.ntfy.topic, undefined);
  });

  it('rejects unknown time zones and weak ntfy topics', () => {
    assert.throws(() => loadConfig({ KIN_TIMEZONE: 'Mars/Olympus' }), ConfigError);
    assert.throws(() => loadConfig({ NTFY_TOPIC: 'kin' }), ConfigError);
  });

  it('refuses to expose Kin publicly without a token and host allow-list', () => {
    assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), /KIN_API_TOKEN is required/);
    assert.throws(
      () => loadConfig({ HOST: '0.0.0.0', KIN_API_TOKEN: TOKEN }),
      /KIN_ALLOWED_HOSTS is required/,
    );
  });

  it('requires a region when Bedrock is enabled', () => {
    assert.throws(() => loadConfig({ BEDROCK_ENABLED: 'true' }), /BEDROCK_REGION is required/);
  });
});
