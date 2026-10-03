import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { MonitorStore } from './monitor-store.js';
import { installMonitor } from './monitor-api.js';

const base = 1_800_000_000_000;
const members = [
  { id: 'watanabe', name: '開発部長', commands: ['/dev'] },
  { id: 'kobayashi', name: 'エンジニア', commands: ['/dev'] },
  { id: 'matsumoto', name: '経営企画', commands: ['/ceo'] },
];
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'monitor-api-'));
  const filePath = join(directory, 'sessions.json');
  let time = base;
  const store = new MonitorStore({ filePath, now: () => time, staleMs: 1000 });
  const app = express();
  app.use(express.json());
  installMonitor(app, { apiKey: 'test-key', members, store });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  let seq = 0;
  const get = (path, key) => fetch(url + path, { headers: key ? { 'x-api-key': key } : {} });
  const post = (path, body, key = 'test-key') => fetch(url + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) }, body: JSON.stringify(body) });
  const send = (changes = {}) => post('/api/events', { source: 'codex', session_id: 's1', event_id: `e${++seq}`, event: 'start', member_id: 'watanabe', timestamp: time, ...changes });
  return { get, post, send, filePath, tick: delta => { time += delta; } };
}

test('write and private history APIs reject missing/wrong authentication', async t => {
  const f = await fixture(t);
  for (const route of ['/api/events', '/api/update', '/api/command']) {
    assert.equal((await f.post(route, {}, null)).status, 401);
    assert.equal((await f.post(route, {}, 'wrong')).status, 401);
  }
  assert.equal((await f.get('/api/sessions')).status, 401);
  assert.equal((await f.get('/api/sessions', 'test-key')).status, 200);
  assert.equal((await (await f.get('/api/monitor')).json()).summary.total, 0);
});

test('invalid events return 400 and do not create phantom sessions', async t => {
  const f = await fixture(t);
  for (const changes of [{ source: 'invalid' }, { session_id: '' }, { event_id: '' }, { event: 'nonsense' }, { timestamp: 'bad' }]) assert.equal((await f.send(changes)).status, 400);
  assert.equal((await f.post('/api/events', [])).status, 400);
  assert.equal((await (await f.get('/api/monitor')).json()).summary.total, 0);
});

test('multiple sessions aggregate per member without marking coworkers active', async t => {
  const f = await fixture(t);
  assert.equal((await f.send()).status, 200);
  assert.equal((await f.send({ source: 'claude' })).status, 200);
  let snapshot = await (await f.get('/api/monitor')).json();
  assert.equal(snapshot.summary.active, 2);
  assert.equal(snapshot.agents.find(a => a.id === 'watanabe').active_sessions, 2);
  assert.equal(snapshot.agents.find(a => a.id === 'kobayashi').status, 'idle');
  await f.send({ event: 'completed' });
  snapshot = await (await f.get('/api/monitor')).json();
  assert.equal(snapshot.agents.find(a => a.id === 'watanabe').status, 'active');
  assert.equal(snapshot.agents.find(a => a.id === 'watanabe').active_sessions, 1);
  const health = await (await f.get('/health')).json();
  assert.equal(health.active_members, 1);
  assert.equal(health.active_sessions, snapshot.summary.active);
  assert.deepEqual(health.sources, snapshot.summary.by_source);
  f.tick(1100);
  const stale = await (await f.get('/health')).json();
  assert.equal(stale.active_members, 0);
  assert.equal(stale.active_sessions, 0);
  assert.equal(stale.stale_sessions, 1);
  await f.send({ source: 'claude', event: 'completed' });
  await f.send({ session_id: 'child', member_id: 'kobayashi' });
  snapshot = await (await f.get('/api/monitor')).json();
  assert.equal(snapshot.agents.find(a => a.id === 'watanabe').status, 'idle');
  assert.equal(snapshot.agents.find(a => a.id === 'kobayashi').status, 'active');
});

test('legacy tool commands and prompts are absent from response and persistence', async t => {
  const f = await fixture(t);
  const secret = 'RAW_PRIVATE_COMMAND_AND_PROMPT_12345';
  const response = await f.post('/api/update', { session_id: 'legacy', tool_name: 'Bash', cwd: '/workspace/new-project', command: secret, prompt: secret, tool_input: { command: secret, prompt: secret }, response: secret });
  assert.equal(response.status, 200);
  assert.ok(!(await response.text()).includes(secret));
  for (const route of ['/api/monitor', '/api/agents', '/api/sessions', '/health']) {
    const r = await f.get(route, 'test-key');
    assert.ok(!(await r.text()).includes(secret));
  }
  const saved = readFileSync(f.filePath, 'utf8');
  assert.ok(!saved.includes(secret));
  assert.ok(!saved.includes('tool_input'));
  const snapshot = await (await f.get('/api/monitor')).json();
  assert.equal(snapshot.sessions[0].source, 'unknown');
  assert.equal(snapshot.sessions[0].description, 'コマンドを実行');
});

test('monitor reads disable caching, including authentication errors', async t => {
  const f = await fixture(t);
  for (const route of ['/api/monitor', '/api/agents', '/api/sessions', '/health']) {
    assert.equal((await f.get(route)).headers.get('cache-control'), 'no-store');
  }
});
