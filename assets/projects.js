'use strict';
const projects=window.MONITOR_PROJECTS;
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// ── 自動の稼働状況（Mac miniの死活監視が1時間ごとに更新。GET /api/health-status） ──
// 各事業カードに紐づける監視項目ID。休止・凍結・休眠の事業は参考表示（グレー）で、要対応には数えない。
const HEALTH_MAP=window.MONITOR_HEALTH_MAP;
let health=null,healthFailed=false;
const pausedNames=new Set(projects.filter(p=>p.group==='paused').map(p=>p.name));
const activeMappedIds=new Set(Object.entries(HEALTH_MAP).filter(([n])=>!pausedNames.has(n)).flatMap(([,ids])=>ids));
const allMappedIds=new Set(Object.values(HEALTH_MAP).flat());
const STATE={ok:['✅','正常','ok'],warn:['⚠️','要対応','warn'],error:['⚠️','要対応','warn'],skip:['⏸','休止中','skip']};
function ago(iso){if(!iso)return '不明';const m=Math.max(0,Math.floor((Date.now()-Date.parse(iso))/60000));if(m<1)return 'たった今';if(m<60)return `${m}分前`;const h=Math.floor(m/60);return h<48?`${h}時間前`:`${Math.floor(h/24)}日前`;}
const healthStopped=()=>healthFailed||!health||health.monitor.state!=='ok'||!Number.isFinite(Date.parse(health.monitor.generatedAt))||Date.now()-Date.parse(health.monitor.generatedAt)>=7200000||Date.parse(health.monitor.generatedAt)>Date.now()+60000;
function healthBlock(p){
 const ids=HEALTH_MAP[p.name];if(!ids)return '';
 const paused=p.group==='paused';
 if(!health)return `<div class="hc ${paused?'paused':''}"><span class="hc-chip skip">${healthFailed?'監視結果を取得できません':'監視結果を読み込み中'}</span></div>`;
 const items=ids.map(id=>health.items.find(i=>i.id===id)).filter(Boolean);
 if(!items.length)return '<div class="hc"><span class="hc-chip skip">監視結果なし・要確認</span></div>';
 const stopped=healthStopped();
 const bad=items.filter(i=>i.status==='warn'||i.status==='error');
 const allSkip=items.every(i=>i.status==='skip');
 let chip;
 if(stopped)chip=`<span class="hc-chip stopped">⚠️ 監視が止まっています</span>`;
 else if(paused)chip=`<span class="hc-chip skip">⏸ 休止中${bad.length?'（監視は参考表示）':''}</span>`;
 else if(bad.length)chip=`<span class="hc-chip warn">⚠️ 要対応 ${bad.length}件</span>`;
 else if(items.length<ids.length)chip=`<span class="hc-chip warn">監視結果が一部未取得</span>`;
 else if(allSkip)chip=`<span class="hc-chip skip">⏸ 休止中</span>`;
 else chip=`<span class="hc-chip ok">✅ 監視項目は正常</span>`;
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
  box.innerHTML=`<strong>⚠️ 最新の監視結果を確認できません</strong><span>${at?`最後に確認できたのは${escapeHtml(ago(at))}。`:'監視結果がまだ届いていません。'}取得失敗・更新停止・時刻不整合の可能性があるため、下の状態は最新として扱いません。Mac miniの死活監視と接続を確認してください。</span>`;
  return;
 }
 const bad=health.items.filter(i=>(i.status==='warn'||i.status==='error')&&(activeMappedIds.has(i.id)||!allMappedIds.has(i.id)));
 const when=`最終確認 ${ago(health.monitor.generatedAt)}（1時間ごとに自動更新）`;
 if(!bad.length){box.className='health-summary ok';box.innerHTML=`<strong>✅ 要対応 0件</strong><span>取得できた監視項目に警告はありません。未監視の業務や進捗は別途確認してください。${escapeHtml(when)}</span>`;return;}
 const owner=id=>Object.entries(HEALTH_MAP).filter(([n,ids])=>ids.includes(id)&&!pausedNames.has(n)).map(([n])=>n);
 box.className='health-summary warn';
 box.innerHTML=`<strong>⚠️ 要対応 ${bad.length}件</strong><span>${escapeHtml(when)}</span><ul>${bad.map(i=>`<li><b>${escapeHtml(i.label)}</b>${owner(i.id).length?`<small>（${escapeHtml(owner(i.id).join('・'))}）</small>`:''}<span>${escapeHtml(i.message||'確認が必要です')}</span></li>`).join('')}</ul>`;
}
async function loadHealth(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{const r=await fetch('/api/health-status',{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error(r.status);const data=await r.json();if(!data?.monitor||!Array.isArray(data.items))throw new Error('invalid');data.items=data.items.filter(item=>item&&typeof item==='object');health=data;healthFailed=false;}
 catch{healthFailed=true;}finally{clearTimeout(timer);}
 renderHealthSummary();renderProjects();
 if(projectDialog.open)updateProjectDialog(document.querySelector(`[data-open-project="${selectedProject}"]`));
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
 if(checks.length<ids.length)return '<span class="monitor-state warn">監視結果が一部未取得</span>';
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
 const list=projects.filter(p=>(filter==='all'||p.group===filter)&&(domain==='all'||p.domain===domain)&&[p.name,p.purpose,p.current,p.next,p.owner,p.routine||''].some(t=>t.toLowerCase().includes(q)));
 el('project-count').textContent=`${list.length} 件のプロジェクト`;
 el('project-grid').innerHTML=list.length?list.map(p=>`<article data-project="${projects.indexOf(p)}" class="project-card ${p.group==='paused'?'paused':''}"><div class="project-top"><span class="project-domain">${escapeHtml(p.domain)}</span><span class="badge project-status ${p.group==='active'?'active':p.group==='unknown'?'waiting':''}">${escapeHtml(p.status)}</span></div><h2>${escapeHtml(p.name)}</h2>${compactState(p)}<p class="project-purpose">${escapeHtml(p.purpose)}</p>${healthBlock(p)}<dl>${p.routine?`<dt>定期的に行うこと</dt><dd>${escapeHtml(p.routine)}</dd>`:''}<dt>現在の状況</dt><dd>${escapeHtml(p.current)}</dd><dt>次の行動</dt><dd>${escapeHtml(p.next)}</dd><dt>相談窓口</dt><dd>${escapeHtml(p.owner)}</dd></dl><p class="project-note">確認日：${escapeHtml(p.checked)} · <a href="/overview.html?project=${encodeURIComponent(p.id)}">次の行動・引き継ぎ →</a></p><details><summary>確認した資料</summary><p>${escapeHtml(p.reference)}<br>確認日：${escapeHtml(p.checked||"未確認")}</p></details><button class="project-open" data-open-project="${projects.indexOf(p)}" aria-label="${escapeHtml(p.name)}の詳細を開く" aria-haspopup="dialog"></button></article>`).join(''):'<div class="empty"><h3>該当するプロジェクトはありません</h3><p>表示範囲や検索条件を変更してください。</p></div>';
}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));renderProjects();}));
el('project-search').addEventListener('input',renderProjects);el('project-domain').addEventListener('change',renderProjects);renderProjects();
renderHealthSummary();loadHealth();setInterval(loadHealth,300000);

let selectedProject=null;
const projectDialog=el('project-dialog');
function updateProjectDialog(button){
 if(!button)return;
 const focusedHref=document.activeElement?.getAttribute('href');
 const opened=[...el('project-dialog-content').querySelectorAll('details')].map(d=>d.open);
 const content=button.closest('.project-card').cloneNode(true);
 content.className='project-detail';content.removeAttribute('data-project');
 content.querySelector('.project-open').remove();
 content.querySelector('.monitor-state').remove();
 content.querySelector('h2').id='project-detail-title';
 content.querySelectorAll('details').forEach((d,i)=>{d.open=opened[i]||false;});
 el('project-dialog-content').replaceChildren(content);
 if(focusedHref)for(const a of content.querySelectorAll('a'))if(a.getAttribute('href')===focusedHref)a.focus({preventScroll:true});
}
function openProject(button){
 if(!button)return;
 selectedProject=button.dataset.openProject;
 updateProjectDialog(button);
 projectDialog.showModal();
}
el('project-grid').addEventListener('click',event=>{
 if(document.body.classList.contains('monitor'))openProject(event.target.closest('[data-open-project]'));
});
el('project-dialog-close').addEventListener('click',()=>projectDialog.close());
projectDialog.addEventListener('click',event=>{if(event.target!==projectDialog)return;const r=projectDialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)projectDialog.close();});
projectDialog.addEventListener('close',()=>{
 const button=document.querySelector(`[data-open-project="${selectedProject}"]`);
 if(button)button.focus({preventScroll:true});
});

const requestedProject=new URLSearchParams(location.search).get('project');
const requestedIndex=projects.findIndex(p=>p.id===requestedProject);
if(requestedIndex>=0)openProject(document.querySelector(`[data-open-project="${requestedIndex}"]`));
