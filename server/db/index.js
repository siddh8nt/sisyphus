// SQLite via better-sqlite3. Synchronous, simple, fast enough for the demo.
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DB_PATH, DATA_DIR } from '../config.js';
import { log } from '../lib/log.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const schema = fs.readFileSync(path.join(import.meta.dirname, 'schema.sql'), 'utf8');
db.exec(schema);
// Migration for DBs created before the deterministic gate existed (CREATE TABLE
// IF NOT EXISTS won't add columns to an existing table).
try {
  db.exec('ALTER TABLE tasks ADD COLUMN gate_json TEXT');
} catch {
  /* column already exists */
}
log.ok('db ready', DB_PATH);

// --- Prepared statements -------------------------------------------------
const stmts = {
  upsertPhone: db.prepare(
    `INSERT INTO phones (id, name, first_seen) VALUES (@id, @name, @firstSeen)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`
  ),
  insertSession: db.prepare(
    `INSERT INTO sessions (id, prompt, started_at) VALUES (@id, @prompt, @startedAt)`
  ),
  completeSession: db.prepare(
    `UPDATE sessions SET completed_at = @completedAt, summary = @summary, stats_json = @statsJson
     WHERE id = @id`
  ),
  updateSessionPrompt: db.prepare(`UPDATE sessions SET prompt = @prompt WHERE id = @id`),
  getSession: db.prepare(`SELECT * FROM sessions WHERE id = @id`),
  listSessions: db.prepare(`SELECT * FROM sessions ORDER BY started_at DESC LIMIT @limit`),
  upsertTask: db.prepare(
    `INSERT INTO tasks (id, session_id, title, file, language, assign, phone_id, phone_name,
        runtime, state, status, tokens_in, tokens_out, duration_ms, tok_per_sec, fallback,
        code, gate_json, created_at, updated_at)
     VALUES (@id, @sessionId, @title, @file, @language, @assign, @phoneId, @phoneName,
        @runtime, @state, @status, @tokensIn, @tokensOut, @durationMs, @tokPerSec, @fallback,
        @code, @gateJson, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, file=excluded.file, language=excluded.language,
        assign=excluded.assign, phone_id=excluded.phone_id, phone_name=excluded.phone_name,
        runtime=excluded.runtime, state=excluded.state, status=excluded.status,
        tokens_in=excluded.tokens_in, tokens_out=excluded.tokens_out,
        duration_ms=excluded.duration_ms, tok_per_sec=excluded.tok_per_sec,
        fallback=excluded.fallback, code=excluded.code, gate_json=excluded.gate_json,
        updated_at=excluded.updated_at`
  ),
  listTasksForSession: db.prepare(
    `SELECT * FROM tasks WHERE session_id = @sessionId ORDER BY created_at ASC`
  ),
  upsertPhoneStats: db.prepare(
    `INSERT INTO phone_stats (phone_id, session_id, tasks_completed, tokens_in, tokens_out, avg_tok_per_sec)
     VALUES (@phoneId, @sessionId, @tasksCompleted, @tokensIn, @tokensOut, @avgTokPerSec)
     ON CONFLICT(phone_id, session_id) DO UPDATE SET
        tasks_completed=excluded.tasks_completed, tokens_in=excluded.tokens_in,
        tokens_out=excluded.tokens_out, avg_tok_per_sec=excluded.avg_tok_per_sec`
  ),
  phoneStatsForSession: db.prepare(
    `SELECT * FROM phone_stats WHERE phone_id = @phoneId AND session_id = @sessionId`
  ),
};

export const store = {
  upsertPhone(id, name) {
    stmts.upsertPhone.run({ id, name, firstSeen: Date.now() });
  },
  insertSession(id, prompt) {
    stmts.insertSession.run({ id, prompt, startedAt: Date.now() });
  },
  updateSessionPrompt(id, prompt) {
    stmts.updateSessionPrompt.run({ id, prompt });
  },
  completeSession(id, summary, stats) {
    stmts.completeSession.run({
      id,
      completedAt: Date.now(),
      summary,
      statsJson: JSON.stringify(stats || {}),
    });
  },
  getSession(id) {
    return stmts.getSession.get({ id });
  },
  listSessions(limit = 50) {
    return stmts.listSessions.all({ limit });
  },
  upsertTask(t) {
    stmts.upsertTask.run({
      id: t.id,
      sessionId: t.sessionId,
      title: t.title ?? null,
      file: t.file ?? null,
      language: t.language ?? null,
      assign: t.assign ?? null,
      phoneId: t.phoneId ?? null,
      phoneName: t.phoneName ?? null,
      runtime: t.runtime ?? null,
      state: t.state ?? null,
      status: t.status ?? null,
      tokensIn: t.tokensIn ?? 0,
      tokensOut: t.tokensOut ?? 0,
      durationMs: t.durationMs ?? 0,
      tokPerSec: t.tokPerSec ?? 0,
      fallback: t.fallback ? 1 : 0,
      code: t.code ?? null,
      gateJson: t.gateJson ?? null,
      createdAt: t.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  },
  listTasksForSession(sessionId) {
    return stmts.listTasksForSession.all({ sessionId });
  },
  upsertPhoneStats(s) {
    stmts.upsertPhoneStats.run({
      phoneId: s.phoneId,
      sessionId: s.sessionId,
      tasksCompleted: s.tasksCompleted ?? 0,
      tokensIn: s.tokensIn ?? 0,
      tokensOut: s.tokensOut ?? 0,
      avgTokPerSec: s.avgTokPerSec ?? 0,
    });
  },
  phoneStatsForSession(phoneId, sessionId) {
    return stmts.phoneStatsForSession.get({ phoneId, sessionId });
  },
};
