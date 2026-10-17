import datetime as dt
import json
import plistlib
import tempfile
import unittest
from pathlib import Path

import schedule_report as sr

NOW = dt.datetime(2026, 10, 17, 11, 35).astimezone()  # 土曜
def at(day, h, m):
    return dt.datetime(2026, 10, day, h, m).astimezone()


class CronTests(unittest.TestCase):
    def runs(self, expr, count=3):
        return sr.CronSpec(expr).next_runs(NOW, count)

    def test_daily(self):
        self.assertEqual(self.runs('0 7 * * *'), [at(18, 7, 0), at(19, 7, 0), at(20, 7, 0)])

    def test_step_hours(self):
        self.assertEqual(self.runs('20 */3 * * *', 2), [at(17, 12, 20), at(17, 15, 20)])

    def test_weekly_monday_and_sunday_seven(self):
        self.assertEqual(self.runs('30 6 * * 1', 1), [at(19, 6, 30)])
        self.assertEqual(self.runs('0 9 * * 7', 1), [at(18, 9, 0)])  # 7 = 日曜

    def test_list_range_step(self):
        self.assertEqual(self.runs('0,30 8-9 * * 1-5', 3), [at(19, 8, 0), at(19, 8, 30), at(19, 9, 0)])
        self.assertEqual(self.runs('*/30 12 * * *', 3), [at(17, 12, 0), at(17, 12, 30), at(18, 12, 0)])

    def test_dom_dow_or_semantics(self):
        # 18日(日) か 月曜 のどちらか
        self.assertEqual(self.runs('0 0 18 * 1', 2), [at(18, 0, 0), at(19, 0, 0)])
        # 片方が * なら AND
        self.assertEqual(self.runs('0 0 * * 1', 1), [at(19, 0, 0)])

    def test_names_and_invalid(self):
        self.assertEqual(self.runs('0 0 * * mon', 1), [at(19, 0, 0)])
        for bad in ('61 * * * *', '* * * *', '*/0 * * * *', 'a b c d e', '5-1 * * * *'):
            with self.assertRaises(ValueError):
                sr.CronSpec(bad)

    def test_schedule_text(self):
        text = lambda e: sr.schedule_text(sr.CronSpec(e))
        self.assertEqual(text('0 7 * * *'), '毎日 7:00')
        self.assertEqual(text('30 6 * * 1'), '毎週月曜 6:30')
        self.assertEqual(text('20 */3 * * *'), '3時間ごと（毎時20分）')
        self.assertEqual(text('*/30 * * * *'), '30分ごと')
        self.assertEqual(text('17 * * * *'), '毎時17分')
        self.assertEqual(text('0 9 * * 1-5'), '平日 9:00')
        self.assertEqual(text('0 7,19 * * *'), '毎日 7:00・19:00')
        self.assertEqual(text('0 10 1 * *'), '毎月1日 10:00')
        self.assertEqual(text('0 9 * * 1,3,5'), '毎週月・水・金曜 9:00')


class LaunchdTests(unittest.TestCase):
    def task(self, plist, name='com.kazuma.x'):
        return sr.launchd_task(plist, name, NOW, {})

    def test_calendar_dict_and_weekday_sunday(self):
        t = self.task({'Label': 'com.kazuma.daily-morning', 'StartCalendarInterval': {'Hour': 7, 'Minute': 0}})
        self.assertEqual(t['schedule_text'], '毎日 7:00')
        self.assertEqual(t['name'], '朝会ブリーフをSlackに投稿')
        self.assertEqual(t['next_runs'][0], at(18, 7, 0).isoformat())
        t = self.task({'Label': 'com.kazuma.w', 'StartCalendarInterval': {'Hour': 9, 'Minute': 0, 'Weekday': 0}})
        self.assertEqual(t['next_runs'][0], at(18, 9, 0).isoformat())

    def test_calendar_list_merges_sorted(self):
        t = self.task({'Label': 'com.kazuma.y', 'StartCalendarInterval': [{'Hour': 20, 'Minute': 0}, {'Hour': 8, 'Minute': 0}]})
        self.assertEqual(t['next_runs'][:2], [at(17, 20, 0).isoformat(), at(18, 8, 0).isoformat()])
        self.assertIn('／', t['schedule_text'])

    def test_interval_and_resident_and_disabled(self):
        t = self.task({'Label': 'com.obsidian.gitpull', 'StartInterval': 300})
        self.assertEqual((t['schedule_text'], t['next_runs'], t['kind']), ('5分ごと', [], 'launchd'))
        self.assertEqual(self.task({'Label': 'com.kazuma.claude-proxy', 'KeepAlive': True})['kind'], '常駐')
        self.assertEqual(self.task({'Label': 'com.kazuma.r', 'RunAtLoad': True})['schedule_text'], '起動時に実行')
        self.assertIsNone(self.task({'Label': 'com.kazuma.d', 'Disabled': True, 'StartInterval': 60}))
        self.assertIsNone(self.task({'Label': 'com.kazuma.n'}))

    def test_collect_only_own_prefixes(self):
        with tempfile.TemporaryDirectory() as d:
            agents = Path(d) / 'Library/LaunchAgents'
            agents.mkdir(parents=True)
            for name in ('com.kazuma.a', 'com.obsidian.b', 'com.google.c'):
                (agents / (name + '.plist')).write_bytes(plistlib.dumps({'Label': name, 'StartInterval': 600, 'ProgramArguments': ['/secret/path']}))
            tasks = sr.collect_launchd(NOW, {}, Path(d))
            self.assertEqual([t['id'] for t in tasks], ['launchd:com.kazuma.a', 'launchd:com.obsidian.b'])
            self.assertNotIn('secret', json.dumps(tasks))


class LabelTests(unittest.TestCase):
    def test_sanitize_and_unknown(self):
        self.assertEqual(sr.sanitize_name('../../etc/pass wd;rm -rf.sh'), '....etcpasswdrm-rf.sh')
        self.assertEqual(sr.unknown_name('my script!.sh'), '定期処理（myscript）')
        self.assertEqual(sr.unknown_name(''), '定期処理（不明）')

    def test_labels_file_overrides(self):
        self.assertEqual(sr.display_name('script:healthcheck.sh', 'x', {}), '死活監視')
        self.assertEqual(sr.display_name('script:healthcheck.sh', 'x', {'script:healthcheck.sh': '独自名'}), '独自名')


class CrontabTests(unittest.TestCase):
    TEXT = '''SHELL=/bin/bash
PATH=/usr/bin:/bin
# 普通のコメント
#PAUSED-20261004 0 8 * * * /root/x-poster/run.sh
# DISABLED 0 9 * * * /root/y.sh
0 7 * * * /root/daily-morning/daily-morning.sh >> /root/daily-morning/cron.log 2>&1
30 6 * * 1 /root/daily-morning/weekly-brief-refresh.sh
0 18 * * 5 WEEKLY_CLOSE_REMINDER=1 /root/daily-morning/daily-morning.sh
*/10 * * * * cd /root/foo && ./mystery tool.py --token abc
'''

    def test_parse_skips_comments_and_env(self):
        entries = sr.parse_crontab(self.TEXT)
        self.assertEqual([e[0] for e in entries], ['0 7 * * *', '30 6 * * 1', '0 18 * * 5', '*/10 * * * *'])

    def test_tasks_labels_and_no_paths(self):
        tasks = sr.cron_tasks(sr.parse_crontab(self.TEXT), NOW, {})
        self.assertEqual([t['name'] for t in tasks][:3], ['朝会ブリーフをSlackに投稿', '週次ブリーフを再生成', '週次締めのリマインド'])
        self.assertEqual(tasks[3]['name'], '定期処理（tool）')
        blob = json.dumps(tasks, ensure_ascii=False)
        for forbidden in ('/root', 'token', 'abc', 'cron.log'):
            self.assertNotIn(forbidden, blob)
        self.assertEqual(len({t['id'] for t in tasks}), 4)

    def test_cron_d_user_field(self):
        text = '0 7 * * * root /root/daily-morning/healthcheck.sh --monitor\n'
        entries = sr.parse_crontab(text, system=True)
        self.assertEqual(entries[0], ('0 7 * * *', '/root/daily-morning/healthcheck.sh --monitor'))
        self.assertEqual(sr.cron_tasks(entries, NOW, {})[0]['name'], '死活監視')

    def test_macros_and_reboot(self):
        tasks = sr.cron_tasks(sr.parse_crontab('@daily /a/b.sh\n@reboot /a/c.sh\n'), NOW, {})
        self.assertEqual(tasks[0]['schedule_text'], '毎日 0:00')
        self.assertEqual(tasks[1]['schedule_text'], '起動時に実行')


class ClaudeAndPayloadTests(unittest.TestCase):
    def test_claude_task(self):
        item = {'id': 'abc', 'displayName': '朝のまとめ', 'cronExpression': '0 7 * * *', 'enabled': True, 'lastRunAt': '2026-10-16T22:00:05.123Z', 'prompt': 'SECRET'}
        t = sr.claude_task(item, NOW, {})
        self.assertEqual((t['name'], t['kind'], t['last_run']), ('朝のまとめ', 'claude', '2026-10-17T07:00:05+09:00'))
        self.assertNotIn('SECRET', json.dumps(t))
        item['enabled'] = False
        self.assertEqual(sr.claude_task(item, NOW, {})['next_runs'], [])
        item.pop('displayName')
        self.assertEqual(sr.claude_task(item, NOW, {'claude:abc': '日本語名'})['name'], '日本語名')

    def test_main_never_fails_without_key(self):
        import os
        for k in ('MONITOR_API_KEY', 'VPS_API_KEY'):
            os.environ.pop(k, None)
        self.assertEqual(sr.main(['--host-label', 'T', '--url', 'http://127.0.0.1:1']), 0)

    def test_auth_key_legacy_file(self):
        import os
        for k in ('MONITOR_API_KEY', 'VPS_API_KEY'):
            os.environ.pop(k, None)
        with tempfile.NamedTemporaryFile('w', suffix='.env') as f:
            f.write('export API_KEY="abc-123"\n'); f.flush()
            self.assertEqual(sr.auth_key(f.name), 'abc-123')


if __name__ == '__main__':
    unittest.main()
