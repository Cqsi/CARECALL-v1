/* ---------- AUTH ---------- */
async function doLogin(){
  const e=document.getElementById('email').value.trim().toLowerCase();
  const p=document.getElementById('pass').value;
  if(e==='demo@carecall.fi' && p==='demo'){
    document.getElementById('login').style.display='none';
    document.getElementById('app').style.display='block';
    await refreshDashboardData();
    renderAll();
  } else {
    document.getElementById('loginErr').style.display='block';
  }
}
function doLogout(){
  document.getElementById('app').style.display='none';
  document.getElementById('login').style.display='flex';
  document.getElementById('pass').value='demo';
  closeDrawer();
}
document.getElementById('pass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});

/* ---------- NAV / ROUTING ---------- */
const titles={overview:'Welfare overview',residents:'Residents',calls:'Call log',alerts:'Wellbeing alerts',cost:'Cost & impact',settings:'Settings'};
document.querySelectorAll('.nav a').forEach(a=>{
  a.addEventListener('click',()=>{
    const v=a.getAttribute('data-view');
    document.querySelectorAll('.nav a').forEach(x=>x.classList.remove('active'));
    a.classList.add('active');
    document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
    document.getElementById('view-'+v).classList.add('active');
    document.getElementById('pageTitle').textContent=titles[v];
    closeDrawer();
  });
});

/* ---------- HELPERS ---------- */
const DEFAULT_API_BASE_URL = window.location.protocol === 'file:' || window.location.port === '3000'
  ? 'http://localhost:3001'
  : window.location.origin;
const API_BASE_URL = window.CARECALL_API_BASE_URL || localStorage.getItem('CARECALL_API_BASE_URL') || DEFAULT_API_BASE_URL;
const byId = id => residents.find(r=>r.id===id);
const initials = n => n.split(' ').map(w=>w[0]).join('').slice(0,2);
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function formatDuration(seconds){
  if(seconds === null || seconds === undefined) return 'No call yet';
  const mins=Math.floor(seconds/60), secs=seconds%60;
  return mins ? `${mins}m ${String(secs).padStart(2,'0')}s` : `${secs}s`;
}

function formatCallTime(iso){
  if(!iso) return 'No call yet';
  const date=new Date(iso);
  if(Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

function formatLastCall(iso){
  if(!iso) return 'No checkup yet';
  const date=new Date(iso);
  if(Number.isNaN(date.getTime())) return iso;
  const today=new Date();
  const sameDay=date.toDateString()===today.toDateString();
  return `${sameDay?'Today':date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}`;
}

function statusFromSentiment(sentiment){
  const s=(sentiment || '').toLowerCase();
  if(['concern','critical','alert','poor','negative','urgent'].some(x=>s.includes(x))) return 'alert';
  if(['watch','mixed','tired','low','unknown'].some(x=>s.includes(x))) return 'watch';
  return 'ok';
}

function trendFromScore(score){
  if(!Number.isFinite(score)) return [3,3,3,3,3,3,3];
  const clamped=Math.max(1,Math.min(5,Math.round(score)));
  return [3,3,3,3,clamped,clamped,clamped];
}

function transcriptFromBackend(call){
  return (call?.transcript || []).map(turn => ({
    r: turn.role === 'agent' ? 'ai' : 'user',
    t: turn.message || ''
  }));
}

function applyDashboardPayload(payload){
  const customerName=payload?.customer?.name || 'Casimir';
  const latest=payload?.latestCall;
  const status=statusFromSentiment(latest?.wellbeingSentiment);
  const summary=latest?.summary || 'No backend call has been received yet. Run the mock webhook or complete an ElevenLabs call to populate this checkup.';
  const transcript=latest ? transcriptFromBackend(latest) : [
    {r:'ai', t:'Waiting for the first CareCall checkup from the backend.'}
  ];

  residents = [{
    id:'backend-customer',
    name:customerName,
    age:'Demo',
    district:'Builder account',
    status,
    trend:trendFromScore(latest?.wellbeingScore),
    last:formatLastCall(latest?.calledAt),
    dir:'in',
    dur:formatDuration(latest?.durationSeconds),
    flag: status === 'ok' ? null : {
      level: status === 'alert' ? 'red' : 'amber',
      title:`${customerName} — ${latest?.wellbeingSentiment || 'wellbeing pending'}`,
      detail:summary
    },
    transcript
  }];

  callLog = latest ? [{
    resId:'backend-customer',
    dir:'in',
    sub:`Inbound checkup · ${latest.wellbeingSentiment || 'unknown'}`,
    dur:formatDuration(latest.durationSeconds),
    time:formatCallTime(latest.calledAt)
  }] : [];

  alerts = status === 'ok' ? [] : [{
    resId:'backend-customer',
    level:status === 'alert' ? 'red' : 'amber',
    title:`${customerName} — ${latest?.wellbeingSentiment || 'checkup pending'}`,
    desc:summary,
    when:latest?.calledAt ? formatLastCall(latest.calledAt) : 'Waiting for first backend call'
  }];
}

async function refreshDashboardData(){
  try{
    const res=await fetch(`${API_BASE_URL}/api/dashboard`);
    if(!res.ok) throw new Error(`Backend returned ${res.status}`);
    const payload=await res.json();
    applyDashboardPayload(payload);
  }catch(err){
    console.warn('Using mock dashboard data because the backend could not be reached.', err);
    useMockData();
    showToast('Backend offline', 'Showing local mock data until the server is available.');
  }
}
const statusBadge = s => ({
  ok:'<span class="badge b-ok"><span class="b-dot"></span>Stable</span>',
  watch:'<span class="badge b-watch"><span class="b-dot"></span>Watch</span>',
  alert:'<span class="badge b-alert"><span class="b-dot"></span>Action needed</span>'
}[s]);
function sparkline(data){
  const w=84,h=24,max=5,min=1,step=w/(data.length-1);
  const pts=data.map((v,i)=>`${(i*step).toFixed(1)},${(h-((v-min)/(max-min))*h).toFixed(1)}`).join(' ');
  const down=data[data.length-1]<data[0];
  const col=down?'var(--red)':'var(--grey-2)';
  return `<svg width="${w}" height="${h}" style="vertical-align:middle"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function dirIcon(isIn){
  return isIn
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 17 17 17 17 7"/><line x1="7" y1="7" x2="17" y2="17"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 7 7 7 7 17"/><line x1="17" y1="17" x2="7" y2="7"/></svg>';
}
function alertRowHTML(a){
  return `<div class="alert-item" onclick="${a.resId?`openResident('${a.resId}')`:''}">
    <div class="alert-ic" style="background:${a.level==='red'?'var(--red)':'var(--red-soft)'};color:${a.level==='red'?'#fff':'var(--red)'}">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
    <div class="alert-meta"><div class="t">${escapeHtml(a.title)}</div><div class="d">${escapeHtml(a.desc)}</div><div class="when">${escapeHtml(a.when)}</div></div>
  </div>`;
}
function callRowHTML(c){
  const r=byId(c.resId), isIn=c.dir==='in';
  return `<div class="call-row" onclick="openResident('${c.resId}')">
    <div class="dir ${isIn?'dir-in':'dir-out'}">${dirIcon(isIn)}</div>
    <div class="call-main"><div class="nm">${escapeHtml(r?r.name:'Unknown')}</div><div class="sub">${escapeHtml(c.sub)}</div></div>
    <div class="call-dur">${escapeHtml(c.dur)}</div>
    <div class="call-time">${escapeHtml(c.time)}</div>
  </div>`;
}

/* ---------- RENDER: OVERVIEW ---------- */
function renderOverview(){
  const order={alert:0,watch:1,ok:2};
  const sorted=[...residents].sort((a,b)=>order[a.status]-order[b.status]).slice(0,5);
  document.getElementById('resTableMini').innerHTML=sorted.map(r=>`
    <tr class="row" onclick="openResident('${r.id}')">
      <td><div class="person"><div class="avatar">${escapeHtml(initials(r.name))}</div><div><div class="nm">${escapeHtml(r.name)}</div><div class="ag">${escapeHtml(r.age)} · ${escapeHtml(r.district)}</div></div></div></td>
      <td><span style="color:var(--grey)">${escapeHtml(r.last)}</span></td>
      <td>${sparkline(r.trend)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('');
  document.getElementById('alertListMini').innerHTML=alerts.length?alerts.slice(0,5).map(alertRowHTML).join(''):`<div class="empty">No wellbeing alerts from the latest backend checkup.</div>`;
  document.getElementById('callMetaMini').textContent=callLog.length?`${callLog.length} backend call${callLog.length===1?'':'s'}`:'Waiting for backend call';
  document.getElementById('callLogMini').innerHTML=callLog.length?callLog.slice(0,6).map(callRowHTML).join(''):`<div class="empty">No call stored yet. Send an ElevenLabs webhook or run the mock webhook script.</div>`;
}

/* ---------- RENDER: RESIDENTS (full, searchable, filterable) ---------- */
let resFilter='all';
function setResFilter(f){resFilter=f;document.querySelectorAll('#resFilter button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));renderResidentsFull();}
function renderResidentsFull(){
  const q=(document.getElementById('resSearch').value||'').toLowerCase();
  let list=residents.filter(r=>resFilter==='all'||r.status===resFilter);
  if(q) list=list.filter(r=>r.name.toLowerCase().includes(q)||r.district.toLowerCase().includes(q));
  const order={alert:0,watch:1,ok:2};
  list.sort((a,b)=>order[a.status]-order[b.status]);
  document.getElementById('resCountMeta').textContent=`${list.length} of ${residents.length}`;
  document.getElementById('resTableFull').innerHTML = list.length?list.map(r=>`
    <tr class="row" onclick="openResident('${r.id}')">
      <td><div class="person"><div class="avatar">${escapeHtml(initials(r.name))}</div><div><div class="nm">${escapeHtml(r.name)}</div><div class="ag">${escapeHtml(r.age)} ${Number.isFinite(r.age)?'years':''}</div></div></div></td>
      <td><span style="color:var(--grey)">${escapeHtml(r.district)}</span></td>
      <td><span style="color:var(--grey)">${escapeHtml(r.last)}</span></td>
      <td>${sparkline(r.trend)}</td>
      <td>${statusBadge(r.status)}</td>
    </tr>`).join('') : `<tr><td colspan="5"><div class="empty">No residents match your search.</div></td></tr>`;
}

/* ---------- RENDER: CALLS (full) ---------- */
let callFilter='all';
function setCallFilter(f){callFilter=f;document.querySelectorAll('#callFilter button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));renderCallsFull();}
function renderCallsFull(){
  const q=(document.getElementById('callSearch').value||'').toLowerCase();
  let list=callLog.filter(c=>callFilter==='all'||c.dir===callFilter);
  if(q) list=list.filter(c=>{const r=byId(c.resId);return r&&r.name.toLowerCase().includes(q);});
  document.getElementById('callCountMeta').textContent=`${list.length} calls`;
  document.getElementById('callLogFull').innerHTML = list.length?list.map(callRowHTML).join('') : `<div class="empty">No calls match your search.</div>`;
}

/* ---------- RENDER: ALERTS (full) ---------- */
let alertFilter='all';
function setAlertFilter(f){alertFilter=f;document.querySelectorAll('#alertFilter button').forEach(b=>b.classList.toggle('on',b.dataset.f===f));renderAlertsFull();}
function renderAlertsFull(){
  let list=alerts.filter(a=>alertFilter==='all'||a.level===alertFilter);
  document.getElementById('alertCountMeta').textContent=`${list.length} alert${list.length===1?'':'s'}`;
  document.getElementById('alertListFull').innerHTML = list.length?list.map(alertRowHTML).join('') : `<div class="empty">No alerts in this category.</div>`;
}

/* ---------- DRAWER ---------- */
function openResident(id){
  const r=byId(id); if(!r) return;
  const down=r.trend[r.trend.length-1]<r.trend[0];
  document.getElementById('drHead').innerHTML=`
    <div class="top">
      <div class="who"><div class="avatar">${escapeHtml(initials(r.name))}</div><div><div class="nm">${escapeHtml(r.name)}</div><div class="ag">${escapeHtml(r.age)} · ${escapeHtml(r.district)}</div></div></div>
      <button class="close-x" onclick="closeDrawer()">×</button>
    </div>
    <div class="dr-stats">
      <div class="dr-stat"><div class="l">Last call</div><div class="v">${escapeHtml(r.last.replace('Today ',''))}</div></div>
      <div class="dr-stat"><div class="l">Duration</div><div class="v">${escapeHtml(r.dur)}</div></div>
      <div class="dr-stat"><div class="l">Wellbeing</div><div class="v" style="color:${down?'var(--red)':'var(--grey-dark)'}">${down?'Declining':'Stable'}</div></div>
    </div>`;
  let html='';
  if(r.flag){
    html+=`<div class="flag-card">
      <span class="fic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
      <div><div class="ft">${escapeHtml(r.flag.title)}</div><div class="fd">${escapeHtml(r.flag.detail)}</div></div>
    </div>`;
  }
  html+=`<div class="dr-actions">
    <button class="primary" onclick="drawerAction('escalate','${r.id}')">Escalate to nurse</button>
    <button onclick="drawerAction('call','${r.id}')">Call now</button>
    <button onclick="drawerAction('resolve','${r.id}')">Mark reviewed</button>
  </div>`;
  html+=`<div class="dr-sec-label">Call transcript</div>`;
  html+=r.transcript.map(m=>{
    let t=escapeHtml(m.t);
    if(m.flag){m.flag.forEach(f=>{t=t.replace(escapeHtml(f),`<span class="flagword">${escapeHtml(f)}</span>`);});}
    return `<div class="bubble ${m.r}"><div class="role">${m.r==='ai'?'CareCall':escapeHtml(r.name.split(' ')[0])}</div><div class="txt">${t}</div></div>`;
  }).join('');
  document.getElementById('drBody').innerHTML=html;
  document.getElementById('drawer').style.display='block';
}
function closeDrawer(){document.getElementById('drawer').style.display='none';}
function drawerAction(kind,id){
  const r=byId(id); if(!r)return;
  if(kind==='call'){
    openOutboundCallModal(r);
    return;
  }
  const msgs={escalate:`Escalated ${r.name} to the on-call nurse.`,call:`Placing a call to ${r.name}…`,resolve:`${r.name} marked as reviewed.`};
  showToast(kind==='call'?'Calling…':'Done', msgs[kind]);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});

function openOutboundCallModal(r){
  document.getElementById('callModalSub').textContent=`Start an outbound CareCall check-in for ${r.name}.`;
  document.getElementById('callPhone').value=localStorage.getItem('CARECALL_TARGET_PHONE') || '';
  document.getElementById('callInstructions').value=localStorage.getItem('CARECALL_LAST_INSTRUCTIONS') || `Ask ${r.name} how they are feeling right now, whether they have eaten and slept well, and whether there is anything worrying or unusual today.`;
  document.getElementById('callModal').style.display='block';
}

function closeCallModal(){
  document.getElementById('callModal').style.display='none';
}

async function submitOutboundCall(){
  const toNumber=document.getElementById('callPhone').value.trim();
  const instructions=document.getElementById('callInstructions').value.trim();
  localStorage.setItem('CARECALL_TARGET_PHONE', toNumber);
  localStorage.setItem('CARECALL_LAST_INSTRUCTIONS', instructions);

  try{
    showToast('Starting call', 'Sending instructions to ElevenLabs…', 3000);
    const res=await fetch(`${API_BASE_URL}/api/calls/outbound`, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({toNumber,instructions})
    });
    const payload=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(payload.error || payload.message || `Backend returned ${res.status}`);
    closeCallModal();
    showToast('Call started', payload.conversationId ? `Conversation ${payload.conversationId} initiated.` : 'ElevenLabs accepted the outbound call.');
  }catch(err){
    console.error(err);
    showToast('Call failed', err.message || 'Could not start the outbound call.');
  }
}

/* ---------- TOAST + LIVE CALL SIM ---------- */
function showToast(title,sub,ms=3500){
  const t=document.getElementById('toast');
  document.getElementById('toastTitle').textContent=title;
  document.getElementById('toastSub').textContent=sub;
  t.style.display='flex';
  clearTimeout(t._h); t._h=setTimeout(()=>{t.style.display='none';},ms);
}
async function simulateCall(){
  showToast('Refreshing latest checkup', 'Reading the newest call stored in the backend…', 2000);
  await refreshDashboardData();
  renderAll();
  showToast('Dashboard updated', 'Latest backend checkup is visible.');
}

/* ---------- INIT ---------- */
function renderAll(){
  renderOverview();
  renderResidentsFull();
  renderCallsFull();
  renderAlertsFull();
}
