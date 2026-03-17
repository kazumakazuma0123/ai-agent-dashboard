#!/bin/bash
# Claude Code PostToolUse フック
# 設置場所: ~/.claude/hooks/monitor_hook.sh
# 事前に chmod +x しておくこと
#
# ~/.claude/settings.json に以下を追加:
# "hooks": {
#   "PostToolUse": [{
#     "matcher": ".*",
#     "hooks": [{ "type": "command", "command": "bash ~/.claude/hooks/monitor_hook.sh" }]
#   }]
# }

VPS_URL="http://YOUR_VPS_IP:3001"   # ← VPSのIPに変更
API_KEY="YOUR_API_KEY"               # ← server.js と同じキーを設定

INPUT=$(cat)

SESSION=$(echo "$INPUT" | jq -r '.session_id // empty')
TOOL=$(echo "$INPUT"    | jq -r '.tool_name  // empty')
CWD=$(echo "$INPUT"     | jq -r '.cwd        // empty')

# tool_input から必要な部分だけ抽出（大きいデータは送らない）
TOOL_INPUT=$(echo "$INPUT" | jq -c '{
  file_path: (.tool_input.file_path // null),
  command:   ((.tool_input.command  // "") | .[0:80]),
  pattern:   (.tool_input.pattern   // null)
}')

# バックグラウンドで送信（エージェントをブロックしない）
(curl -sf -X POST "$VPS_URL/api/update" \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d "{\"session_id\":\"$SESSION\",\"tool_name\":\"$TOOL\",\"cwd\":\"$CWD\",\"tool_input\":$TOOL_INPUT}" \
  > /dev/null 2>&1) &
