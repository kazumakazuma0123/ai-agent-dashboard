import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const SOURCES = new Set(['codex', 'claude', 'unknown']);
const EVENTS = new Set(['start', 'activity', 'completed', 'failed', 'waiting', 'heartbeat']);
const STATES = new Set(['active', 'waiting', 'completed', 'failed']);
const TERMINAL = new Set(['completed', 'failed']);
const MAX_SESSIONS = 500;
const MAX_HISTORY = 100;
const MAX_IDS = 2000;
const TEXT_FIELDS = ['project', 'cwd', 'task', 'tool', 'description', 'member_id'];
const clone = value => JSON.parse(JSON.stringify(value));
const iso = time => new Date(time).toISOString();

/** Synchronous single-process persistent session store. now returns epoch milliseconds.
 * ingest throws TypeError for malformed events; duplicate IDs are scoped to a source
 * and session. History (100), sessions (500), and replay IDs/session (2000) are bounded.
 * snapshot returns detached JSON, deriving stale after staleMs without marking completion.
 * Use one instance/writer per file. Persistence errors and corrupt files are surfaced.
 */
export class MonitorStore {
  constructor({ filePath, now = Date.now, staleMs = 5 * 60_000 } = {}) {
    if (filePath !== undefined && (typeof filePath !== 'string' || !filePath)) throw new TypeError('Invalid filePath');
    if (typeof now !== 'function' || !Number.isFinite(staleMs) || staleMs <= 0) throw new TypeError('Invalid clock or staleMs');
    this.filePath = filePath;
    this.now = now;
    this.staleMs = staleMs;
    this.sessions = new Map();
    if (filePath && existsSync(filePath)) {
      try {
        const saved = JSON.parse(readFileSync(filePath, 'utf8'));
        if (saved.version !== 1 || !Array.isArray(saved.sessions) || saved.sessions.length > MAX_SESSIONS) throw new Error('Unsupported schema');
        for (const s of saved.sessions) {
          if (!s || !SOURCES.has(s.source) || typeof s.session_id !== 'string' || !s.session_id || s.id !== `${s.source}:${s.session_id}` || this.sessions.has(s.id) || !STATES.has(s.status)
            || !Array.isArray(s.history) || s.history.length > MAX_HISTORY || !Array.isArray(s.event_ids) || s.event_ids.length > MAX_IDS
            || !s.event_ids.every(id => typeof id === 'string') || !Number.isInteger(s.tool_count) || s.tool_count < 0
            || !['started_at', 'updated_at', 'last_activity_at'].every(k => typeof s[k] === 'string' && Number.isFinite(Date.parse(s[k])))) throw new Error('Invalid session');
          this.sessions.set(s.id, s);
        }
      } catch (error) {
        throw new Error(`Cannot load monitor state from ${filePath}: ${error.message}`, { cause: error });
      }
    }
  }

  ingest(input) {
    const time = this.now();
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Event must be an object');
    const source = input.source ?? 'unknown';
    if (!SOURCES.has(source) || !EVENTS.has(input.event)) throw new TypeError('Invalid source or event');
    for (const key of ['session_id', 'event_id']) {
      if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 256 || /[\x00-\x1f]/.test(input[key])) throw new TypeError(`Invalid ${key}`);
    }
    const stamp = input.timestamp === undefined ? time : (typeof input.timestamp === 'number' ? input.timestamp : typeof input.timestamp === 'string' ? Date.parse(input.timestamp) : NaN);
    if (!Number.isFinite(stamp) || stamp < 0 || stamp > time + 60_000) throw new TypeError('Invalid or future timestamp');
    const event = { source, session_id: input.session_id, event_id: input.event_id, event: input.event, timestamp: iso(Math.min(stamp, time)) };
    for (const key of TEXT_FIELDS) {
      if (input[key] !== undefined) {
        if (typeof input[key] !== 'string' || input[key].length > (key === 'description' || key === 'task' ? 2000 : 1000)) throw new TypeError(`Invalid ${key}`);
        event[key] = input[key];
      }
    }
    const id = `${source}:${event.session_id}`;
    const existing = this.sessions.get(id);
    if (existing?.event_ids.includes(event.event_id)) return this.publicSession(existing, time);
    const candidate = new Map(this.sessions);
    const session = existing ? clone(existing) : {
      id, source, session_id: event.session_id, status: 'active', started_at: event.timestamp,
      updated_at: event.timestamp, last_activity_at: event.timestamp, tool_count: 0, history: [], event_ids: [],
    };
    const late = Date.parse(event.timestamp) < Date.parse(session.updated_at);
    // Only an explicit, strictly newer turn start can reopen a terminal conversation.
    const newTurn = TERMINAL.has(session.status) && event.event === 'start' && Date.parse(event.timestamp) > Date.parse(session.updated_at);
    if (!late && (!TERMINAL.has(session.status) || newTurn)) {
      session.status = event.event === 'completed' || event.event === 'failed' ? event.event
        : event.event === 'waiting' ? 'waiting'
        : event.event === 'heartbeat' ? session.status : 'active';
      session.updated_at = event.timestamp;
      session.last_activity_at = event.timestamp;
      for (const key of TEXT_FIELDS) if (event[key] !== undefined) session[key] = event[key];
    }
    if (event.event === 'activity' && event.tool) session.tool_count += 1;
    if (newTurn) session.started_at = event.timestamp;
    session.history.push(event);
    session.history.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    session.history = session.history.slice(-MAX_HISTORY);
    session.event_ids.push(event.event_id);
    session.event_ids = session.event_ids.slice(-MAX_IDS);
    candidate.set(id, session);
    if (candidate.size > MAX_SESSIONS) {
      const oldest = [...candidate.values()].filter(s => s.id !== id).sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at))[0];
      candidate.delete(oldest.id);
    }
    this.persist(candidate);
    this.sessions = candidate;
    return this.publicSession(session, time);
  }

  publicSession(session, time) {
    const { event_ids, ...result } = clone(session);
    if (!TERMINAL.has(result.status) && time - Date.parse(result.last_activity_at) >= this.staleMs) result.status = 'stale';
    return result;
  }

  snapshot() {
    const time = this.now();
    const sessions = [...this.sessions.values()].map(s => this.publicSession(s, time)).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    const summary = { total: sessions.length, active: 0, waiting: 0, completed: 0, failed: 0, stale: 0, by_source: { codex: 0, claude: 0, unknown: 0 } };
    for (const session of sessions) { summary[session.status]++; summary.by_source[session.source]++; }
    return { sessions, summary, updated_at: iso(time) };
  }

  persist(sessions) {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, JSON.stringify({ version: 1, sessions: [...sessions.values()] }), { encoding: 'utf8', mode: 0o600 });
      renameSync(temp, this.filePath);
    } catch (error) {
      try { unlinkSync(temp); } catch { /* preserve original write failure */ }
      throw error;
    }
  }
}
export default MonitorStore;
