'use strict';
// Pure display rules, shared by the browser and Node's regression tests.
(function (root) {
  const MINUTE = 60000, DAY = 86400000;
  const value = v => typeof v === 'string' ? v : '';
  const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const time = v => typeof v === 'string' && v ? Date.parse(v) : NaN;
  const today = now => new Date(now + 9 * 60 * MINUTE).toISOString().slice(0, 10);
  function dateDay(input) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value(input))) return NaN;
    const parsed = Date.parse(input + 'T00:00:00Z');
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === input ? parsed : NaN;
  }
  function resourceFresh(resource, now) {
    const age = now - resource?.receivedAt;
    return resource?.state === 'ok' && Number.isFinite(age) && age >= 0 && age < 2 * MINUTE;
  }
  function healthFresh(resource, now) {
    const age = now - time(resource?.data?.monitor?.generatedAt);
    return resourceFresh(resource, now) && resource.data?.monitor?.state === 'ok' && Number.isFinite(age) && age >= 0 && age < 120 * MINUTE;
  }
  function information(project, now) {
    const day = dateDay(project.checked), current = dateDay(today(now));
    const age = (current - day) / DAY;
    if (!Number.isFinite(age) || age < 0) return { stale: true, days: null, label: '確認日を要確認' };
    return { stale: age > 14, days: age, label: age > 14 ? `確認から${age}日・進捗を再確認` : `資料確認 ${project.checked}` };
  }
  function healthFor(project, healthMap, resource, now) {
    const ids = Array.isArray(healthMap?.[project.name]) ? healthMap[project.name] : [];
    if (!ids.length) return { state: 'unmapped', items: [], bad: [], label: '自動監視の対象外' };
    if (!healthFresh(resource, now)) return { state: 'unknown', items: [], bad: [], label: resource?.state === 'error' ? '監視の取得に失敗' : resource?.state === 'loading' ? '監視を取得中' : '監視の更新を要確認' };
    const data = Array.isArray(resource.data.items) ? resource.data.items.filter(record) : [];
    const items = ids.map(id => data.find(item => item.id === id)).filter(Boolean);
    const bad = items.filter(item => ['warn', 'error'].includes(item.status));
    if (bad.length) return { state: 'attention', items, bad, complete: items.length === ids.length && items.every(item => ['ok', 'skip', 'warn', 'error'].includes(item.status)), label: `監視で要対応 ${bad.length}件` };
    if (items.length < ids.length || items.some(item => !['ok', 'skip'].includes(item.status))) return { state: 'unknown', items, bad, label: '一部の監視結果が未取得' };
    if (items.every(item => item.status === 'skip')) return { state: 'skip', items, bad, label: '監視休止中' };
    return { state: 'ok', items, bad, label: '取得した監視項目は正常' };
  }
  function matchingSessions(project, resource, now) {
    if (!resourceFresh(resource, now) || !Array.isArray(resource?.data?.sessions)) return [];
    const aliases = new Set((Array.isArray(project.sessionProjects) ? project.sessionProjects : []).filter(Boolean));
    return resource.data.sessions.filter(session => record(session) && aliases.has(session.project)).map(session => {
      const age = now - time(session.last_activity_at || session.updated_at);
      const status = ['active', 'waiting'].includes(session.status) && (!Number.isFinite(age) || age < 0 || age >= 5 * MINUTE) ? 'stale' : session.status;
      return { ...session, status };
    }).sort((a, b) => (time(b.updated_at) || 0) - (time(a.updated_at) || 0));
  }
  function projectView(project, { healthMap = {}, health, monitor, pins = new Set(), now = Date.now() } = {}) {
    const info = information(project, now), checks = healthFor(project, healthMap, health, now);
    const sessions = matchingSessions(project, monitor, now);
    const due = dateDay(project.due), overdue = Number.isFinite(due) && due < dateDay(today(now));
    const paused = project.group === 'paused';
    const waiting = Boolean(value(project.blocked).trim()) || project.group === 'unknown';
    let rank = 4, label = '次の行動へ', reason = '記録されている次の行動を確認できます。';
    if (info.stale) { rank = 3; label = '進捗を再確認'; reason = info.label; }
    if (waiting) { rank = 2; label = '確認待ち'; reason = value(project.blocked) || '稼働・導入状況の確認が必要です。'; }
    if (overdue) { rank = 1; label = '期限を確認'; reason = `記録された期限 ${project.due} を過ぎています。`; }
    if (checks.bad.length) { rank = 0; label = '要対応'; reason = checks.bad.map(item => item.label || item.id).join('・'); }
    if (paused) { rank = 5; label = '休止・保全'; reason = '再開の判断があるまで保全します。'; }
    return { project, info, checks, sessions, paused, waiting: !paused && waiting, overdue: !paused && overdue,
      attention: !paused && (checks.bad.length > 0 || overdue), review: !paused && info.stale,
      pinned: pins.has(project.id), rank, label, reason,
      running: !paused && sessions.some(session => session.status === 'active') };
  }
  function rows(projects, options) {
    return projects.map(project => projectView(project, options)).sort((a, b) => a.rank - b.rank || Number(b.pinned) - Number(a.pinned) || a.project.name.localeCompare(b.project.name, 'ja'));
  }
  function upcoming(resource, now = Date.now(), limit = 5) {
    if (!resourceFresh(resource, now) || !Array.isArray(resource?.data?.hosts)) return { known: false, entries: [], staleHosts: [], freshHosts: 0 };
    const staleHosts = [], entries = [];
    let freshHosts = 0;
    for (const host of resource.data.hosts) {
      if (!record(host)) continue;
      const age = now - time(host.collected_at), receivedAge = now - time(host.received_at);
      if (!Number.isFinite(age) || age < 0 || age >= 30 * MINUTE || !Number.isFinite(receivedAge) || receivedAge < 0 || receivedAge >= 30 * MINUTE) { staleHosts.push(host.host); continue; }
      freshHosts += 1;
      for (const task of Array.isArray(host.tasks) ? host.tasks : []) {
        if (!record(task) || task.enabled !== true) continue;
        const next = (Array.isArray(task.next_runs) ? task.next_runs : []).map(time).filter(at => Number.isFinite(at) && at >= now).sort((a, b) => a - b)[0];
        if (next !== undefined) entries.push({ id: `${host.host}:${task.id}`, name: task.name, host: host.host, at: next });
      }
    }
    return { known: freshHosts > 0, entries: entries.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).slice(0, limit), staleHosts, freshHosts };
  }
  function handoff(row) {
    const p = row.project;
    return [
      row.paused ? `「${p.name}」の保全状態を確認してください。` : `「${p.name}」の現状と次の行動を確認してください。`, '',
      `目的：${value(p.purpose)}`, `現在の記録：${value(p.current)}`, `次の行動：${value(p.next)}`,
      `相談窓口：${value(p.owner) || '未設定'}`, `資料確認日：${value(p.checked) || '未確認'}`,
      p.due ? `記録された期限：${p.due}` : '期限：未設定',
      `確認資料：${value(p.reference) || '未設定'}`, `確認が必要な点：${row.reason}`,
      ...(p.blocked ? [`確認待ちの理由：${value(p.blocked)}`] : []),
      `自動監視：${row.checks.label}`,
      ...row.checks.bad.map(item => `監視項目：${value(item.label)} — ${value(item.message)}`), '',
      row.paused ? 'この案件は休止中です。再開はせず、保全と現状確認の範囲で扱ってください。' : 'まず正本・最新の記録を読み、未確認の点を確かめてから着手してください。',
      'これは確認日時点の記録です。稼働通知やAIの応答完了だけで、業務が完了したとは判断しないでください。'
    ].join('\n');
  }
  function safeUrl(input) {
    if (typeof input !== 'string') return null;
    if (/^\/(?!\/)[^\s\\]*$/.test(input)) return input;
    try { const url = new URL(input); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
  }
  root.MonitorOverview = { today, dateDay, resourceFresh, healthFresh, information, healthFor, matchingSessions, projectView, rows, upcoming, handoff, safeUrl };
})(globalThis);
