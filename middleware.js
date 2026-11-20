// 画面と読み取りAPIの門番（2026-11-20 SEC-06）。
// - 閲覧: 一度だけ「?k=<MONITOR_VIEW_KEY>」付きURLを開くと、1年有効のCookieが付き、以後はURLだけで見られる。
// - フック等の送信: x-api-key を付けた要求はそのまま通す（鍵の正しさはMac mini側が判定する）。
// - それ以外は 401。
export const config = { matcher: '/:path*' }

const COOKIE = 'mon_view'

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function readCookie(req, name) {
  const raw = req.headers.get('cookie') || ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return ''
}

function pass() {
  return new Response(null, { headers: { 'x-middleware-next': '1' } })
}

export default async function middleware(req) {
  const viewKey = process.env.MONITOR_VIEW_KEY
  if (!viewKey) return new Response('monitor locked', { status: 503 })

  if (req.headers.get('x-api-key')) return pass()

  const expected = await sha256Hex('mon-view:' + viewKey)
  if (readCookie(req, COOKIE) === expected) return pass()

  const url = new URL(req.url)
  if (url.searchParams.get('k') === viewKey) {
    url.searchParams.delete('k')
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.pathname + (url.search || ''),
        'Set-Cookie': `${COOKIE}=${expected}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
        'Cache-Control': 'no-store',
      },
    })
  }

  return new Response('この画面は閲覧用リンクから開いてください。', {
    status: 401,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
