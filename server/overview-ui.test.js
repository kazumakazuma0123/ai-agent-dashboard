import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// A minimal DOM smoke test: runs the shipped scripts and event handlers.
// It does not replace browser layout, focus-trap or accessibility verification.
function page(search = '', responseFor) {
  const elements = new Map()
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: id === 'domain' ? 'all' : '', hidden: false, innerHTML: '', textContent: '', listeners: {},
      append() {}, addEventListener(event, callback) { this.listeners[event] = callback }, focus() {}, select() {},
      showModal() { this.open = true }, close() { this.open = false; this.listeners.close?.() },
      insertAdjacentHTML(_, text) { this.innerHTML += text }, contains() { return false }, querySelectorAll() { return [] },
      getBoundingClientRect() { return { left: 0, top: 0, right: 600, bottom: 600 } }
    })
    return elements.get(id)
  }
  const filters = ['live', 'active', 'attention', 'waiting', 'review', 'pinned', 'paused', 'all'].map(filter => ({ dataset: { filter }, setAttribute() {}, addEventListener() {} }))
  const requests = []
  const context = {
    console, URL, URLSearchParams, Intl, Date, Set, Map, Promise, AbortController, setTimeout, clearTimeout, setInterval() {},
    location: { search }, navigator: {}, localStorage: { getItem() { throw Error('blocked') }, setItem() { throw Error('blocked') } },
    document: { hidden: false, getElementById: element, querySelectorAll(selector) { return selector === '[data-filter]' ? filters : [] }, createElement() { return {} }, addEventListener() {} },
    fetch(path) { requests.push(path); return responseFor ? Promise.resolve({ ok: true, json: async () => responseFor(path) }) : Promise.reject(Error('offline')) }
  }
  context.window = context
  vm.createContext(context)
  for (const name of ['project-catalog.js', 'overview-model.js', 'overview.js']) vm.runInContext(fs.readFileSync(new URL(`../assets/${name}`, import.meta.url), 'utf8'), context)
  return { element, context, requests }
}
const settle = () => new Promise(resolve => setImmediate(resolve))

test('demo loads without network, opens a linked project and supports offline clipboard and denied storage', async () => {
  const view = page('?demo=1&project=demo-monitor')
  assert.equal(view.requests.length, 0)
  assert.equal(view.element('detail-dialog').open, true)
  assert.match(view.element('project-list').innerHTML, /予約連携の稼働確認/)
  assert.doesNotMatch(view.element('project-list').innerHTML, /保全中のプロジェクト/)
  await view.element('copy-handoff').listeners.click()
  assert.equal(view.element('copy-fallback').hidden, false)
  assert.match(view.element('copy-fallback').value, /目的：/)
  view.element('project-list').listeners.click({ target: { closest(selector) { return selector === '[data-pin]' ? { dataset: { pin: 'demo-monitor' } } : null } } })
  assert.match(view.element('pin-note').textContent, /保存が利用できません/)
  assert.match(view.element('project-list').innerHTML, /aria-label="予約連携の稼働確認（デモ）を注目から外す"/)
  view.element('search').value = '存在しない案件'
  view.element('search').listeners.input()
  assert.match(view.element('project-list').innerHTML, /この条件に合う案件はありません/)
})
test('live catalog loads and each offline endpoint reports unavailable data', async () => {
  const view = page()
  await settle()
  assert.equal(view.requests.length, 3)
  assert.match(view.element('project-list').innerHTML, /ホテル/)
  assert.match(view.element('source-status').innerHTML, /取得に失敗/)
  assert.match(view.element('summary').innerHTML, /一部または全件の監視情報が不足/)
  assert.match(view.element('summary').innerHTML, /<strong>—<\/strong>/)
})
test('fresh but incomplete monitoring cannot claim zero issues, and unmatched warnings remain visible safely', async () => {
  const view = page('', path => path === '/api/health-status'
    ? { monitor: { state: 'ok', generatedAt: new Date(Date.now() - 1000).toISOString() }, items: [{ id: 'unmapped.check', status: 'error', label: '<script>不明項目</script>' }] }
    : path === '/api/monitor' ? { sessions: [] } : { hosts: [] })
  await settle()
  assert.match(view.element('summary').innerHTML, /<strong>—<\/strong>/)
  assert.match(view.element('source-status').innerHTML, /未分類の監視警告 1件/)
  assert.match(view.element('source-status').innerHTML, /&lt;script&gt;/)
  assert.doesNotMatch(view.element('source-status').innerHTML, /<script>/)
})
test('summary action opens the same active-project group that the count describes', async () => {
  const view = page()
  await settle()
  view.element('summary').listeners.click({ target: { closest() { return { dataset: { summaryFilter: 'active' } } } } })
  const count = view.context.MONITOR_PROJECTS.filter(project => project.group === 'active').length
  assert.equal(view.element('result-count').textContent, `${count} / ${view.context.MONITOR_PROJECTS.length} 件`)
})
