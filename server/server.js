import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50kb' }))

const API_KEY = process.env.API_KEY || 'REDACTED_API_KEY'

// ── 社員マスタ（常駐表示） ──
const MEMBERS = [
  { id: 'sato',     name: '佐藤', role: 'コンテンツ制作部長', commands: ['/article'] },
  { id: 'tanaka',   name: '田中', role: 'リサーチャー',       commands: ['/research'] },
  { id: 'yamada',   name: '山田', role: 'ライター',           commands: ['/write'] },
  { id: 'suzuki',   name: '鈴木', role: 'エディター',         commands: ['/direct'] },
  { id: 'nakamura', name: '中村', role: 'ホテル運営部長',     commands: ['/hotel'] },
  { id: 'watanabe', name: '渡辺', role: '開発部長',           commands: ['/dev'] },
  { id: 'kato',     name: '加藤', role: 'インフラ部長',       commands: ['/infra'] },
  { id: 'matsumoto',name: '松本', role: '経営企画',           commands: ['/ceo', '/standup'] },
]

// ── 社員ステート管理 ──
// { id → { status, command, task, started_at, last_seen, tool_count, last_tool, last_desc, history } }
const memberState = new Map()

function initMemberState() {
  for (const m of MEMBERS) {
    memberState.set(m.id, {
      status: 'idle',
      command: null,
      task: null,
      started_at: null,
      last_seen: new Date().toISOString(),
      tool_count: 0,
      last_tool: null,
      last_desc: null,
      history: [],
    })
  }
}
initMemberState()

// ── ツール名の日本語表示 ──
function describeToolUse(tool, input) {
  const fp = input?.file_path || ''
  const cmd = (input?.command || '').slice(0, 60)
  const pat = (input?.pattern || '').slice(0, 40)
  switch (tool) {
    case 'Write':     return `${fp} を作成`
    case 'Edit':      return `${fp} を編集`
    case 'Read':      return `${fp} を読み込み`
    case 'Bash':      return cmd || 'コマンド実行'
    case 'Glob':      return `${pat} を検索`
    case 'Grep':      return `"${pat}" を検索`
    case 'WebFetch':  return 'Web取得'
    case 'WebSearch': return 'Web検索'
    case 'TodoWrite': return 'TODOを更新'
    case 'Agent':     return 'サブエージェント起動'
    default:          return tool
  }
}

// ── POST /api/command — スキルから開始/終了を通知 ──
app.post('/api/command', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { member_id, action, command, task } = req.body
  // action: 'start' | 'end'
  if (!member_id || !action) {
    return res.status(400).json({ error: 'missing member_id or action' })
  }

  const state = memberState.get(member_id)
  if (!state) {
    return res.status(400).json({ error: 'unknown member_id' })
  }

  if (action === 'start') {
    memberState.set(member_id, {
      ...state,
      status: 'active',
      command: command || null,
      task: task || null,
      started_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      tool_count: 0,
      last_tool: null,
      last_desc: null,
      history: [],
    })
  } else if (action === 'end') {
    memberState.set(member_id, {
      ...state,
      status: 'idle',
      command: null,
      task: null,
      last_seen: new Date().toISOString(),
    })
  }

  res.json({ ok: true })
})

// ── POST /api/update — PostToolUseフックから受信 ──
// member_id が含まれていれば社員のステートを更新
const sessions = new Map()

app.post('/api/update', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { session_id, tool_name, cwd, tool_input, member_id } = req.body

  const entry = {
    tool: tool_name,
    desc: describeToolUse(tool_name, tool_input),
    time: new Date().toISOString()
  }

  // 社員IDが指定されている場合、社員ステートも更新
  if (member_id && memberState.has(member_id)) {
    const state = memberState.get(member_id)
    memberState.set(member_id, {
      ...state,
      last_tool: tool_name,
      last_desc: entry.desc,
      tool_count: state.tool_count + 1,
      last_seen: new Date().toISOString(),
      history: [entry, ...state.history].slice(0, 8),
    })
  }

  // セッション追跡（後方互換）
  if (session_id) {
    const project = (cwd || '').split('/').filter(Boolean).pop() || 'unknown'
    const existing = sessions.get(session_id) || {
      session_id, project, cwd: cwd || '', tool_count: 0,
      started_at: new Date().toISOString(), history: []
    }
    sessions.set(session_id, {
      ...existing, project, cwd: cwd || existing.cwd,
      last_tool: tool_name, last_desc: entry.desc,
      tool_count: existing.tool_count + 1,
      last_seen: new Date().toISOString(),
      history: [entry, ...existing.history].slice(0, 8)
    })
  }

  res.json({ ok: true })
})

// ── GET /api/agents — ダッシュボード用 ──
// 社員マスタベースで返す（常に全員表示）
app.get('/api/agents', (req, res) => {
  const now = Date.now()
  const result = MEMBERS.map(m => {
    const state = memberState.get(m.id)

    // activeステータスの自動タイムアウト（5分操作なし → idle）
    let status = state.status
    if (status === 'active' && state.last_seen) {
      const diffSec = (now - new Date(state.last_seen).getTime()) / 1000
      if (diffSec > 300) {
        status = 'idle'
        memberState.set(m.id, { ...state, status: 'idle', command: null, task: null })
      }
    }

    return {
      member_id: m.id,
      name: m.name,
      role: m.role,
      commands: m.commands,
      status,
      command: state.command,
      task: state.task,
      started_at: state.started_at,
      last_seen: state.last_seen,
      tool_count: state.tool_count,
      last_tool: state.last_tool,
      last_desc: state.last_desc,
      history: state.history,
    }
  })

  res.json(result)
})

// ヘルスチェック
app.get('/health', (_, res) => res.json({ ok: true, members: MEMBERS.length }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Agent monitor server running on :${PORT}`))
