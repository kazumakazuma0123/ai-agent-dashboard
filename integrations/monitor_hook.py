#!/usr/bin/env python3
"""Privacy-minimal, advisory hook adapter. Standard library only."""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.request
import urllib.parse
import uuid

EVENTS = {
    'SessionStart': ('waiting', 'セッション開始'),
    'UserPromptSubmit': ('start', '依頼を処理中'),
    'PreToolUse': ('activity', 'ツールを実行中'),
    'PostToolUse': ('activity', 'ツール実行済み'),
    'PostToolUseFailure': ('activity', 'ツールエラー・処理継続中'),
    'Stop': ('completed', '応答完了'),
    'StopFailure': ('failed', '応答エラー'),
    'Interrupt': ('waiting', '中断'),
    'SessionEnd': ('waiting', 'セッション終了'),
    'PermissionRequest': ('waiting', '承認待ち'),
    'SubagentStart': ('start', 'サブエージェント作業中'),
    'SubagentStop': ('completed', 'サブエージェント応答完了'),
}

def normalized(data, source):
    name = data.get('hook_event_name')
    if name not in EVENTS or not isinstance(data.get('session_id'), str):
        return None
    session = data['session_id'][:200]
    if name.startswith('Subagent'):
        if not data.get('agent_id'):
            return None
        session += ':' + str(data['agent_id'])[:100]
    event, description = EVENTS[name]
    cwd = data.get('cwd') if isinstance(data.get('cwd'), str) else ''
    project = Path(cwd).name[:80] or '未指定'
    if re.search(r'(?i)(secret|credential|token|\.env)', project):
        project = '非公開プロジェクト'
    ident = data.get('tool_use_id')
    event_id = hashlib.sha256(f'{source}:{session}:{name}:{ident}'.encode()).hexdigest() if ident else str(uuid.uuid4())
    result = dict(source=source, session_id=session, event_id=event_id, event=event,
                  timestamp=dt.datetime.now(dt.timezone.utc).isoformat(), project=project,
                  task=description, description=description)
    # Never forward tool arguments, output, prompts, transcript paths or absolute cwd.
    if name in ('PostToolUse', 'PostToolUseFailure'):
        tool = data.get('tool_name', '')
        if isinstance(tool, str) and re.fullmatch(r'[\w.:-]{1,120}', tool):
            result['tool'] = tool
    return result

def auth_key(legacy_config=None):
    key = os.environ.get('MONITOR_API_KEY') or os.environ.get('VPS_API_KEY')
    if key or not legacy_config:
        return key
    try:
        contents = Path(legacy_config).expanduser().read_text()
        # Literal assignments only. Never execute or source a shell configuration.
        match = re.search(r'''(?m)^\s*(?:export\s+)?API_KEY\s*=\s*(["'])([a-zA-Z0-9_./+\-=]+)\1\s*(?:#.*)?$''', contents)
        return match.group(2) if match else None
    except OSError:
        return None

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def send(url, key, event, timeout):
    req = urllib.request.Request(url, json.dumps(event, ensure_ascii=False).encode(),
                                 {'Content-Type': 'application/json', 'x-api-key': key}, method='POST')
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=timeout) as response:
        return 200 <= response.status < 300

def deliver(event, url, key, queue_dir, sender=send):
    """Durable individual files avoid losing concurrent arrivals; lock serializes drains."""
    if not key:
        return
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1')):
        return
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        return
    endpoint = url.rstrip('/') + '/api/events'
    # Separate destinations so pending events never migrate to another server.
    directory = Path(queue_dir).expanduser() / hashlib.sha256(endpoint.encode()).hexdigest()[:16]
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = directory / (str(uuid.uuid4()) + '.tmp')
    with os.fdopen(os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
        json.dump(event, handle, ensure_ascii=False)
    temporary.replace(directory / (event['event_id'] + '.json'))
    with (directory / 'drain.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        files = sorted(directory.glob('*.json'), key=lambda p: p.stat().st_mtime)
        now = time.time()
        for path in files:
            if path.stat().st_mtime < now - 86400:
                path.unlink(missing_ok=True)
        files = [p for p in files if p.exists()]
        for path in files[:-200]:
            path.unlink(missing_ok=True)
        deadline = time.monotonic() + 1.5
        for path in files[-200:][:8]:
            budget = deadline - time.monotonic()
            if budget <= 0:
                break
            try:
                pending = json.loads(path.read_text())
                if sender(endpoint, key, pending, budget):
                    path.unlink(missing_ok=True)
                else:
                    break
            except (ValueError, OSError, TimeoutError):
                break

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, choices=['codex', 'claude'])
    parser.add_argument('--url', required=True)
    parser.add_argument('--legacy-config')
    parser.add_argument('--queue-dir', default='~/.cache/agent-monitor/queue')
    args = parser.parse_args()
    name = None
    try:
        data = json.load(sys.stdin)
        if isinstance(data, dict):
            name = data.get('hook_event_name')
            event = normalized(data, args.source)
            if event:
                deliver(event, args.url, auth_key(args.legacy_config), args.queue_dir)
    except Exception:
        # A monitor outage must never alter the agent's execution.
        pass
    finally:
        if name in ('Stop', 'SubagentStop'):
            print('{}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
