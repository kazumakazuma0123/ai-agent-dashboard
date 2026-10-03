import { mkdirSync, copyFileSync } from 'node:fs'
mkdirSync('public', { recursive: true })
for (const file of ['index.html', 'office.html']) copyFileSync(file, `public/${file}`)
console.log('公開用の画面2ファイルを準備しました。')
