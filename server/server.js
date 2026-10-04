import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { execSync, spawn } from 'child_process'
import { fileURLToPath } from 'node:url'
import { installMonitor } from './monitor-api.js'
import { installHealthStatus } from './health-status.js'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50kb' }))

const API_KEY = process.env.API_KEY
if (!API_KEY) { console.error('環境変数 API_KEY が設定されていません'); process.exit(1) }

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
  { id: 'matsumoto',name: 'ミア',       role: '秘書',               commands: ['/ceo', '/standup'] },
]

// セッションを唯一の稼働根拠にする。運用APIは既存のまま維持する。
installMonitor(app, { apiKey: API_KEY, members: MEMBERS })
// 死活監視の結果（公開画面用。VPSのhealthcheckが1時間ごとに書き出すJSONを読む）
installHealthStatus(app)
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
app.use('/assets', express.static(path.join(projectRoot, 'assets'), { dotfiles: 'deny' }))
app.get('/', (_, res) => res.sendFile(path.join(projectRoot, 'index.html')))
app.get('/office.html', (_, res) => res.sendFile(path.join(projectRoot, 'office.html')))

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
    const text = await resp.text()
    // /slack-reply 等は平文 "ok" を返す（JSONではない）ためパース失敗を許容する
    let json
    try { json = JSON.parse(text) } catch { json = { ok: text === 'ok', raw: text } }
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

// ── POST /api/vps-file — VPSにファイルを書き込み＆プロセス管理 ──
// claude-proxy-server.js 等のファイルをリモートから配置・起動するためのエンドポイント
app.post('/api/vps-file', (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const { action, file, content } = req.body
  const ALLOWED = [
    '/root/claude-proxy-server.js',
    '/root/hotel-sui-slack/daily-slack-report.sh',
    '/root/hotel-sui-slack/todo.json',
    '/root/daily-morning/daily-morning.sh',
    '/root/daily-morning/weekly-brief.json',
    '/root/daily-morning/weekly-brief-refresh.sh',
    '/root/daily-morning/monthly-goals.md',
    '/root/daily-morning/.env',
    '/etc/cron.d/daily-morning',
  ]

  if (action === 'write') {
    if (!file || !content || !ALLOWED.includes(file)) {
      return res.status(403).json({ error: 'path not allowed: ' + file })
    }
    const dir = path.dirname(file)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(file, content, 'utf-8')
    return res.json({ ok: true, file, size: content.length })
  }

  if (action === 'read') {
    // デバッグ・監視用。読み取り可能なパスはホワイトリスト + ログファイル（cron.log / refresh.log）に限定
    const READABLE = [
      ...ALLOWED,
      '/root/daily-morning/cron.log',
      '/root/daily-morning/refresh.log',
    ]
    if (!file || !READABLE.includes(file)) {
      return res.status(403).json({ error: 'path not readable: ' + file })
    }
    if (!fs.existsSync(file)) {
      return res.json({ ok: true, file, exists: false, content: '' })
    }
    const content = fs.readFileSync(file, 'utf-8')
    return res.json({ ok: true, file, exists: true, size: content.length, content })
  }

  if (action === 'start-proxy') {
    // claude-proxy-server.js をバックグラウンド起動
    try {
      // まず既存プロセスを停止
      try { execSync('kill $(lsof -t -i:3002 -sTCP:LISTEN) 2>/dev/null', { encoding: 'utf8' }) } catch {}
      // 1秒待ってから起動
      spawn('bash', ['-c', 'sleep 1 && cd /root && nohup node claude-proxy-server.js >> claude-proxy.log 2>&1 &'], {
        detached: true, stdio: 'ignore'
      }).unref()
      return res.json({ ok: true, message: 'proxy starting on :3002' })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (action === 'status') {
    // port 3002 のプロセス状態を確認
    try {
      const pid = execSync('lsof -t -i:3002 -sTCP:LISTEN 2>/dev/null', { encoding: 'utf8' }).trim()
      return res.json({ ok: true, port3002: pid ? 'running (PID: ' + pid + ')' : 'stopped' })
    } catch {
      return res.json({ ok: true, port3002: 'stopped' })
    }
  }

  return res.status(400).json({ error: 'unknown action. use: write, start-proxy, status' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Agent monitor server running on :${PORT}`))
