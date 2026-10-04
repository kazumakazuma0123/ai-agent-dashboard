'use strict';
const projects = [
  {
    "name": "AI支配人",
    "domain": "ホテル",
    "group": "unknown",
    "status": "詳細確認中",
    "purpose": "ホテル向けの独立プロジェクト。客室タブレットとは別に管理します。",
    "current": "プロジェクトの存在と、客室タブレットとは別であることを確認。機能・進捗は未確認。",
    "next": "対象業務・現在の進捗・関連資料を確認する。",
    "reference": "本人確認（2026年10月5日）"
  },
  {
    "name": "Slack通知・朝会",
    "domain": "共通基盤",
    "group": "active",
    "status": "運用・検証中",
    "purpose": "日々の予定や進捗をSlackにまとめ、返信から更新できるようにする。",
    "current": "日次朝会・週次再生成・返信反映の仕組みを整備済み。週次生成と返信の実運用確認が残る。",
    "next": "週次生成結果と、Slack返信がブリーフへ反映されるか確認。",
    "reference": "朝会運用ルール・月次目標・朝会README"
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
    "next": "プロジェクト概要を追加し、方針変更に合わせて情報を更新。",
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
  }
];
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let filter='active';
const el=id=>document.getElementById(id);
for(const domain of [...new Set(projects.map(p=>p.domain))]){const option=document.createElement('option');option.value=domain;option.textContent=domain;el('project-domain').append(option);}
el('project-stats').innerHTML=[['進行・運用中',projects.filter(p=>p.group==='active').length],['停止・休止中',projects.filter(p=>p.group==='paused').length],['確認中',projects.filter(p=>p.group==='unknown').length]].map(([label,count])=>`<div class="project-stat"><strong>${count}</strong><span>${label}</span></div>`).join('');
function renderProjects(){
 const q=el('project-search').value.trim().toLowerCase(),domain=el('project-domain').value;
 const list=projects.filter(p=>(filter==='all'||p.group===filter)&&(domain==='all'||p.domain===domain)&&[p.name,p.purpose,p.current].some(t=>t.toLowerCase().includes(q)));
 el('project-count').textContent=`${list.length} 件のプロジェクト`;
 el('project-grid').innerHTML=list.length?list.map(p=>`<article class="project-card ${p.group==='paused'?'paused':''}"><div class="project-top"><span class="project-domain">${escapeHtml(p.domain)}</span><span class="badge project-status ${p.group==='active'?'active':p.group==='unknown'?'waiting':''}">${escapeHtml(p.status)}</span></div><h2>${escapeHtml(p.name)}</h2><p class="project-purpose">${escapeHtml(p.purpose)}</p><dl><dt>現在の状況</dt><dd>${escapeHtml(p.current)}</dd><dt>次の予定</dt><dd>${escapeHtml(p.next)}</dd></dl><details><summary>確認した資料</summary><p>${escapeHtml(p.reference)}<br>確認日：2026年10月5日</p></details></article>`).join(''):'<div class="empty"><h3>該当するプロジェクトはありません</h3><p>表示範囲や検索条件を変更してください。</p></div>';
}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));renderProjects();}));
el('project-search').addEventListener('input',renderProjects);el('project-domain').addEventListener('change',renderProjects);renderProjects();
