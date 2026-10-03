import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MonitorStore } from './monitor-store.js';

const base = 1_800_000_000_000;
const event = (changes = {}) => ({ source: 'codex', session_id: 'same', event_id: 'e1', event: 'start', timestamp: base, ...changes });

test('interleaved sources and replay IDs remain separate', () => {
  const store = new MonitorStore({ now: () => base });
  store.ingest(event());
  store.ingest(event({ source: 'claude' }));
  store.ingest(event({ event_id: 'e2', event: 'activity', tool: 'read' }));
  store.ingest(event({ event_id: 'e2', event: 'activity', tool: 'read' }));
  const state = store.snapshot();
  assert.equal(state.sessions.length, 2);
  assert.equal(state.sessions.find(s => s.source === 'codex').tool_count, 1);
  assert.equal(state.sessions.find(s => s.source === 'claude').tool_count, 0);
  state.sessions[0].history.length = 0;
  assert.ok(store.snapshot().sessions[0].history.length);
});

test('restart restores state and duplicate suppression; corrupt files fail loudly', t => {
  const dir = mkdtempSync(join(tmpdir(), 'monitor-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'state.json');
  const store = new MonitorStore({ filePath, now: () => base });
  store.ingest(event({ event: 'activity', tool: 'read' }));
  const restored = new MonitorStore({ filePath, now: () => base });
  restored.ingest(event({ event: 'activity', tool: 'read' }));
  assert.equal(restored.snapshot().sessions[0].tool_count, 1);
  writeFileSync(filePath, '{');
  assert.throws(() => new MonitorStore({ filePath }), /Cannot load monitor state/);
});

test('stale means silence, never completion; heartbeat preserves waiting and terminal state', () => {
  let time = base;
  const store = new MonitorStore({ now: () => time, staleMs: 1000 });
  store.ingest(event());
  time += 1500;
  assert.equal(store.snapshot().sessions[0].status, 'stale');
  store.ingest(event({ event_id: 'e2', event: 'waiting', timestamp: time }));
  store.ingest(event({ event_id: 'e3', event: 'heartbeat', timestamp: time }));
  assert.equal(store.snapshot().sessions[0].status, 'waiting');
  store.ingest(event({ event_id: 'e4', event: 'completed', timestamp: time }));
  time += 2000;
  store.ingest(event({ event_id: 'e5', event: 'heartbeat', timestamp: time }));
  store.ingest(event({ event_id: 'e6', event: 'activity', timestamp: base, tool: 'read' }));
  store.ingest(event({ event_id: 'e7', event: 'start', timestamp: base + 1500 }));
  assert.equal(store.snapshot().sessions[0].status, 'completed');
});

test('late events do not replace current status or metadata', () => {
  const store = new MonitorStore({ now: () => base + 100 });
  store.ingest(event({ timestamp: base + 100, event: 'waiting', project: 'current' }));
  store.ingest(event({ event_id: 'old', event: 'activity', tool: 'read', project: 'old' }));
  const s = store.snapshot().sessions[0];
  assert.equal(s.status, 'waiting');
  assert.equal(s.project, 'current');
  assert.equal(s.tool_count, 1);
});

test('malformed events and future timestamps are rejected before mutation', () => {
  const store = new MonitorStore({ now: () => base });
  for (const input of [null, [], event({ source: 'other' }), event({ event: 'nope' }), event({ session_id: '' }), event({ event_id: '' }), event({ timestamp: 'bad' }), event({ timestamp: null }), event({ timestamp: base + 60_001 }), event({ task: {} })]) assert.throws(() => store.ingest(input), TypeError);
  assert.equal(store.snapshot().summary.total, 0);
  store.ingest(event({ timestamp: base + 500 }));
  assert.equal(store.snapshot().sessions[0].updated_at, new Date(base).toISOString());
});

test('sessions and history are bounded', () => {
  const store = new MonitorStore({ now: () => base });
  for (let i = 0; i < 110; i++) store.ingest(event({ event_id: `e${i}`, event: 'activity', tool: 'read' }));
  assert.equal(store.snapshot().sessions[0].history.length, 100);
  assert.equal(store.snapshot().sessions[0].tool_count, 110);
  for (let i = 0; i < 510; i++) store.ingest(event({ session_id: `s${i}` }));
  assert.equal(store.snapshot().summary.total, 500);
});

test('failed persistence does not publish an in-memory success', t => {
  const dir = mkdtempSync(join(tmpdir(), 'monitor-write-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const blocker = join(dir, 'not-a-directory');
  writeFileSync(blocker, 'block');
  const store = new MonitorStore({ filePath: join(blocker, 'state.json'), now: () => base });
  assert.throws(() => store.ingest(event()));
  assert.equal(store.snapshot().summary.total, 0);
});


test('only strictly newer explicit start reopens a completed conversation', () => {
  let time = base + 100;
  const store = new MonitorStore({ now: () => time });
  store.ingest(event({ event: 'activity', tool: 'read' }));
  store.ingest(event({ event_id: 'done', event: 'completed', timestamp: time }));
  store.ingest(event({ event_id: 'old-start', event: 'start', timestamp: base }));
  store.ingest(event({ event_id: 'equal-start', event: 'start', timestamp: time }));
  assert.equal(store.snapshot().sessions[0].status, 'completed');
  time += 100;
  store.ingest(event({ event_id: 'heartbeat', event: 'heartbeat', timestamp: time }));
  store.ingest(event({ event_id: 'late-activity', event: 'activity', timestamp: time }));
  assert.equal(store.snapshot().sessions[0].status, 'completed');
  store.ingest(event({ event_id: 'next-turn', event: 'start', timestamp: time }));
  const s = store.snapshot().sessions[0];
  assert.equal(s.status, 'active');
  assert.equal(s.started_at, new Date(time).toISOString());
  assert.equal(s.tool_count, 1);
  assert.equal(s.history.length, 7);
  // A delayed old completion must not terminate the new turn.
  store.ingest(event({ event_id: 'late-done', event: 'completed', timestamp: base + 100 }));
  assert.equal(store.snapshot().sessions[0].status, 'active');
});

test('completion metadata persists independently from a later turn', t => {
  const dir = mkdtempSync(join(tmpdir(), 'monitor-completion-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filePath = join(dir, 'sessions.json');
  let time = base;
  const store = new MonitorStore({ filePath, now: () => time });
  store.ingest(event({ task: '原稿A', project: '案件A', member_id: 'writer', stage: 'writing', assignment: 'explicit' }));
  time += 10;
  store.ingest(event({ event_id: 'done', event: 'completed', timestamp: time }));
  store.ingest(event({ event_id: 'duplicate-done', event: 'completed', timestamp: time }));
  time += 10;
  store.ingest(event({ event_id: 'next', timestamp: time, task: '原稿B', member_id: 'reviewer', stage: 'review' }));
  const restored = new MonitorStore({ filePath, now: () => time });
  const completed = restored.snapshot().sessions[0].history.filter(e => e.accepted_completion);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].task, '原稿A');
  assert.equal(completed[0].member_id, 'writer');
  assert.equal(completed[0].stage, 'writing');
  assert.equal(completed[0].assignment, 'explicit');
  assert.throws(() => store.ingest(event({ event_id: 'bad', stage: 'invalid' })), TypeError);
  assert.throws(() => store.ingest(event({ event_id: 'bad', assignment: 'invalid' })), TypeError);
});
