import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { installHealthStatus, buildHealthStatus, sanitizeText } from './health-status.js'

const now = Date.parse('2026-10-05T09:00:00+09:00')
async function fixture(t, content, clock = () => now) {
  const dir = mkdtempSync(join(tmpdir(), 'health-status-'))
  const filePath = join(dir, 'health-status.json')
  if (content !== undefined) writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content))
  const app = express()
  installHealthStatus(app, { filePath, now: clock })
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(async () => { await new Promise(r => server.close(r)); rmSync(dir, { recursive: true, force: true }) })
  return () => fetch(`http://127.0.0.1:${server.address().port}/api/health-status`)
}
const sample = generatedAt => ({
  generatedAt,
  items: [
    { id: 'gas.sync', label: '予約メール取り込み', category: 'hotel', status: 'ok', message: '', lastSuccessAt: '2026-10-05T08:02:35+09:00' },
    { id: 'gas.guest', label: 'ゲスト返信', category: 'hotel', status: 'warn', message: '*トリガーが存在しません* → 直し方（Claude Code に「直して」と依頼）' },
    { id: 'poster.x', label: 'x-poster', category: 'sns', status: 'skip', message: '休止中' },
    { id: 'gas.api', label: 'GAS', category: 'hotel', status: 'error', message: '確認できません' },
  ],
})

test('公開APIは認証なしで状態と件数を返す', async t => {
  const get = await fixture(t, sample('2026-10-05T08:30:00+09:00'))
  const res = await get()
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('cache-control'), 'no-store')
  const body = await res.json()
  assert.equal(body.monitor.state, 'ok')
  assert.equal(body.monitor.ageMinutes, 30)
  assert.deepEqual(body.summary, { ok: 1, warn: 1, error: 1, skip: 1, attention: 2 })
  assert.equal(body.items.length, 4)
})

test('2時間以上更新が無ければ監視自体が止まっている状態になる', async t => {
  const fresh = buildHealthStatus('/nonexistent', now)
  assert.equal(fresh.monitor.state, 'missing')
  const get = await fixture(t, sample('2026-10-05T06:59:00+09:00'))
  assert.equal((await (await get()).json()).monitor.state, 'stale')
  const get2 = await fixture(t, sample('2026-10-05T07:01:00+09:00'))
  assert.equal((await (await get2()).json()).monitor.state, 'ok')
})

test('ファイルが無い・壊れている場合は missing（500にしない）', async t => {
  assert.equal((await (await (await fixture(t))()).json()).monitor.state, 'missing')
  assert.equal((await (await (await fixture(t, '{broken'))()).json()).monitor.state, 'missing')
  assert.equal((await (await (await fixture(t, { generatedAt: 'bad', items: [] }))()).json()).monitor.state, 'missing')
})

test('秘密・内部パス・URL・長いトークンを出力しない', async t => {
  const secret = 'abcdEFGH1234567890abcdEFGH1234567890zz'
  const get = await fixture(t, {
    generatedAt: '2026-10-05T08:30:00+09:00',
    items: [{ id: 'x', label: 'x', category: 'hotel', status: 'warn', token: secret, internalPath: '/root/daily-morning/.env',
      message: `失敗 https://example.com/hook?token=${secret} /root/daily-morning/.env xoxb-1234-abcd ${secret} 末尾`, lastSuccessAt: null }],
  })
  const text = await (await get()).text()
  for (const needle of [secret, '/root/', 'https://', 'xoxb', 'internalPath', 'token']) assert.equal(text.includes(needle), false, needle)
  assert.ok(text.includes('失敗'))
  assert.equal(sanitizeText(123), '')
})

test('不正な状態は error 扱い、id の無い項目は捨てる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'health-status-'))
  const filePath = join(dir, 'h.json')
  writeFileSync(filePath, JSON.stringify({ generatedAt: '2026-10-05T08:30:00+09:00', items: [{ id: 'a', status: 'weird' }, { status: 'ok' }, null] }))
  const body = buildHealthStatus(filePath, now)
  rmSync(dir, { recursive: true, force: true })
  assert.equal(body.items.length, 1)
  assert.equal(body.items[0].status, 'error')
})
