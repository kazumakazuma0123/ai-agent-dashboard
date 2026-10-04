'use strict';
const projects = [
  {
    "name": "ホテル経営管理",
    "domain": "ホテル",
    "group": "active",
    "status": "運用中・取得に要確認",
    "purpose": "購入費・固定費・光熱費などをコスト表へ集め、月別の経費と原価を把握する。",
    "routine": "毎朝9:00：Amazon購入データを取得する設定。請求書・固定費は確認時に追加。",
    "current": "購入データ候補とコスト表・月別集計を整備済み。10月4日のAmazon取得は、ホテル用アカウントに切り替えが必要となり未完了。定期実行設定は有効。",
    "next": "ホテル購入用のAmazonアカウントへの切替後、購入データ取得を再確認。未確定の費用・対象月を整理する。",
    "reference": "チャット「ホテル経営管理」の10月4日までの記録・Amazon購入データ取得の有効な定期実行設定（10月5日確認）。売上数値の毎朝取得とは別の処理"
  },
  {
    "name": "ホテル予約・売上の自動連携",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・確認中",
    "purpose": "予約メールからカレンダー・売上管理シート・清掃管理へ情報をつなぎ、転記の手間を減らす。",
    "routine": "予約・キャンセルメールの検知時に反映。毎週月曜8:00頃に売上レポートをSlackへ通知する設定。",
    "current": "予約・キャンセルの連携と週次レポートの仕組みを整備済み。メールにないaiPass直接入力の予約は集計に含まれない。今回、最新の実行結果は未確認。",
    "next": "取り込み・通知の最終成功を確認し、aiPassの全予約と照合して集計の漏れを整理する。",
    "reference": "予約管理GAS README・売上管理シート運用ガイド・朝会の死活監視資料"
  },
  {
    "name": "年金解説チャンネル（シニア向けYouTube）",
    "domain": "YouTube",
    "group": "active",
    "status": "制作・運用中",
    "purpose": "年金や暮らしの情報を、シニア世代に分かりやすい動画で届ける。",
    "current": "週2本の公開を目指し、企画・台本・音声・図解・動画編集を継続中。複数動画の制作と確認・公開準備を進めている。",
    "next": "制作済み動画の確認・サムネイル作成・公開を進め、公開後の反応を次の動画へ反映。",
    "reference": "本人の稼働確認（10月5日）・10月月次目標・YouTube制作の共有進捗。個別動画の最新工程は共通の制作管理シートで管理"
  },
  {
    "name": "HOTEL SUI 集客・収益改善",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・改善中",
    "purpose": "本館とヴィラの魅力を伝え、宿泊予約と安定したホテル運営につなげる。",
    "current": "8室体制で集客中。予約状況を確認しながら、宿泊予約サイトの掲載内容・写真・販売設定の改善を進める。",
    "next": "掲載情報の差異を解消し、写真や販売設定を整える。予約経路別の実績を確認して集客施策を見直す。",
    "reference": "10月月次目標・10月3日確認のホテル集客状況"
  },
  {
    "name": "AI支配人（スタッフ向けLINE Bot）",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・拡充中",
    "purpose": "スタッフがLINEで備品の場所や清掃・業務ルールを確認し、判断が必要な内容を担当者へ引き継ぐ。",
    "current": "備品回答とSlackへの引継ぎ・担当者返信・Bot復帰は実機成功の記録あり。業務FAQは131問中59問を確認済み（10月2日の記録）。追加ルールは本番未反映。",
    "next": "残りの業務ルールを確認し、承認済みの回答を本番へ反映。清掃の聞き返しと利用停止後の動作を実機で確認。",
    "reference": "タスク「スタッフ向けLINE Bot構築」の10月2日までの記録・接続進捗・スタッフ想定質問一覧（今回の稼働確認は未実施）"
  },
  {
    "name": "Slack通知・朝会",
    "domain": "共通基盤",
    "group": "active",
    "status": "運用・検証中",
    "purpose": "日々の予定や進捗をSlackにまとめ、返信から更新できるようにする。",
    "current": "日次朝会・週次再生成・返信反映の仕組みを整備済み。週次生成と返信の実運用確認が残る。",
    "next": "週次生成結果と、Slack返信がブリーフへ反映されるか確認。",
    "reference": "朝会運用ルール・月次目標・朝会README",
    "routine": "毎朝7:00：朝会・仕組みの停止確認。毎週月曜6:30：週次ブリーフ生成。"
  },
  {
    "name": "客室タブレット",
    "domain": "ホテル",
    "group": "active",
    "status": "導入確認中",
    "purpose": "多言語の客室案内・島ガイド・フロント通話を客室から利用できるようにする。",
    "current": "本番表示の確認済みという記録あり。各客室の実端末設定は確認待ち。",
    "next": "客室端末の設定とフロント通話を実機で確認。",
    "reference": "客室タブレットのデプロイ情報・月次目標"
  },
  {
    "name": "清掃管理アプリ",
    "domain": "ホテル",
    "group": "active",
    "status": "運用・改善中",
    "purpose": "予約と清掃タスクをまとめ、担当割り当てと作業確認を行う。",
    "current": "導入済み。清掃マニュアルを整備し、新スタッフへの定着を進める段階。",
    "next": "品質基準の共有と、アプリのタスク・マニュアルの紐付け。",
    "reference": "清掃オペレーション資料・清掃管理アプリREADME"
  },
  {
    "name": "ホテル運営マニュアル",
    "domain": "ホテル",
    "group": "active",
    "status": "更新確認中",
    "purpose": "スタッフが業務手順を確認できる共通の案内を整える。",
    "current": "公開・認証確認の記録あり。正本と配信元の同期状況に確認事項がある。",
    "next": "正本と公開内容を照合し、必要な更新を反映。",
    "reference": "月次目標・ホテル運営マニュアル資料"
  },
  {
    "name": "エージェントモニター",
    "domain": "共通基盤",
    "group": "active",
    "status": "運用中",
    "purpose": "Codex・Claude Codeの作業状況と、各プロジェクトの全体像を見えるようにする。",
    "current": "実通知の受信・応答完了の反映を確認済み。部署別表示とスマホ表示に対応。",
    "next": "各プロジェクトの進捗や方針変更に合わせて概要を更新。",
    "reference": "本タスクの実通知確認・モニターREADME・共有進捗"
  },
  {
    "name": "HOTEL SUI 採用ページ",
    "domain": "ホテル",
    "group": "paused",
    "status": "停止中",
    "purpose": "仕事内容や島での暮らしを伝える採用ページ。",
    "current": "2026年10月4日、採用決定により制作・更新を停止。採用note・SNS採用も同様。",
    "next": "既存ページ・原稿を保全。採用再開の判断後に見直す。",
    "reference": "共通ルールの採用節・10月4日の本人決定"
  },
  {
    "name": "ねるぞう X・Threads運用",
    "domain": "SNS",
    "group": "paused",
    "status": "休止中",
    "purpose": "副業ジャンルの発信を継続するための投稿運用。",
    "current": "2026年10月4日から休止。投稿スケジュールも停止済みという記録あり。",
    "next": "本人の手間をかけずに運用できる体制が整った場合に再開を検討。",
    "reference": "共通ルール・10月4日の本人決定"
  },
  {
    "name": "八丈島の歩き方",
    "domain": "メディア",
    "group": "paused",
    "status": "一時凍結",
    "purpose": "八丈島の一次情報からホテルへの直接予約につなげるメディア。",
    "current": "2026年10月4日から一時凍結。再開時期は未定。",
    "next": "ドメイン・コード・資料を保全。再開は本人判断。",
    "reference": "共通ルールの八丈島メディア節"
  },
  {
    "name": "年金のホンネTV",
    "domain": "YouTube",
    "group": "paused",
    "status": "休眠中",
    "purpose": "共同運営で年金に関する情報を届けるYouTubeプロジェクト。",
    "current": "2026年10月4日から休眠。制作を継続している「年金解説チャンネル」とは別プロジェクト。",
    "next": "既存の動画・資料を保全。再開する場合は共同運営者と相談。",
    "reference": "共通ルールのYouTube節・10月4日の本人決定"
  }
];
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let filter='active';
const el=id=>document.getElementById(id);
for(const domain of [...new Set(projects.map(p=>p.domain))]){const option=document.createElement('option');option.value=domain;option.textContent=domain;el('project-domain').append(option);}
el('project-stats').innerHTML=[['進行・運用中',projects.filter(p=>p.group==='active').length],['停止・休止中',projects.filter(p=>p.group==='paused').length],['確認中',projects.filter(p=>p.group==='unknown').length]].map(([label,count])=>`<div class="project-stat"><strong>${count}</strong><span>${label}</span></div>`).join('');
function renderProjects(){
 const q=el('project-search').value.trim().toLowerCase(),domain=el('project-domain').value;
 const list=projects.filter(p=>(filter==='all'||p.group===filter)&&(domain==='all'||p.domain===domain)&&[p.name,p.purpose,p.current,p.routine||''].some(t=>t.toLowerCase().includes(q)));
 el('project-count').textContent=`${list.length} 件のプロジェクト`;
 el('project-grid').innerHTML=list.length?list.map(p=>`<article class="project-card ${p.group==='paused'?'paused':''}"><div class="project-top"><span class="project-domain">${escapeHtml(p.domain)}</span><span class="badge project-status ${p.group==='active'?'active':p.group==='unknown'?'waiting':''}">${escapeHtml(p.status)}</span></div><h2>${escapeHtml(p.name)}</h2><p class="project-purpose">${escapeHtml(p.purpose)}</p><dl>${p.routine?`<dt>定期的に行うこと</dt><dd>${escapeHtml(p.routine)}</dd>`:''}<dt>現在の状況</dt><dd>${escapeHtml(p.current)}</dd><dt>次の予定</dt><dd>${escapeHtml(p.next)}</dd></dl><details><summary>確認した資料</summary><p>${escapeHtml(p.reference)}<br>確認日：2026年10月5日</p></details></article>`).join(''):'<div class="empty"><h3>該当するプロジェクトはありません</h3><p>表示範囲や検索条件を変更してください。</p></div>';
}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));renderProjects();}));
el('project-search').addEventListener('input',renderProjects);el('project-domain').addEventListener('change',renderProjects);renderProjects();
