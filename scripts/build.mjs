import { mkdirSync, copyFileSync, cpSync } from 'node:fs'
mkdirSync('public', { recursive: true })
for (const file of ['index.html', 'office.html', 'projects.html']) copyFileSync(file, `public/${file}`)
cpSync('assets', 'public/assets', { recursive: true })
console.log('公開用の画面と顔アイコンを準備しました。')
