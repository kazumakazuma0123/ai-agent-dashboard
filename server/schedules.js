import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

// 各マシン（Mac mini / MacBook / VPS）の定期タスク予定を、マシンごとに最新の1件だけ保存する。
// コマンド・パス・引数は受け付けない（収集側も送らない）。想定外の項目は拒否する。
export const MAX_HOSTS = 10
export const MAX_TASKS = 100
export const MAX_NEXT_RUNS = 5
const KINDS = new Set(['claude', 'launchd', 'cron', '常駐'])
const TASK_KEYS = new Set(['id', 'name', 'kind', 'schedule_text', 'next_runs', 'last_run', 'enabled'])
const BODY_KEYS = new Set(['host', 'collected_at', 'tasks'])
const CONTROL = /[\x00-\x1f\x7f]/

const isIso = value => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value))
const text = (value, max, { required = false } = {}) => {
  if (typeof value !== 'string' || value.length > max || CONTROL.test(value) || (required && !value.trim())) throw new TypeError('invalid text')
  return value
}

export function validateSnapshot(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new TypeError('body must be an object')
  for (const key of Object.keys(body)) if (!BODY_KEYS.has(key)) throw new TypeError(`unexpected field: ${key}`)
  const host = text(body.host, 40, { required: true }).trim()
  if (!isIso(body.collected_at)) throw new TypeError('invalid collected_at')
  if (!Array.isArray(body.tasks) || body.tasks.length > MAX_TASKS) throw new TypeError('invalid tasks')
  const tasks = body.tasks.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('task must be an object')
    for (const key of Object.keys(raw)) if (!TASK_KEYS.has(key)) throw new TypeError(`unexpected task field: ${key}`)
    if (!KINDS.has(raw.kind)) throw new TypeError('invalid kind')
    const nextRuns = raw.next_runs ?? []
    if (!Array.isArray(nextRuns) || nextRuns.length > MAX_NEXT_RUNS || !nextRuns.every(isIso)) throw new TypeError('invalid next_runs')
    if (raw.last_run != null && !isIso(raw.last_run)) throw new TypeError('invalid last_run')
    if (typeof raw.enabled !== 'boolean') throw new TypeError('invalid enabled')
    return {
      id: text(raw.id, 120, { required: true }),
      name: text(raw.name, 80, { required: true }),
      kind: raw.kind,
      schedule_text: text(raw.schedule_text ?? '', 80),
      next_runs: nextRuns.map(v => new Date(v).toISOString()),
      last_run: raw.last_run ? new Date(raw.last_run).toISOString() : null,
      enabled: raw.enabled,
    }
  })
  return { host, collected_at: new Date(body.collected_at).toISOString(), tasks }
}

export class ScheduleStore {
  constructor({ filePath, now = Date.now } = {}) {
    this.filePath = filePath
    this.now = now
    this.hosts = new Map()
    if (filePath && fs.existsSync(filePath)) {
      try {
        const saved = JSON.parse(fs.readFileSync(filePath, 'utf8'))
        if (!Array.isArray(saved.hosts) || saved.hosts.length > MAX_HOSTS) throw new Error('Unsupported schema')
        for (const h of saved.hosts) {
          const snapshot = validateSnapshot({ host: h.host, collected_at: h.collected_at, tasks: h.tasks })
          if (typeof h.received_at !== 'string' || Number.isNaN(Date.parse(h.received_at))) throw new Error('Invalid received_at')
          this.hosts.set(snapshot.host, { ...snapshot, received_at: h.received_at })
        }
      } catch (error) {
        throw new Error(`Cannot load schedules from ${filePath}: ${error.message}`, { cause: error })
      }
    }
  }

  put(body) {
    const snapshot = validateSnapshot(body)
    if (!this.hosts.has(snapshot.host) && this.hosts.size >= MAX_HOSTS) throw new RangeError('too many hosts')
    this.hosts.set(snapshot.host, { ...snapshot, received_at: new Date(this.now()).toISOString() })
    this.persist()
    return snapshot.host
  }

  snapshot() {
    const hosts = [...this.hosts.values()]
      .map(h => ({ host: h.host, received_at: h.received_at, collected_at: h.collected_at, tasks: h.tasks }))
      .sort((a, b) => a.host.localeCompare(b.host))
    return { hosts }
  }

  persist() {
    if (!this.filePath) return
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${randomUUID()}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(this.snapshot()), { mode: 0o600 })
    fs.renameSync(temporary, this.filePath)
  }
}

export function installSchedules(app, { apiKey, store = new ScheduleStore({
  filePath: process.env.SCHEDULES_STATE_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/schedules.json'),
}) } = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new TypeError('API key is required')
  const authorize = (req, res, next) => apiKey && req.headers['x-api-key'] === apiKey ? next() : res.status(401).json({ error: 'unauthorized' })
  app.get('/api/schedules', (_, res) => {
    res.set('Cache-Control', 'no-store')
    res.json(store.snapshot())
  })
  app.post('/api/schedules', authorize, (req, res) => {
    try {
      res.json({ ok: true, host: store.put(req.body) })
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) return res.status(400).json({ error: error.message })
      console.error('schedules error', error.message)
      res.status(500).json({ error: 'internal error' })
    }
  })
  return store
}
