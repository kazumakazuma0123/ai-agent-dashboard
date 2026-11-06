#!/usr/bin/env bash
# 既存のエージェントモニターへ公開し、配信された実ファイルとAPI応答を確認する。
# 通信とローカルポートの利用が許可されたターミナルで実行する。
set -euo pipefail
cd "$(dirname "$0")/.."

release_branch='codex/agent-monitor-v2'
release_origin='https://claude-agent-monitor.vercel.app'

if [ "$(git branch --show-current)" != "$release_branch" ]; then
  echo "公開対象のブランチではありません。$release_branch を確認してください。" >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo '未コミットの変更があります。変更を確認してから公開してください。' >&2
  exit 1
fi

echo '1/5 テストを実行します'
npm --prefix server test
python3 -m unittest discover -s integrations -p 'test_*.py'

echo '2/5 公開ファイルを作成します'
node scripts/build.mjs

echo '3/5 GitHubへ送信します'
git push origin "HEAD:$release_branch"

echo '4/5 既存のVercelプロジェクトへ公開します'
vercel --prod --yes

echo '5/5 本番のファイルとAPIを確認します'
release_tmp=$(mktemp -d "${TMPDIR:-/tmp}/agent-monitor-release.XXXXXX")
trap 'rm -rf "$release_tmp"' EXIT
release_revision=$(git rev-parse --short HEAD)
for release_file in overview.html assets/overview.js assets/overview-model.js assets/project-catalog.js; do
  curl --fail --silent --show-error --max-time 30 \
    "$release_origin/$release_file?verify=$release_revision" -o "$release_tmp/download"
  if ! cmp -s "$release_file" "$release_tmp/download"; then
    echo "本番の $release_file が手元の変更と一致しません。公開成功とは扱いません。" >&2
    exit 1
  fi
done

for release_api in monitor health-status schedules; do
  curl --fail --silent --show-error --max-time 30 \
    "$release_origin/api/$release_api" -o "$release_tmp/$release_api.json"
done
node --input-type=module - "$release_tmp" <<'JS'
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2];
const read = name => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
const monitor = read('monitor'), health = read('health-status'), schedules = read('schedules');
if (!Array.isArray(monitor.sessions) || !Array.isArray(health.items) || !health.monitor || !Array.isArray(schedules.hosts)) {
  throw new Error('APIの形式が想定と異なります。画面の稼働確認が必要です。');
}
console.log('本番ファイル4点の一致と、3種類のAPI応答を確認しました。');
if (health.monitor.state !== 'ok') console.log('監視データは更新確認が必要です。業務ハブの表示を確認してください。');
console.log('https://claude-agent-monitor.vercel.app/overview.html');
JS
