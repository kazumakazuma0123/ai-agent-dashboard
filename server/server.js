import express from 'express'
import cors from 'cors'
import compression from 'compression'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { timingSafeEqual } from 'node:crypto'
import { installMonitor } from './monitor-api.js'
import { installHealthStatus } from './health-status.js'
import { installSchedules } from './schedules.js'

// ---- ログにISO8601タイムスタンプを付与（server.log の障害時刻照合用） ----
const _origLog = console.log.bind(console)
const _origErr = console.error.bind(console)
const _ts = () => new Date().toISOString()
console.log = (...args) => _origLog(`[${_ts()}]`, ...args)
console.error = (...args) => _origErr(`[${_ts()}]`, ...args)

const app = express()
app.use(cors())
// Mac mini（Tailscale Funnel経由）は回線が細いので、2MB超の /api/monitor を圧縮して返す
app.use(compression())
app.use(express.json({ limit: '50kb' }))

const API_KEY = process.env.API_KEY
if (!API_KEY) { console.error('環境変数 API_KEY が設定されていません'); process.exit(1) }

// ── 門番（2026-11-20 SEC-06）：Funnelでインターネットに公開されているため、鍵（x-api-key）の無い要求は全て401にする ──
// 例外は Slack受信の入口 POST /slack-reply だけ（中身の合言葉 secret は claude proxy 側が確認する）。
// 画面（Vercel）は Vercel側の中継関数が鍵を付けて読む。フック・定期タスク報告は自分で鍵を付けて送る。
const keyOk = k => typeof k === 'string' && k.length === API_KEY.length && timingSafeEqual(Buffer.from(k), Buffer.from(API_KEY))
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/slack-reply') return next()
  if (keyOk(req.headers['x-api-key'])) return next()
  res.status(401).json({ error: 'unauthorized' })
})

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
  { id: 'matsumoto',name: 'ハル',       role: '秘書',               commands: ['/ceo', '/standup'] },
]

// セッションを唯一の稼働根拠にする。運用APIは既存のまま維持する。
installMonitor(app, { apiKey: API_KEY, members: MEMBERS })
// 死活監視の結果（公開画面用。VPSのhealthcheckが1時間ごとに書き出すJSONを読む）
installHealthStatus(app)
// 各マシンの定期タスク予定（収集スクリプト integrations/schedule_report.py が10分ごとに送る）
installSchedules(app, { apiKey: API_KEY })
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
app.use('/assets', express.static(path.join(projectRoot, 'assets'), { dotfiles: 'deny' }))
app.get('/', (_, res) => res.sendFile(path.join(projectRoot, 'index.html')))
app.get('/overview.html', (_, res) => res.sendFile(path.join(projectRoot, 'overview.html')))
app.get('/schedules.html', (_, res) => res.sendFile(path.join(projectRoot, 'schedules.html')))
app.get('/office.html', (_, res) => res.sendFile(path.join(projectRoot, 'office.html')))
app.get('/projects.html', (_, res) => res.sendFile(path.join(projectRoot, 'projects.html')))

// ── POST /api/proxy — claude proxy（:3002）への中継 ──
// Slack返信（Vercel → 本サーバー）を claude proxy へ渡す。
// 2026-10-17〜 本サーバーも claude proxy も Mac mini で動く（VPS解約）。同じマシンの :3002 へ渡す。
const CLAUDE_PROXY_URL = process.env.CLAUDE_PROXY_URL || 'http://100.75.127.75:3002' // claude proxy はTailscaleのアドレスだけで待ち受ける
app.post('/api/proxy', async (req, res) => {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  const { path, body: proxyBody } = req.body
  if (!path) return res.status(400).json({ error: 'missing path' })
  try {
    const resp = await fetch(`${CLAUDE_PROXY_URL}${path}`, {
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

// ── POST /slack-reply — Slack返信（Vercel hotel-cleaning-app → Funnel → 本サーバー）を claude proxy の /slack-reply へそのまま渡す ──
// 2026-11-07 追加。本番の route.ts は SLACK_REPLY_URL 未設定時に Funnel の /slack-reply へ直接送るため、ここが無いと404で止まっていた。
// 合言葉（secret）の確認は claude proxy 側が行う。ここでは中身を変えずに渡すだけ。
app.post('/slack-reply', async (req, res) => {
  try {
    const resp = await fetch(`${CLAUDE_PROXY_URL}/slack-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
      signal: AbortSignal.timeout(10000),
    })
    res.status(resp.status).send(await resp.text())
  } catch (e) {
    res.status(502).json({ error: e.message })
  }
})

// /api/deploy・/api/vps-file はVPS専用だったため2026-10-17のMac mini移行で削除（外部公開するのでファイル書き込み・コマンド実行の口を残さない）

const PORT = process.env.PORT || 3001
app.listen(PORT, process.env.HOST || '127.0.0.1', () => console.log(`Agent monitor server running on :${PORT}`))
