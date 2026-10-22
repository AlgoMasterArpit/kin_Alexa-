export const migrations: readonly string[] = [
  `
  CREATE TABLE medications (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    dosage TEXT NOT NULL,
    purpose TEXT,
    aliases TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(aliases)),
    schedule TEXT NOT NULL CHECK (json_valid(schedule)),
    pills_remaining INTEGER CHECK (pills_remaining >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE dose_events (
    medication_id INTEGER NOT NULL REFERENCES medications (id) ON DELETE CASCADE,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('taken', 'skipped')),
    recorded_at TEXT NOT NULL,
    PRIMARY KEY (medication_id, scheduled_date, scheduled_time)
  ) STRICT;

  CREATE INDEX dose_events_by_date ON dose_events (scheduled_date);

  CREATE TABLE checkins (
    id INTEGER PRIMARY KEY,
    local_date TEXT NOT NULL,
    mood INTEGER NOT NULL CHECK (mood BETWEEN 1 AND 5),
    sleep TEXT NOT NULL CHECK (sleep IN ('poor', 'fair', 'good')),
    ate_well INTEGER NOT NULL CHECK (ate_well IN (0, 1)),
    note TEXT,
    recorded_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX checkins_by_date ON checkins (local_date);

  CREATE TABLE memories (
    id INTEGER PRIMARY KEY,
    content TEXT NOT NULL,
    remind_on TEXT,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX memories_by_remind_on ON memories (remind_on);

  CREATE TABLE questions (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    asked_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX questions_by_asked_at ON questions (asked_at);

  CREATE TABLE orders (
    id INTEGER PRIMARY KEY,
    medication_id INTEGER NOT NULL REFERENCES medications (id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reference TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE alerts (
    id INTEGER PRIMARY KEY,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'urgent')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    delivery TEXT NOT NULL CHECK (delivery IN ('sent', 'failed', 'disabled')),
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX alerts_by_created_at ON alerts (created_at);
  `,
];
