# Codex / Claude Code 接続

Python 3 標準ライブラリだけを使います。`monitor_hook.py` はプロンプト・応答・コマンド・ファイル内容・絶対パスを送信せず、作業状態・作業フォルダの末尾名・AIが書いた短い作業名だけを送ります。`Stop` は「応答完了」であり、依頼全体の成功を保証する表示ではありません。ツールエラーは作業継続扱いです。

作業名は、AIが書いた短い説明文（Agent / Bash の `description`）をそのまま表示します（2026-10-04追加）。依頼文・コマンド本体・ツール引数は送らず、秘密情報らしき文字列（キー・トークン・メールアドレス・URL・絶対パス等）を含む説明文は捨てます。`【ホテル運営部】…` のように先頭に部署名を書くとその部署の担当として表示し、Agent の作業名は子のサブエージェントにも引き継ぎます。それ以外の作業内容は、正確に一致する Skill 名、既知のサブエージェント名、Read/Write/Edit の構造化されたファイルパスから推定します。「記事ドラフトを執筆」「競合情報を調査」「コードを編集」等の固定文と工程・担当候補を送り、`assignment: inferred` で推定と明示します。PPC案件のパスは安全な案件フォルダ名まで使用します。秘密情報を示すパスは推定に使いません。Bashのコマンドを解析したり、プロンプトから担当を推測したりしません。具体的な内容を判定できないフックや Stop は作業名・工程・担当を送らず、直前の具体的な表示を保持します。

作業フォルダ名はセッション・依頼・サブエージェント開始時だけ送ります。その後は具体的なPPC案件名が判明した場合だけプロジェクトを更新し、一般的な操作や応答完了で案件名を上書きしません。開始通知を受信していなければ、案件が判明するまでプロジェクト未指定になります。

```sh
python3 integrations/install_hooks.py
python3 integrations/install_hooks.py --apply
```

既定は変更予定のみ表示。適用時は既存設定のバックアップを作り、`monitor_hook.sh` / `monitor_hook.py` のハンドラーだけを置換します。他の設定・フックを保ち、信頼記録や環境変数を変更しません。Codex は適用後に `/hooks` で新しいフックを確認・信頼する必要があります。アプリ／CLIの再起動が必要な場合があります。

認証は既存の `MONITOR_API_KEY`、次に `VPS_API_KEY` を使用します。移行時は `--legacy-config /絶対パス/monitor_hook.sh` で旧スクリプトの `API_KEY="固定値"` を読み取れます。旧スクリプトは実行しません。キーを引数・設定JSON・出力へ書き出しません。

通信失敗時はローカルの非公開キューに残し、次のフックで再送します（最大200件、24時間、1回約1.5秒）。同じ送信先だけに再送し、リダイレクトは追跡しません。アダプタの障害はエージェントを止めません。認証キー未設定時は送信しません。継続的な heartbeat は送らないため、長い無通信はサーバー側で接続状態不明として扱います。

## Grok Bot 連携（2026-11-17追加）

**Grok経由の判定（monitor_hook.py）**: Claude Code が xAI の「Grok Bot」アプリから起動されたかを、環境変数 `NODE_PATH` に `Grok Bot.app` が含まれるか、無ければ親プロセスを最大8段たどって実行ファイル名に `Grok Bot` が含まれるか（`ps` を1回だけ）で判定します。結果はセッション単位でローカルにキャッシュします。判定できた時だけ固定値 `launcher: "grok"` を送ります。パス・環境変数の中身・プロセス名は送りません。判定失敗時は何も付けず、エージェントを止めません。サーバーは `grok` 以外の値を捨て、一度 Grok経由と分かったセッションは後続イベントでも保持します（表示は「Claude Code（Grok経由）」、`/api/monitor` の `summary.by_launcher.grok` に件数）。

**Grok Bot の稼働状況（schedule_report.py）**: `~/Library/Application Support/Grok Bot/desktop-status.json` だけを読み、`pid` の生死（`os.kill(pid, 0)`）と合わせて `apps: [{id: "grok-bot", name, running, signed_in, app_version, started_at}]` を定期レポートへ足します。同じフォルダの他のファイル（認証情報・Cookie 等）には触れません。ファイルが無いマシンでは `apps` を付けず、読み取り失敗でも定期レポートは止まりません。Grok自身の会話・思考内容は取得しません。画面では定期タスクページ（schedules.html）と業務ハブの「データの届き方」に「稼働中／停止中／未ログイン」と最終確認時刻を出し、レポートが30分以上来ていないマシンは「状況不明」とします。

```sh
python3 -m unittest discover -s integrations -p 'test_*.py'
```

参考: [Codex Hooks](https://learn.chatgpt.com/docs/hooks) / [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
