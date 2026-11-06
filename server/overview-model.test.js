import test from 'node:test'
import assert from 'node:assert/strict'
import '../assets/overview-model.js'

const M = globalThis.MonitorOverview
const now = Date.parse('2026-11-06T01:00:00Z')
const stamp = delta => new Date(now + delta).toISOString()
const project = (props = {}) => ({ id: 'one', name: '案件', group: 'active', checked: '2026-11-06', sessionProjects: ['app-one'], ...props })
const resource = data => ({ state: 'ok', data, receivedAt: now })
const health = (status = 'ok', delta = -60000) => resource({ monitor: { state: 'ok', generatedAt: stamp(delta) }, items: [{ id: 'check', status, label: '連携' }] })
const options = extra => ({ now, healthMap: { 案件: ['check'] }, health: health(), ...extra })

test('priority favors fresh faults, overdue tasks, explicit waiting, then stale information', () => {
  assert.equal(M.projectView(project({ blocked: '判断待ち', due: '2026-11-01', checked: '2026-10-01' }), options({ health: health('warn') })).rank, 0)
  assert.equal(M.projectView(project({ blocked: '判断待ち', due: '2026-11-01' }), options()).rank, 1)
  assert.equal(M.projectView(project({ blocked: '判断待ち', checked: '2026-10-01' }), options()).rank, 2)
  assert.equal(M.projectView(project({ checked: '2026-10-01' }), options()).rank, 3)
  assert.equal(M.projectView(project(), options()).rank, 4)
})
test('paused projects never enter attention, waiting or information review queues', () => {
  const row = M.projectView(project({ group: 'paused', blocked: '確認', due: '2026-10-01', checked: '2026-10-01' }), options({ health: health('error') }))
  assert.equal(row.rank, 5)
  assert.equal(row.attention, false)
  assert.equal(row.waiting, false)
  assert.equal(row.overdue, false)
  assert.equal(row.review, false)
})
test('old, future, failed and missing health are unknown, never current healthy or faulty evidence', () => {
  for (const candidate of [health('error', -120 * 60000), health('error', 60000), { ...health('error'), state: 'error' }, undefined, { ...health(), receivedAt: now - 120001 }]) {
    const row = M.projectView(project(), options({ health: candidate }))
    assert.equal(row.checks.state, 'unknown')
    assert.equal(row.attention, false)
  }
})
test('missing individual monitoring checks do not imply a healthy project', () => {
  const row = M.projectView(project(), options({ healthMap: { 案件: ['check', 'not-returned'] } }))
  assert.equal(row.checks.state, 'unknown')
})
test('checked dates are strictly validated and review starts after 14 calendar days in Japan', () => {
  for (const checked of ['2026-11-07', 'not-a-date', '2026-02-30', null]) assert.equal(M.information(project({ checked }), now).stale, true)
  assert.equal(M.information(project({ checked: '2026-10-23' }), now).stale, false)
  assert.equal(M.information(project({ checked: '2026-10-22' }), now).stale, true)
  assert.equal(M.today(Date.parse('2026-11-05T16:00:00Z')), '2026-11-06')
  assert.equal(M.projectView(project({ due: '2026-11-06' }), options()).overdue, false)
  assert.equal(M.projectView(project({ due: '2026-02-30' }), options()).overdue, false)
})
test('only explicitly mapped project names are matched and old running signals become stale', () => {
  const monitor = resource({ sessions: [
    { project: 'app-one', status: 'active', updated_at: stamp(-40000) },
    { project: 'app-one-other', status: 'active', updated_at: stamp(0) },
    { project: 'app-one', status: 'active', updated_at: stamp(-300000) },
    { project: 'app-one', status: 'completed', updated_at: stamp(-400000) }
  ] })
  const matched = M.matchingSessions(project(), monitor, now)
  assert.deepEqual(matched.map(s => s.status), ['active', 'stale', 'completed'])
  assert.deepEqual(M.matchingSessions(project(), { ...monitor, state: 'error' }, now), [])
  assert.equal(M.projectView(project(), options({ monitor })).running, true)
})
test('future schedules exclude stale hosts, disabled jobs, past times and duplicate next runs', () => {
  const task = { id: 'job', name: '定期確認', enabled: true, next_runs: [stamp(-1000), stamp(60000), stamp(120000)] }
  const result = M.upcoming(resource({ hosts: [
    { host: 'current', collected_at: stamp(-60000), received_at: stamp(-60000), tasks: [task, { ...task, id: 'off', enabled: false }] },
    { host: 'old', collected_at: stamp(-1800000), received_at: stamp(-60000), tasks: [task] },
    { host: 'future', collected_at: stamp(60000), received_at: stamp(0), tasks: [task] }
  ] }), now)
  assert.equal(result.entries.length, 1)
  assert.equal(result.entries[0].at, now + 60000)
  assert.deepEqual(result.staleHosts, ['old', 'future'])
  assert.equal(result.known, true)
  assert.equal(M.upcoming(resource({ hosts: [] }), now).known, false)
  assert.equal(M.upcoming({ state: 'error' }, now).known, false)
})
test('handoffs preserve unknowns, paused boundaries and do not equate response completion to business completion', () => {
  const text = M.handoff(M.projectView(project({ group: 'paused', name: '保全案件', purpose: '目的', current: '確認記録', next: '保全', reference: '正本' }), options()))
  assert.match(text, /期限：未設定/)
  assert.match(text, /再開はせず/)
  assert.match(text, /応答完了だけで、業務が完了したとは判断しない/)
  assert.match(text, /確認資料：正本/)
})
test('links exclude script URLs, protocol-relative URLs and credentials', () => {
  for (const input of ['javascript:alert(1)', '//example.com', '/\\evil', 'https://user:pass@example.com', 'http://example.com']) assert.equal(M.safeUrl(input), null)
  assert.equal(M.safeUrl('/projects.html?project=one'), '/projects.html?project=one')
  assert.equal(M.safeUrl('https://example.com/'), 'https://example.com/')
})
test('malformed entries in otherwise valid API arrays cannot break the page', () => {
  const noisy = health('ok')
  noisy.data.items.unshift(null, false, 'bad')
  assert.equal(M.healthFor(project(), { 案件: ['check'] }, noisy, now).state, 'ok')
  assert.deepEqual(M.matchingSessions(project(), resource({ sessions: [null, false, 'bad'] }), now), [])
  const schedules = resource({ hosts: [null, false, 'bad', { host: 'current', collected_at: stamp(0), received_at: stamp(0), tasks: [null, false, 'bad'] }] })
  assert.equal(M.upcoming(schedules, now).known, true)
  assert.deepEqual(M.upcoming(schedules, now).entries, [])
})
