import { parseArgs } from 'node:util';

import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/database.ts';
import { createStore } from '../db/store.ts';
import { systemClock } from '../time.ts';
import { clearDatabase, seedDemoData } from './demo.ts';

const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });

const config = loadConfig();
const db = openDatabase(config.databasePath);
const store = createStore(db);

try {
  if (store.medications.listActive().length > 0 && !values.reset) {
    process.stderr.write(
      `${config.databasePath} already has data. Run "npm run seed:demo -- --reset" to replace it.\n`,
    );
    process.exitCode = 1;
  } else {
    if (values.reset) clearDatabase(db);
    seedDemoData(store, systemClock, config.timeZone);
    process.stdout.write(`Seeded a week of demo data into ${config.databasePath}\n`);
  }
} finally {
  db.close();
}
