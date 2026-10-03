#!/usr/bin/env python3
"""Preview by default; preserve unrelated hooks, permissions, and trust records."""
import argparse
import copy
import datetime as dt
import json
import os
from pathlib import Path
import shlex
import shutil
import sys
import tempfile

COMMON = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
          'PermissionRequest', 'Stop', 'SessionEnd', 'SubagentStart', 'SubagentStop']

def is_monitor(handler):
    if handler.get('type') != 'command':
        return False
    try:
        return any(Path(token).name in ('monitor_hook.sh', 'monitor_hook.py')
                   for token in shlex.split(handler.get('command', '')))
    except ValueError:
        return False

def configure(original, source, command):
    result = copy.deepcopy(original)
    hooks = result.setdefault('hooks', {})
    for name, groups in list(hooks.items()):
        kept = []
        for group in groups:
            handlers = group.get('hooks', [])
            remaining = [h for h in handlers if not is_monitor(h)]
            if remaining or not handlers:
                group['hooks'] = remaining
                kept.append(group)
        if kept:
            hooks[name] = kept
        else:
            del hooks[name]
    events = COMMON + (['Interrupt'] if source == 'codex' else ['PostToolUseFailure', 'StopFailure'])
    for name in events:
        hooks.setdefault(name, []).append({'hooks': [{'type': 'command', 'command': command, 'timeout': 3}]})
    return result

def install(home, source, url, apply=False, legacy_config=None):
    home = Path(home).expanduser().resolve()
    path = home / ('.codex/hooks.json' if source == 'codex' else '.claude/settings.json')
    original = json.loads(path.read_text()) if path.exists() else {}
    adapter = Path(__file__).resolve().with_name('monitor_hook.py')
    command = shlex.join([sys.executable, str(adapter), '--source', source, '--url', url,
                          '--queue-dir', str(home / '.cache/agent-monitor/queue')])
    if legacy_config:
        command += ' ' + shlex.join(['--legacy-config', str(Path(legacy_config).expanduser().resolve())])
    updated = configure(original, source, command)
    changed = updated != original
    if apply and changed:
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.exists():
            stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            backup = path.with_name(path.name + '.monitor-backup-' + stamp)
            shutil.copy2(path, backup)
            backup.chmod(0o600)
        fd, temp = tempfile.mkstemp(dir=path.parent, prefix='.monitor-')
        try:
            with os.fdopen(fd, 'w') as handle:
                json.dump(updated, handle, ensure_ascii=False, indent=2)
                handle.write('\n')
            os.replace(temp, path)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
    return {'file': str(path), 'changed': changed, 'applied': bool(apply and changed),
            'events': COMMON + (['Interrupt'] if source == 'codex' else ['PostToolUseFailure', 'StopFailure'])}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', default=str(Path.home()))
    parser.add_argument('--source', choices=['codex', 'claude', 'both'], default='both')
    parser.add_argument('--url', default='https://claude-agent-monitor.vercel.app')
    parser.add_argument('--legacy-config')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    sources = ['codex', 'claude'] if args.source == 'both' else [args.source]
    for source in sources:
        print(json.dumps(install(args.home, source, args.url, args.apply, args.legacy_config), ensure_ascii=False))
    if 'codex' in sources:
        print('Codex の /hooks で変更内容を確認し信頼してください。信頼記録は変更していません。')

if __name__ == '__main__':
    main()
