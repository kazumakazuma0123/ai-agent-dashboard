// 旧オフィスのSVGキャラクターから顔アイコンを再利用する。
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'

const html = readFileSync(new URL('../office.html', import.meta.url), 'utf8')
const definitions = html.slice(html.indexOf('const COLORS ='), html.indexOf('const SPRITE_IDLE ='))
const { palettes, characters, mapping } = vm.runInNewContext(
  definitions + ';({palettes:COLORS,characters:MEMBER_SPRITES,mapping:MEMBER_COLORS})',
  {}, { timeout: 1000 },
)
const names = { sato:'ジャック', tanaka:'ニコル', yamada:'アレックス', suzuki:'エマ',
  nakamura:'オリバー', ito:'ソフィー', takahashi:'ルカス', watanabe:'ライアン',
  kobayashi:'イーサン', kato:'レオ', yoshida:'マックス', matsumoto:'ノア' }
const destination = new URL('../assets/avatars/', import.meta.url)
mkdirSync(destination, { recursive:true })
for (const [id, palette] of Object.entries(mapping)) {
  const c = palettes[palette]
  const colors = { h:c.hair, s:c.skin, e:c.eye, t:c.shirt, p:c.pants, o:c.shoes,
    m:'#e07060', g:'#404060', c:'#f0f0f8', k:c.shirt, n:'#d02020', a:'#483068', b:c.hair }
  const pixels = characters[id].working.slice(0, 10).flatMap((row, y) => row.flatMap((pixel, x) =>
    pixel ? [`<rect x="${6+x*4}" y="${4+y*4}" width="4" height="4" fill="${colors[pixel] || pixel}"/>`] : [],
  )).join('')
  writeFileSync(new URL(`${id}.svg`, destination), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" role="img" aria-label="${names[id]}"><title>${names[id]}</title><rect width="48" height="48" rx="12" fill="#eef1eb"/><g shape-rendering="crispEdges">${pixels}</g></svg>\n`)
}
console.log('旧オフィスの12人の顔アイコンを生成しました。')
