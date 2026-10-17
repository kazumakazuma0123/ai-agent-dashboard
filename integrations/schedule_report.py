#!/usr/bin/env python3
"""各マシンの定期タスク（Claudeの予定タスク / launchd / cron）の予定をモニターへ送る。標準ライブラリのみ。

コマンド・引数・パス・秘密は送らない。送るのは日本語の名前・予定の文章・次回時刻だけ。
通信に失敗しても何も出力せず終了コード0で終わる（cron/launchdから安全に呼べる）。
"""
import argparse
import datetime as dt
import glob
import json
import os
import plistlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_URL = 'https://claude-agent-monitor.vercel.app'
NEXT_RUN_COUNT = 3

DEFAULT_LABELS = {
    'launchd:com.kazuma.daily-morning': '朝会ブリーフをSlackに投稿',
    'launchd:com.kazuma.daily-morning-weekly-close': '週次締めのリマインド',
    'launchd:com.kazuma.weekly-brief-refresh': '週次ブリーフを再生成',
    'launchd:com.kazuma.healthcheck-monitor': '死活監視',
    'launchd:com.kazuma.sauna-review-upload': 'サウナ広告の確認用YouTubeアップ監視',
    'launchd:com.kazuma.claude-proxy': 'Slack返信の応答サーバー',
    'launchd:com.obsidian.gitpull': 'Obsidian Vaultの同期（git pull）',
    'script:daily-morning.sh': '朝会ブリーフをSlackに投稿',
    'script:weekly-brief-refresh.sh': '週次ブリーフを再生成',
    'script:healthcheck.sh': '死活監視',
    'script:daily-slack-report.sh': 'HOTEL SUI 日次Slackレポート',
    'claude:youtube-post-publish-monitor': 'YouTube公開後モニタリング（お財布ガードマン）',
}
# OS・パッケージが入れる /etc/cron.d の定期処理は本人の予定ではないので表示しない
SYSTEM_CRON_FILES = {'e2scrub_all', 'sysstat', 'popularity-contest', 'anacron', 'php', 'certbot',
                     'mdadm', 'zfsutils-linux', 'john', '.placeholder'}
WEEKLY_CLOSE_LABEL = '週次締めのリマインド'

# ---------- cron式 ----------
FIELD_RANGES = [(0, 59), (0, 23), (1, 31), (1, 12), (0, 7)]
MONTH_NAMES = {n: i + 1 for i, n in enumerate('jan feb mar apr may jun jul aug sep oct nov dec'.split())}
DOW_NAMES = {n: i for i, n in enumerate('sun mon tue wed thu fri sat'.split())}
JP_DOW = '日月火水木金土'
MACROS = {'@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *',
          '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *'}


def parse_field(text, index):
    """cronの1項目を数値の集合にする。不正なら ValueError。"""
    lo, hi = FIELD_RANGES[index]
    names = MONTH_NAMES if index == 3 else DOW_NAMES if index == 4 else {}
    values = set()
    for part in text.split(','):
        if not part:
            raise ValueError('empty')
        step = 1
        if '/' in part:
            part, step_text = part.split('/', 1)
            step = int(step_text)
            if step < 1:
                raise ValueError('step')
        if part == '*':
            start, end = lo, hi
        elif '-' in part:
            a, b = part.split('-', 1)
            start, end = num(a, names), num(b, names)
        else:
            start = num(part, names)
            end = hi if step != 1 else start
        if start < lo or end > hi or start > end:
            raise ValueError('range')
        values.update(range(start, end + 1, step))
    if index == 4:
        values = {v % 7 for v in values}
    return values


def num(text, names):
    text = text.lower()
    return names[text] if text in names else int(text)


class CronSpec:
    def __init__(self, expr):
        parts = expr.split()
        if len(parts) != 5:
            raise ValueError('fields')
        self.expr = ' '.join(parts)
        self.fields = parts
        self.sets = [parse_field(p, i) for i, p in enumerate(parts)]
        self.dom_star = parts[2].startswith('*')
        self.dow_star = parts[4].startswith('*')

    def day_matches(self, day):
        mins, hours, doms, months, dows = self.sets
        if day.month not in months:
            return False
        dom_ok = day.day in doms
        dow_ok = (day.isoweekday() % 7) in dows
        if self.dom_star or self.dow_star:
            return dom_ok and dow_ok
        return dom_ok or dow_ok  # cron標準: 日と曜日が両方指定ならOR

    def next_runs(self, after, count=NEXT_RUN_COUNT, horizon_days=400):
        found = []
        day = after.replace(hour=0, minute=0, second=0, microsecond=0)
        for _ in range(horizon_days):
            if self.day_matches(day):
                for h in sorted(self.sets[1]):
                    for m in sorted(self.sets[0]):
                        candidate = day.replace(hour=h, minute=m)
                        if candidate > after:
                            found.append(candidate)
                            if len(found) >= count:
                                return found
            day += dt.timedelta(days=1)
        return found


def hhmm(h, m):
    return '%d:%02d' % (h, m)


def day_text(spec):
    f = spec.fields
    months = '' if f[3] == '*' else '・'.join(str(v) for v in sorted(spec.sets[3])) + '月の'
    dom_text = dow_text = None
    if not spec.dom_star:
        dom_text = '毎月' + '・'.join(str(v) for v in sorted(spec.sets[2])) + '日'
    if not spec.dow_star:
        d = sorted(spec.sets[4])
        if d == [1, 2, 3, 4, 5]:
            dow_text = '平日'
        elif d == [0, 6]:
            dow_text = '土日'
        elif d == list(range(7)):
            dow_text = '毎日'
        else:
            dow_text = '毎週' + '・'.join(JP_DOW[v] for v in d) + '曜'
    if dom_text and dow_text:
        return months + dom_text + 'または' + dow_text
    return months + (dom_text or dow_text or '毎日')


def schedule_text(spec):
    """cron式を日本語の短い文章にする。例: 毎日 7:00 / 毎週月曜 6:30 / 3時間ごと（毎時20分）。"""
    f = spec.fields
    mins, hours = sorted(spec.sets[0]), sorted(spec.sets[1])
    day = day_text(spec)
    step_min = re.fullmatch(r'(?:\*|0-59)/(\d+)', f[0])
    step_hour = re.fullmatch(r'(?:\*|0-23)/(\d+)', f[1])
    if step_min and f[1] == '*':
        time = '%s分ごと' % step_min.group(1)
    elif f[0] == '*' and f[1] == '*':
        time = '毎分'
    elif step_hour and len(mins) == 1:
        time = '%s時間ごと（毎時%d分）' % (step_hour.group(1), mins[0])
    elif f[1] == '*' and len(mins) == 1:
        time = '毎時%d分' % mins[0]
    elif len(hours) * len(mins) <= 4 and f[1] != '*':
        time = '・'.join(hhmm(h, m) for h in hours for m in mins)
    elif len(hours) * len(mins) > 4 and f[1] != '*' and len(mins) == 1:
        time = '%d:%02d〜%d:%02d の間（%d回）' % (hours[0], mins[0], hours[-1], mins[0], len(hours))
    else:
        return '定期（%s）' % spec.expr
    if day == '毎日' and ('ごと' in time or time.startswith('毎')):
        return time
    return day + ' ' + time


# ---------- 名前 ----------
def sanitize_name(text, limit=60):
    return re.sub(r'[^A-Za-z0-9_.-]', '', text or '')[:limit]


def stem(text):
    base = sanitize_name(text)
    return base.rsplit('.', 1)[0] if '.' in base else base


def display_name(key, fallback_name, labels):
    """labels(ファイル) > 既定の対応表 > fallback の順で日本語名を決める。"""
    for source in (labels, DEFAULT_LABELS):
        if isinstance(source, dict):
            value = source.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:80]
    return fallback_name


def unknown_name(base):
    return '定期処理（%s）' % (stem(base) or '不明')


# ---------- 収集: Claudeデスクトップの予定タスク ----------
def parse_iso(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.astimezone()


def collect_claude(now, labels, home):
    pattern = str(home / 'Library/Application Support/Claude/claude-code-sessions/*/*/scheduled-tasks.json')
    tasks, seen = [], set()
    for path in sorted(glob.glob(pattern)):
        try:
            data = json.loads(Path(path).read_text())
        except (OSError, ValueError):
            continue
        for item in data.get('scheduledTasks', []) if isinstance(data, dict) else []:
            try:
                task = claude_task(item, now, labels)
            except (ValueError, TypeError, KeyError, AttributeError):
                continue
            if task and task['id'] not in seen:
                seen.add(task['id'])
                tasks.append(task)
    return tasks


def claude_task(item, now, labels):
    raw_id = sanitize_name(str(item['id']), 80)
    if not raw_id:
        return None
    key = 'claude:' + raw_id
    spec = CronSpec(item['cronExpression'])
    enabled = bool(item.get('enabled', True))
    shown = item.get('displayName')
    name = display_name(key, shown.strip()[:80] if isinstance(shown, str) and shown.strip() else raw_id, labels)
    last = parse_iso(item.get('lastRunAt'))
    return dict(id=key, name=name, kind='claude', schedule_text=schedule_text(spec),
                next_runs=[t.isoformat() for t in spec.next_runs(now)] if enabled else [],
                last_run=last.astimezone().replace(microsecond=0).isoformat() if last else None, enabled=enabled)


# ---------- 収集: launchd ----------
def interval_text(seconds):
    if seconds % 3600 == 0:
        return '%d時間ごと' % (seconds // 3600)
    if seconds % 60 == 0:
        return '%d分ごと' % (seconds // 60)
    return '%d秒ごと' % seconds


def calendar_expr(entry):
    def get(key):
        value = entry.get(key)
        return str(int(value)) if isinstance(value, int) and not isinstance(value, bool) else '*'
    weekday = get('Weekday')
    return ' '.join([get('Minute'), get('Hour'), get('Day'), get('Month'), weekday])


def collect_launchd(now, labels, home):
    tasks = []
    patterns = ['com.kazuma.*.plist', 'com.obsidian.*.plist']
    for pattern in patterns:
        for path in sorted(glob.glob(str(home / 'Library/LaunchAgents' / pattern))):
            try:
                with open(path, 'rb') as handle:
                    plist = plistlib.load(handle)
                task = launchd_task(plist, Path(path).stem, now, labels)
            except Exception:
                continue
            if task:
                tasks.append(task)
    return tasks


def launchd_task(plist, filename_stem, now, labels):
    if not isinstance(plist, dict) or plist.get('Disabled') is True:
        return None
    label = sanitize_name(str(plist.get('Label') or filename_stem), 100)
    if not label:
        return None
    key = 'launchd:' + label
    name = display_name(key, unknown_name(label), labels)
    calendar = plist.get('StartCalendarInterval')
    interval = plist.get('StartInterval')
    base = dict(id=key, name=name, last_run=None, enabled=True)
    if calendar:
        entries = calendar if isinstance(calendar, list) else [calendar]
        specs = [CronSpec(calendar_expr(e)) for e in entries if isinstance(e, dict)]
        if not specs:
            return None
        texts = []
        for s in specs:
            t = schedule_text(s)
            if t not in texts:
                texts.append(t)
        runs = sorted(r for s in specs for r in s.next_runs(now))[:NEXT_RUN_COUNT]
        return dict(base, kind='launchd', schedule_text='／'.join(texts)[:80], next_runs=[r.isoformat() for r in runs])
    if isinstance(interval, int) and not isinstance(interval, bool) and interval > 0:
        return dict(base, kind='launchd', schedule_text=interval_text(interval), next_runs=[])
    if plist.get('KeepAlive') or plist.get('RunAtLoad'):
        text = '常駐プロセス' if plist.get('KeepAlive') else '起動時に実行'
        return dict(base, kind='常駐', schedule_text=text, next_runs=[])
    return None


# ---------- 収集: cron ----------
ENV_LINE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*=')
SCRIPT_TOKEN = re.compile(r'[^\s;&|<>"\']+\.(?:sh|py|js|mjs|rb|pl)\b')
SHELL_WORDS = {'bash', 'sh', 'zsh', 'python', 'python3', 'node', 'flock', 'env', 'nice', 'cd', 'time'}


def command_basename(command):
    match = SCRIPT_TOKEN.search(command)
    if match:
        return sanitize_name(match.group(0).rsplit('/', 1)[-1])
    for token in command.split():
        if ENV_LINE.match(token) or token.startswith('-') or token in SHELL_WORDS:
            continue
        return sanitize_name(token.rsplit('/', 1)[-1])
    return ''


def parse_crontab(text, system=False):
    """crontab本文から有効な行だけを (式, コマンド) で返す。コメント行（#PAUSED等）と環境変数行は除く。"""
    entries = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or ENV_LINE.match(line.split()[0]):
            continue
        parts = line.split(None, 1)
        if parts[0].startswith('@'):
            expr = MACROS.get(parts[0].lower())
            rest = parts[1] if len(parts) > 1 else ''
            if parts[0].lower() == '@reboot':
                expr = '@reboot'
            if not expr:
                continue
        else:
            fields = line.split(None, 5)
            if len(fields) < 6:
                continue
            expr, rest = ' '.join(fields[:5]), fields[5]
        if system:  # /etc/cron.d はユーザー名欄がある
            pieces = rest.split(None, 1)
            if len(pieces) < 2:
                continue
            rest = pieces[1]
        entries.append((expr, rest))
    return entries


def cron_tasks(entries, now, labels, used_ids=None):
    tasks = []
    used = used_ids if used_ids is not None else set()
    for expr, command in entries:
        base = command_basename(command)
        close = 'WEEKLY_CLOSE_REMINDER=1' in command
        key = 'script:' + base
        fallback = unknown_name(base)
        name = WEEKLY_CLOSE_LABEL if close and base == 'daily-morning.sh' else display_name(key, fallback, labels)
        task_id = ('cron:%s:%s' % (base or 'unknown', expr))[:120]
        suffix = 2
        while task_id in used:
            task_id = ('cron:%s:%s#%d' % (base or 'unknown', expr, suffix))[:120]
            suffix += 1
        used.add(task_id)
        if expr == '@reboot':
            tasks.append(dict(id=task_id, name=name, kind='cron', schedule_text='起動時に実行', next_runs=[], last_run=None, enabled=True))
            continue
        try:
            spec = CronSpec(expr)
        except (ValueError, KeyError):
            continue
        tasks.append(dict(id=task_id, name=name, kind='cron', schedule_text=schedule_text(spec)[:80],
                          next_runs=[t.isoformat() for t in spec.next_runs(now)], last_run=None, enabled=True))
    return tasks


def collect_cron(now, labels):
    entries = []
    try:
        result = subprocess.run(['crontab', '-l'], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            entries += parse_crontab(result.stdout)
    except (OSError, subprocess.SubprocessError):
        pass
    if sys.platform.startswith('linux'):
        for path in sorted(glob.glob('/etc/cron.d/*')):
            if Path(path).name in SYSTEM_CRON_FILES:
                continue
            try:
                entries += parse_crontab(Path(path).read_text(), system=True)
            except OSError:
                continue
    return cron_tasks(entries, now, labels)


# ---------- 送信 ----------
def auth_key(legacy_config=None):
    key = os.environ.get('MONITOR_API_KEY') or os.environ.get('VPS_API_KEY')
    if key or not legacy_config:
        return key
    try:
        contents = Path(legacy_config).expanduser().read_text()
        # 代入の文字列だけを読む。シェル設定は実行しない。
        match = re.search(r'''(?m)^\s*(?:export\s+)?API_KEY\s*=\s*(["'])([a-zA-Z0-9_./+\-=]+)\1\s*(?:#.*)?$''', contents)
        return match.group(2) if match else None
    except OSError:
        return None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def send(url, key, payload, timeout=5):
    req = urllib.request.Request(url, json.dumps(payload, ensure_ascii=False).encode(),
                                 {'Content-Type': 'application/json', 'x-api-key': key}, method='POST')
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=timeout) as response:
        return 200 <= response.status < 300


def valid_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('localhost', '127.0.0.1', '::1')):
        return False
    return not (parsed.username or parsed.password or parsed.query or parsed.fragment)


def load_labels(path):
    if not path:
        return {}
    try:
        data = json.loads(Path(path).expanduser().read_text())
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def build_payload(host_label, now, labels, home=None):
    home = home or Path.home()
    tasks = []
    for collector in (lambda: collect_claude(now, labels, home), lambda: collect_launchd(now, labels, home), lambda: collect_cron(now, labels)):
        try:
            tasks += collector()
        except Exception:
            continue
    tasks = tasks[:100]
    return dict(host=host_label[:40], collected_at=now.isoformat(), tasks=tasks)


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--host-label', required=True)
    parser.add_argument('--url', default=DEFAULT_URL)
    parser.add_argument('--legacy-config')
    parser.add_argument('--labels')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args(argv)
    try:
        now = dt.datetime.now().astimezone().replace(microsecond=0)
        payload = build_payload(args.host_label, now, load_labels(args.labels))
        if args.dry_run:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
            return 0
        key = auth_key(args.legacy_config)
        if key and valid_url(args.url):
            send(args.url.rstrip('/') + '/api/schedules', key, payload)
    except Exception:
        pass  # モニター側の不調で、呼び出し元（cron/launchd）を失敗させない
    return 0


if __name__ == '__main__':
    sys.exit(main())
