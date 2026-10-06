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
    "current": "予約・キャンセルの連携と週次レポートの仕組みを整備済み。メールにないaiPass直接入力の予約は集計に含まれない。今回、最新の実行結果は未確認。 10月5日は監視側の認証エラーにより最終成功を取得できず、連携本体の停止有無は未判定。",
    "next": "取り込み・通知の最終成功を確認し、aiPassの全予約と照合して集計の漏れを整理する。",
    "reference": "予約管理GAS README・売上管理シート運用ガイド・朝会の死活監視資料"
  },
  {
    "name": "YouTube 定期分析・改善",
    "domain": "YouTube",
    "group": "active",
    "status": "定期実行設定あり",
    "purpose": "チャンネルの数字と制作状況を確認し、次の企画・タイトル・サムネイルの改善につなげる。",
    "routine": "毎週月曜・木曜9:00：YouTube Studioを確認し、週次・中間レビュー。",
    "current": "定期実行は有効。再生数・クリック率・視聴維持率・登録者の変化などを取得する設定。今回、直近の分析完了は未確認。",
    "next": "分析結果と次の公開候補を確認し、改善内容を制作へ反映する。",
    "reference": "YouTube週2回分析の定期実行設定（10月5日確認）"
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
    "reference": "売上管理シート運用ガイド・GASトリガー定義・10月5日の監視結果"
  },
  {
    "name": "シフト用予約状況表の自動更新",
    "domain": "ホテル",
    "group": "unknown",
    "status": "稼働確認待ち",
    "purpose": "予約状況を日別・予約一覧にまとめ、スタッフのシフト作成に使う。",
    "routine": "毎朝5:00頃：当日から60日先までの予約状況を更新する設計。",
    "current": "自動更新の実装あり。GAS監視の認証エラーにより、現在のトリガーと最終更新の確認ができていない。",
    "next": "認証復旧後、更新時刻と8室分の予約反映を確認する。",
    "reference": "予約状況表の実装・月次目標・10月5日の監視結果"
  },
  {
    "name": "Trello・朝会タスク同期",
    "domain": "共通基盤",
    "group": "unknown",
    "status": "導入状況確認待ち",
    "purpose": "Trelloの完了・追加タスクを朝会に反映し、進捗の二重入力を減らす。",
    "routine": "毎朝6:55に同期、月曜6:50に週次切替を行う設計。",
    "current": "同期コードと導入手順あり。今回確認したVPSのroot定期実行一覧には該当設定がなく、運用開始済みとは確認できていない。",
    "next": "運用先と導入状況を確認し、稼働中・未導入の区分を確定する。",
    "reference": "Trello連携README・10月5日のVPS root定期実行一覧"
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
    "reference": "請求書マネージャーREADME"
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
    "current": "備品回答とSlackへの引継ぎ・担当者返信・Bot復帰は実機成功の記録あり。業務FAQは131問中59問を確認済み。確認済みルールを10月6日に業務FAQシートとして本番へ反映（AI停止中のため登録した言い換えと一致する質問のみ回答）。LINE実機での到着確認待ち。",
    "next": "LINE実機でFAQ回答を確認。残り72問の業務ルールを確認し業務FAQシートへ追加。清掃の聞き返しと利用停止後の動作を実機で確認。",
    "reference": "タスク「スタッフ向けLINE Bot構築」の10月2日までの記録・接続進捗・スタッフ想定質問一覧（今回の稼働確認は未実施）"
  },
  {
    "name": "Slack通知・朝会",
    "domain": "共通基盤",
    "group": "active",
    "status": "運用中・ホテル連携に要確認",
    "purpose": "日々の予定や進捗をSlackにまとめ、返信から更新できるようにする。",
    "current": "日次朝会・週次再生成・返信反映の仕組みを整備済み。10月5日の監視でホテル情報取得の認証エラーを検出。今日の予定・ホテル状況の取得に問題がある。",
    "next": "ホテル情報取得の認証を復旧し、朝会への反映と週次生成・Slack返信の動作を確認。",
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
// ── 自動の稼働状況（VPSの死活監視が1時間ごとに更新。GET /api/health-status） ──
// 各事業カードに紐づける監視項目ID。休止・凍結・休眠の事業は参考表示（グレー）で、要対応には数えない。
const HEALTH_MAP={
 'ホテル予約・売上の自動連携':['gas.api','gas.sync','gas.cancel','gas.trig.sync','gas.trig.cancel','gas.cleaningPush','gas.cleaningConfig','gas.salesWrite','gas.salesMail','gas.weekly','gas.trig.weekly','http.cleaningWebhook'],
 'ゲストメッセージの返信案作成':['gas.guest','gas.trig.guest','gas.guestConfig'],
 'シフト用予約状況表の自動更新':['gas.shift','gas.trig.shift'],
 'Slack通知・朝会':['morning.prev','pm2.proxy','disk.vps'],
 '清掃管理アプリ':['http.cleaning','http.cleaningWebhook'],
 '客室タブレット':['http.tablet'],
 'ホテル運営マニュアル':['http.manual'],
 'HOTEL SUI 集客・収益改善':['http.kpi'],
 'エージェントモニター':['http.monitor','pm2.dashboard'],
 'HOTEL SUI 採用ページ':['http.recruit'],
 'ねるぞう X・Threads運用':['poster.x','poster.threads']
};
let health=null,healthFailed=false;
const pausedNames=new Set(projects.filter(p=>p.group==='paused').map(p=>p.name));
const activeMappedIds=new Set(Object.entries(HEALTH_MAP).filter(([n])=>!pausedNames.has(n)).flatMap(([,ids])=>ids));
const allMappedIds=new Set(Object.values(HEALTH_MAP).flat());
const STATE={ok:['✅','正常','ok'],warn:['⚠️','要対応','warn'],error:['⚠️','要対応','warn'],skip:['⏸','休止中','skip']};
function ago(iso){if(!iso)return '不明';const m=Math.max(0,Math.floor((Date.now()-Date.parse(iso))/60000));if(m<1)return 'たった今';if(m<60)return `${m}分前`;const h=Math.floor(m/60);return h<48?`${h}時間前`:`${Math.floor(h/24)}日前`;}
const healthStopped=()=>!health||health.monitor.state!=='ok';
function healthBlock(p){
 const ids=HEALTH_MAP[p.name];if(!ids)return '';
 const paused=p.group==='paused';
 if(!health)return `<div class="hc ${paused?'paused':''}"><span class="hc-chip skip">${healthFailed?'監視結果を取得できません':'監視結果を読み込み中'}</span></div>`;
 const items=ids.map(id=>health.items.find(i=>i.id===id)).filter(Boolean);
 if(!items.length)return '';
 const stopped=healthStopped();
 const bad=items.filter(i=>i.status==='warn'||i.status==='error');
 const allSkip=items.every(i=>i.status==='skip');
 let chip;
 if(stopped)chip=`<span class="hc-chip stopped">⚠️ 監視が止まっています</span>`;
 else if(paused)chip=`<span class="hc-chip skip">⏸ 休止中${bad.length?'（監視は参考表示）':''}</span>`;
 else if(bad.length)chip=`<span class="hc-chip warn">⚠️ 要対応 ${bad.length}件</span>`;
 else if(allSkip)chip=`<span class="hc-chip skip">⏸ 休止中</span>`;
 else chip=`<span class="hc-chip ok">✅ 正常</span>`;
 const when=health.monitor.generatedAt?`最終確認 ${ago(health.monitor.generatedAt)}`:'最終確認 不明';
 const warns=(stopped||paused)?'':bad.map(i=>`<div class="hc-warn"><strong>${escapeHtml(i.label)}</strong><span>${escapeHtml(i.message||'確認が必要です')}</span></div>`).join('');
 const rows=items.map(i=>{const [icon,label,cls]=STATE[i.status]||STATE.error;return `<li class="${stopped||paused?'skip':cls}"><span>${stopped?'―':icon}</span>${escapeHtml(i.label)}<em>${stopped?'確認できません':label}</em></li>`;}).join('');
 return `<div class="hc ${paused?'paused':''}"><div class="hc-head">${chip}<span class="hc-when">${escapeHtml(when)}</span></div>${warns}<details class="hc-list"><summary>監視している項目（${items.length}件）</summary><ul>${rows}</ul></details></div>`;
}
function renderHealthSummary(){
 const box=el('health-summary');if(!box)return;
 if(!health){box.className='health-summary';box.innerHTML=healthFailed?'<strong>自動の稼働状況を取得できませんでした</strong><span>しばらくして再読み込みしてください。</span>':'<strong>自動の稼働状況を読み込み中…</strong>';return;}
 if(healthStopped()){
  const at=health.monitor.generatedAt;
  box.className='health-summary stopped';
  box.innerHTML=`<strong>⚠️ 監視自体が止まっています</strong><span>${at?`最後に確認できたのは${escapeHtml(ago(at))}。`:'監視結果がまだ届いていません。'}2時間以上更新がないため、下の状態は最新ではありません。VPSの死活監視（1時間ごとのcron）を確認してください（Claude Code に「死活監視のcronを直して」と依頼）。</span>`;
  return;
 }
 const bad=health.items.filter(i=>(i.status==='warn'||i.status==='error')&&(activeMappedIds.has(i.id)||!allMappedIds.has(i.id)));
 const when=`最終確認 ${ago(health.monitor.generatedAt)}（1時間ごとに自動更新）`;
 if(!bad.length){box.className='health-summary ok';box.innerHTML=`<strong>✅ 要対応 0件</strong><span>自動の稼働状況はすべて正常です。${escapeHtml(when)}</span>`;return;}
 const owner=id=>Object.entries(HEALTH_MAP).filter(([n,ids])=>ids.includes(id)&&!pausedNames.has(n)).map(([n])=>n);
 box.className='health-summary warn';
 box.innerHTML=`<strong>⚠️ 要対応 ${bad.length}件</strong><span>${escapeHtml(when)}</span><ul>${bad.map(i=>`<li><b>${escapeHtml(i.label)}</b>${owner(i.id).length?`<small>（${escapeHtml(owner(i.id).join('・'))}）</small>`:''}<span>${escapeHtml(i.message||'確認が必要です')}</span></li>`).join('')}</ul>`;
}
async function loadHealth(){
 try{const r=await fetch('/api/health-status',{cache:'no-store'});if(!r.ok)throw new Error(r.status);health=await r.json();healthFailed=false;}
 catch{if(!health)healthFailed=true;}
 renderHealthSummary();renderProjects();
}
let filter='all';
const el=id=>document.getElementById(id);
for(const domain of [...new Set(projects.map(p=>p.domain))]){const option=document.createElement('option');option.value=domain;option.textContent=domain;el('project-domain').append(option);}
el('project-stats').innerHTML=[['進行・運用中',projects.filter(p=>p.group==='active').length],['停止・休止中',projects.filter(p=>p.group==='paused').length],['確認中',projects.filter(p=>p.group==='unknown').length]].map(([label,count])=>`<div class="project-stat"><strong>${count}</strong><span>${label}</span></div>`).join('');
function compactState(p){
 if(p.group==='paused')return `<span class="monitor-state">⏸ ${escapeHtml(p.status)}</span>`;
 const ids=HEALTH_MAP[p.name];
 if(!ids)return `<span class="monitor-state ${p.group==='unknown'||p.status.includes('要確認')?'warn':''}">${escapeHtml(p.status)} · 自動監視なし</span>`;
 if(!health||healthStopped())return `<span class="monitor-state warn">${healthFailed?'監視取得失敗':health?'監視更新停止':'監視を確認中'}</span>`;
 const checks=ids.map(id=>health.items.find(i=>i.id===id)).filter(Boolean);
 if(!checks.length)return '<span class="monitor-state warn">監視結果なし</span>';
 const bad=checks.filter(i=>i.status==='warn'||i.status==='error');
 if(bad.length)return `<span class="monitor-state warn">⚠ 要対応 ${bad.length}件</span>`;
 if(checks.every(i=>i.status==='skip'))return '<span class="monitor-state">⏸ 監視休止中</span>';
 return '<span class="monitor-state ok">● 監視項目は正常</span>';
}
let modeAnimation=null;
function setMode(mode){
 const changed=document.body.classList.contains('monitor')!==(mode==='monitor');
 modeAnimation?.cancel();
 document.body.classList.toggle('monitor',mode==='monitor');
 document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 if(changed && el('project-grid').children.length && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  modeAnimation=el('project-grid').animate([
   {opacity:0,transform:'translateY(8px)'},
   {opacity:1,transform:'translateY(0)'}
  ],{duration:240,easing:'cubic-bezier(.2,.7,.2,1)'});
 }
 try{localStorage.setItem('project-view-mode',mode);}catch{}
}
document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
try{setMode(localStorage.getItem('project-view-mode')==='detail'?'detail':'monitor');}catch{}
function renderProjects(){
 const q=el('project-search').value.trim().toLowerCase(),domain=el('project-domain').value;
 const list=projects.filter(p=>(filter==='all'||p.group===filter)&&(domain==='all'||p.domain===domain)&&[p.name,p.purpose,p.current,p.routine||''].some(t=>t.toLowerCase().includes(q)));
 el('project-count').textContent=`${list.length} 件のプロジェクト`;
 el('project-grid').innerHTML=list.length?list.map(p=>`<article data-project="${projects.indexOf(p)}" class="project-card ${p.group==='paused'?'paused':''}"><div class="project-top"><span class="project-domain">${escapeHtml(p.domain)}</span><span class="badge project-status ${p.group==='active'?'active':p.group==='unknown'?'waiting':''}">${escapeHtml(p.status)}</span></div><h2>${escapeHtml(p.name)}</h2>${compactState(p)}<p class="project-purpose">${escapeHtml(p.purpose)}</p>${healthBlock(p)}<dl>${p.routine?`<dt>定期的に行うこと</dt><dd>${escapeHtml(p.routine)}</dd>`:''}<dt>現在の状況</dt><dd>${escapeHtml(p.current)}</dd><dt>次の予定</dt><dd>${escapeHtml(p.next)}</dd></dl><details><summary>確認した資料</summary><p>${escapeHtml(p.reference)}<br>確認日：2026年10月5日</p></details><button class="project-open" data-open-project="${projects.indexOf(p)}" aria-label="${escapeHtml(p.name)}の詳細を開く" aria-haspopup="dialog"></button></article>`).join(''):'<div class="empty"><h3>該当するプロジェクトはありません</h3><p>表示範囲や検索条件を変更してください。</p></div>';
}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));renderProjects();}));
el('project-search').addEventListener('input',renderProjects);el('project-domain').addEventListener('change',renderProjects);renderProjects();
renderHealthSummary();loadHealth();setInterval(loadHealth,300000);

let selectedProject=null;
const projectDialog=el('project-dialog');
el('project-grid').addEventListener('click',event=>{
 const button=event.target.closest('[data-open-project]');
 if(!button||!document.body.classList.contains('monitor'))return;
 selectedProject=button.dataset.openProject;
 const content=button.closest('.project-card').cloneNode(true);
 content.className='project-detail';content.removeAttribute('data-project');
 content.querySelector('.project-open').remove();
 content.querySelector('.monitor-state').remove();
 content.querySelector('h2').id='project-detail-title';
 el('project-dialog-content').replaceChildren(content);
 projectDialog.showModal();
});
el('project-dialog-close').addEventListener('click',()=>projectDialog.close());
projectDialog.addEventListener('click',event=>{if(event.target!==projectDialog)return;const r=projectDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)projectDialog.close();});
projectDialog.addEventListener('close',()=>{
 const button=document.querySelector(`[data-open-project="${selectedProject}"]`);
 if(button)button.focus({preventScroll:true});
});
