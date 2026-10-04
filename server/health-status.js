import fs from 'node:fs'

// VPS の死活監視（/root/daily-morning/healthcheck.sh --monitor）が1時間ごとに書き出すJSONを、
// 公開画面向けに整えて返す。秘密・内部パス・URL・長いトークン状の文字列は出さない。
export const STALE_AFTER_MINUTES = 120
const STATUSES = new Set(['ok', 'warn', 'skip', 'error'])

// 公開してよい形に整える（URL・パス・トークンらしい長い英数字列を除去し、長さを制限）
export function sanitizeText(value, max = 300) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\x00-\x1f]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/(?:^|[\s（(])\/(?:root|etc|home|var|usr|tmp|opt)\/[^\s）)、。]*/g, ' ')
    .replace(/\b(?:xox[a-z]-|sk-|ghp_|AKIA)[A-Za-z0-9_-]*/g, '')
    .replace(/[A-Za-z0-9_-]{32,}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)
}

function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = sanitizeText(raw.id, 60)
  if (!id) return null
  const last = typeof raw.lastSuccessAt === 'string' && !Number.isNaN(Date.parse(raw.lastSuccessAt)) ? raw.lastSuccessAt : null
  return {
    id,
    label: sanitizeText(raw.label, 80),
    category: sanitizeText(raw.category, 20),
    status: STATUSES.has(raw.status) ? raw.status : 'error',
    message: sanitizeText(raw.message),
    lastSuccessAt: last,
  }
}

export function buildHealthStatus(filePath, now = Date.now()) {
  const base = { staleAfterMinutes: STALE_AFTER_MINUTES, checkedAt: new Date(now).toISOString() }
  let parsed
  try { parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) }
  catch {
    return { ...base, monitor: { state: 'missing', generatedAt: null, ageMinutes: null }, summary: { ok: 0, warn: 0, error: 0, skip: 0, attention: 0 }, items: [] }
  }
  const generated = Date.parse(parsed?.generatedAt)
  const items = Array.isArray(parsed?.items) ? parsed.items.map(sanitizeItem).filter(Boolean) : []
  if (Number.isNaN(generated)) {
    return { ...base, monitor: { state: 'missing', generatedAt: null, ageMinutes: null }, summary: { ok: 0, warn: 0, error: 0, skip: 0, attention: 0 }, items: [] }
  }
  const ageMinutes = Math.max(0, Math.floor((now - generated) / 60000))
  const summary = { ok: 0, warn: 0, error: 0, skip: 0 }
  for (const item of items) summary[item.status] += 1
  summary.attention = summary.warn + summary.error
  return {
    ...base,
    monitor: { state: ageMinutes >= STALE_AFTER_MINUTES ? 'stale' : 'ok', generatedAt: new Date(generated).toISOString(), ageMinutes },
    summary,
    items,
  }
}

export function installHealthStatus(app, { filePath = process.env.HEALTH_STATUS_FILE || '/root/daily-morning/health-status.json', now = Date.now } = {}) {
  app.get('/api/health-status', (_, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(buildHealthStatus(filePath, now()))
  })
}
