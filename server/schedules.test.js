import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { installSchedules, ScheduleStore, MAX_HOSTS, MAX_TASKS } from './schedules.js'

const KEY = 'test-key'
const now = Date.parse('2026-10-17T09:00:00+09:00')
async function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'schedules-'))
  const filePath = join(dir, 'schedules.json')
  const make = () => {
    const app = express()
    app.use(express.json())
    installSchedules(app, { apiKey: KEY, store: new ScheduleStore({ filePath, now: () => now }) })
    return app.listen(0, '127.0.0.1')
  }
  const server = make()
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { await new Promise(r => server.close(r)); rmSync(dir, { recursive: true, force: true }) })
  const post = (body, key = KEY) => fetch(`${base}/api/schedules`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-api-key': key } : {}) }, body: JSON.stringify(body) })
  return { dir, filePath, base, post, get: () => fetch(`${base}/api/schedules`) }
}
const task = (over = {}) => ({ id: 'cron:daily-morning.sh', name: '朝会ブリーフをSlackに投稿', kind: 'cron', schedule_text: '毎日 7:00', next_runs: ['2026-10-18T07:00:00+09:00'], last_run: null, enabled: true, ...over })
const payload = (over = {}) => ({ host: 'VPS', collected_at: '2026-10-17T08:55:00+09:00', tasks: [task()], ...over })

test('認証付きで保存し、公開GETで最新のスナップショットを返す', async t => {
  const f = await fixture(t)
  assert.equal((await f.post(payload(), null)).status, 401)
  assert.equal((await f.post(payload(), 'wrong')).status, 401)
  assert.equal((await f.post(payload())).status, 200)
  assert.equal((await f.post(payload({ host: 'Mac mini', tasks: [] }))).status, 200)
  assert.equal((await f.post(payload({ tasks: [task({ name: '更新後' })] }))).status, 200)
  const res = await f.get()
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const body = await res.json()
  assert.deepEqual(body.hosts.map(h => h.host).sort(), ['Mac mini', 'VPS'])
  const vps = body.hosts.find(h => h.host === 'VPS')
  assert.equal(vps.tasks.length, 1)
  assert.equal(vps.tasks[0].name, '更新後')
  assert.equal(vps.received_at, new Date(now).toISOString())
})

test('余計な項目・不正な値・上限超過は400', async t => {
  const f = await fixture(t)
  const bad = [
    payload({ command: 'rm -rf /' }),
    payload({ tasks: [{ ...task(), command: '/bin/x' }] }),
    payload({ host: 'x'.repeat(41) }),
    payload({ host: '' }),
    payload({ collected_at: 'bad' }),
    payload({ tasks: Array.from({ length: MAX_TASKS + 1 }, () => task()) }),
    payload({ tasks: [task({ next_runs: Array(6).fill('2026-10-18T07:00:00+09:00') })] }),
    payload({ tasks: [task({ next_runs: ['bad'] })] }),
    payload({ tasks: [task({ kind: 'shell' })] }),
    payload({ tasks: [task({ name: 'x'.repeat(81) })] }),
    payload({ tasks: [task({ enabled: 'yes' })] }),
    payload({ tasks: 'x' }),
  ]
  for (const body of bad) assert.equal((await f.post(body)).status, 400, JSON.stringify(body).slice(0, 80))
  assert.deepEqual((await (await f.get()).json()).hosts, [])
})

test('ホストは最大10台まで（既存ホストの更新は可能）', async t => {
  const f = await fixture(t)
  for (let i = 0; i < MAX_HOSTS; i++) assert.equal((await f.post(payload({ host: `h${i}` }))).status, 200)
  assert.equal((await f.post(payload({ host: 'extra' }))).status, 400)
  assert.equal((await f.post(payload({ host: 'h0' }))).status, 200)
})

test('ファイルへ原子的に保存し、再起動後も読み込める。壊れたファイルは起動エラー', async t => {
  const f = await fixture(t)
  await f.post(payload())
  assert.deepEqual(readdirSync(f.dir), ['schedules.json'])
  const reloaded = new ScheduleStore({ filePath: f.filePath, now: () => now })
  assert.equal(reloaded.snapshot().hosts[0].tasks[0].id, 'cron:daily-morning.sh')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(f.filePath, '{broken')
  assert.throws(() => new ScheduleStore({ filePath: f.filePath }), /Cannot load schedules/)
})
