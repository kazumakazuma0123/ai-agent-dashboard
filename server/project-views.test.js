import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
function projectPage(fetch) {
  const boxes = new Map();
  const context = vm.createContext({window: {}, Date, setTimeout, clearTimeout, AbortController, fetch, projectDialog: {open:false},
    el: id => { if (!boxes.has(id)) boxes.set(id, {}); return boxes.get(id); }, renderProjects() {}});
  vm.runInContext(read('assets/project-catalog.js'), context);
  vm.runInContext(read('assets/projects.js').split("let filter='all';")[0], context);
  return {run: code => vm.runInContext(code, context), boxes};
}
const payload = () => ({monitor: {state: 'ok', generatedAt: new Date().toISOString()},
  items: [{id: 'http.monitor', label: '画面', status: 'ok'}]});

test('監視の再取得失敗は前の正常値を最新として表示しない', async () => {
  let fail = false;
  const page = projectPage(async () => {if (fail) throw new Error('offline'); return {ok: true, json: async () => payload()};});
  await page.run('loadHealth()');
  assert.equal(page.run('healthStopped()'), false);
  fail = true;
  await page.run('loadHealth()');
  assert.equal(page.run('healthStopped()'), true);
  assert.match(page.boxes.get('health-summary').innerHTML, /最新の監視結果を確認できません/);
});

test('壊れた応答・未来時刻・2時間前の正常値は最新として扱わない', async () => {
  const page = projectPage(async () => ({ok: true, json: async () => ({monitor: null})}));
  await page.run('loadHealth()');
  assert.equal(page.run('healthStopped()'), true);
  for (const timestamp of ['invalid', new Date(Date.now() + 120000).toISOString(), new Date(Date.now() - 7200001).toISOString()]) {
    page.run(`healthFailed=false;health=${JSON.stringify({monitor: {state:'ok', generatedAt:timestamp}, items:[]})}`);
    assert.equal(page.run('healthStopped()'), true);
  }
});

test('監視項目が欠けているプロジェクトを正常にしない', async () => {
  const page = projectPage(async () => ({ok: true, json: async () => payload()}));
  await page.run('loadHealth()');
  assert.match(page.run("healthBlock(projects.find(p=>p.id==='agent-monitor'))"), /一部未取得/);
  assert.doesNotMatch(page.run("healthBlock(projects.find(p=>p.id==='agent-monitor'))"), /hc-chip ok/);
});

test('公開カタログは一意のIDと確認日、業務を再開できる次の行動を持つ', () => {
  const page = projectPage();
  const items = page.run('projects');
  assert.equal(new Set(items.map(p=>p.id)).size, items.length);
  for (const p of items) {
    assert.match(p.checked, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(p.next && p.reference && p.owner);
    for (const link of p.links) assert.match(link.url, /^(https:\/\/|\/(?!\/))/);
  }
  assert.equal(items.find(p=>p.id==='hotel-recruit').group, 'active');
  for (const id of ['neruzou','hachijo-media','honne-tv']) assert.equal(items.find(p=>p.id===id).group,'paused');
});

test('定期タスクは古い収集・不正時刻・未来時刻を最新と扱わない', () => {
  const source = read('schedules.html');
  const fn = source.slice(source.indexOf('function freshHost('), source.indexOf('function upcoming('));
  const context = vm.createContext({STALE_MIN:30,Date});
  vm.runInContext(fn, context);
  const now = Date.now();
  const check = host => vm.runInContext(`freshHost(${JSON.stringify(host)},new Date(${now}))`, context);
  const iso = age => new Date(now-age).toISOString();
  assert.equal(check({received_at:iso(1000), collected_at:iso(1200)}),true);
  assert.equal(check({received_at:iso(1000), collected_at:iso(1800001)}),false);
  assert.equal(check({received_at:'bad'}),false);
  assert.equal(check({received_at:iso(-120000)}),false);
});
