import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { MonitorStore } from './monitor-store.js'

const labels = {
  Read: 'ファイルを確認', Edit: 'ファイルを編集', Write: 'ファイルを作成',
  apply_patch: 'ファイルを編集', Bash: 'コマンドを実行', exec_command: 'コマンドを実行',
  Glob: 'ファイルを検索', Grep: '内容を検索', WebSearch: '情報を検索',
  WebFetch: 'ページを確認', Agent: 'サブエージェントを起動', Skill: 'スキルを実行',
}
const text = (value, max = 160) => typeof value === 'string' ? value.replace(/[\x00-\x1f]/g, ' ').slice(0, max) : ''
const department = (cwd = '') => {
  if (/new-project|sui-room-cre|threads-poster|\/gas\//.test(cwd)) return 'watanabe'
  if (/hotel|HOTEL|sui-tablet/.test(cwd)) return 'nakamura'
  if (/ppc|sns|pension|年金|media/.test(cwd)) return 'sato'
  if (/daily-morning|infra/.test(cwd)) return 'kato'
  return 'matsumoto'
}

export function installMonitor(app, { apiKey, members, store = new MonitorStore({
  filePath: process.env.MONITOR_STATE_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/sessions.json'),
}) }) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new TypeError('API key is required')
  const memberIds = new Set(members.map(m => m.id))
  const authorize = (req, res, next) => req.headers['x-api-key'] === apiKey ? next() : res.status(401).json({ error: 'unauthorized' })
  app.use(['/api/monitor', '/api/agents', '/api/sessions', '/health'], (_, res, next) => {
    res.set('Cache-Control', 'no-store'); next()
  })
  function record(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Event must be an object')
    // Keep only display metadata. Never persist raw tool input, shell commands or responses.
    const member = memberIds.has(input.member_id) ? input.member_id : department(text(input.cwd || input.project, 1000))
    return store.ingest({
      source: input.source ?? 'unknown', session_id: input.session_id, event_id: input.event_id,
      event: input.event, timestamp: input.timestamp,
      project: text(input.project || path.basename(text(input.cwd, 1000))) || 'プロジェクト未指定',
      task: text(input.task), tool: text(input.tool), description: text(input.description), member_id: member,
    })
  }
  function respond(res, operation) {
    try { return res.json(operation()) }
    catch (error) {
      if (error instanceof TypeError) return res.status(400).json({ error: error.message })
      console.error('Monitor persistence failed:', error.code || error.name)
      return res.status(503).json({ error: '履歴の保存に失敗しました。再送してください。' })
    }
  }
  const projectedAgents = snapshot => members.map(member => {
    const sessions = snapshot.sessions.filter(s => s.member_id === member.id)
    const active = sessions.filter(s => s.status === 'active')
    const latest = active[0] || sessions[0]
    const previous = sessions.find(s => s.status === 'completed' || s.status === 'failed')
    const history = s => (s?.history || []).slice(-8).reverse().map(e => ({ tool: e.tool || e.event, desc: e.description, time: e.timestamp }))
    return {
      ...member, member_id: member.id, status: active.length ? 'active' : 'idle',
      command: latest?.source ? ({ codex: 'Codex', claude: 'Claude Code', unknown: '旧連携' }[latest.source]) : null,
      task: latest?.task || latest?.project || null, started_at: latest?.started_at || null,
      last_seen: latest?.updated_at || null, tool_count: latest?.tool_count || 0,
      last_tool: latest?.tool || null, last_desc: latest?.description || null,
      history: history(latest), active_sessions: active.length,
      last_task: previous ? { task: previous.task || previous.project, tool_count: previous.tool_count,
        started_at: previous.started_at, ended_at: previous.updated_at, history: history(previous) } : null,
    }
  })
  app.post('/api/events', authorize, (req, res) => respond(res, () => ({ ok: true, session: record(req.body) })))
  // Old clients remain accepted, but their provider cannot be guessed from the session ID.
  app.post('/api/update', authorize, (req, res) => respond(res, () => {
    const body = req.body || {}
    const tool = text(body.tool_name)
    const session = record({ source: body.source || 'unknown', session_id: body.session_id,
      event_id: body.event_id || randomUUID(), event: 'activity', tool,
      cwd: body.tool_input?.file_path || body.cwd, project: path.basename(text(body.cwd, 1000)),
      description: labels[tool] || 'ツールを使用', member_id: body.member_id })
    return { ok: true, member_id: session.member_id }
  }))
  app.post('/api/command', authorize, (req, res) => respond(res, () => {
    const body = req.body || {}
    if (!memberIds.has(body.member_id) || !['start', 'end'].includes(body.action)) throw new TypeError('Invalid member_id or action')
    const session = record({ source: body.source || 'unknown', session_id: body.session_id || `command:${body.member_id}`,
      event_id: body.event_id || randomUUID(), event: body.action === 'start' ? 'start' : 'completed',
      member_id: body.member_id, project: '組織コマンド', description: body.action === 'start' ? '作業を開始' : '応答が完了' })
    return { ok: true, member_id: session.member_id }
  }))
  app.get('/api/monitor', (_, res) => {
    const snapshot = store.snapshot()
    res.json({ ...snapshot, agents: projectedAgents(snapshot), version: 2 })
  })
  app.get('/api/agents', (_, res) => res.json({ agents: projectedAgents(store.snapshot()), unmapped_sessions: 0, unmapped_details: [] }))
  app.get('/api/sessions', authorize, (_, res) => res.json(store.snapshot().sessions))
  app.get('/health', (_, res) => {
    const snapshot = store.snapshot()
    res.json({ ok: true, version: 2, members: members.length,
      active_members: projectedAgents(snapshot).filter(m => m.status === 'active').length,
      active_sessions: snapshot.summary.active, stale_sessions: snapshot.summary.stale,
      sources: snapshot.summary.by_source, unmapped_sessions: 0, warnings: [] })
  })
  return store
}
