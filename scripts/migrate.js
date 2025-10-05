import { run } from '../src/db.js';

async function migrate() {
  // users
  await run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user','agent','admin')),
    created_at TEXT NOT NULL
  );`);

  // idempotency keys
  await run(`CREATE TABLE IF NOT EXISTS idempotency_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    method TEXT NOT NULL,
    path TEXT NOT NULL,
    user_id INTEGER,
    response_body TEXT,
    status INTEGER,
    created_at TEXT NOT NULL
  );`);

  // tickets
  await run(`CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open','in_progress','resolved','closed')) DEFAULT 'open',
    priority TEXT NOT NULL CHECK (priority IN ('low','medium','high','urgent')) DEFAULT 'medium',
    requester_id INTEGER NOT NULL,
    assignee_id INTEGER,
    sla_due_at TEXT, -- ISO date string
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
  );`);

  // comments (threaded via parent_id)
  await run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    author_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    parent_id INTEGER,
    created_at TEXT NOT NULL
  );`);

  // timeline logs
  await run(`CREATE TABLE IF NOT EXISTS timeline (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id INTEGER NOT NULL,
    actor_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL
  );`);

  // index for search
  await run(`CREATE INDEX IF NOT EXISTS idx_tickets_search ON tickets(title, description);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_comments_ticket ON comments(ticket_id, created_at);`);
  await run(`CREATE INDEX IF NOT EXISTS idx_timeline_ticket ON timeline(ticket_id, created_at);`);

  console.log('Migration completed');
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});


