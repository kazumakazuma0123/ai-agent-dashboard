import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import fcntl
import hashlib
import time
from unittest.mock import patch

import monitor_hook as hook
import install_hooks as installer

class HooksTests(unittest.TestCase):
    def payload(self, event='PostToolUse'):
        return dict(hook_event_name=event, session_id='session', cwd='/private/user/project',
                    tool_name='Bash', tool_use_id='tool-1', tool_input={'command': 'SECRET'},
                    prompt='SECRET', tool_response='SECRET', last_assistant_message='SECRET')

    def test_privacy_and_deduplication(self):
        event = hook.normalized(self.payload(), 'codex')
        self.assertNotIn('SECRET', json.dumps(event))
        self.assertNotIn('/private', json.dumps(event))
        self.assertEqual(event['event_id'], hook.normalized(self.payload(), 'codex')['event_id'])
        self.assertNotEqual(event['event_id'], hook.normalized(self.payload(), 'claude')['event_id'])
        self.assertNotIn('tool', hook.normalized(self.payload('PreToolUse'), 'codex'))

    def test_lifecycle_and_subagent(self):
        for name, expected in [('Stop', 'completed'), ('Interrupt', 'waiting'), ('SessionEnd', 'waiting'), ('PostToolUseFailure', 'activity')]:
            self.assertEqual(hook.normalized(self.payload(name), 'codex')['event'], expected)
        payload = self.payload('SubagentStop')
        payload['agent_id'] = 'child'
        self.assertEqual(hook.normalized(payload, 'codex')['session_id'], 'session:child')

    def test_safe_legacy_key(self):
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {}, clear=True):
            path = Path(tmp) / 'old.sh'
            path.write_text('API_KEY="abc-123"\n')
            self.assertEqual(hook.auth_key(path), 'abc-123')
            path.write_text('API_KEY="$(touch /tmp/unsafe)"\n')
            self.assertIsNone(hook.auth_key(path))
            with patch.dict(os.environ, {'MONITOR_API_KEY': 'preferred'}):
                self.assertEqual(hook.auth_key(path), 'preferred')

    def test_queue_retry_and_expiry(self):
        with tempfile.TemporaryDirectory() as tmp:
            event = hook.normalized(self.payload(), 'codex')
            def fail(*args):
                raise OSError('offline')
            hook.deliver(event, 'https://example.com', 'key', tmp, fail)
            self.assertEqual(len(list(Path(tmp).rglob('*.json'))), 1)
            sent = []
            def success(url, key, event, timeout):
                sent.append(event)
                return True
            hook.deliver(event, 'https://example.com', 'key', tmp, success)
            self.assertEqual(len(sent), 1)
            self.assertEqual(len(list(Path(tmp).rglob('*.json'))), 0)

    def test_queue_cap_expiry_and_busy_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            url = 'https://example.com'
            directory = Path(tmp) / hashlib.sha256((url + '/api/events').encode()).hexdigest()[:16]
            directory.mkdir()
            for number in range(205):
                (directory / f'{number:03}.json').write_text('{}')
            expired = directory / 'expired.json'
            expired.write_text('{}')
            os.utime(expired, (time.time() - 90000, time.time() - 90000))
            event = hook.normalized(self.payload(), 'codex')
            hook.deliver(event, url, 'key', tmp, lambda *args: False)
            self.assertFalse(expired.exists())
            self.assertEqual(len(list(directory.glob('*.json'))), 200)
            with (directory / 'drain.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                hook.deliver(event, url, 'key', tmp, lambda *args: self.fail('lock bypassed'))
            self.assertTrue((directory / (event['event_id'] + '.json')).exists())

    def test_insecure_destination_and_missing_key(self):
        with tempfile.TemporaryDirectory() as tmp:
            event = hook.normalized(self.payload(), 'codex')
            def fail(*args):
                self.fail('should not send')
            hook.deliver(event, 'http://example.com', 'key', tmp, fail)
            hook.deliver(event, 'https://example.com', None, tmp, fail)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_stop_outage_never_blocks(self):
        result = subprocess.run([sys.executable, hook.__file__, '--source', 'codex', '--url', 'http://127.0.0.1:1'],
                                input=json.dumps(self.payload('Stop')), text=True, capture_output=True,
                                env={**os.environ, 'MONITOR_API_KEY': '' , 'VPS_API_KEY': ''}, timeout=3)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), '{}')

    def test_installer_preserves_other_settings_and_is_idempotent(self):
        original = {'permissions': {'allow': ['Read']}, 'hooks': {'Stop': [{'matcher': '*', 'hooks': [
            {'type': 'command', 'command': 'sh /old/monitor_hook.sh'},
            {'type': 'command', 'command': 'echo safe'}]}]}}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / '.claude/settings.json'
            path.parent.mkdir()
            path.write_text(json.dumps(original))
            installer.install(tmp, 'claude', 'https://example.com')
            self.assertEqual(json.loads(path.read_text()), original)
            installer.install(tmp, 'claude', 'https://example.com', True)
            actual = json.loads(path.read_text())
            self.assertEqual(actual['permissions'], original['permissions'])
            self.assertEqual(actual['hooks']['Stop'][0]['hooks'][0]['command'], 'echo safe')
            self.assertFalse(installer.install(tmp, 'claude', 'https://example.com', True)['changed'])
            self.assertEqual(len(list(path.parent.glob('*.monitor-backup-*'))), 1)

if __name__ == '__main__':
    unittest.main()
