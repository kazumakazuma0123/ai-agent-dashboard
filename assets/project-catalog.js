'use strict';
// 公開用の概要だけを保持。業務の正本・秘密値・売上金額は含めない。
window.MONITOR_PROJECTS = [
  {
    "name": "ホテル経営管理",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・照合中",
    "purpose": "購入費・固定費・光熱費などをコスト表へ集め、月別の経費と原価を把握する。",
    "routine": "購入品・請求書・固定費を確認時に反映。定期取得の最新成功は別途確認。",
    "current": "実績コスト表の経費・決済手数料・月別損益を更新した記録あり。用途未確認の購入候補と、見込みで置いている費用が残る。",
    "next": "用途未確認の購入候補を確認し、実際の請求書と月別損益を照合する。",
    "reference": "共有進捗の2026年10月29日・ホテル収支 v2.6／損益表の更新記録。現在のシート値は未取得。",
    "id": "hotel-cost",
    "checked": "2026-10-29",
    "owner": "ホテル運営部",
    "sessionProjects": [],
    "links": [
      {
        "label": "実績コスト管理シート",
        "url": "https://docs.google.com/spreadsheets/d/1jpG7pP6zxj9vPnoQB0STye3F1wBQ_E4oieNbfVqyGDQ/edit"
      }
    ]
  },
  {
    "name": "ホテル予約・売上の自動連携",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・監視中",
    "purpose": "予約メールからカレンダー・売上管理シート・清掃管理へ情報をつなぎ、転記の手間を減らす。",
    "routine": "予約・キャンセルメールの検知時に反映。毎週月曜8:00頃に売上レポートをSlackへ通知する設定。",
    "current": "予約メール連携で請求メールを誤認する問題を11月4日に修正した記録あり。aipass日次取得も同日に復旧。メール連携とaipass全予約の取得は別処理。",
    "next": "修正後の定期実行の成功と、aipass全予約・売上シートの照合を確認する。",
    "reference": "共有進捗の2026年11月4日・売上書込みエラー修正／aipass復旧記録。以降の自動実行結果は未取得。",
    "id": "hotel-bookings",
    "checked": "2026-11-04",
    "owner": "ホテル運営部",
    "sessionProjects": [
      "hotel-sui-sync"
    ],
    "links": []
  },
  {
    "name": "YouTube 定期分析・改善",
    "domain": "YouTube",
    "group": "active",
    "status": "分析継続・台帳反映待ち",
    "purpose": "チャンネルの数字と制作状況を確認し、次の企画・タイトル・サムネイルの改善につなげる。",
    "routine": "月曜・木曜の定期レビュー。現在の実行予定は「定期タスク」で確認。",
    "current": "11月5日のStudio確認と管理シート更新の記録あり。外付けSSDが未接続だったため、SSD正本の改善台帳への反映は保留。",
    "next": "SSD接続後に最新レビューを正本の改善台帳へ反映し、次の制作へ適用する。",
    "reference": "共有進捗の2026年11月5日・YouTube木曜中間レビュー。以降のSSD反映は未確認。",
    "id": "youtube-review",
    "checked": "2026-11-05",
    "owner": "コンテンツ制作部",
    "sessionProjects": [],
    "links": [
      {
        "label": "YouTube制作・実績管理",
        "url": "https://docs.google.com/spreadsheets/d/1ZF-xU4RByzu50ip48ckCkX2Z9GiZSYFCQ7UKq4OYB0g/edit"
      }
    ],
    "blocked": "外付けSSDの接続待ち（11月5日の記録。現在の接続は未確認）。"
  },
  {
    "name": "ゲストメッセージの返信案作成",
    "domain": "ホテル",
    "group": "unknown",
    "status": "稼働確認待ち",
    "purpose": "ゲストからの問い合わせを検知し、返信案をスタッフへ渡す。",
    "routine": "15分ごとにAirbnbの通知メールを確認し、返信案をSlackへ送る設計。",
    "current": "実装・運用資料あり。送信はスタッフが内容を確認して手動で行う。GAS監視の認証エラーにより、最終成功時刻は取得できていない。",
    "next": "監視の認証を復旧し、メール検知と返信案の通知が動いているか確認する。",
    "reference": "売上管理シート運用ガイド・GASトリガー定義・10月5日の監視結果",
    "id": "guest-reply",
    "checked": "2026-10-05",
    "owner": "ホテル運営部",
    "sessionProjects": [],
    "links": []
  },
  {
    "name": "シフト用予約状況表の自動更新",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・翌月準備",
    "purpose": "予約状況を日別・予約一覧にまとめ、スタッフのシフト作成に使う。",
    "routine": "予約・清掃必要量を日次更新。毎月25日に翌月シフトを作成する設定。",
    "current": "11月シフトの手直しを12月以降の作成ルールへ反映した記録あり。翌月分は毎月25日に作成する設定。",
    "next": "次月シフトの自動作成後、予約状況・勤務条件・不足時間を確認する。",
    "reference": "共有進捗の2026年11月5日・月次シフトルール更新。次月シフト作成は未実施。",
    "id": "hotel-shift",
    "checked": "2026-11-05",
    "owner": "ホテル運営部",
    "sessionProjects": [],
    "links": []
  },
  {
    "name": "Trello・朝会タスク同期",
    "domain": "共通基盤",
    "group": "unknown",
    "status": "導入状況確認待ち",
    "purpose": "Trelloの完了・追加タスクを朝会に反映し、進捗の二重入力を減らす。",
    "routine": "毎朝6:55に同期、月曜6:50に週次切替を行う設計。",
    "current": "同期コードと導入手順あり。10月5日の調査では運用開始を確認できず、その後の導入状況は未確認。",
    "next": "現在の運用先と導入状況を確認し、必要な場合に朝会との同期方法を決める。",
    "reference": "Trello連携README・10月5日のVPS root定期実行一覧",
    "id": "trello-sync",
    "checked": "2026-10-05",
    "owner": "インフラ・自動化部",
    "sessionProjects": [],
    "links": []
  },
  {
    "name": "立替経費・請求書管理",
    "domain": "共通基盤",
    "group": "unknown",
    "status": "利用状況確認待ち",
    "purpose": "立替払いを台帳に集め、請求先ごとの請求書PDFと入金状況を管理する。",
    "routine": "支払いの登録時・請求書発行時に利用。時刻指定の定期実行ではない。",
    "current": "台帳・PDF生成・明細追加の実装あり。現在の利用状況は未確認。メールの自動取り込み・自動送付は今後の構想。",
    "next": "公開先と利用状況を確認し、運用中の範囲を確定する。",
    "reference": "請求書マネージャーREADME",
    "id": "invoices",
    "checked": "2026-10-05",
    "owner": "インフラ・自動化部",
    "sessionProjects": [],
    "links": []
  },
  {
    "name": "年金解説チャンネル（シニア向けYouTube）",
    "domain": "YouTube",
    "group": "active",
    "status": "制作・運用中",
    "purpose": "年金や暮らしの情報を、シニア世代に分かりやすい動画で届ける。",
    "current": "制作・公開を継続中。11月5日の記録では完成動画の通し確認・収益化設定・公開予約がボトルネック。",
    "next": "制作管理シートで現在の公開待ちを確認し、通し確認と公開予約を進める。",
    "reference": "共有進捗の2026年11月5日・YouTube中間レビュー。個別動画の最新工程は制作管理シートが正本。",
    "id": "pension-channel",
    "checked": "2026-11-05",
    "owner": "コンテンツ制作部",
    "sessionProjects": [
      "pension-channel",
      "年金解説チャンネル"
    ],
    "links": [
      {
        "label": "YouTube制作・実績管理",
        "url": "https://docs.google.com/spreadsheets/d/1ZF-xU4RByzu50ip48ckCkX2Z9GiZSYFCQ7UKq4OYB0g/edit"
      }
    ],
    "blocked": "完成動画の本人確認・公開設定の確認待ち（11月5日の記録）。"
  },
  {
    "name": "HOTEL SUI 集客・収益改善",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・改善中",
    "purpose": "本館とヴィラの魅力を伝え、宿泊予約と安定したホテル運営につなげる。",
    "current": "冬季プラン原稿と料金方針の確定記録あり。11月の月次目標も確定。営業室数は改修予定に応じて変わるため、月別の条件で確認する。",
    "next": "冬季プランの販売設定と掲載内容を照合し、月次目標に対する予約推移を確認する。",
    "reference": "共有進捗の2026年10月19日・冬季プラン原稿／営業室数修正、および11月4日・月次目標確定。OTA設定の最新状態は未取得。",
    "id": "hotel-marketing",
    "checked": "2026-11-04",
    "owner": "ホテル運営部",
    "sessionProjects": [
      "hotel-sui",
      "hotel-sui-kpi"
    ],
    "links": []
  },
  {
    "name": "AI支配人（スタッフ向けLINE Bot）",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・拡充中",
    "purpose": "スタッフがLINEで備品の場所や清掃・業務ルールを確認し、判断が必要な内容を担当者へ引き継ぐ。",
    "current": "備品・業務FAQと担当者への引継ぎを整備。10月24日に生成AIをClaude APIへ切り替え、比較テスト成功の記録あり。LINE実機での自由文確認は未実施。",
    "next": "スタッフのLINE実機で自由文の回答と担当者への引継ぎを確認する。",
    "reference": "共有進捗の2026年10月24日・AI支配人の生成AI切替記録。現在のLINE実機動作は未確認。",
    "id": "ai-manager",
    "checked": "2026-10-24",
    "owner": "ホテル運営部",
    "sessionProjects": [
      "line-bot"
    ],
    "links": []
  },
  {
    "name": "Slack通知・朝会",
    "domain": "共通基盤",
    "group": "active",
    "status": "運用中",
    "purpose": "日々の予定や進捗をSlackにまとめ、返信から更新できるようにする。",
    "current": "朝会・週次再生成・Slack返信の処理はMac miniへ移設済み。11月4日に月次目標確定と週次ブリーフの再生成を実施した記録あり。",
    "next": "次回の朝会と週次更新に最新の完了・追加タスクが反映されることを確認する。",
    "reference": "共通ルールの朝会運用と、共有進捗の2026年10月17日・移設／11月4日・目標確定記録。",
    "routine": "毎朝7:00：朝会・仕組みの停止確認。毎週月曜6:30：週次ブリーフ生成。",
    "id": "morning-brief",
    "checked": "2026-11-04",
    "owner": "インフラ・自動化部",
    "sessionProjects": [
      "daily-morning"
    ],
    "links": []
  },
  {
    "name": "客室タブレット",
    "domain": "ホテル",
    "group": "active",
    "status": "導入確認中",
    "purpose": "多言語の客室案内・島ガイド・フロント通話を客室から利用できるようにする。",
    "current": "本番表示の確認済みという記録あり。各客室の実端末設定は確認待ち。",
    "next": "客室端末の設定とフロント通話を実機で確認。",
    "reference": "客室タブレットのデプロイ情報・月次目標",
    "id": "room-tablet",
    "checked": "2026-10-05",
    "owner": "ホテル運営部",
    "sessionProjects": [
      "sui-tablet"
    ],
    "links": []
  },
  {
    "name": "フロントシステム",
    "domain": "ホテル",
    "group": "active",
    "status": "導入確認中",
    "purpose": "客室タブレットからの内線通話をフロントで受け、応答・拒否・通話・ミュートを行う。",
    "routine": "フロント端末で受付画面を開いたままにして待機する（時刻指定の定期実行ではない）。",
    "current": "客室タブレット内のフロント受付画面（要ログイン）を公開済み。着信音とバイブでの通知、不在着信の記録とSlack通知、直近24時間の通話履歴、フロント離席中の自動表示、スマホ表示まで実装済み。",
    "next": "フロント用の端末を決めて受付画面を常時表示し、各客室からの通話を実機で確認。",
    "reference": "客室タブレットのコードのうちフロント受付画面・通話状態APIの変更履歴",
    "checked": "2026-10-24",
    "id": "front-desk",
    "owner": "ホテル運営部",
    "sessionProjects": [],
    "links": []
  },
  {
    "name": "清掃管理アプリ",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・改善中",
    "purpose": "予約と清掃タスクをまとめ、担当割り当てと作業確認を行う。",
    "current": "導入済み。清掃マニュアルを整備し、新スタッフへの定着を進める段階。",
    "next": "品質基準の共有と、アプリのタスク・マニュアルの紐付け。",
    "reference": "清掃オペレーション資料・清掃管理アプリREADME",
    "id": "hotel-cleaning",
    "checked": "2026-10-05",
    "owner": "ホテル運営部",
    "sessionProjects": [
      "sui-room-crean"
    ],
    "links": []
  },
  {
    "name": "ホテル運営マニュアル",
    "domain": "ホテル",
    "group": "active",
    "status": "公開・更新確認中",
    "purpose": "スタッフが業務手順を確認できる共通の案内を整える。",
    "current": "READMEで公開先とパスワード不要の配信方式を確認。現在の公開本文と運営資料の一致は未確認。",
    "next": "正本と公開内容を照合し、必要な更新を反映。",
    "reference": "ホテル運営マニュアル README を2026年11月6日に確認。本文の同期確認は別途必要。",
    "id": "hotel-manual",
    "checked": "2026-11-06",
    "owner": "ホテル運営部",
    "sessionProjects": [
      "hotel-sui-manual"
    ],
    "links": [
      {
        "label": "運営マニュアル",
        "url": "https://hotel-sui-manual.vercel.app"
      }
    ]
  },
  {
    "name": "エージェントモニター",
    "domain": "共通基盤",
    "group": "active",
    "status": "運用中",
    "purpose": "Codex・Claude Codeの作業状況と、各プロジェクトの全体像を見えるようにする。",
    "current": "作業通知・プロジェクト概要・定期タスクを集約。業務ハブで要対応、情報の古さ、次の行動と引き継ぎを確認できる。",
    "next": "業務ハブで確認待ちの案件を選び、正本資料を確認して次の行動を進める。",
    "reference": "エージェントモニターのコード・README（2026年11月6日更新）。応答完了は業務全体の完了とは区別。",
    "id": "agent-monitor",
    "checked": "2026-11-06",
    "owner": "開発部",
    "sessionProjects": [
      "new-project",
      "エージェントモニター"
    ],
    "links": [
      {
        "label": "業務ハブ",
        "url": "/overview.html"
      }
    ]
  },
  {
    "name": "HOTEL SUI 採用ページ",
    "domain": "ホテル",
    "group": "active",
    "status": "アルバイト募集中",
    "purpose": "仕事内容や島での暮らしを伝える採用ページ。",
    "current": "正社員（副支配人候補）は募集終了。清掃スタッフのアルバイト応募は継続。採用LPに区分を反映済みの記録あり。",
    "next": "アルバイトの応募受付を継続し、募集条件に変更があればLPへ反映する。採用note・SNSの新規制作は依頼時のみ。",
    "reference": "CLAUDE.mdの採用方針と共有進捗の2026年10月22日・LP公開記録。",
    "id": "hotel-recruit",
    "checked": "2026-10-22",
    "owner": "ホテル運営部",
    "sessionProjects": [
      "hotel-sui-recruit"
    ],
    "links": [
      {
        "label": "採用ページ",
        "url": "https://hotel-sui-recruit.vercel.app"
      }
    ]
  },
  {
    "name": "ねるぞう X・Threads運用",
    "domain": "SNS",
    "group": "paused",
    "status": "休止中",
    "purpose": "副業ジャンルの発信を継続するための投稿運用。",
    "current": "2026年10月4日から休止。投稿スケジュールも停止済みという記録あり。",
    "next": "本人の手間をかけずに運用できる体制が整った場合に再開を検討。",
    "reference": "共通ルール・10月4日の本人決定",
    "id": "neruzou",
    "checked": "2026-10-05",
    "owner": "コンテンツ制作部",
    "sessionProjects": [
      "x-sidebiz",
      "threads-poster"
    ],
    "links": []
  },
  {
    "name": "八丈島の歩き方",
    "domain": "メディア",
    "group": "paused",
    "status": "一時凍結",
    "purpose": "八丈島の一次情報からホテルへの直接予約につなげるメディア。",
    "current": "2026年10月4日から一時凍結。再開時期は未定。",
    "next": "ドメイン・コード・資料を保全。再開は本人判断。",
    "reference": "共通ルールの八丈島メディア節",
    "id": "hachijo-media",
    "checked": "2026-10-05",
    "owner": "コンテンツ制作部",
    "sessionProjects": [
      "hachijo-media"
    ],
    "links": []
  },
  {
    "name": "年金のホンネTV",
    "domain": "YouTube",
    "group": "paused",
    "status": "休眠中",
    "purpose": "共同運営で年金に関する情報を届けるYouTubeプロジェクト。",
    "current": "2026年10月4日から休眠。制作を継続している「年金解説チャンネル」とは別プロジェクト。",
    "next": "既存の動画・資料を保全。再開する場合は共同運営者と相談。",
    "reference": "共通ルールのYouTube節・10月4日の本人決定",
    "id": "honne-tv",
    "checked": "2026-10-05",
    "owner": "コンテンツ制作部",
    "sessionProjects": [],
    "links": []
  }
];
window.MONITOR_HEALTH_MAP={
 'ホテル予約・売上の自動連携':['gas.api','gas.sync','gas.cancel','gas.trig.sync','gas.trig.cancel','gas.cleaningPush','gas.cleaningConfig','gas.salesWrite','gas.salesMail','gas.weekly','gas.trig.weekly','http.cleaningWebhook'],
 'ゲストメッセージの返信案作成':['gas.guest','gas.trig.guest','gas.guestConfig'],
 'シフト用予約状況表の自動更新':['gas.shift','gas.trig.shift'],
 'Slack通知・朝会':['morning.prev','pm2.proxy','disk.vps'],
 '清掃管理アプリ':['http.cleaning','http.cleaningWebhook'],
 '客室タブレット':['http.tablet'],
 'ホテル運営マニュアル':['http.manual'],
 'HOTEL SUI 集客・収益改善':['http.kpi'],
 'エージェントモニター':['http.monitor','http.monitorApi','pm2.dashboard'],
 'HOTEL SUI 採用ページ':['http.recruit'],
 'ねるぞう X・Threads運用':['poster.x','poster.threads']
};
