# エージェントモニター

Codex と Claude Code の作業通知、プロジェクトの次の行動、自動処理の予定をまとめるモニター。業務ハブは `/overview.html`、既存の組織図は `/`、旧オフィスは `/office.html` です。

## 業務ハブ（2026-11-06追加）

`/overview.html` で「今、何を確認して次に何をするか」を選びます。

- 監視異常・期限超過・確認待ち・資料の更新確認を理由付きで表示。休止案件は初期表示と要対応の集計から除きます。
- 次の行動をカードの主役にし、目的・現在の状況・相談窓口・確認日・参照資料・関連リンクを詳細で表示します。
- 作業通知はプロジェクト名の完全一致で関連付けます。対応が不明な通知を特定案件に無理に紐付けません。「応答完了」は業務完了へ変換しません。
- 定期タスクは新鮮な収集結果の次回予定を表示します。予定時刻は実行成功の証明ではありません。
- 「注目」はこのブラウザだけに保存。正本のタスク状態は変更しません。共有が必要な進捗は既存の管理シート・朝会・資料へ反映します。
- 「AIへの引き継ぎ」は目的・現状・次の行動・確認根拠をコピーします。クリップボードが使えない場合は手動コピー欄を表示します。外部への送信やAIの自動実行は行いません。
- `/overview.html?project=<id>` で詳細を直接表示。`?demo=1` は架空データでネットワーク通信なし。実データとは明示して区別します。

### 判定とデータ更新

公開概要の正本は `assets/project-catalog.js`。`id` は固定し、`current`・`next`・`reference`・`checked` を根拠のある記録に合わせて更新します。`checked` は `YYYY-MM-DD`、14日を超えた記録は更新確認の対象です。`owner` は相談窓口であり、仕事が実際に割り当てられた証拠ではありません。任意の `blocked`・`due` は根拠がある時だけ設定します。売上金額・スタッフ個人情報・鍵・内部絶対パス・生の会話本文はカタログに追加しません。

監視は2時間、定期タスク収集は30分を鮮度の基準にします。取得失敗・不正応答・未来時刻は未確認扱い。取得できた監視項目に警告がなくても、未監視の業務・欠けた項目まで正常とは扱いません。

## 構成

- `overview.html` / `assets/overview*.js` / `assets/overview.css`: 業務ハブと判定ロジック。
- `assets/project-catalog.js`: 両画面で共有する公開用プロジェクト概要と監視項目の対応。
- `index.html`: 5部門の組織図を主表示にしたダッシュボード。経営企画部の下にコンテンツ制作・ホテル運営・開発・インフラの4部門を表示し、各部署に役割・所属メンバー・受信した作業をまとめます。5秒更新、部署・サービス・状態・検索で絞り込み、履歴表示。
- `server/monitor-api.js`: 共通イベントAPIと旧クライアント互換API。
- `server/monitor-store.js`: セッション履歴の永続保存。最新500セッション、各100履歴。
- `integrations/`: 両クライアントの通知と設定移行。
- `server/server.js`: APIサーバー。既存の朝会・通知用管理APIも利用しているため、単独用途として削除・置換しない。
- `scripts/build.mjs`: 公開用のHTMLと顔アイコンを `public/` にコピー。サーバーコードや履歴ファイルは公開しない。
- `assets/avatars/`: 旧オフィスの12人を引き継いだSVG顔アイコン。`node scripts/build-avatars.mjs` で再生成。

部署内の人物カードには顔・役割・具体的な作業状態・現在の作業・直近の完了内容を表示します。人物を選ぶとその担当の作業に絞り込めます。「進行中・確認待ち」と「完了した作業」は別に表示し、同じ会話で次の依頼を始めても前の完了内容を残します。

`/?demo=1#organization-title` は、記事執筆・調査・レビューなどの架空の作業例を表示する見た目確認用です。黄色のデモ案内を常時表示し、サーバーへの取得・送信は行いません。実データへ戻るリンクで通常表示に戻れます。

## 表示の意味

| 状態 | 意味 |
|---|---|
| 作業中 | 開始・ツール活動を受信したセッション |
| 応答待ち | 承認待ち、中断、セッション開始・終了など |
| 応答完了 | Stop通知を受信。依頼全体が成功したという意味ではない |
| エラー | 明示的な応答失敗通知 |
| 通知途絶・要確認 | 非終端セッションから5分通知なし。長時間の推論・実行も含み、失敗や完了とは断定しない |

受付担当は作業フォルダ名からの推定。組織図の12名は役割の定義であり、12エージェントが稼働しているという意味ではありません。部長の作業を理由に部下を稼働扱いにはしません。部署別の状態・件数は受信したセッションだけから集計します。旧クライアントからの通知はサービス名を推測せず「不明」とします。

通知に含まれるスキル名・限定的なファイルパス情報から工程を判定した場合、担当は「推定」と表示します。明示的な担当指定と区別し、名前だけで執筆中などと決めつけません。停止・応答完了通知で具体的な作業名が消えないよう保持します。完了記録は新しい判定方式で受信したものを最大100件表示し、旧データの応答完了も現在の状態から補完します。

## ローカル起動・テスト

Node.js 20以上、Python 3。実際の認証キーはリポジトリへ保存しないでください。

```sh
cd server
npm ci
npm test
python3 -m unittest discover -s ../integrations -p 'test_*.py'
API_KEY=local-test-only PORT=4317 MONITOR_STATE_FILE=/tmp/agent-monitor-local-test.json npm start
```

ローカル確認は `http://localhost:4317/`。テスト用のキー・履歴は本番へ使用しません。

## 接続と保存

`POST /api/events` は既存の `x-api-key` 認証を使用。`GET /api/monitor` は表示用の限定情報を返します。プロンプト、応答本文、コマンド、ツール引数、絶対パスを新しい通知から送信しません。公開画面にはプロジェクト末尾名・状態・操作名・受付担当・セッションIDが表示されます。

履歴は既定で `data/sessions.json` に保存（`MONITOR_STATE_FILE` で変更可）。単一プロセス運用。原子的なファイル置換を行い、壊れた履歴を黙って空にせず起動エラーにします。バックアップ対象に含めてください。

フック導入手順は [integrations/README.md](integrations/README.md)。初回はdry-run、サーバーのv2稼働確認後に適用します。既存の認証キーを変更せず使う移行方法を用意しています。Codexのフック信頼はユーザーによる確認が必要です。

## 公開先と反映

公開先: https://claude-agent-monitor.vercel.app 。Gitは `codex/agent-monitor-v2` を使用します。既存変更を保持し、`git reset --hard` は使いません。

2026年10月17日以降、APIサーバーは **Mac mini** の `~/agent-monitor-server/`、launchd `com.kazuma.agent-monitor` で稼働します。VercelからTailscale Funnelを経由して既存APIへ転送します。VPSは廃止済みなので旧サーバーに配置しません。

画面変更は `node scripts/build.mjs` で静的公開物を検証し、コミット・push後に既存プロジェクトへ `vercel --prod --yes`。今回の業務ハブは既存APIだけを使うため、Mac miniの再起動・キー変更・API追加は不要です。APIサーバーから直接HTMLを配る場合のみ、`server.js` の `/overview.html` ルートと画面ファイルを同期します。

サーバー変更が必要な場合は現行ファイルと履歴のバックアップを取ってから対象ファイルを反映し、稼働を確認します。認証キー・状態ファイルを公開物へ入れないでください。

## プロジェクト概要

`/projects.html` は資料に基づくプロジェクト一覧。`assets/project-catalog.js` で目的・現在の状況・次の行動・確認資料を管理します。リアルタイムの稼働監視とは別です。方針変更時は該当項目と確認日を更新して再公開してください。AI支配人は客室タブレットとは別（2026-10-05本人確認）。タスク「スタッフ向けLINE Bot構築」と別フォルダの接続進捗から、運用・拡充中として更新済み。採用は正社員募集終了・アルバイト受付継続。X運用・八丈島メディア・年金のホンネTVの休止方針は維持します。

## 自動の稼働状況（死活監視の表示）

プロジェクト概要の各事業カードに「✅正常／⚠️要対応／⏸休止中」と「最終確認 ◯分前」を自動表示し、ページ上部に「要対応 N件」をまとめます。⚠️の項目は警告文（直し方つき）も出ます。休止・凍結・休眠の事業はグレーの参考表示で、要対応には数えません。

- 元データ: Mac mini の `healthcheck.sh --monitor`（`common/daily-morning/`）が毎時17分に実行し、`~/daily-morning/health-status.json` に書き出す（launchd は `com.kazuma.healthcheck-monitor`）。Slack には何も送らない。
- API: `GET /api/health-status`（認証なし・公開画面用）。`server/health-status.js` がJSONを読み、URL・内部パス・トークン状の文字列を除去して返す。ファイルの場所は環境変数 `HEALTH_STATUS_FILE`（旧既定値はVPSパスのため、Mac miniでは環境変数で指定）。
- 監視自体の停止検知: ファイルの生成時刻が2時間以上前なら `monitor.state = "stale"`（ファイルが無い／壊れていれば `"missing"`）。画面は「監視自体が止まっています」を出し、個別の状態は最新扱いにしない。
- 画面: `assets/project-catalog.js` の `MONITOR_HEALTH_MAP`（事業カード名 → 監視項目ID）で紐づけ。項目を足したら healthcheck.sh 側のIDとここを揃える。5分ごとに再取得。
- テスト: `server/health-status.test.js`（`npm test`）。
- 反映: サーバー変更時のみMac miniへ配置・launchdを再起動。画面側は `vercel --prod --yes`。

## 定期タスク・予定（/schedules.html）

登録済みマシン（Mac mini / MacBook等）の「次にいつ何が動くか」を一覧にするページ。`?demo=1` で架空データの表示。

- 収集: `integrations/schedule_report.py`（標準ライブラリのみ、Python 3.9以上）。Claudeデスクトップの予定タスク（`scheduled-tasks.json`）、`~/Library/LaunchAgents/com.kazuma.*`・`com.obsidian.*`、crontab（Linuxは `/etc/cron.d/*` も）を読み、次回3回分の時刻と日本語の予定文を `POST /api/schedules` へ送る。コマンド・パス・引数は送らない（名前は内蔵の対応表、または `--labels` のJSONで日本語化。未知の処理は「定期処理（スクリプト名）」）。`#PAUSED` などコメントアウトされた行は対象外。通信失敗時も無言で終了コード0。
- 確認: `python3 integrations/schedule_report.py --host-label "Mac mini" --dry-run`（送信せずJSONを表示）。
- API: `POST /api/schedules`（`x-api-key` 認証、ホスト名40字・100タスク・next_runs 5件まで、未知の項目は拒否）。マシンごとに最新1件だけを `SCHEDULES_STATE_FILE`（既定 `data/schedules.json`）へ原子的に保存、最大10台。`GET /api/schedules` は認証なし。
- 画面: 次の予定15件のタイムライン、マシン別カード、最終取得（30分超で警告）、同じ処理が複数マシンで同時刻に動く設定の警告。60秒ごとに更新。
- 導入（各マシンで10分ごと）。キーは `MONITOR_API_KEY` 環境変数、または `--legacy-config`（フックと同じ `API_KEY="..."` 形式のファイル）で渡す:

```sh
# cron（VPS・Linux）
*/10 * * * * MONITOR_API_KEY=... /usr/bin/python3 /path/to/integrations/schedule_report.py --host-label "VPS"

# launchd（Mac）: StartInterval=600 の ~/Library/LaunchAgents/com.kazuma.schedule-report.plist を作り、
# ProgramArguments に /usr/bin/python3, schedule_report.py のパス, --host-label "Mac mini", --legacy-config <設定ファイル> を指定
```

- テスト: `python3 -m unittest discover -s integrations -p 'test_*.py'` と `server/schedules.test.js`。反映: サーバーは `schedules.js`・`server.js` を Mac mini へ配置して再起動、画面は再デプロイ。

### 定期タスク予定表の設置状況（2026-10-17移行後）

| マシン | 実行方法 | 収集スクリプトの置き場所 | 認証キー |
|---|---|---|---|
| Mac mini | `~/Library/LaunchAgents/com.kazuma.schedule-report.plist`（600秒ごと） | `~/.agent-monitor/schedule_report.py` | `~/.agent-monitor/legacy_key.sh` |
| MacBook | 同上 | `~/.agent-monitor/schedule_report.py` | `~/.claude/hooks/monitor_hook.sh` |

`integrations/schedule_report.py` を直したら稼働中の各マシンの置き場所へコピーし直す（launchd は `~/Downloads` 配下を読めないことがあるため、リポジトリから直接は実行しない）。新しい定期処理を足したら `DEFAULT_LABELS` に日本語名を追加する。
