'use strict';
(()=>{
 const toggle=document.getElementById('sidebar-toggle');
 const sidebar=document.getElementById('app-sidebar');
 if(!toggle||!sidebar)return;
 function apply(closed){
  document.body.classList.toggle('sidebar-closed',closed);
  sidebar.hidden=closed;
  toggle.setAttribute('aria-expanded',String(!closed));
  toggle.textContent=closed?'☰ メニューを開く':'☰ メニューを閉じる';
 }
 let closed=true;
 try{closed=localStorage.getItem('monitor-sidebar')!=='open';}catch{}
 apply(closed);
 toggle.addEventListener('click',()=>{
  closed=!closed;apply(closed);
  try{localStorage.setItem('monitor-sidebar',closed?'closed':'open');}catch{}
 });
})();
