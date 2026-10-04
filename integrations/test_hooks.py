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

    def test_inferred_writing_and_research_metadata(self):
        data = self.payload('PreToolUse')
        data.update(tool_name='Write', tool_input={'file_path': '/home/user/ppc/drafts/articles/a.md', 'content': 'SECRET'})
        event = hook.normalized(data, 'codex')
        self.assertEqual((event['stage'], event['member_id'], event['assignment']), ('writing', 'yamada', 'inferred'))
        self.assertNotIn('tool', event)
        self.assertNotIn('SECRET', json.dumps(event))
        data.update(tool_name='Read', tool_input={'file_path': '/home/user/ppc/cases/介護美容研究所/research/a.md'})
        event = hook.normalized(data, 'claude')
        self.assertEqual(event['project'], '介護美容研究所')
        self.assertEqual(event['member_id'], 'tanaka')
        self.assertNotIn('/home', json.dumps(event))

    def test_skill_exact_match_and_unknown_preserves_previous_metadata(self):
        data = self.payload()
        data.update(tool_name='Skill', tool_input={'skill': '/write', 'args': 'SECRET'})
        self.assertEqual(hook.normalized(data, 'claude')['stage'], 'writing')
        for name in ('Stop', 'UserPromptSubmit', 'SessionEnd', 'Interrupt'):
            event = hook.normalized(self.payload(name), 'codex')
            for field in ('task', 'stage', 'member_id', 'assignment'):
                self.assertNotIn(field, event)
        self.assertNotIn('stage', hook.normalized(self.payload(), 'codex'))
        data['tool_input']['skill'] = '/write secret prompt'
        self.assertNotIn('stage', hook.normalized(data, 'claude'))

    def test_secret_paths_never_drive_assignment(self):
        data = self.payload()
        data.update(tool_name='Edit', tool_input={'file_path': '/home/user/credentials/articles/secret.md'})
        event = hook.normalized(data, 'codex')
        self.assertNotIn('stage', event)
        self.assertNotIn('credentials', json.dumps(event))
        data.update(hook_event_name='SubagentStart', agent_id='child', agent_type='yamada')
        self.assertEqual(hook.normalized(data, 'codex')['member_id'], 'yamada')
        data['agent_type'] = 'custom SECRET'
        self.assertNotIn('member_id', hook.normalized(data, 'codex'))

    def test_project_only_sent_for_start_or_specific_case(self):
        for name in ('SessionStart', 'UserPromptSubmit'):
            self.assertEqual(hook.normalized(self.payload(name), 'codex')['project'], 'project')
        for name in ('PreToolUse', 'PostToolUse', 'Stop', 'Interrupt', 'SessionEnd'):
            self.assertNotIn('project', hook.normalized(self.payload(name), 'codex'))
        data = self.payload('PreToolUse')
        data.update(tool_name='Read', tool_input={'file_path': '/workspace/ppc/cases/案件A/research/info.md'})
        self.assertEqual(hook.normalized(data, 'codex')['project'], '案件A')

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

    def test_ai_written_labels_and_department_prefix(self):
        data = self.payload('PreToolUse')
        data.update(tool_name='Bash', tool_input={'command': 'SECRET', 'description': 'Fetch live monitor API'})
        event = hook.normalized(data, 'claude')
        self.assertEqual(event['task'], 'Fetch live monitor API')
        self.assertNotIn('SECRET', json.dumps(event))
        data.update(tool_name='Agent', tool_input={'prompt': 'SECRET', 'description': '【ホテル運営部】OTA説明文の見直し'})
        event = hook.normalized(data, 'claude')
        self.assertEqual((event['task'], event['member_id'], event['assignment']),
                         ('【ホテル運営部】OTA説明文の見直し', 'nakamura', 'explicit'))
        self.assertNotIn('SECRET', json.dumps(event))
        # Post通知や説明文のないツールは作業名を送らず、直前の表示を保つ
        data.update(hook_event_name='PostToolUse')
        self.assertNotIn('task', hook.normalized(data, 'claude'))

    def test_unsafe_labels_are_dropped(self):
        for text in ('Read /Users/kazuma/.env', 'Set API key for x', 'curl https://example.com/a',
                     'send to someone@example.com', 'token abcdefghijklmnopqrstuvwxyz123456'):
            self.assertIsNone(hook.work_label(text))
        self.assertEqual(len(hook.work_label('あ' * 100)), 60)

    def test_subagent_inherits_label_from_parent_agent_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent = self.payload('PreToolUse')
            parent.update(tool_name='Agent', tool_input={'description': '【経営企画部】矛盾監査'})
            hook.attach_agent_label(parent, hook.normalized(parent, 'claude'), tmp)
            child = dict(hook_event_name='SubagentStart', session_id='session', agent_id='child', cwd='/x/bizdev')
            event = hook.normalized(child, 'claude')
            hook.attach_agent_label(child, event, tmp)
            self.assertEqual((event['session_id'], event['task'], event['member_id']),
                             ('session:child', '【経営企画部】矛盾監査', 'matsumoto'))
            other = hook.normalized(child, 'claude')
            hook.attach_agent_label(child, other, tmp)
            self.assertNotIn('member_id', other)

if __name__ == '__main__':
    unittest.main()
