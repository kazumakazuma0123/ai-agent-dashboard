# Codex / Claude Code 接続

Python 3 標準ライブラリだけを使います。`monitor_hook.py` はプロンプト・応答・コマンド・ファイル内容・絶対パスを送信せず、作業状態と作業フォルダの末尾名だけを送ります。`Stop` は「応答完了」であり、依頼全体の成功を保証する表示ではありません。ツールエラーは作業継続扱いです。

```sh
python3 integrations/install_hooks.py
python3 integrations/install_hooks.py --apply
```

既定は変更予定のみ表示。適用時は既存設定のバックアップを作り、`monitor_hook.sh` / `monitor_hook.py` のハンドラーだけを置換します。他の設定・フックを保ち、信頼記録や環境変数を変更しません。Codex は適用後に `/hooks` で新しいフックを確認・信頼する必要があります。アプリ／CLIの再起動が必要な場合があります。

認証は既存の `MONITOR_API_KEY`、次に `VPS_API_KEY` を使用します。移行時は `--legacy-config /絶対パス/monitor_hook.sh` で旧スクリプトの `API_KEY="固定値"` を読み取れます。旧スクリプトは実行しません。キーを引数・設定JSON・出力へ書き出しません。

通信失敗時はローカルの非公開キューに残し、次のフックで再送します（最大200件、24時間、1回約1.5秒）。同じ送信先だけに再送し、リダイレクトは追跡しません。アダプタの障害はエージェントを止めません。認証キー未設定時は送信しません。継続的な heartbeat は送らないため、長い無通信はサーバー側で接続状態不明として扱います。

```sh
python3 -m unittest discover -s integrations -p 'test_*.py'
```

参考: [Codex Hooks](https://learn.chatgpt.com/docs/hooks) / [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
