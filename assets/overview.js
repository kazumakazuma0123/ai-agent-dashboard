'use strict';
(() => {
  const M = window.MonitorOverview;
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const query = new URLSearchParams(location.search), demo = query.get('demo') === '1';
  const resources = Object.fromEntries(['health', 'monitor', 'schedules'].map(key => [key, { state: 'loading', data: null, receivedAt: null }]));
  let projects = window.MONITOR_PROJECTS || [], healthMap = window.MONITOR_HEALTH_MAP || {};
  let filter = 'live', selectedId = null, fetching = false;
  const pinKey = demo ? 'monitor-hub-demo-pins-v1' : 'monitor-hub-pins-v1';
  let pins = new Set();
  try { const saved = JSON.parse(localStorage.getItem(pinKey) || '[]'); if (Array.isArray(saved)) pins = new Set(saved.filter(id => typeof id === 'string')); } catch {}
  const date = (input, options = {}) => {
    const parsed = typeof input === 'number' ? input : Date.parse(input);
    return Number.isFinite(parsed) ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', ...options }).format(parsed) : '日時未確認';
  };
  const statusLabel = { active: '作業中', waiting: '応答待ち', stale: '通知途絶・要確認', failed: 'エラー', completed: '応答完了' };
  const options = () => ({ healthMap, health: resources.health, monitor: resources.monitor, pins, now: Date.now() });
  const allRows = () => M.rows(projects, options());
  const getRow = id => allRows().find(row => row.project.id === id);
  function setupDemo() {
    const now = Date.now(), iso = delta => new Date(now + delta).toISOString();
    const common = { domain: 'デモ事業', purpose: '状況を把握して次の作業へつなげるための表示例です。', reference: '架空の確認資料（デモ）', checked: M.today(now), owner: 'デモ担当', links: [] };
    projects = [
      { ...common, id: 'demo-monitor', name: '予約連携の稼働確認（デモ）', group: 'active', status: '運用中', current: '監視に確認が必要な項目があります。', next: '予約連携の最終成功時刻を確認し、必要な復旧作業を整理する。', sessionProjects: ['demo-reservations'] },
      { ...common, id: 'demo-video', name: '次の動画の公開準備（デモ）', group: 'active', status: '確認待ち', current: '確認用の動画を用意した段階です。', next: '動画を通して確認し、公開する版を決める。', blocked: '公開前の内容確認を待っています。', sessionProjects: [] },
      { ...common, id: 'demo-plan', name: '販売計画の更新（デモ）', group: 'active', status: '運用中', checked: M.today(now - 22 * 86400000), current: '前回の販売方針を記録しています。', next: '最新の販売状況を読み、次の施策を整理する。', sessionProjects: ['demo-plan'] },
      { ...common, id: 'demo-pause', name: '保全中のプロジェクト（デモ）', group: 'paused', status: '休止中', current: '再開の判断を待っています。', next: '既存の資料を保全する。', sessionProjects: [] }
    ];
    healthMap = { [projects[0].name]: ['demo.health'] };
    resources.health = { state: 'ok', receivedAt: now, data: { monitor: { state: 'ok', generatedAt: iso(-300000) }, items: [{ id: 'demo.health', status: 'warn', label: '予約反映の最終成功', message: '最終成功の記録を確認してください。' }] } };
    resources.monitor = { state: 'ok', receivedAt: now, data: { sessions: [{ project: 'demo-plan', task: '販売状況の記録を確認', status: 'active', source: 'codex', updated_at: iso(-40000) }, { project: 'demo-reservations', task: '予約連携の記録を確認', status: 'completed', source: 'claude', updated_at: iso(-600000) }] } };
    resources.schedules = { state: 'ok', receivedAt: now, data: { hosts: [{ host: 'デモ用マシン', collected_at: iso(0), received_at: iso(0), tasks: [{ id: 'review', name: '運用状況の確認（デモ）', enabled: true, next_runs: [iso(900000)] }, { id: 'report', name: '分析レポートの作成（デモ）', enabled: true, next_runs: [iso(3600000)] }] }] } };
    $('demo-banner').hidden = false;
    $('refresh').textContent = 'デモを更新 ↻';
  }
  if (demo) setupDemo();
  for (const domain of [...new Set(projects.map(p => p.domain))]) {
    const option = document.createElement('option'); option.value = domain; option.textContent = domain; $('domain').append(option);
  }
  $('today').textContent = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'long', day: 'numeric', weekday: 'long' }).format(Date.now());
  function renderSummary(rows) {
    const live = rows.filter(row => !row.paused), count = live.filter(row => row.attention).length;
    const known = M.healthFresh(resources.health, Date.now()) && !live.some(row => row.checks.state === 'unknown' || row.checks.complete === false);
    const cards = [
      { title: '要対応', count: known ? count : count ? `${count}+` : '—', note: known ? '監視異常・記録された期限超過' : '一部または全件の監視情報が不足', filter: 'attention', css: 'attention' },
      { title: '進行・運用中', count: live.filter(row => row.project.group === 'active').length, note: '資料上で進行・運用している案件', filter: 'active' },
      { title: '確認待ち', count: live.filter(row => row.waiting).length, note: '判断・稼働確認が必要な案件', filter: 'waiting' },
      { title: '進捗を再確認', count: live.filter(row => row.review).length, note: '確認日から14日超・確認日不明', filter: 'review' }
    ];
    $('summary').innerHTML = cards.map(card => `<button type="button" class="summary-card ${card.css || ''}" data-summary-filter="${card.filter}"><span>${card.title}</span><strong>${card.count}</strong><small>${card.note}</small></button>`).join('');
  }
  function matches(row) {
    const p = row.project, search = $('search').value.trim().toLocaleLowerCase('ja');
    const inFilter = ({ all: true, live: !row.paused, active: p.group === 'active', paused: row.paused, attention: row.attention, waiting: row.waiting, review: row.review, pinned: row.pinned })[filter];
    return inFilter && ($('domain').value === 'all' || p.domain === $('domain').value) && (!search || [p.name, p.domain, p.purpose, p.current, p.next, p.owner].some(value => String(value || '').toLocaleLowerCase('ja').includes(search)));
  }
  function renderProjects(rows) {
    const shown = rows.filter(matches);
    $('result-count').textContent = `${shown.length} / ${rows.length} 件`;
    $('project-list').innerHTML = shown.length ? shown.map(row => {
      const p = row.project, pill = row.attention ? 'attention' : row.waiting ? 'waiting' : row.review ? 'review' : '';
      return `<article class="project-card ${row.paused ? 'paused' : ''}" data-rank="${row.rank}"><div class="card-top"><div class="card-meta"><span>${escape(p.domain)}</span><span class="pill ${pill}">${escape(row.label)}</span>${row.running ? '<span class="pill running">AI作業中</span>' : ''}</div><button type="button" class="pin" data-pin="${escape(p.id)}" aria-pressed="${row.pinned}" aria-label="${escape(p.name)}を注目${row.pinned ? 'から外す' : 'に追加'}">${row.pinned ? '★' : '☆'}</button></div><h3>${escape(p.name)}</h3><div class="next-action"><span>${row.paused ? '保全・再開の条件' : '次の行動'}</span><p>${escape(p.next || '次の行動が未設定です。現在の状況を確認してください。')}</p></div>${row.rank < 4 ? `<p class="reason">${escape(row.reason)}</p>` : ''}<div class="card-bottom"><p>窓口：${escape(p.owner || '未設定')}<br>${escape(row.info.label)}<br>${escape(row.paused ? '休止中・監視は参考情報' : row.checks.label)}</p><button type="button" class="detail-button" data-detail="${escape(p.id)}" aria-haspopup="dialog" aria-label="${escape(p.name)}の詳細・引き継ぎ">詳細・引き継ぎ ↗</button></div></article>`;
    }).join('') : `<div class="empty"><strong>この条件に合う案件はありません</strong><p>${filter === 'attention' && (!M.healthFresh(resources.health, Date.now()) || rows.some(row=>!row.paused && (row.checks.state==='unknown' || row.checks.complete===false))) ? '監視情報が不足しているため、要対応がないとは判定できません。' : filter === 'pinned' ? 'カード右上の ☆ を押すと、ここにまとめられます。' : '検索条件や表示範囲を変更してください。'}</p></div>`;
  }
  function renderSources() {
    const now = Date.now(), health = resources.health, monitor = resources.monitor, schedules = resources.schedules;
    const schedule = M.upcoming(schedules, now);
    const stateText = r => r.state === 'error' ? '取得に失敗しました。再取得してください。' : r.state === 'loading' ? '取得中です。' : '最新の状態を確認できません。';
    const healthOk = M.healthFresh(health, now), monitorOk = M.resourceFresh(monitor, now);
    const active = monitorOk ? (monitor.data.sessions || []).filter(s => s && s.status === 'active' && now - Date.parse(s.last_activity_at || s.updated_at) >= 0 && now - Date.parse(s.last_activity_at || s.updated_at) < 300000).length : null;
    const sources = [
      ['自動の稼働監視', healthOk, healthOk ? `監視記録 ${date(health.data.monitor.generatedAt)}` : health.state === 'ok' ? `監視記録の更新を要確認。${health.data?.monitor?.generatedAt ? '最後の記録 ' + date(health.data.monitor.generatedAt) : '記録がまだありません。'}` : stateText(health)],
      ['エージェントの作業通知', monitorOk, monitorOk ? `取得 ${date(monitor.receivedAt)}・作業中 ${active}件` : stateText(monitor)],
      ['定期タスクの予定', schedule.known && !schedule.staleHosts.length, schedule.known ? `${schedule.freshHosts}台の予定を取得${schedule.staleHosts.length ? `・${schedule.staleHosts.length}台は更新を要確認` : ''}` : schedules.state === 'ok' ? '30分以内の有効な収集記録がありません。' : stateText(schedules)]
    ];
    $('source-status').innerHTML = sources.map(([label, ok, text]) => `<div class="source-row ${ok ? '' : 'problem'}"><strong>${escape(label)}</strong><span>${escape(text)}</span></div>`).join('');
    if (healthOk) {
      const mappedIds = new Set(Object.values(healthMap).filter(Array.isArray).flat());
      const unclassified = health.data.items.filter(item => item && ['warn', 'error'].includes(item.status) && !mappedIds.has(item.id));
      if (unclassified.length) $('source-status').insertAdjacentHTML('beforeend', `<div class="source-row problem"><strong>未分類の監視警告 ${unclassified.length}件</strong><span>${escape(unclassified.map(item => item.label || item.id).join('・'))}</span><span>案件に未分類のため、左の要対応件数には含みません。</span></div>`);
    }
    $('schedule-list').innerHTML = schedule.entries.length ? schedule.entries.map(item => `<div class="schedule-item"><time datetime="${new Date(item.at).toISOString()}">${escape(new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(item.at))}<small>${escape(new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }).format(item.at))}</small></time><p>${escape(item.name)}<small>${escape(item.host)}</small></p></div>`).join('') : `<p class="minor-note">${schedule.known ? '取得した記録には次回時刻のある予定がありません。' : '最新の予定を確認できません。'}</p>`;
    if (schedule.staleHosts.length) $('schedule-list').insertAdjacentHTML('beforeend', `<p class="minor-note">更新待ち：${escape(schedule.staleHosts.join('・'))}。古い予定は表示していません。</p>`);
  }
  function render() {
    const active = document.activeElement;
    const focus = active?.dataset?.detail ? ['detail', active.dataset.detail] : active?.dataset?.pin ? ['pin', active.dataset.pin] : active?.dataset?.summaryFilter ? ['summaryFilter', active.dataset.summaryFilter] : null;
    const rows = allRows(); renderSummary(rows); renderProjects(rows); renderSources();
    if (focus) ([...document.querySelectorAll(focus[0] === 'summaryFilter' ? '[data-summary-filter]' : `[data-${focus[0]}]`)].find(button => button.dataset[focus[0]] === focus[1]) || $('projects-heading')).focus({ preventScroll: true });
  }
  function setFilter(next) {
    filter = next;
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    renderProjects(allRows());
  }
  function renderDetail(row) {
    const p = row.project;
    const links = (Array.isArray(p.links) ? p.links : []).filter(link => link && typeof link === 'object').map(link => ({ ...link, url: M.safeUrl(link.url) })).filter(link => link.url);
    const activityLink = p.sessionProjects?.length ? `/?q=${encodeURIComponent(p.sessionProjects[0])}#session-list` : '/';
    $('detail-content').innerHTML = `<span class="pill">${escape(p.domain)} · ${escape(p.status)}</span><h2 id="detail-title">${escape(p.name)}</h2><p>${escape(p.purpose)}</p><div class="next-action"><span>${row.paused ? '保全・再開の条件' : '次の行動'}</span><p>${escape(p.next)}</p></div><dl><dt>現在の記録</dt><dd>${escape(p.current)}</dd><dt>窓口</dt><dd>${escape(p.owner || '未設定')}</dd><dt>情報の確認日</dt><dd>${escape(p.checked || '未確認')} · ${escape(row.info.label)}</dd><dt>期限</dt><dd>${escape(p.due || '設定されていません')}</dd><dt>判断の根拠</dt><dd>${escape(row.reason)}</dd><dt>確認した資料</dt><dd>${escape(p.reference || '未設定')}</dd><dt>自動監視</dt><dd>${escape(row.checks.label)}</dd></dl>${row.checks.bad.length ? `<ul>${row.checks.bad.map(item => `<li>${escape(item.label)}：${escape(item.message || '記録を確認してください。')}</li>`).join('')}</ul>` : ''}<div class="resource-links">${links.map(link => `<a href="${escape(link.url)}" target="_blank" rel="noopener noreferrer">${escape(link.label)} ↗</a>`).join('')}<a href="/projects.html?project=${encodeURIComponent(p.id)}">プロジェクト概要 ↗</a></div><h3>最近の関連する作業通知</h3>${row.sessions.length ? row.sessions.slice(0, 4).map(session => `<div class="session-record">${escape(session.task || '作業名の記録なし')}<small>${escape(statusLabel[session.status] || '状態未確認')} · ${escape(session.source === 'codex' ? 'Codex' : session.source === 'claude' ? 'Claude Code' : '連携元不明')} · ${escape(date(session.updated_at))}</small></div>`).join('') : `<p class="minor-note">${M.resourceFresh(resources.monitor, Date.now()) ? 'この案件に明確に対応する通知はありません。作業が行われていないとは限りません。' : '作業通知の最新状態を取得できていません。'}</p>`}<p class="minor-note">作業場所の名前が対応する通知のみを表示しています。応答完了は、業務の完了を意味しません。</p><a href="${escape(activityLink)}" class="text-link">作業状況を開く ↗</a>`;
  }
  function openDetail(id) {
    const row = getRow(id); if (!row) return;
    selectedId = id; renderDetail(row);
    $('copy-status').textContent = '';
    $('copy-fallback').hidden = true; $('copy-fallback-label').hidden = true;
    $('detail-dialog').showModal(); $('close-dialog').focus();
  }
  async function request(key, path, valid) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('HTTP error');
      const data = await response.json(); if (!valid(data)) throw new Error('Invalid response');
      resources[key] = { state: 'ok', data, receivedAt: Date.now() };
    } catch { resources[key] = { state: 'error', data: null, receivedAt: null }; }
    finally { clearTimeout(timer); render(); }
  }
  async function refresh() {
    if (fetching) return;
    if (demo) { setupDemo(); render(); return; }
    fetching = true; $('refresh').disabled = true;
    await Promise.allSettled([
      request('health', '/api/health-status', data => data && typeof data.monitor?.state === 'string' && Array.isArray(data.items)),
      request('monitor', '/api/monitor', data => data && Array.isArray(data.sessions)),
      request('schedules', '/api/schedules', data => data && Array.isArray(data.hosts))
    ]);
    fetching = false; $('refresh').disabled = false;
    if ($('detail-dialog').open && selectedId) {
      const active = document.activeElement;
      const href = active?.tagName === 'A' && $('detail-content').contains(active) ? active.getAttribute('href') : null;
      const row = getRow(selectedId); if (row) renderDetail(row);
      if (href) ([...$('detail-content').querySelectorAll('a')].find(link => link.getAttribute('href') === href) || $('close-dialog')).focus({ preventScroll: true });
    }
  }
  $('project-list').addEventListener('click', event => {
    const detail = event.target.closest('[data-detail]');
    if (detail) { openDetail(detail.dataset.detail); return; }
    const pin = event.target.closest('[data-pin]'); if (!pin) return;
    const id = pin.dataset.pin;
    pins.has(id) ? pins.delete(id) : pins.add(id);
    try { localStorage.setItem(pinKey, JSON.stringify([...pins])); }
    catch { $('pin-note').textContent = '注目の保存が利用できません。この画面を開いている間だけ保持します。'; }
    render();
    ([...document.querySelectorAll('[data-pin]')].find(button => button.dataset.pin === id) || $('projects-heading')).focus({ preventScroll: true });
    $('toast').textContent = pins.has(id) ? '注目に追加しました。' : '注目から外しました。';
  });
  $('summary').addEventListener('click', event => { const button = event.target.closest('[data-summary-filter]'); if (button) { setFilter(button.dataset.summaryFilter); $('projects-heading').focus({ preventScroll: true }); } });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));
  $('search').addEventListener('input', () => renderProjects(allRows())); $('domain').addEventListener('change', () => renderProjects(allRows()));
  $('refresh').addEventListener('click', refresh);
  $('close-dialog').addEventListener('click', () => $('detail-dialog').close());
  $('detail-dialog').addEventListener('click', event => {
    if (event.target !== $('detail-dialog')) return;
    const rect = $('detail-dialog').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('detail-dialog').close();
  });
  $('detail-dialog').addEventListener('close', () => {
    ([...document.querySelectorAll('[data-detail]')].find(button => button.dataset.detail === selectedId) || $('projects-heading')).focus({ preventScroll: true });
  });
  $('copy-handoff').addEventListener('click', async () => {
    const row = getRow(selectedId); if (!row) return;
    const content = M.handoff(row);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(content);
      $('copy-status').textContent = 'コピーしました。AIとの会話に貼り付けて使えます。';
      $('copy-fallback').hidden = true; $('copy-fallback-label').hidden = true;
    } catch {
      $('copy-status').textContent = '自動コピーが使えないため、引き継ぎ文を表示しました。';
      $('copy-fallback').value = content; $('copy-fallback').hidden = false; $('copy-fallback-label').hidden = false;
      $('copy-fallback').focus(); $('copy-fallback').select();
    }
  });
  render(); refresh();
  if (query.get('project')) openDetail(query.get('project'));
  if (!demo) setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !demo) refresh(); });
})();
