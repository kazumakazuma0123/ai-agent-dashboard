// 画面（Vercel）→ Mac mini のモニターサーバーへの中継（2026-11-20 SEC-06）。
// Funnelの入口は鍵（x-api-key）が無い要求を拒否する。画面の読み取り（GET）だけは、ここでサーバー側の鍵を付けて中継する。
// フックなどの送信（POST）は、送り主が付けた鍵をそのまま渡す（ここでは鍵を足さない）。
const ORIGIN = process.env.MONITOR_ORIGIN || 'https://onos-mac-mini.tailb3f9c0.ts.net'
const READ_ONLY = new Set(['monitor', 'agents', 'schedules', 'health-status'])

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const rest = url.pathname.replace(/^\/api\//, '')
  const headers = { 'content-type': req.headers['content-type'] || 'application/json' }
  if (req.headers['x-api-key']) headers['x-api-key'] = req.headers['x-api-key']
  else if (req.method === 'GET' && READ_ONLY.has(rest) && process.env.MONITOR_API_KEY) headers['x-api-key'] = process.env.MONITOR_API_KEY
  let body
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body ?? {})
  }
  try {
    const up = await fetch(`${ORIGIN}/api/${rest}${url.search}`, { method: req.method, headers, body, signal: AbortSignal.timeout(28000) })
    const buf = Buffer.from(await up.arrayBuffer())
    res.status(up.status)
    res.setHeader('Content-Type', up.headers.get('content-type') || 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.send(buf)
  } catch (e) {
    res.status(502).json({ error: 'upstream unavailable' })
  }
}
