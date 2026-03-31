import express from 'express'
import cors from 'cors'
import { execSync } from 'child_process'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50kb' }))

const API_KEY = process.env.API_KEY || 'changeme'

// ── 社員マスタ（常駐表示） ──
const MEMBERS = [
  { id: 'sato',     name: 'ジャック',   role: 'コンテンツ制作部長', commands: ['/article'] },
  { id: 'tanaka',   name: 'ニコル',     role: 'リサーチャー',       commands: ['/research'] },
  { id: 'yamada',   name: 'アレックス', role: 'ライター',           commands: ['/write'] },
  { id: 'suzuki',   name: 'エマ',       role: 'エディター',         commands: ['/direct'] },
  { id: 'nakamura', name: 'オリバー',   role: 'ホテル運営部長',     commands: ['/hotel'] },
  { id: 'ito',      name: 'ソフィー',   role: '集客マネージャー',   commands: ['/hotel'] },
  { id: 'takahashi',name: 'ルカス',     role: '清掃マネージャー',   commands: ['/hotel'] },
  { id: 'watanabe', name: 'ライアン',   role: '開発部長',           commands: ['/dev'] },
  { id: 'kobayashi',name: 'イーサン',   role: 'エンジニア',         commands: ['/dev'] },
  { id: 'kato',     name: 'レオ',       role: 'インフラ部長',       commands: ['/infra'] },
  { id: 'yoshida',  name: 'マックス',   role: '自動化エンジニア',   commands: ['/infra'] },
  { id: 'matsumoto',name: 'ノア',       role: '経営企画',           commands: ['/ceo', '/standup'] },
]

// ── 社員ステート管理 ──
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
      last_task: null,
    })
  }
}
initMemberState()

// ── セッション→社員 自動紐付け ──
// /api/command start 時に session_id が不明なので、
// session_id→member_id マッピングと、member_id→session_id マッピングを管理
const sessionMemberMap = new Map()   // session_id → member_id
const memberSessionMap = new Map()   // member_id → session_id

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

  const { member_id, action, command, task, session_id } = req.body
  if (!member_id || !action) {
    return res.status(400).json({ error: 'missing member_id or action' })
  }

  const state = memberState.get(member_id)
  if (!state) {
    return res.status(400).json({ error: 'unknown member_id' })
  }

  if (action === 'start') {
    // session_id が渡されたらマッピングに登録
    if (session_id) {
      sessionMemberMap.set(session_id, member_id)
      memberSessionMap.set(member_id, session_id)
    }

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
    // セッションマッピングをクリア
    const sid = memberSessionMap.get(member_id)
    if (sid) {
      sessionMemberMap.delete(sid)
      memberSessionMap.delete(member_id)
    }

    memberState.set(member_id, {
      ...state,
      status: 'idle',
      command: null,
      task: null,
      last_seen: new Date().toISOString(),
      last_task: {
        command: state.command,
        task: state.task,
        tool_count: state.tool_count,
        started_at: state.started_at,
        ended_at: new Date().toISOString(),
        last_tool: state.last_tool,
        last_desc: state.last_desc,
        history: state.history,
      },
    })
  }

  res.json({ ok: true })
})

// ── POST /api/update — PostToolUseフックから受信 ──
const sessions = new Map()

app.post('/api/update', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  let { session_id, tool_name, cwd, tool_input, member_id } = req.body

  const entry = {
    tool: tool_name,
    desc: describeToolUse(tool_name, tool_input),
    time: new Date().toISOString()
  }

  // member_id が未指定の場合、セッション→社員マッピングから自動解決
  if (!member_id && session_id) {
    member_id = sessionMemberMap.get(session_id) || null
  }

  // まだ不明なら、アクティブな社員の中から最も最近 start した部長を探す
  // （フックからの初回updateで、まだマッピングがない場合のフォールバック）
  if (!member_id && session_id) {
    let bestMatch = null
    let bestTime = 0
    for (const [mid, state] of memberState) {
      if (state.status === 'active' && !memberSessionMap.has(mid)) {
        const t = new Date(state.started_at).getTime()
        if (t > bestTime) {
          bestTime = t
          bestMatch = mid
        }
      }
    }
    if (bestMatch && (Date.now() - bestTime) < 60000) {
      member_id = bestMatch
      sessionMemberMap.set(session_id, member_id)
      memberSessionMap.set(member_id, session_id)
    }
  }

  // 社員ステートを更新
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
      started_at: new Date().toISOString(), history: [],
      member_id: member_id || null,
    }
    sessions.set(session_id, {
      ...existing, project, cwd: cwd || existing.cwd,
      last_tool: tool_name, last_desc: entry.desc,
      tool_count: existing.tool_count + 1,
      last_seen: new Date().toISOString(),
      member_id: member_id || existing.member_id,
      history: [entry, ...existing.history].slice(0, 8)
    })
  }

  res.json({ ok: true })
})

// ── GET /api/agents — ダッシュボード用 ──
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
        const sid = memberSessionMap.get(m.id)
        if (sid) {
          sessionMemberMap.delete(sid)
          memberSessionMap.delete(m.id)
        }
        memberState.set(m.id, {
          ...state,
          status: 'idle',
          command: null,
          task: null,
          last_task: {
            command: state.command,
            task: state.task,
            tool_count: state.tool_count,
            started_at: state.started_at,
            ended_at: new Date().toISOString(),
            last_tool: state.last_tool,
            last_desc: state.last_desc,
            history: state.history,
          },
        })
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
      last_task: state.last_task,
    }
  })

  res.json(result)
})

// ── GET /api/sessions — セッション一覧（デバッグ用） ──
app.get('/api/sessions', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  res.json([...sessions.values()])
})

// ── POST /api/proxy — localhost:3002 への中継 ──
// port 3002（claude proxy）はパケットフィルター未開放のため外部から到達不可。
// port 3001（本サーバー）経由でlocalhost:3002にリクエストを中継する。
app.post('/api/proxy', async (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const { path, body: proxyBody } = req.body
  if (!path) return res.status(400).json({ error: 'missing path' })
  try {
    const resp = await fetch(`http://localhost:3002${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyBody || {}),
      signal: AbortSignal.timeout(10000),
    })
    const json = await resp.json()
    res.status(resp.status).json(json)
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// ── POST /api/deploy — リモートデプロイ ──
app.post('/api/deploy', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  try {
    const cwd = process.cwd()
    const pull = execSync('git pull', { cwd, encoding: 'utf8', timeout: 15000 })
    res.json({ ok: true, pull: pull.trim() })
    // git pullの後、pm2で自身を再起動（レスポンス送信後に実行）
    if (!pull.includes('Already up to date')) {
      setTimeout(() => {
        try { execSync('pm2 restart ai-agent-dashboard', { encoding: 'utf8' }) } catch {}
      }, 500)
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ヘルスチェック
app.get('/health', (_, res) => res.json({ ok: true, members: MEMBERS.length }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Agent monitor server running on :${PORT}`))
