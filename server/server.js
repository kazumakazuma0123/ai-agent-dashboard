import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { execSync, spawn } from 'child_process'

const app = express()
app.use(cors())
app.use(express.json({ limit: '50kb' }))

const API_KEY = process.env.API_KEY || 'REDACTED_API_KEY'

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

// ── ファイルパスから案件名・作業種別を抽出 ──
function describeFilePath(fp) {
  if (!fp) return null
  // 案件名を抽出 (cases/案件名/, lp-案件名 等)
  const caseMatch = fp.match(/cases\/([^/]+)/)
  const lpMatch = fp.match(/lp-([^/]+)/)
  const draftMatch = fp.match(/drafts\/([^/]+)/)
  const caseName = caseMatch ? caseMatch[1] : lpMatch ? lpMatch[1] : draftMatch ? draftMatch[1] : null

  // 作業種別を判定
  const fileName = fp.split('/').pop()
  let action = ''
  if (/research|リサーチ|レギュレーション/.test(fp)) action = 'リサーチ'
  else if (/draft|ドラフト/.test(fp)) action = 'ドラフト'
  else if (/regulation|レギュレーション/.test(fp)) action = 'レギュレーション確認'
  else if (/\.html$/.test(fp)) action = 'LP編集'
  else if (/\.css$/.test(fp)) action = 'スタイル調整'
  else if (/\.js$/.test(fp)) action = 'スクリプト編集'
  else if (/\.md$/.test(fp)) action = 'ドキュメント編集'
  else action = fileName

  if (caseName) return `${caseName} / ${action}`
  return null
}

// ── ツール名の日本語表示 ──
function describeToolUse(tool, input) {
  const fp = input?.file_path || ''
  const cmd = (input?.command || '').slice(0, 60)
  const pat = (input?.pattern || '').slice(0, 40)
  const rich = describeFilePath(fp)

  switch (tool) {
    case 'Write':     return rich ? `${rich} を作成` : `${fp.split('/').pop() || 'ファイル'} を作成`
    case 'Edit':      return rich ? `${rich} を編集` : `${fp.split('/').pop() || 'ファイル'} を編集`
    case 'Read':      return rich ? `${rich} を読み込み` : `${fp.split('/').pop() || 'ファイル'} を読み込み`
    case 'Bash':      return cmd || 'コマンド実行'
    case 'Glob':      return `${pat} を検索`
    case 'Grep':      return `"${pat}" を検索`
    case 'WebFetch':  return input?.url ? `Web取得: ${input.url.slice(0, 50)}` : 'Web取得'
    case 'WebSearch':  return input?.query ? `"${input.query}" を検索` : 'Web検索'
    case 'TodoWrite': return input?.content ? `TODO: ${input.content.slice(0, 40)}` : 'TODOを更新'
    case 'Skill':     return input?.skill ? `/${input.skill}${input.args ? ' ' + input.args.slice(0, 40) : ''} を実行` : 'スキル実行'
    case 'Agent':     return (input?.description || 'サブエージェント起動').slice(0, 60)
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

    // 部下も連動で稼働
    activateSubordinates(member_id, session_id || member_id, command)
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

    // 部長終了 → 部下も連動で idle
    deactivateSubordinates(member_id)
  }

  res.json({ ok: true })
})

// ── スキル名→社員マッピング ──
const SKILL_MEMBER_MAP = {
  article: 'sato', research: 'tanaka', write: 'yamada', direct: 'suzuki',
  hotel: 'nakamura', dev: 'watanabe', infra: 'kato',
  ceo: 'matsumoto', standup: 'matsumoto',
}

// スキル名→日本語タスク説明
const SKILL_DESCRIPTIONS = {
  article:  '記事制作パイプライン',
  research: 'テーマリサーチ',
  write:    '記事執筆',
  direct:   '記事レビュー・校正',
  hotel:    'ホテル運営タスク',
  dev:      'アプリ開発・バグ修正',
  infra:    'インフラ・自動化',
  ceo:      '事業分析・経営企画',
  standup:  '全社朝会・状況確認',
}

// ── Agentツール委任検知用: 社員キーワード ──
const MEMBER_KEYWORDS = {
  kobayashi: ['イーサン', 'kobayashi.md', 'kobayashi', 'エンジニア'],
  ito:       ['ソフィー', 'ito.md', '集客マネージャー'],
  takahashi: ['ルカス', 'takahashi.md', '清掃マネージャー'],
  tanaka:    ['ニコル', 'tanaka.md', 'リサーチャー'],
  yamada:    ['アレックス', 'yamada.md', 'ライター'],
  suzuki:    ['エマ', 'suzuki.md', 'エディター'],
  yoshida:   ['マックス', 'yoshida.md', '自動化エンジニア'],
  // 部長は別ルートで活性化されるので省略
}

// 部長→部下の関係
const DEPARTMENT_MEMBERS = {
  sato:     ['tanaka', 'yamada', 'suzuki'],
  nakamura: ['ito', 'takahashi'],
  watanabe: ['kobayashi'],
  kato:     ['yoshida'],
}

// ── cwd/ファイルパスから部門長を自動判定 ──
// 細かいルールを先に、汎用ルールを後に（先にマッチしたものが優先）
const PATH_MEMBER_RULES = [
  // コンテンツ制作 - 案件別
  { pattern: /cases\/介護美容研究所.*research/,             member: 'sato',     label: '介護美容研究所 / リサーチ' },
  { pattern: /cases\/([^/]+).*research/,                    member: 'sato',     label: null, extract: /cases\/([^/]+)/, suffix: ' / リサーチ' },
  { pattern: /lp-kaigo/,                                    member: 'sato',     label: '介護美容研究所 / LP制作' },
  { pattern: /lp-speak/,                                    member: 'sato',     label: 'Speak / LP制作' },
  { pattern: /lp-([^/]+)/,                                  member: 'sato',     label: null, extract: /lp-([^/]+)/, suffix: ' / LP制作' },
  { pattern: /drafts\//,                                    member: 'sato',     label: '記事ドラフト作成' },
  { pattern: /cases\//,                                     member: 'sato',     label: '案件リサーチ' },
  // ホテル
  { pattern: /sui-room-cre/,                                member: 'watanabe', label: 'SUI清掃アプリ / 開発' },
  { pattern: /hotel-sui/,                                   member: 'nakamura', label: 'HOTEL SUI / 運営' },
  // 開発
  { pattern: /new-project/,                                 member: 'watanabe', label: 'エージェントモニター / 開発' },
  { pattern: /threads-poster/,                              member: 'watanabe', label: 'Threads投稿ツール / 開発' },
  { pattern: /gas\//,                                       member: 'watanabe', label: 'GAS / 開発' },
  // インフラ
  { pattern: /\.claude\/org|\.claude\/commands/,             member: 'kato',     label: '組織設定 / メンテナンス' },
  { pattern: /\.claude\//,                                   member: 'kato',     label: 'Claude設定 / メンテナンス' },
]

function detectMemberFromPath(cwd, filePath) {
  const target = (filePath || '') + ' ' + (cwd || '')
  for (const rule of PATH_MEMBER_RULES) {
    if (rule.pattern.test(target)) {
      // 動的ラベル生成（extract パターンがある場合）
      if (!rule.label && rule.extract) {
        const m = target.match(rule.extract)
        if (m) return { member: rule.member, label: m[1] + (rule.suffix || '') }
      }
      return { member: rule.member, label: rule.label || '作業中' }
    }
  }
  return null
}

// ── デフォルト受付担当（経営企画・ノア） ──
const DEFAULT_RECEIVER = 'matsumoto'

// ── ノアが代表で持っているセッションを適切な社員に引き継ぐ ──
function rerouteFromDefault(sessionId, newMemberId, command, task) {
  const currentMember = sessionMemberMap.get(sessionId)
  if (currentMember !== DEFAULT_RECEIVER) return false
  if (currentMember === newMemberId) return false

  // ノアのセッションを終了
  const defaultState = memberState.get(DEFAULT_RECEIVER)
  sessionMemberMap.delete(sessionId)
  memberSessionMap.delete(DEFAULT_RECEIVER)
  memberState.set(DEFAULT_RECEIVER, {
    ...defaultState,
    status: 'idle',
    command: null,
    task: null,
    last_seen: new Date().toISOString(),
    last_task: {
      command: defaultState.command,
      task: defaultState.task,
      tool_count: defaultState.tool_count,
      started_at: defaultState.started_at,
      ended_at: new Date().toISOString(),
      last_tool: defaultState.last_tool,
      last_desc: defaultState.last_desc,
      history: defaultState.history,
    },
  })

  // 新しい社員にセッションを引き継ぐ
  return autoActivateMember(newMemberId, sessionId, command, task)
}

// セッションで最初にactiveになった社員を記録（セッション終了時のフォールバック用）
function autoActivateMember(memberId, sessionId, command, task) {
  const state = memberState.get(memberId)
  if (!state) return false
  // 既にこのセッションに紐付いていれば何もしない
  if (sessionMemberMap.get(sessionId) === memberId) return true
  // 他のセッションでactive中なら別の社員を探す
  if (state.status === 'active' && memberSessionMap.has(memberId)) return false

  sessionMemberMap.set(sessionId, memberId)
  memberSessionMap.set(memberId, sessionId)
  memberState.set(memberId, {
    ...state,
    status: 'active',
    command: command || state.command,
    task: task || state.task,
    started_at: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    tool_count: 0,
    last_tool: null,
    last_desc: null,
    history: [],
  })

  // 部下も連動で稼働させる
  activateSubordinates(memberId, sessionId, command)

  return true
}

// ── 部長稼働時に部下も連動で active にする ──
function activateSubordinates(memberId, sessionId, command) {
  const subordinates = DEPARTMENT_MEMBERS[memberId]
  if (!subordinates) return
  for (const subId of subordinates) {
    const subState = memberState.get(subId)
    if (!subState) continue
    // 既に他セッションでactive中の部下はスキップ
    if (subState.status === 'active' && memberSessionMap.has(subId)) continue
    const subSessionId = sessionId + ':dept:' + subId
    sessionMemberMap.set(subSessionId, subId)
    memberSessionMap.set(subId, subSessionId)
    memberState.set(subId, {
      ...subState,
      status: 'active',
      command: command || null,
      task: null,
      started_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      tool_count: 0,
      last_tool: null,
      last_desc: null,
      history: [],
    })
  }
}

// ── 部長終了時に部下も連動で idle にする ──
function deactivateSubordinates(memberId) {
  const subordinates = DEPARTMENT_MEMBERS[memberId]
  if (!subordinates) return
  for (const subId of subordinates) {
    const subState = memberState.get(subId)
    if (!subState || subState.status !== 'active') continue
    // 部下のセッションマッピングをクリア
    const subSid = memberSessionMap.get(subId)
    if (subSid) {
      sessionMemberMap.delete(subSid)
      memberSessionMap.delete(subId)
    }
    memberState.set(subId, {
      ...subState,
      status: 'idle',
      command: null,
      task: null,
      last_seen: new Date().toISOString(),
      last_task: {
        command: subState.command,
        task: subState.task,
        tool_count: subState.tool_count,
        started_at: subState.started_at,
        ended_at: new Date().toISOString(),
        last_tool: subState.last_tool,
        last_desc: subState.last_desc,
        history: subState.history,
      },
    })
  }
}

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

  // ── Skillツール検知 → 該当エージェントを自動active化 ──
  if (tool_name === 'Skill' && tool_input?.skill && session_id) {
    const skillName = tool_input.skill
    const targetMember = SKILL_MEMBER_MAP[skillName]
    if (targetMember) {
      const skillDesc = SKILL_DESCRIPTIONS[skillName] || skillName
      const taskDetail = tool_input.args ? `${skillDesc}: ${tool_input.args.slice(0, 60)}` : skillDesc
      // ノアが代表で持っている場合はリルート、そうでなければ通常の活性化
      rerouteFromDefault(session_id, targetMember, '/' + skillName, taskDetail)
      autoActivateMember(targetMember, session_id, '/' + skillName, taskDetail)
      member_id = targetMember
    }
  }

  // ── Agentツール検知 → 委任先の社員を自動active化 ──
  if (tool_name === 'Agent' && session_id) {
    const text = ((tool_input?.description || '') + ' ' + (tool_input?.prompt || '')).slice(0, 500)
    // 親セッションの部長を特定
    const parentMember = sessionMemberMap.get(session_id)
    const parentState = parentMember ? memberState.get(parentMember) : null
    const parentCommand = parentState?.command || null

    // Agentの内容からSkillコマンドを検出 → ノアからリルート
    for (const [skillName, targetMember] of Object.entries(SKILL_MEMBER_MAP)) {
      if (text.includes('/' + skillName) || text.includes(skillName)) {
        rerouteFromDefault(session_id, targetMember, '/' + skillName, null)
        if (!sessionMemberMap.has(session_id)) {
          autoActivateMember(targetMember, session_id, '/' + skillName, null)
          member_id = targetMember
        }
        break
      }
    }

    for (const [mid, keywords] of Object.entries(MEMBER_KEYWORDS)) {
      if (keywords.some(kw => text.includes(kw))) {
        // 委任先を見つけた — 別セッションIDで活性化
        const delegateSessionId = session_id + ':delegate:' + mid
        const task = (tool_input?.description || '').slice(0, 80) || null
        autoActivateMember(mid, delegateSessionId, parentCommand, task)
        break
      }
    }
  }

  // member_id が未指定の場合、セッション→社員マッピングから自動解決
  if (!member_id && session_id) {
    member_id = sessionMemberMap.get(session_id) || null
    // タイムアウトでidleになっていたら即復帰
    if (member_id) {
      const state = memberState.get(member_id)
      if (state && state.status === 'idle') {
        memberState.set(member_id, {
          ...state,
          status: 'active',
          last_seen: new Date().toISOString(),
        })
        // 部下も連動で復帰
        activateSubordinates(member_id, session_id, state.command)
      }
    }
  }

  // ── 初回ツール使用: まだどの社員にも紐付いていないセッション ──
  if (!member_id && session_id) {
    // 1) アクティブだがセッション未紐付けの社員を探す（/api/command start 直後）
    let bestMatch = null
    let bestTime = 0
    for (const [mid, state] of memberState) {
      if (state.status === 'active' && !memberSessionMap.has(mid)) {
        const t = new Date(state.started_at).getTime()
        if (t > bestTime) { bestTime = t; bestMatch = mid }
      }
    }
    if (bestMatch && (Date.now() - bestTime) < 60000) {
      member_id = bestMatch
      sessionMemberMap.set(session_id, member_id)
      memberSessionMap.set(member_id, session_id)
      // 部下も連動で稼働
      const bestState = memberState.get(member_id)
      activateSubordinates(member_id, session_id, bestState?.command)
    }

    // 2) cwd/ファイルパスから部門長を自動判定して活性化
    //    ただし実作業と判断できる場合のみ（同セッション3ツール以上 or Write/Edit操作）
    if (!member_id) {
      const sessionData = sessions.get(session_id)
      const toolCount = sessionData ? sessionData.tool_count : 0
      const isWriteOp = tool_name === 'Write' || tool_name === 'Edit'
      if (toolCount >= 3 || isWriteOp) {
        const filePath = tool_input?.file_path || ''
        const detected = detectMemberFromPath(cwd, filePath)
        if (detected) {
          const activated = autoActivateMember(detected.member, session_id, detected.label, null)
          if (activated) {
            member_id = detected.member
          }
        }
      }
    }

    // 3) フォールバック: ノア（経営企画）が代表で引き受ける
    //    担当が判明次第、rerouteFromDefault で適切な社員に引き継ぐ
    if (!member_id) {
      const activated = autoActivateMember(DEFAULT_RECEIVER, session_id, '受付中（自動振分待ち）', null)
      if (activated) {
        member_id = DEFAULT_RECEIVER
      }
    }
  }

  // ── ノアが代表で持っているセッションのリルート判定 ──
  // パス情報から担当部門が判明したら即引き継ぎ
  if (member_id === DEFAULT_RECEIVER && session_id) {
    const filePath = tool_input?.file_path || ''
    const detected = detectMemberFromPath(cwd, filePath)
    if (detected) {
      const rerouted = rerouteFromDefault(session_id, detected.member, detected.label, null)
      if (rerouted) {
        member_id = detected.member
      }
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

    // 部長がactiveなのに部下がidleなら連動で起動（デプロイ直後等のリカバリ）
    const subs = DEPARTMENT_MEMBERS[member_id]
    if (subs && session_id && subs.some(s => memberState.get(s)?.status !== 'active')) {
      activateSubordinates(member_id, session_id, state.command)
    }
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

  res.json({ ok: true, member_id: member_id || null })
})

// ── GET /api/agents — ダッシュボード用 ──
app.get('/api/agents', (req, res) => {
  const now = Date.now()
  const result = MEMBERS.map(m => {
    const state = memberState.get(m.id)

    // activeステータスの自動タイムアウト（5分操作なし → idle）
    // ※セッション紐付けは維持する（次のツール使用で即復帰できるように）
    let status = state.status
    if (status === 'active' && state.last_seen) {
      const diffSec = (now - new Date(state.last_seen).getTime()) / 1000
      if (diffSec > 300) {
        status = 'idle'
        memberState.set(m.id, {
          ...state,
          status: 'idle',
          // command/taskは維持（復帰時に表示するため）
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
        // タイムアウト時も部下を連動で idle
        deactivateSubordinates(m.id)
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

  // 未紐付けアクティブセッション検知
  const now2 = Date.now()
  const unmappedSessions = [...sessions.values()].filter(s => {
    const elapsed = now2 - new Date(s.last_seen).getTime()
    return !s.member_id && elapsed < 300000 && s.tool_count >= 2
  })

  res.json({
    agents: result,
    unmapped_sessions: unmappedSessions.length,
    unmapped_details: unmappedSessions.map(s => ({
      session_id: s.session_id,
      project: s.project,
      tool_count: s.tool_count,
      last_tool: s.last_tool,
      last_desc: s.last_desc,
      last_seen: s.last_seen,
    })),
  })
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

// ヘルスチェック（異常検知付き）
app.get('/health', (_, res) => {
  const now = Date.now()
  const activeMembers = [...memberState.values()].filter(s => s.status === 'active').length
  const recentSessions = [...sessions.values()].filter(s => now - new Date(s.last_seen).getTime() < 300000)
  const unmappedActive = recentSessions.filter(s => !s.member_id && s.tool_count >= 2)

  const warnings = []
  if (unmappedActive.length > 0 && activeMembers === 0) {
    warnings.push(`${unmappedActive.length}件のアクティブセッションがエージェントに未紐付け`)
  }
  if (unmappedActive.length > 0) {
    warnings.push(`未紐付けセッション: ${unmappedActive.map(s => s.session_id.slice(0, 8) + '(' + s.tool_count + 'tools)').join(', ')}`)
  }

  res.json({
    ok: warnings.length === 0,
    members: MEMBERS.length,
    active_members: activeMembers,
    active_sessions: recentSessions.length,
    unmapped_sessions: unmappedActive.length,
    warnings,
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Agent monitor server running on :${PORT}`))
