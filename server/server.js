import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50kb' }))

const API_KEY = process.env.API_KEY || 'changeme'
const sessions = new Map()

// ツール名を人間が読みやすい説明に変換
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
    case 'WebFetch':  return `Web取得`
    case 'WebSearch': return `Web検索`
    case 'TodoWrite': return 'TODOを更新'
    default:          return tool
  }
}

// POST /api/update — フックから受信
app.post('/api/update', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const { session_id, tool_name, cwd, tool_input } = req.body
  if (!session_id) return res.status(400).json({ error: 'missing session_id' })

  const project = (cwd || '').split('/').filter(Boolean).pop() || 'unknown'
  const existing = sessions.get(session_id) || {
    session_id,
    project,
    cwd: cwd || '',
    tool_count: 0,
    started_at: new Date().toISOString(),
    history: []
  }

  const entry = {
    tool: tool_name,
    desc: describeToolUse(tool_name, tool_input),
    time: new Date().toISOString()
  }

  sessions.set(session_id, {
    ...existing,
    project,
    cwd: cwd || existing.cwd,
    last_tool: tool_name,
    last_desc: entry.desc,
    tool_count: existing.tool_count + 1,
    last_seen: new Date().toISOString(),
    history: [entry, ...existing.history].slice(0, 8)
  })

  res.json({ ok: true })
})

// GET /api/agents — ダッシュボード用
app.get('/api/agents', (req, res) => {
  const now = Date.now()
  const result = []

  for (const [id, s] of sessions) {
    const diffSec = (now - new Date(s.last_seen).getTime()) / 1000

    // 1時間以上放置されたセッションは削除
    if (diffSec > 3600) { sessions.delete(id); continue }

    result.push({
      ...s,
      status: diffSec < 30 ? 'active' : diffSec < 300 ? 'idle' : 'stopped'
    })
  }

  result.sort((a, b) => new Date(b.last_seen) - new Date(a.last_seen))
  res.json(result)
})

// ヘルスチェック
app.get('/health', (_, res) => res.json({ ok: true, sessions: sessions.size }))

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Agent monitor server running on :${PORT}`))
