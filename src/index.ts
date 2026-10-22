import { once } from 'node:events';

import { createKinApp } from './app.ts';
import { ConfigError, loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { createStore } from './db/store.ts';
import { createLogger } from './logger.ts';
import { loadTodayViewHtml } from './mcp/today-view.ts';
import { createDigestWriter } from './services/bedrock-digest.ts';
import { FamilyAlerts } from './services/family-alerts.ts';
import { Household } from './services/household.ts';
import { createNotifier } from './services/notifier.ts';
import { Watchdog } from './services/watchdog.ts';
import { systemClock } from './time.ts';
import { KIN_VERSION } from './version.ts';

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  const db = openDatabase(config.databasePath);

  const household = new Household({
    store: createStore(db),
    clock: systemClock,
    timeZone: config.timeZone,
    parentName: config.parentName,
  });
  const notifier = createNotifier({ ...config.ntfy, logger });
  const familyAlerts = new FamilyAlerts(household, notifier);
  const digestWriter = createDigestWriter({ ...config.bedrock, logger });

  const app = createKinApp({
    services: {
      household,
      familyAlerts,
      digestWriter,
      todayViewHtml: loadTodayViewHtml(),
      logger,
    },
    logger,
    apiToken: config.apiToken,
    allowedHosts: config.allowedHosts,
  });

  const watchdog = new Watchdog({ household, alerts: familyAlerts, logger, ...config.watchdog });

  app.server.listen(config.port, config.host);
  await once(app.server, 'listening');
  if (config.watchdog.enabled) watchdog.start();
  logger.info(
    {
      url: `http://${config.host}:${String(config.port)}/mcp`,
      version: KIN_VERSION,
      familyAlerts: notifier.enabled,
      watchdog: config.watchdog.enabled,
      bedrockDigest: config.bedrock.enabled,
      auth: config.apiToken ? 'bearer' : 'none',
    },
    'Kin MCP server is ready',
  );

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'shutting down');
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref();
    watchdog.stop();
    void app.close().finally(() => {
      db.close();
      process.exit(0);
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof ConfigError ? error.message : String((error as Error).stack ?? error)}\n`,
  );
  process.exit(1);
});
