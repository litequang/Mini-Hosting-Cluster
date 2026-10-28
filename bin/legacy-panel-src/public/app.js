const state={user:null,csrf:'',authMode:null,tab:'dashboard',sites:[],selectedSite:'',dir:'',selectedFile:'',stats:null};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtBytes=n=>{if(!Number.isFinite(+n))return '—';if(n<1024)return n+' B';let i=0;while(n>=1024&&i<4){n/=1024;i++;}return n.toFixed(1)+' '+['B','KB','MB','GB','TB'][i]};
const qs=o=>new URLSearchParams(o).toString();
let toastTimer;
function toast(message,error=false){const node=$('#toast');node.textContent=message;node.className='toast'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.add('hide'),4200);}
async function req(route,{method='GET',body,raw=false}={}){
 const opts={method,credentials:'same-origin',headers:{}};
 if(method!=='GET')opts.headers['x-csrf-token']=state.csrf;
 if(body!==undefined){if(raw){opts.body=body;}else{opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}}
 let res;try{res=await fetch(route,opts);}catch{throw Error('Không kết nối được panel');}
 if(!res.ok){let msg='HTTP '+res.status;try{msg=(await res.json()).error||msg;}catch{}if(res.status===401){if(state.authMode==='cloudflare-access')window.location.reload();else showLogin();}throw Error(msg);}
 return res.json();
}
function showLogin(){$('#shell').classList.add('hide');$('#login').classList.remove('hide');}
function showPanel(){$('#login').classList.add('hide');$('#shell').classList.remove('hide');nav(state.tab);}
function modal(title,html){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=html;$('#modal').classList.remove('hide');}
function closeModal(){state.pairingCode=null;state.pairingExpiresAt=null;$('#modal').classList.add('hide');$('#modalBody').innerHTML='';}
function input(name,label,placeholder='',val='',type='text'){return `<div class="inputgroup"><label>${esc(label)}</label><input name="${esc(name)}" placeholder="${esc(placeholder)}" value="${esc(val)}" type="${esc(type)}" required></div>`;}
function busy(button,func){if(!button)return func();button.disabled=true;const old=button.textContent;button.textContent='Đang xử lý...';return Promise.resolve().then(func).catch(e=>{toast(e.message,true);throw e;}).finally(()=>{button.disabled=false;button.textContent=old;});}
function page(title,html){$('#pageTitle').textContent=title;$('#content').innerHTML=html;}
async function nav(tab){state.tab=tab;$('#navigation').querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 try{if(tab==='dashboard')await dashboard();else if(tab==='sites')await sites();else if(tab==='files')await filesPage();else if(tab==='databases')await databases();else if(tab==='modules')await mhcModulesPage();else if(tab==='monitor')await mhcMonitorPage();else if(tab==='cluster')await mhcClusterPage();else if(tab==='services')await services();else if(tab==='backups')await backups();else if(tab==='domains')await domains();}catch(e){toast(e.message,true);page('Lỗi',`<div class="info danger">${esc(e.message)}</div>`);}}
function btn(s,a,cls='tiny'){return `<button class="${cls}" data-action="${a}">${esc(s)}</button>`;}
function serviceBadge(out){const running=out?.ok&&String(out.out||'').startsWith('run:');return `<span class="badge ${running?'good':'bad'}">${running?'Running':'Offline'}</span>`;}
async function dashboard(){const s=await req('/api/overview');state.stats=s;const b=s.battery||{};
 const batteryPercent=Number.isFinite(b.percentage)?Math.round(b.percentage)+'%':'—';
 const batteryTemperature=Number.isFinite(b.temperature)?b.temperature.toFixed(1)+'°C':'—';
 const batteryState=b.status==='CHARGING'?'Đang sạc':b.status==='FULL'?'Đã sạc đầy':b.status==='DISCHARGING'?'Đang xả pin':b.status==='NOT_CHARGING'?'Không sạc':b.plugged==='UNPLUGGED'?'Không cắm sạc':b.plugged||'Chưa xác định';
 const batteryHealth=b.health==='GOOD'?'Pin bình thường':b.health||'Chưa xác định';
 const batteryMeta=b.available?esc(batteryState+' · '+batteryHealth):'Termux:API chưa phản hồi';
 const batteryWarn=Number.isFinite(b.percentage)&&b.percentage<20?' · Pin thấp':'';
 const heatWarn=Number.isFinite(b.temperature)&&b.temperature>=40?' · Nhiệt độ cao':'';
 const rows=Object.entries(s.services).map(([name,v])=>`<tr><td class="titlecell">${esc(name)}</td><td>${serviceBadge(v)}</td><td class="muted mini mono">${esc((v.out||v.err||'').slice(0,120))}</td></tr>`).join('');
 const nodeRows=(s.nodeProcesses?.processes||[]).map(p=>`<tr><td class="titlecell">${esc(p.name)}</td><td class="mono">${p.pid}</td><td>${p.ppid}</td><td>${fmtBytes(p.rssBytes)}</td></tr>`).join('');
 page('Tổng quan',`<div class="grid">
 <div class="card stat"><div class="tag">WEBSITES</div><b>${s.sites}</b><small>Đang quản lý</small></div>
 <div class="card stat"><div class="tag">RAM ĐANG DÙNG</div><b>${fmtBytes(s.mem.total-s.mem.available)}</b><small>/ ${fmtBytes(s.mem.total)} RAM</small><div class="progress"><div style="width:${Math.round((s.mem.total-s.mem.available)*100/s.mem.total)}%"></div></div></div>
 <div class="card stat"><div class="tag">BỘ NHỚ TRỐNG</div><b>${fmtBytes(s.disk?.available)}</b><small>Trong ${fmtBytes(s.disk?.total)}</small></div>
<div class="card stat"><div class="tag">PIN ĐIỆN THOẠI</div><b>${esc(batteryPercent)}</b><small>${batteryMeta}${batteryWarn}</small></div>
 <div class="card stat"><div class="tag">NHIỆT ĐỘ PIN</div><b>${esc(batteryTemperature)}</b><small>${b.available?'Android Battery API · '+esc(b.health||''):'Không đọc được'}${heatWarn}</small></div>
 <div class="card stat"><div class="tag">NODE.JS</div><b>${esc(s.node)}</b><small>${esc(s.arch)} • local</small></div><div class="card stat"><div class="tag">UPTIME ANDROID</div><b>${Math.floor(s.uptime/3600)} giờ</b><small>Từ lần khởi động gần nhất</small></div></div>
 <div class="sectionhead"><h2>Dịch vụ máy chủ</h2>${btn('Xem logs','tab-services')}</div><div class="tablewrap"><table><thead><tr><th>Tên</th><th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>${rows}</tbody></table></div>
 <div class="sectionhead"><h2>Tiến trình Node.js</h2></div>
 <div class="tablewrap"><table><thead><tr><th>Ứng dụng</th><th>PID</th><th>PPID</th><th>RAM tiến trình</th></tr></thead><tbody>${nodeRows||'<tr><td colspan="4" class="empty">Không đọc được danh sách tiến trình Node.js</td></tr>'}</tbody></table></div>
 <div class="sectionhead"><h2>Hành động nhanh</h2></div><div class="btnrow">${btn('+ Tạo website','create-site','primary')}${btn('+ Tạo database','create-database')}${btn('Domain & Nginx','tab-domains')}</div>
 <p class="help">Panel chạy tại <code>127.0.0.1:9090</code>; truy cập bằng SSH forwarding hoặc Cloudflare Access được bảo vệ. Dịch vụ đang chạy không có nghĩa đã hoạt động ổn định sau reboot — hãy kiểm thử riêng.</p>`);
}

// Modules and Cluster are integrated into the ORIGINAL 9090 Panel, behind its existing session cookie.
// Never display env vars, credentials, raw remote reports or claim that labels establish HA authority.
const safeNum=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
// MHC_MONITOR_EXPANDED_ALL_NODES_V3: render entire cluster without per-node selection.
function mhcDuration(seconds){
 if(!Number.isFinite(seconds)||seconds<0)return '—';
 const day=Math.floor(seconds/86400),hour=Math.floor((seconds%86400)/3600);
 return day?day+' ngày '+hour+' giờ':hour+' giờ '+Math.floor((seconds%3600)/60)+' phút';
}
function mhcMonFormat(n,digits=0,unit=''){
 const v=typeof n==='number'&&Number.isFinite(n)?n:null;
 return v===null?'—':v.toFixed(digits)+unit;
}

function mhcMonAge(ts){
 const time=Date.parse(ts||'');
 if(!Number.isFinite(time))return 'chưa có';
 const delta=Date.now()-time;
 if(delta<0)return 'vừa nhận';
 if(delta<60000)return 'vừa nhận';
 if(delta<3600000)return Math.floor(delta/60000)+' phút trước';
 if(delta<86400000)return Math.floor(delta/3600000)+' giờ trước';
 return Math.floor(delta/86400000)+' ngày trước';
}

function mhcMonSpark(points,key,title){
 const a=(Array.isArray(points)?points:[]).filter(x=>typeof x?.[key]==='number'&&Number.isFinite(x[key])).slice(-144);
 if(a.length<2)return `<div class="mhc-spark"><span>${esc(title)}</span><small>Chưa đủ mẫu</small></div>`;
 const data=a.map(x=>x[key]),lo=Math.min(...data),hi=Math.max(...data),span=Math.max(1,hi-lo);
 const coords=data.map((n,i)=>`${(i*190/(data.length-1)+3).toFixed(1)},${(44-(n-lo)*36/span).toFixed(1)}`).join(' ');
 return `<div class="mhc-spark"><div class="mhc-spark-title"><span>${esc(title)}</span><b>${esc(mhcMonFormat(data[data.length-1],1))}</b></div><svg viewBox="0 0 196 48" preserveAspectRatio="none" aria-label="${esc(title)}"><polyline fill="none" stroke="currentColor" stroke-width="2.3" vector-effect="non-scaling-stroke" points="${coords}"/></svg></div>`;
}

function mhcMonHistoryHtml(points){
 const safe=Array.isArray(points)?points:[];
 const gapCount=safe.reduce((total,p,i)=>i&&Date.parse(p.at||'')-Date.parse(safe[i-1].at||'')>720000?total+1:total,0);
 return `<div class="mhc-history-label">Lịch sử 12 giờ <span>mỗi 5 phút · ${safe.length} mẫu${gapCount?' · '+gapCount+' khoảng gián đoạn':''}</span></div>
 <div class="mhc-sparklines">${mhcMonSpark(safe,'batteryPct','Pin %')}${mhcMonSpark(safe,'ramUsedMiB','RAM dùng · MiB')}${mhcMonSpark(safe,'tempC','Nhiệt độ pin °C')}${mhcMonSpark(safe,'wifiRssiDbm','Wi-Fi · dBm')}${mhcMonSpark(safe,'diskFreeMiB','Bộ nhớ trống · MiB')}${mhcMonSpark(safe,'rxKiBs','Mạng nhận · KiB/s')}</div>`;
}

function mhcMonCard(n,local=false){
 const m=n.telemetry||null;
 const fresh=local?Number.isFinite(Date.parse(m?.at||''))&&Date.now()-Date.parse(m.at)<180000:n.telemetryRecent===true;
 const reachable=local?!!m:n.heartbeatRecent===true;
 const status=!reachable?'MẤT TÍN HIỆU':!m?'CHƯA CÓ MONITOR V2':fresh?'ĐANG KẾT NỐI':'DỮ LIỆU ĐÃ CŨ';
 const klass=reachable?(fresh?'ok':'stale'):'off';
 const role=n.role==='PRIMARY_VERIFIED'?'PRIMARY':n.role==='STANDBY_NO_WRITER_GRANT'?'STANDBY':'CHƯA XÁC MINH';
 const numeric=(v,min=0,max=1e10)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null;
 const bat=numeric(m?.battery?.percentage,0,100),temp=numeric(m?.battery?.temperatureC,-25,100);
 const ram=numeric(m?.memory?.totalMiB),ramFree=numeric(m?.memory?.freeMiB);
 const disk=numeric(m?.storage?.totalMiB),diskFree=numeric(m?.storage?.freeMiB);
 const percentage=(f,t)=>f===null||t===null||t===0?null:Math.max(0,Math.min(100,f*100/t));
 const batteryBar=bat===null?0:bat;
 const wifi=numeric(m?.wifi?.rssiDbm,-127,0);
 const statusMap={running:'run',stopped:'down',unknown:'unknown'};
 const serviceItems=[
  ['mysqld','DB'],['mini-web','Web Node.js'],['nginx','Nginx'],['mhc-full-wp-php','WordPress PHP'],
  ['php-fpm','PHP-FPM'],['amh-panel','Panel'],['sshd','SSH'],
  ['named-tunnel','Web Tunnel'],['mhc-panel-tunnel','Panel Tunnel'],
  ['mhc-authority-agent','Cluster Agent'],['mhc-full-daily-backup','Backup'],
  ['mhc-full-wp-nginx','WordPress Nginx']
 ];
 const svcHtml=serviceItems.map(([key,label])=>{
  const v=m?.services?.[key]||'unknown';
  return `<span class="mhc-service ${v==='running'?'run':v==='stopped'?'down':'unknown'}" title="${esc(label)}: ${esc(statusMap[v]||'unknown')}"><span class="mhc-service-dot"></span>${esc(label)} <strong>${esc(statusMap[v]||'unknown')}</strong></span>`;
 }).join('');
 const processes=(Array.isArray(m?.processes)?m.processes:[]).slice(0,6);
 const procHtml=processes.length?processes.map(p=>`<div class="mhc-process"><span>${esc(p.name||'Node.js')}</span><strong>${esc(mhcMonFormat(numeric(p.rssMiB),0,' MiB'))}</strong></div>`).join(''):'<p class="mhc-note">Chưa có dữ liệu tiến trình Node.js</p>';
 const snap=m?.snapshot?.name||'Chưa ghi nhận';
 const warnings=[];
 if(!m)warnings.push('Agent chưa gửi dữ liệu Monitor v2. Kiểm tra Cluster Agent và phiên bản Worker.');
 else if(!fresh)warnings.push('Dữ liệu đã cũ; các số liệu bên dưới là lần đo cuối, không phải trạng thái hiện tại.');
 if(bat!==null&&bat<20)warnings.push('Pin thấp dưới 20%');
 if(temp!==null&&temp>=42)warnings.push('Nhiệt độ pin từ 42°C');
 if(ram&&ramFree!==null&&ramFree/ram<.15)warnings.push('RAM còn dưới 15%');
 if(disk&&diskFree!==null&&diskFree/disk<.1)warnings.push('Bộ nhớ còn dưới 10%');
 const meter=(f,t,css='')=>{
  const pc=percentage(f,t);
  return `<div class="mhc-meter ${css}"><span style="width:${pc===null?0:pc.toFixed(1)}%"></span></div>`;
 };
 const historyId=typeof n.nodeId==='string'&&/^[0-9a-f-]{36}$/.test(n.nodeId)?n.nodeId:null;
 const label=n.label||m?.device||'Android';
 const update=local?m?.at:n.metricsAt;
 return `<article class="mhc-node ${klass}" aria-label="Monitor ${esc(label)}">
  <header class="mhc-node-head">
   <div><div class="mhc-role">CẤU HÌNH: ${esc(role)}${local?' · PANEL NÀY':''}</div><h2>${esc(label)}</h2>
   <p>${esc(m?.device||'Android')} · Android ${esc(m?.android||'—')} · ${esc(mhcMonAge(update))}</p></div>
   <span class="mhc-node-status ${klass}"><span class="mhc-led"></span>${esc(status)}</span>
  </header>
  ${warnings.length?`<div class="mhc-alerts">${warnings.map(w=>`<span>${esc(w)}</span>`).join('')}</div>`:''}
  <div class="mhc-metrics">
    <div class="mhc-metric"><span>Pin</span><b>${esc(mhcMonFormat(bat,0,'%'))}</b><small>${esc(m?.battery?.status||'Chưa rõ')} · ${esc(m?.battery?.health||'Sức khỏe chưa rõ')}</small>${meter(bat,100,'battery')}</div>
    <div class="mhc-metric"><span>Nhiệt độ pin</span><b>${esc(mhcMonFormat(temp,1,'°C'))}</b><small>Nhiệt độ cảm biến pin</small></div>
    <div class="mhc-metric"><span>RAM còn khả dụng</span><b>${esc(mhcMonFormat(ramFree,0,' MiB'))}</b><small>Tổng ${esc(mhcMonFormat(ram,0,' MiB'))}</small>${meter(ramFree,ram)}</div>
    <div class="mhc-metric"><span>Bộ nhớ còn trống</span><b>${esc(mhcMonFormat(diskFree,0,' MiB'))}</b><small>Tổng ${esc(mhcMonFormat(disk,0,' MiB'))}</small>${meter(diskFree,disk)}</div>
    <div class="mhc-metric"><span>Thời gian hoạt động</span><b>${esc(mhcDuration(m?.uptimeSec))}</b><small>Tính từ lần Android khởi động</small></div>
    <div class="mhc-metric"><span>Wi-Fi</span><b>${m?.wifi?.state==='connected'?'Đã kết nối':'Chưa rõ'}</b><small>${wifi===null?'Không đo được tín hiệu':wifi+' dBm'} · không thu SSID</small></div>
    <div class="mhc-metric"><span>Mạng nhận / gửi</span><b>${esc(mhcMonFormat(numeric(m?.network?.rxKiBs),0,' KiB/s'))}</b><small>Gửi ${esc(mhcMonFormat(numeric(m?.network?.txKiBs),0,' KiB/s'))}</small></div>
    <div class="mhc-metric"><span>Node.js</span><b>${processes.length} tiến trình</b><small>RAM được đo nếu Android cho phép</small></div>
  </div>
  <div class="mhc-node-sections">
   <section class="mhc-node-panel"><h3>Trạng thái dịch vụ</h3><div class="mhc-service-grid">${svcHtml}</div></section>
   <section class="mhc-node-panel"><h3>Đồng bộ &amp; bản sao lưu</h3>
    <p><span>Đồng bộ</span><strong class="mhc-unknown">CHƯA XÁC MINH</strong></p>
    <p><span>Snapshot gần nhất</span><strong>${esc(snap)}</strong></p>
    <p><span>Thời điểm ghi nhận</span><strong>${esc(m?.snapshot?.recordedAt||'—')}</strong></p>
    <small>Snapshot chưa được xác minh checksum/khôi phục; không suy ra dữ liệu giữa các node giống nhau.</small>
   </section>
   <section class="mhc-node-panel"><h3>Tiến trình Node.js (${processes.length})</h3>${procHtml}</section>
   <section class="mhc-node-panel"><h3>Trạng thái cụm</h3>
    <p><span>Heartbeat gần nhất</span><strong>${esc(local?'Trực tiếp':mhcMonAge(n.lastSeenAt))}</strong></p>
    <p><span>Thông số gần nhất</span><strong>${esc(mhcMonAge(update))}</strong></p>
    <p><span>Quyền ghi Primary</span><strong>${role==='PRIMARY'?'Đã xác minh':'Chưa được cấp'}</strong></p>
   </section>
  </div>
  <section class="mhc-history" ${historyId?`data-mhc-history="${historyId}"`:''}>${historyId?'<div class="mhc-history-label">Lịch sử 12 giờ <span>Đang tải dữ liệu...</span></div>':'<p class="mhc-note">Lịch sử sẽ có sau khi node ghép vào Shared Authority.</p>'}</section>
 </article>`;
}

async function mhcMonLoadHistory(nodes,version){
 // Cards render immediately; fetch histories separately at bounded concurrency.
 const queue=nodes.filter(n=>/^[0-9a-f-]{36}$/.test(n.nodeId||''));
 const cache=state.monitorHistoryCache||(state.monitorHistoryCache=new Map());
 let index=0;
 const worker=async()=>{
  while(index<queue.length){
   const n=queue[index++],id=n.nodeId;
   let entry=cache.get(id);
   if(!entry||Date.now()-entry.at>90000){
    try{
     const response=await req('/api/mhc/monitor/history?'+qs({nodeId:id}));
     entry={at:Date.now(),points:Array.isArray(response.history?.points)?response.history.points:[]};
    }catch{entry={at:Date.now(),points:[]};}
    cache.set(id,entry);
   }
   if(state.tab!=='monitor'||version!==state.monitorRenderVersion)return;
   const target=document.querySelector(`[data-mhc-history="${id}"]`);
   if(target)target.innerHTML=mhcMonHistoryHtml(entry.points);
  }
 };
 await Promise.all(Array.from({length:Math.min(3,queue.length)},worker));
}

async function mhcMonitorPage(){
 if(state.monitorLoading)return;
 state.monitorLoading=true;
 try{
  const results=await Promise.allSettled([req('/api/mhc/monitor'),req('/api/mhc/cluster')]);
  if(state.tab!=='monitor')return;
  const local=results[0].status==='fulfilled'?results[0].value:null;
  const shared=results[1].status==='fulfilled'?results[1].value:null;
  const nodes=Array.isArray(shared?.nodes)?shared.nodes:[];
  let list=nodes.map(n=>({...n,local:false}));
  const localMatch=local?.nodeId&&list.find(n=>n.nodeId===local.nodeId);
  if(localMatch){
   // Local measurement is authoritative for this Panel only, not for other nodes.
   localMatch.telemetry=local;
   localMatch.local=true;
   localMatch.telemetryRecent=Number.isFinite(Date.parse(local.at||''))&&Date.now()-Date.parse(local.at)<180000;
  }else if(local)list.unshift({nodeId:null,label:local.nodeLabel||local.device||'Panel hiện tại',role:'LOCAL_PANEL',
    telemetry:local,local:true,heartbeatRecent:true,telemetryRecent:true,lastSeenAt:local.at,metricsAt:local.at});
  if(!list.length){
   page('Monitor toàn cụm','<div class="info">Chưa đọc được thông số và danh sách node. Kiểm tra Panel hoặc Cloudflare Authority.</div>');return;
  }
  list.sort((a,b)=>Number(b.local===true)-Number(a.local===true)||
   Number(b.heartbeatRecent===true)-Number(a.heartbeatRecent===true)||
   String(a.label||'').localeCompare(String(b.label||''),'vi'));
  const seen=nodes.filter(n=>n.heartbeatRecent===true).length;
  const fresh=nodes.filter(n=>n.heartbeatRecent===true&&n.telemetryRecent===true).length;
  const outdated=nodes.filter(n=>n.heartbeatRecent!==true).length;
  const banner=results[1].status==='rejected'||shared?.mode==='AUTHORITY_UNAVAILABLE'?
   '<div class="info danger">Cloudflare Shared Authority chưa phản hồi. Chỉ có số liệu trực tiếp của Panel này; không thể xác minh trạng thái các node khác.</div>':
   '<p class="mhc-footnote">Các trạng thái lấy từ heartbeat/telemetry, không phải kết quả kiểm tra website hoặc quyền Primary. Không nhận heartbeat không đồng nghĩa điện thoại đã tắt.</p>';
  const version=(state.monitorRenderVersion||0)+1;
  state.monitorRenderVersion=version;
  page('Monitor toàn cụm',`
   <section class="mhc-monitor-head"><div><h2>Toàn bộ node</h2><p>Mở Monitor là thấy tất cả thiết bị và dịch vụ, tự cập nhật sau mỗi 15 giây.</p></div>
    ${btn('Làm mới','monitor-refresh','primary')}</section>
   <div class="mhc-monitor-totals"><div><span>Node đã đăng ký</span><strong>${nodes.length}</strong></div><div><span>Nhận heartbeat</span><strong>${seen}</strong></div><div><span>Đang gửi thông số</span><strong>${fresh}</strong></div><div><span>Mất tín hiệu</span><strong>${outdated}</strong></div></div>
   ${banner}
   <div class="mhc-all-nodes">${list.map(n=>mhcMonCard(n,n.local===true)).join('')}</div>
   <p class="mhc-footnote">Không hiển thị chỉ số CPU vì Android thường không cấp quyền đọc. Các chỉ số không đo được để trống, không tự suy đoán. Biểu đồ có thể cần thêm thời gian tích lũy mẫu.</p>
  `);
  // Important: history is optional; displaying live cards never waits for it.
  mhcMonLoadHistory(list,version).catch(()=>{});
 }finally{state.monitorLoading=false;}
}

// No polling occurs before authentication; a single tab may refresh only while visible.
setInterval(()=>{if(state.user&&state.tab==='monitor'&&!document.hidden)mhcMonitorPage().catch(()=>{});},15000);
async function mhcModulesPage(){
 const d=await req('/api/mhc/modules');
 const statuses=Object.fromEntries((d.services||[]).map(v=>[v.name,v.state]));
 const rows=(d.modules||[]).map(m=>{const live=m.service?statuses[m.service]||'not-observed':'CLI';return `<tr><td class="titlecell">${esc(m.id)}</td><td>${m.installed?'Đã cài':'Chưa cài'}</td><td class="mono">${esc(m.version||'—')}</td><td>${esc(live)}</td></tr>`;}).join('');
 const extensions=(d.modules||[]).find(m=>m.id==='php')?.extensions||[];
 page('Modules máy chủ',`<div class="sectionhead"><div><h2>PHP · Nginx · MariaDB · Node.js</h2><p>Đọc trực tiếp trên điện thoại; trạng thái binary không đồng nghĩa HTTP/DB hoạt động.</p></div></div>
 <div class="tablewrap"><table><thead><tr><th>Module</th><th>Trạng thái cài</th><th>Phiên bản</th><th>Dịch vụ</th></tr></thead><tbody>${rows}</tbody></table></div>
 <div class="sectionhead"><h2>PHP Extensions</h2></div><div class="card"><p>${extensions.map(esc).join(' · ')||'Chưa đọc được extensions'}</p></div>
 <div class="info">${esc(d.notice)}</div>`);
}
function autoPrimaryHTML(p){
 const chosen=p.chosenCandidate?`${esc(p.chosenCandidate.label)} (backup ghi nhận: ${esc(p.chosenCandidate.backupStamp||'không rõ')})`:'Chưa có node phù hợp';
 return `<div class="card"><b>Auto Primary Election — ${esc(p.mode||'NOT_CONFIGURED')}</b>
 <p>Chế độ: ${p.enabled?'Đã bật kiểm tra bầu chọn':'Tắt mặc định'} · Ứng viên: ${chosen}</p>
 <p>Số node cũ cách ly: ${Number(p.quarantinedCount)||0} · Đổi tuyến gần nhất: ${p.lastElection?.routeVerified?'Đã ghi nhận API xác minh':'Chưa có'}</p>
 ${p.pendingRoute?'<p class="help">Có phiên đổi Cloudflare chưa xác nhận kết thúc. Controller sẽ đối chiếu lại CNAME trước khi bầu thêm node.</p>':''}
 <p class="help">Chỉ dựa heartbeat/snapshot đã ghi nhận; máy cũ quay lại phải vào Standby và đồng bộ lại. Không chứng minh fencing thực tế. Cấu hình tự động riêng bằng CLI trên controller độc lập.</p></div>`;
}
function primarySelectionHTML(p){
 state.primarySelection=p;
 if(p.mode==='AUTHORITY_UNAVAILABLE')return `<div class="card"><h2>Authority không truy cập được</h2><p>${esc(p.notice)}</p><p>Không thể tạo phiên chuyển Primary. Kiểm tra kết nối/cấu hình rồi tải lại.</p></div>`;
 if(p.mode==='SHARED_AUTHORITY_PREPARE_ONLY')return `<div class="card"><h2>Chuẩn bị chuyển Primary — trạng thái dùng chung</h2><p>Revision ${Number(p.revision)} · Epoch ${Number(p.epoch)}</p><p>Các Panel dùng chung phiên chuẩn bị. Bản này chưa kích hoạt node, chuyển tuyến hoặc cấp quyền ghi.</p><div class="toolbar"><select id="primaryTarget">${(p.nodes||[]).map(n=>`<option value="${esc(n.nodeId)}" ${n.heartbeatRecent?'':'disabled'}>${esc(n.label)}${n.heartbeatRecent?'':' (heartbeat cũ)'}</option>`).join('')}</select>${p.pending?'':btn('Tạo phiên chuẩn bị','primary-begin','primary')}</div>${p.pending?`<p>Đích: ${esc(p.pending.label)} · ${esc(p.pending.status)}</p>${btn('Hủy phiên chuẩn bị','primary-abort','tiny warn')}`:''}</div>`;
 const options=(p.nodes||[]).map(n=>`<option value="${esc(n.nodeId)}" ${!n.heartbeatRecent?'disabled':''}>${esc(n.label)}${n.heartbeatRecent?'':' (heartbeat cũ)'}</option>`).join('');
 const current=p.declaredPrimary?`${esc(p.declaredPrimary.label)} — do quản trị viên ghi nhận, CHƯA xác minh tuyến đang phục vụ`:'Chưa khai báo Primary';
 const pending=p.pending?`<div class="info"><b>Đang chuẩn bị chuyển tới ${esc(p.pending.label)}</b><p>Backup/restore và đổi tuyến phải làm bên ngoài Panel, sau đó xác nhận checklist.</p><div class="btnrow">${btn('Xác nhận đã hoàn tất chuyển thủ công','primary-complete','primary')}${btn('Hủy phiên','primary-abort','tiny warn')}</div></div>`:'';
 return `<div class="sectionhead"><h2>Chọn Primary thủ công — không cần replication tự động</h2></div>
 <div class="card"><p><b>Primary ghi nhận:</b> ${current}</p><p class="help">Node đã đăng ký: chọn đích → backup/restore thủ công → dừng ghi node cũ → kiểm tra node mới → đổi Cloudflare routing thủ công → xác nhận. MHC KHÔNG tự dừng node, đổi DNS hoặc bảo đảm chống split-brain.</p>
 <div class="toolbar"><select id="primaryTarget">${options||'<option>Chưa có node trong controller</option>'}</select>${btn('Chuẩn bị chọn Primary','primary-begin','primary')}</div>
 ${pending}<p class="help">Trạng thái: ${esc(p.mode)}. Chỉ là thông tin lựa chọn vận hành, KHÔNG cấp quyền HA/lease.</p></div>`;
}
// MHC_COMPACT_CLUSTER_UI_V1: compact dashboard for Shared Authority PREPARE_ONLY.
function mhcTime(v){const n=Date.parse(v||'');if(!Number.isFinite(n))return 'Chưa nhận';return new Date(n).toLocaleString('vi-VN');}
function mhcAge(v){const n=Date.parse(v||'');if(!Number.isFinite(n))return 'Chưa nhận';const s=Math.max(0,Math.floor((Date.now()-n)/1000));return s<60?s+' giây':s<3600+1?Math.floor(s/60)+' phút':Math.floor(s/3600)+' giờ';}
async function mhcClusterPage(){
 state.clusterTechnical=false;if(state.clusterOverviewLoading)return;state.clusterOverviewLoading=true;
 try{
  const d=await req('/api/mhc/cluster');if(state.tab!=='cluster'||state.clusterTechnical)return;
  const shared=d.mode==='SHARED_AUTHORITY_PREPARE_ONLY',failure=d.mode==='AUTHORITY_UNAVAILABLE',managed=d.p33?.enabled===true;
  const nodes=Array.isArray(d.nodes)?d.nodes:[],active=shared?nodes.filter(n=>n.heartbeatRecent===true).length:null;
  const cards=nodes.map(n=>{
   const good=n.heartbeatRecent===true,seen=n.lastSeenAt||n.lastSeen;
   const label=shared?(good?'Heartbeat gần đây':seen?'Heartbeat quá hạn':'Chưa nhận heartbeat'):(n.state||'Chưa xác minh');
   return `<div class='card'><div class='flex'><h3 style='margin:0'>${esc(n.label||'Node')}</h3><span class='badge ${shared?(good?'good':'bad'):''}'>${esc(label)}</span></div><p>Nhận tín hiệu cách đây: <b>${esc(mhcAge(seen))}</b></p><small class='muted'>Lần cuối: ${esc(mhcTime(seen))}</small><p class='muted'>Vai trò: ${esc(managed?(d.p33.lease?.nodeId===n.nodeId?'PRIMARY_MANAGED_SCOPE':'STANDBY'):shared?'STANDBY_NO_WRITER_GRANT':n.role||'Chưa xác minh')}</p><small class='mono muted' style='overflow-wrap:anywhere'>${esc(n.nodeId||'')}</small></div>`;
  }).join('');
  const notice=failure?'Cloudflare Shared Authority không truy cập được: chưa thể xác minh tình trạng node.':shared?'Heartbeat chỉ xác nhận liên lạc gần đây với Cloudflare, không chứng minh website hoặc database đã sẵn sàng.':'Chỉ có metadata quan sát cục bộ; chưa có quyền Primary được xác minh.';
  // M3 entry point: persist an operator-selected candidate in the shared authority.
  // This is not an active writer, route switch, or a Primary grant.
  state.primarySelection=shared?d:null;
  const targets=nodes.filter(n=>n.heartbeatRecent===true);
  const primaryChoices=targets.map(n=>`<option value="${esc(n.nodeId)}">${esc(n.label)}</option>`).join('');
  const intent=d.pending&&shared?`<div class="info"><b>Ứng viên P3 LAB: ${esc(d.pending.label||'Node')}</b>
<p>Trạng thái: <b>${esc(d.pending.status||'PREPARED_NO_WRITER_GRANT')}</b> · Epoch ${Number(d.pending.epoch)||0}</p>
<p>Chuyển DNS LAB chỉ được phép sau khi backup/restore và kiểm tra node đích. Không có fencing độc lập; không sử dụng cho website production.</p>
<div class="btnrow">
${!d.p31?.enabled&&d.pending.status==='PREPARED_NO_WRITER_GRANT'?btn('Chuyển Cloudflare DNS (LAB)','primary-lab-route','primary'):''}
${!d.p31?.enabled&&d.pending.status==='ROUTING_REQUESTED'?btn('Kiểm tra và tiếp tục DNS','primary-lab-resume','primary'):''}
${!d.p31?.enabled&&d.pending.status==='DNS_SWITCHED_AWAITING_HTTP_CONFIRM'?btn('Xác nhận sau chuyển tuyến (LAB)','primary-lab-complete','primary'):''}
${d.pending.status==='PREPARED_NO_WRITER_GRANT'?btn('Hủy ứng viên','primary-abort','tiny warn'):''}
</div></div>`:'';
  const recovery=shared&&!managed?`<div class="card"><h2>Panel chung &amp; khôi phục quản trị</h2>
 <p><b>Website Primary được ghi nhận (LAB):</b> ${esc(d.declaredPrimary?.label||'Chưa xác minh')}</p>
 <p><b>Tuyến quản trị:</b> ${d.panelRecovery?.status==='DNS_SWITCHED_RECOVERY'?'DNS Panel đã chuyển sang Standby (chưa kiểm tra HTTP)':d.panelRecovery?.status==='DNS_REQUESTED'?'Đang khôi phục Panel':d.panelRecoveryEnabled?'Theo dõi để khôi phục khi Primary mất tín hiệu (LAB)':'Chưa kích hoạt khôi phục tự động (LAB)'}</p>
 ${d.panelRecovery?`<p>Node Panel dự phòng: <b>${esc(nodes.find(n=>n.nodeId===d.panelRecovery.targetNodeId)?.label||'Không xác định')}</b> · ${esc(mhcTime(d.panelRecovery.dnsVerifiedAt||d.panelRecovery.startedAt))}</p>`:''}
 <p class="help">Panel 9090 vẫn chạy trên mọi node. Khôi phục địa chỉ Panel không tự chuyển website, DB hoặc quyền ghi. Chuyển Primary website cần hoàn tất P3 riêng.</p></div>`:'';
  const setupRows=(d.localOnboarding&&!shared?[{label:'Thiết bị này',telemetry:{onboarding:d.localOnboarding}}]:nodes).filter(n=>n.telemetry?.onboarding?.v===1).map(n=>{
   const o=n.telemetry.onboarding,fresh=n.heartbeatRecent===true&&n.telemetryRecent===true;
   const labels={INSTALL_INCOMPLETE:'Cài đặt chưa hoàn tất — tiếp tục đúng lệnh release ban đầu',PAIRING_REQUIRED:'Cần ghép Cluster',MANAGEMENT_NOT_RUNNING:'Cần kiểm Panel/Agent',TUNNEL_NOT_RUNNING:'Tunnel chưa chạy',CONTROL_PROOF_REQUIRED:'Chưa xác minh đủ đường chuyển Control',SITE_RESTORE_AND_GUARDS_REQUIRED:'Thiếu website/DB đã restore và kiểm tra quyền ghi'};
   return `<div class="info"><b>${esc(n.label)}</b> · ${fresh?'Báo cáo Agent mới':'Báo cáo đã cũ, cần node online'}<p>Hệ thống: ${esc(o.installPhase)} (${Number(o.completedStages)||0}/6) · Ghép Cluster: ${fresh?'Đã xác minh liên lạc':'Chưa xác minh lại'}<br>Panel/Agent: ${o.managementRunning?'Đang chạy':'Chưa sẵn sàng'} · Tunnel: ${o.tunnelRunning?'Đang chạy; chưa đủ bằng chứng chuyển Control':'Chưa chạy'}<br>Website/database: Chưa xác minh · Primary: Chưa đủ điều kiện</p><p>${(o.blockers||[]).map(b=>esc(labels[b]||'Cần kiểm tra thêm')).join('<br>')}</p><small>Để dùng làm dự phòng website, chọn backup/restore có kiểm chứng; ghép node không tự sao chép dữ liệu. Khởi động lại Android: chưa nghiệm thu.</small></div>`;
  }).join('');
  const enroll=shared?`<div class="card"><h2>Thêm điện thoại mới vào Cluster</h2><p>Điện thoại mới cần chạy bộ cài MHC một lần. Tạo mã dùng một lần, tự hết hạn sau 10 phút; node mới tham gia Standby và tự gửi Monitor.</p>${btn('Tạo mã ghép 10 phút','cluster-invite','primary')}${setupRows}</div>`:setupRows?`<div class="card"><h2>Cài đặt node mới</h2>${setupRows}<p>Trên Panel node đang hoạt động, tạo mã ghép; trên Termux này chạy <code>~/mhc-full join</code> rồi nhập mã ẩn.</p></div>`:'';
  const readiness=state.p31Readiness;
  const p31=!managed&&d.p31?.enabled?`<div class="card"><h2>P3.1 — website ứng viên nội bộ</h2><p>Preview chỉ đọc trên cổng loopback 18131, dữ liệu LAB riêng. Primary an toàn đang bị chặn: chưa fence được SQL đặc quyền, shell và các writer cùng Android UID.</p>
<div class="btnrow">${btn('Kiểm readiness hai node','primary-p31-check')}${d.pending?.status==='PREPARED_NO_WRITER_GRANT'?btn('Bật preview chỉ đọc trên ứng viên','primary-p31-prepare','primary'):''}</div>
<div class="toolbar"><select id="p31Target">${nodes.map(n=>`<option value="${esc(n.nodeId)}" ${n.nodeId===d.pending?.targetNodeId?'selected':''}>${esc(n.label)}</option>`).join('')}</select>${btn('Dừng preview về Standby','primary-p31-standby','tiny warn')}</div>
${readiness?.nodes?.map(n=>{const fresh=n.verified&&Date.now()<=n.expiresAt&&n.epoch===d.epoch&&n.revision===d.revision;return `<p><b>${esc(nodes.find(x=>x.nodeId===n.nodeId)?.label||n.nodeId)}</b>: ${!fresh?'Chưa xác minh hoặc proof đã hết hạn':!n.previewReady?'Thiếu dữ liệu/dịch vụ':n.websiteServing?'Website LAB đang preview chỉ đọc':'Dữ liệu sẵn sàng, website đang Standby'}<br><small>${esc(n.problem||n.problems?.join(', ')||'')} · P3.1 cấp writer: KHÔNG · kiểm lúc ${esc(mhcTime(n.checkedAt))}<br>MHC ${esc(n.version||'chưa xác minh')} · dataset ${esc(n.dataset?.datasetId||'chưa có')} · tạo lúc ${esc(mhcTime(n.dataset?.preparedAt))}</small></p>`;}).join('')||'<p>Heartbeat chưa đủ: bấm kiểm readiness để xác minh dữ liệu, SQL và HTTP riêng từng node.</p>'}</div>`:'';
  const lab=d.p32,labJournal=lab?.journal;
  const p32=shared&&!managed?`<div class="card"><h2>P3.2 — tuyến Internet LAB chỉ đọc</h2><p>Panel thử nghiệm: <a href="https://panel-lab.giaouoc.com" target="_blank" rel="noopener">panel-lab.giaouoc.com</a><br>Website thử nghiệm: <a href="https://preview-lab.giaouoc.com" target="_blank" rel="noopener">preview-lab.giaouoc.com</a></p><p>Không đổi panel.giaouoc.com, không cấp quyền ghi.</p>${lab?.enabled?`<p>Revision tuyến ${Number(lab.routeRevision)} · ${esc(labJournal?.status||'Chưa kiểm Internet')}<br>Panel: ${esc(nodes.find(n=>n.nodeId===lab.panelNodeId)?.label||lab.panelNodeId)}<br>Preview: ${esc(nodes.find(n=>n.nodeId===lab.siteNodeId)?.label||lab.siteNodeId)}</p><p>${labJournal?.httpVerified?'Đã kiểm Access và node ký proof qua tuyến LAB.':'DNS/API chưa đủ: mở Panel LAB rồi bấm xác minh Internet.'}</p><div class="toolbar"><select id="p32Target">${nodes.filter(n=>['4ed4c025-62ae-4c2a-8d68-65dd76ecf550','4a9672d1-bb62-4286-946a-a78b73e57b24'].includes(n.nodeId)).map(n=>`<option value="${esc(n.nodeId)}" ${n.nodeId===d.pending?.targetNodeId?'selected':''}>${esc(n.label)}</option>`).join('')}</select></div><div class="btnrow">${btn('Chuyển Panel + preview LAB','p32-route')}${btn('Chỉ chuyển Panel LAB','p32-panel')}${btn('Tiếp tục tuyến bị gián đoạn','p32-resume')}${btn('Rollback tuyến LAB','p32-rollback')}${btn('Xác minh Internet từ Panel LAB','p32-confirm','primary')}</div>`:'<p>Worker hiện chưa có P3.2 hoặc chưa được cấu hình LAB. Chưa thể chuyển tuyến.</p>'}</div>`:'';
  const selection=shared&&!managed?`<div class="card"><h2>Chọn node dự kiến làm Primary</h2><p>Thao tác đầu tiên chỉ chuẩn bị ứng viên. Chuyển tuyến chỉ hoạt động trên LAB có allowlist và xác nhận độc lập; không cấp writer lease.</p>${intent}${!d.pending?`<div class="toolbar"><select id="primaryTarget">${primaryChoices||'<option value="">Chưa có node sẵn sàng</option>'}</select>${primaryChoices?btn('Chọn node — bắt đầu chuẩn bị','primary-begin','primary'):''}</div>`:''}<p class="help">Route LAB có nhật ký phục hồi. Worker phải có quyền DNS cho đúng tên miền thử nghiệm; chưa có write fencing thực.</p></div>`:'';
  page('Cluster — tổng quan',`
  <div class='sectionhead'><div><h2>Cụm máy chủ</h2><p>Trạng thái từ Cloudflare, tự cập nhật mỗi 20 giây khi mở trang</p></div><div class='btnrow'>${btn('Làm mới','cluster-overview')}${btn('Kỹ thuật LAB','cluster-advanced')}</div></div>
  <div class='grid two'>
    <div class='card stat'><div class='tag'>NODE ĐĂNG KÝ</div><b>${Number.isInteger(d.nodeCount)?d.nodeCount:nodes.length}</b><small>${esc(d.mode||'Chưa cấu hình')}</small></div>
    <div class='card stat'><div class='tag'>HEARTBEAT GẦN ĐÂY</div><b>${active===null?'—':active+' / '+nodes.length}</b><small>Độ mới theo Cloudflare (180 giây)</small></div>
    <div class='card stat'><div class='tag'>PRIMARY GHI NHẬN (LAB)</div><b style='font-size:19px;letter-spacing:0'>${esc(d.declaredPrimary?.label||'Chưa xác minh')}</b><small>${managed?(d.p33.writerLeaseGranted?'Lease ghi chỉ website LAB':'Không có lease ghi hiệu lực'):'Không có lease/fencing độc lập'}</small></div>
    <div class='card stat'><div class='tag'>CHUYỂN PRIMARY TỰ ĐỘNG</div><b style='font-size:19px;letter-spacing:0'>Chưa hỗ trợ</b><small>Ưu tiên chuyển thủ công; Auto làm sau</small></div>
  </div>
  <div class='sectionhead'><h2>Thiết bị</h2></div><div class='grid two'>${cards||'<div class="card">Chưa có dữ liệu node.</div>'}</div>
  <div class='info' style='margin-top:16px'>${esc(notice)}</div>
  ${recovery}
  ${enroll}
  ${selection}
  ${managed?`<div class="card"><h2>Chuyển Primary / Control — LAB</h2><p>Primary: ${esc(nodes.find(n=>n.nodeId===d.p33.primaryNodeId)?.label||'Chưa hoàn tất')} · ${d.p33.writerLeaseGranted?'Lease ghi đang hiệu lực':'Không có lease ghi hiệu lực'}<br>Control: ${esc(nodes.find(n=>n.nodeId===d.p32?.panelNodeId)?.label||'Chưa xác định')}<br>Trạng thái: ${esc(d.p33.phase)} · ${esc(d.p33.journal?.status||'')}</p><p>Áp dụng WordPress LAB tại <a href="https://preview-lab.giaouoc.com" target="_blank" rel="noopener">preview-lab.giaouoc.com</a>. Dùng dữ liệu sẵn có trên node đích; không tự đồng bộ DB. Node cũ phải liên lạc được để dừng ghi. Website khác giữ nguyên.</p><div class="toolbar"><select id="p33Target">${nodes.filter(n=>['4ed4c025-62ae-4c2a-8d68-65dd76ecf550','4a9672d1-bb62-4286-946a-a78b73e57b24'].includes(n.nodeId)).map(n=>`<option value="${esc(n.nodeId)}">${esc(n.label)}</option>`).join('')}</select></div><div class="btnrow">${['IDLE','COMMITTED','CANCELLED'].includes(d.p33.phase)?btn('Chuyển Primary + Control','p33-switch','primary')+btn('Chỉ chuyển Control','p33-control'):''}${btn('Tiếp tục tác vụ','p33-resume')}${d.p33.journal?.status==='AWAITING_PUBLIC'?btn('Hoàn tất kiểm tra Internet','p33-confirm','primary'):''}${['FENCING','ACTIVATING','ACTIVE'].includes(d.p33.phase)?btn('Dừng và hủy trước đổi DNS','p33-cancel','warn'):''}</div></div>`:''}
  ${p31}
  ${p32}
  ${shared?`<div class='card' style='margin-top:16px'><b>Shared Authority M2</b><p>Revision ${Number.isSafeInteger(d.revision)?d.revision:'—'} · Epoch ${Number.isSafeInteger(d.epoch)?d.epoch:'—'} · Phiên chuẩn bị ${d.pending?'đang mở':'không có'}</p><p class='help'>${managed?'Manual Primary có lease cho WordPress LAB; không tự đồng bộ dữ liệu và không fence root/shell ngoài MHC.':'PREPARE_ONLY: chưa cấp quyền Primary, không chuyển dịch vụ hay đồng bộ dữ liệu.'}</p></div>`:''}
  `);
 }finally{state.clusterOverviewLoading=false;}
}
async function mhcClusterTechnicalPage(){
 const [d,repl,sw,fence,witness,writepaths,writerAudit,primary,autoPrimary,guard,remotePanel]=await Promise.all([req('/api/mhc/cluster'),req('/api/mhc/replication'),req('/api/mhc/switchover'),req('/api/mhc/fencing'),req('/api/mhc/witness'),req('/api/mhc/write-paths'),req('/api/mhc/writer-audit'),req('/api/mhc/primary-selection'),req('/api/mhc/auto-primary'),req('/api/mhc/node-guard'),req('/api/mhc/remote-access')]);
 const rows=(d.nodes||[]).map(n=>{const when=n.lastSeenAt||n.lastSeen;
 const status=n.heartbeatRecent===true?'Heartbeat gần đây':n.heartbeatRecent===false?(when?'Quá hạn':'Chưa ghi nhận'):(n.state||'Chưa xác minh');
 return `<tr><td>${esc(n.label)}</td><td>${esc(status)}</td><td>${esc(mhcTime(when))}</td></tr>`;}).join('');
 const alerts=(d.alerts||[]).map(a=>`<p>${esc(a.kind)}: ${esc(a.message)}</p>`).join('');
 page('Cluster (quan sát)',`${primarySelectionHTML(primary)}<div class="card"><b>Quản trị Primary từ Internet</b><p>${remotePanel.configured?`Hostname dự kiến: <b>https://${esc(remotePanel.remoteHostname)}</b>`:'Chưa cấu hình Cloudflare Access cho Panel.'}</p><p class="help">Mỗi node giữ Panel 127.0.0.1:9090, mật khẩu và CSRF; truy cập từ Internet cần Tunnel + Access JWT. Khi đã cấu hình authority chung, các Panel dùng cùng phiên chuẩn bị. Tuyến quản trị chung dự phòng và chuyển tuyến website chưa được cấu hình tự động.</p></div>${autoPrimaryHTML(autoPrimary)}<div class="card"><b>Node Role Guard (LAB)</b><p>${guard.armed?'Đã ARM':'Chưa ARM'} · ${guard.services?.length||0} dịch vụ khai báo · Lần kiểm tra: ${esc(guard.lastCheck?.reason||'Chưa kiểm tra')}</p><small>Chỉ tự hạ dịch vụ LAB khi mất quyền; không tự bật lại và chưa có fencing độc lập cho mọi đường ghi.</small></div><div class="grid"><div class="card stat"><div class="tag">TRẠNG THÁI</div><b>${esc(d.mode)}</b><small>Chỉ quan sát</small></div><div class="card stat"><div class="tag">NODE</div><b>${Number(d.nodeCount)||0}</b><small>Đã ghi nhận, không phải HA-ready</small></div><div class="card stat"><div class="tag">BACKUP</div><b>${esc(d.backupStatus||'—')}</b></div><div class="card stat"><div class="tag">CLONE</div><b>${esc(d.cloneState||'—')}</b></div></div>
 <div class="sectionhead"><h2>v0.4A — Local Replication Observer (chỉ đọc)</h2></div><div class="grid"><div class="card"><h3>GTID MariaDB</h3><p>${repl.gtid?.observed?'Đã đọc cấu hình cục bộ':'Chưa có quan sát'}</p><small>Binlog: ${repl.gtid?.binaryLogEnabled?'ON':'Chưa xác nhận'} · GTID strict: ${repl.gtid?.gtidStrictMode?'ON':'Chưa xác nhận'}</small></div><div class="card"><h3>File SHA-256</h3><p>${esc(repl.mode||'NOT_OBSERVED')} · ${Number(repl.files)||0} file</p><small>Thêm: ${Number(repl.change?.added)||0} · Sửa: ${Number(repl.change?.modified)||0} · Xóa: ${Number(repl.change?.removed)||0}</small></div></div><div class="info">${esc(repl.notice||'Chưa có báo cáo. Chạy ~/mhc-full replication scan trên node LAB.')} KHÔNG PHẢI replication đang hoạt động.</div>
 <div class="sectionhead"><h2>v0.4D — E2E Acceptance Gate (LAB)</h2></div><div class="grid"><div class="card"><h3>Bằng chứng 2 giao dịch</h3><p>${esc(repl.e2eAcceptance?.review||'NOT_OBSERVED')}</p><small>Đã thấy: ${(repl.e2eAcceptance?.phases||[]).filter(Boolean).length}/3 pha; giao dịch mới: ${repl.e2eAcceptance?.distinctNewProbe?'Đã kiểm tra':'Chưa đủ'}</small></div><div class="card"><h3>File offline</h3><p>${repl.e2eAcceptance?.fileVerified?'SHA-256 đã xác minh tại thời điểm đọc':'Chưa xác minh'}</p><small>Cần nghiệm thu thủ công trên 2 Android LAB. Không cấp quyền HA.</small></div></div>
<div class="sectionhead"><h2>v0.4B.1 — MariaDB GTID LAB</h2></div><div class="grid"><div class="card"><h3>Replica receiver</h3><p>${esc(repl.lab?.mode||'NOT_OBSERVED')}</p><small>Kênh quan sát: ${repl.lab?.channelCount??'—'} · Không cấp quyền ghi</small></div><div class="card"><h3>IO / SQL thread</h3><p>${(repl.lab?.channels||[]).map(c=>`${c.ioRunning?'IO: ON':'IO: OFF'} / ${c.sqlRunning?'SQL: ON':'SQL: OFF'} / lag: ${c.lagSeconds??'—'}s`).join(' · ')||'Không có replica được xác nhận'}</p><small>Lag không chứng minh GTID hoặc dữ liệu đã đồng bộ</small></div></div><div class="info">Để xem chi tiết tại Termux LAB: ~/mhc-full replication lab-status. Không tự cấu hình DB hoặc thăng Primary.</div>
 <div class="sectionhead"><h2>v0.4B.4 — GTID Acceptance LAB</h2></div><div class="grid"><div class="card"><h3>Diễn tập mất kết nối</h3><p>${esc(repl.acceptance?.mode||'NO_OUTAGE_EVIDENCE')}</p><small>${(repl.acceptance?.phases||[]).map(esc).join(' → ')||'Chưa có chứng cứ'}</small></div><div class="card"><h3>Đủ bằng chứng LAB?</h3><p>${repl.acceptance?.completed?'Đã ghi nhận đủ 3 trạng thái LAB':'Chưa đủ chứng cứ'}</p><small>Không phải xác nhận HA, dữ liệu toàn vẹn hoặc quyền Primary</small></div></div>
 <div class="sectionhead"><h2>v0.4B.2 — GTID Seed LAB</h2></div><div class="grid"><div class="card"><h3>Seed đã ghi nhận</h3><p>${Number(repl.seed?.seedCount)||0} bản</p><small>${esc(repl.seed?.mode||'NOT_OBSERVED')} · Không tự nhập SQL</small></div><div class="card"><h3>GTID catch-up</h3><p>CHƯA NGHIỆM THU</p><small>Không tự cấu hình kết nối, không chuyển Primary</small></div></div>
 <div class="sectionhead"><h2>v0.4C.1 — File Delta LAB</h2></div><div class="grid"><div class="card"><h3>Gói file gia tăng</h3><p>${esc(repl.fileDelta?.mode||'NOT_CONFIGURED')}</p><small>Manifest: ${Number(repl.fileDelta?.manifests)||0} · Gói delta: ${Number(repl.fileDelta?.bundles)||0}</small></div><div class="card"><h3>Ứng viên offline</h3><p>${Number(repl.fileDelta?.candidates)||0} bản</p><small>Chưa áp dụng vào website và chưa liên kết GTID</small></div></div>
 <div class="sectionhead"><h2>v0.4C.2 — Peer Transfer LAB</h2></div><div class="grid"><div class="card"><h3>Truyền delta qua SSH</h3><p>${esc(repl.filePeer?.mode||'NOT_CONFIGURED')}</p><small>Máy gửi đã xác minh: ${Number(repl.filePeer?.verified)||0} · Có thể thử lại: ${Number(repl.filePeer?.retryable)||0}</small></div><div class="card"><h3>Máy nhận</h3><p>${Number(repl.filePeer?.received)||0} gói được ghi biên nhận</p><small>Đang/đã bắt đầu gửi: ${Number(repl.filePeer?.active)||0} · Chỉ metadata; không có phép ghi vào website/GTID</small></div></div>
 <div class="sectionhead"><h2>v0.4C.3 — GTID + file checkpoint LAB (offline)</h2></div><div class="grid"><div class="card"><h3>Bản áp dụng riêng</h3><p>${Number(repl.fileConsistent?.offlineVersions)||0} bản offline</p><small>${esc(repl.fileConsistent?.mode||'NOT_CONFIGURED')} · Không ghi đè website/DB đang phục vụ</small></div><div class="card"><h3>Giới hạn an toàn</h3><p>Chưa xác minh snapshot nguyên tử</p><small>Checkpoint dựa trên xác nhận tạm dừng ghi của người quản trị và GTID đối chiếu; KHÔNG cấp quyền Primary/HA</small></div></div>

 <div class="sectionhead"><h2>v0.5B.5 — HTTP Write Gate LAB (localhost-only)</h2></div><div class="grid"><div class="card"><h3>HTTP LAB 127.0.0.1:19096</h3><p>${writepaths.isolatedHttpGateConfigured?'Đã có cấu hình LAB':'CHƯA CẤU HÌNH'}</p><small>4 endpoint ghi fixture; chỉ đọc trạng thái local, KHÔNG xác minh dịch vụ đang chạy hay lease hiện tại</small></div><div class="card"><h3>Đường ghi production chưa được bảo vệ</h3><p>${Number(writepaths.unguardedProductionPaths)||9} nhóm CHƯA CHỐT</p><small>Nginx, PHP, MariaDB, uploads, shell, Panel, backup, route, job vẫn bỏ qua gate nếu dùng trực tiếp</small></div></div><div class="info">HTTP thật nhưng chỉ trên localhost và thư mục fixture LAB cách ly. Không có reverse proxy Nginx, không cấp HA hay Primary. Chạy ~/mhc-full http-gate plan để xem giới hạn.</div>
 <div class="sectionhead"><h2>v0.5B.2 — Cloudflare Witness LAB</h2></div><div class="grid"><div class="card"><h3>LAB client</h3><p>${witness.clientConfigured?'Đã có cấu hình client':'CHƯA CẤU HÌNH'}</p><small>Không gọi Cloudflare từ Panel; chỉ đọc sự hiện diện file cấu hình</small></div><div class="card"><h3>Chốt ghi production</h3><p>CHƯA TRIỂN KHAI</p><small>Lease trên LAB không thay thế fencing tại MariaDB, PHP, file, route</small></div></div><div class="info">Mọi kết nối witness LAB thực hiện thủ công bằng ~/mhc-full witness status hoặc gate-check. Không tạo HA hay quyền Primary.</div>
 <div class="sectionhead"><h2>v0.5B — Fencing &amp; Lease Fault LAB (chỉ mô phỏng)</h2></div><div class="grid"><div class="card"><h3>Đối chiếu các tình huống lỗi</h3><p>${esc(fence.review||'NOT_OBSERVED')}</p><small>${Number(fence.scenarioCount)||0} kịch bản giả lập · ${Number(fence.failedCount)||0} lỗi · Không có lease thật</small></div><div class="card"><h3>Thẩm quyền ghi / HA</h3><p>CHƯA ĐƯỢC CHỨNG THỰC</p><small>Không có fencing độc lập, term gate trên tất cả đường ghi hoặc kiểm thử phân vùng mạng thực tế</small></div></div><div class="info">Bộ mô phỏng chỉ kiểm tra nguyên tắc fail-closed. Không cấp lease hay điều khiển Cloudflare. Sử dụng ~/mhc-full fencing scenarios để xem tình huống LAB.</div>
 <div class="sectionhead"><h2>v0.5C — Field Drill 3 pha (hai Android LAB)</h2></div><div class="grid"><div class="card"><h3>GTID source → replica</h3><p>CHỜ CHỨNG CỨ HAI NODE</p><small>Baseline → IO down + GTID source tăng → IO/SQL chạy, replica bắt kịp. Trên máy quản trị: field-drill collect/verify</small></div><div class="card"><h3>SHA-256 file fixture</h3><p>CHỜ NGHIỆM THU THỰC</p><small>Source thay đổi trong gián đoạn, replica giữ bản cũ, sau phục hồi hai bên trùng hash. Panel không đọc file chứng cứ từ PC.</small></div></div><div class="info">Kiểm thử giả lập đã có mã; kết quả hai điện thoại LAB thật CHƯA được xác nhận. Không cấp quyền Primary, không tự chỉnh Cloudflare, không chứng minh hard-fencing.</div>
 <div class="sectionhead"><h2>v0.5C — Kiểm kê đường ghi HOST (chỉ đọc)</h2></div><div class="grid"><div class="card"><h3>Đường ghi có dấu hiệu hoạt động</h3><p>${Number(writerAudit.activeOrConfiguredCount)||0}/12 nhóm</p><small>${esc(writerAudit.mode||'NOT_OBSERVED')} — chỉ thấy dịch vụ hoặc cấu hình; không chứng minh quyền ghi</small></div><div class="card"><h3>Đường ghi chưa chứng minh fencing</h3><p>${Number(writerAudit.unverifiedFencingPaths)||12}/12 nhóm</p><small>KHÔNG ĐƯỢC PHÉP chuyển Primary/HA. Dịch vụ dừng không chứng minh khóa ghi an toàn.</small></div></div><div class="info">Quét lại trên node: ~/mhc-full writer-audit scan. Không đọc mật khẩu, không truy vấn DB, không gọi mạng, không chạm cấu hình. ${esc(writerAudit.notice||'')}</div>
 <div class="sectionhead"><h2>v0.5C — Active Fence Probe (LAB canary)</h2></div><div class="grid"><div class="card"><h3>Writer A → Writer B</h3><p>CHỜ PHÉP THỬ TRÊN HAI ANDROID</p><small>Gửi POST thật tới canary LAB trên từng máy; yêu cầu A từ chối, B chấp nhận, B từ chối khi witness không cấp phép.</small></div><div class="card"><h3>Phạm vi đã fencing</h3><p>CHƯA CÓ BẰNG CHỨNG PRODUCTION</p><small>Chữ ký Ed25519 chỉ bảo vệ chứng cứ cho localhost LAB canary. Không bảo vệ MariaDB/PHP/WordPress, không cấp Primary.</small></div></div><div class="info">Trên node LAB trống: ~/mhc-full fence-probe plan. Gửi 3 yêu cầu thử theo hướng dẫn, ký và đối chiếu ngoại tuyến. Panel không thu token, không chạy write probe và không kết nối witness.</div>
 <div class="sectionhead"><h2>v0.5C — Manual Switchover LAB (chờ nghiệm thu)</h2></div><div class="grid"><div class="card"><h3>Nhật ký diễn tập</h3><p>${esc(sw.state||'NOT_OBSERVED')}</p><small>${(sw.simulatedSteps||[]).length} bước mô phỏng · Không có chuyển quyền thật</small></div><div class="card"><h3>Quyền Primary</h3><p>KHÔNG ĐƯỢC CẤP</p><small>Chưa có chứng nhận write fencing, lease, GTID và Cloudflare routing trực tiếp</small></div></div><div class="info">Bản C-LAB có thêm ~/mhc-full switchover-readiness plan và HTTP/MariaDB LAB fixture. Chưa có executor chuyển Primary, chứng nhận Android E2E hoặc khóa ghi production.</div>
 <div class="sectionhead"><h2>v0.5C — Diễn tập HTTP E2E trên localhost (dữ liệu giả lập)</h2></div><div class="grid"><div class="card"><h3>Giao dịch và chuyển tuyến LAB</h3><p>${esc(sw.loopback?.status||'NOT_OBSERVED')}</p><small>${Number(sw.loopback?.eventCount)||0} sự kiện · HTTP thật trên loopback · Source/replica và witness giả lập</small></div><div class="card"><h3>Fencing thật / quyền Primary</h3><p>CHƯA ĐẠT</p><small>Không phải hai Android, không dùng GTID MariaDB và không chặn writer ngoài LAB</small></div></div><div class="info">Chỉ trên máy LAB trống: ~/mhc-full switchover-e2e plan hoặc run --confirm=RUN_SYNTHETIC_LOOPBACK_SWITCHOVER_ONLY. Không chuyển website, cloud routing, lease hoặc DB thật.</div>
 <div class="sectionhead"><h2>Node Inventory</h2></div><div class="tablewrap"><table><thead><tr><th>Node</th><th>Heartbeat</th><th>Quan sát cuối</th></tr></thead><tbody>${rows||'<tr><td colspan="3">Chưa có node</td></tr>'}</tbody></table></div><div class="sectionhead"><h2>Cảnh báo</h2></div><div class="card">${alerts||'<p>Chưa có báo cáo cảnh báo.</p>'}</div><div class="info">${esc(d.notice)}</div>`);
}
async function loadSites(){state.sites=(await req('/api/sites')).sites;return state.sites;}
async function sites(){const items=await loadSites();const lab=await req('/api/mhc/sites');const labRows=(lab.sites||[]).map(x=>`<tr><td class="titlecell">${esc(x.slug)}</td><td>${esc(x.type)}</td><td>${x.filesPresent?'Đã có thư mục':'Thiếu file'}</td><td>Chưa kiểm tra HTTP/DB</td></tr>`).join('');page('Quản lý website',`<div class="sectionhead"><div><h2>Danh sách website</h2><p>Website của Panel gốc và MHC LAB được hiển thị theo từng nhóm, không cần tạo lại cấu hình Nginx.</p></div>${btn('+ Website mới','create-site','primary')}</div><div class="tablewrap"><table><thead><tr><th>Website</th><th>Loại</th><th>Origin</th><th>Hành động</th></tr></thead><tbody>${items.map(s=>`<tr><td><div class="titlecell">${esc(s.hostname)}</div><small class="muted">${esc(s.slug)}${s.external?' • Website hiện có':''}</small></td><td><span class="badge ${s.external?'good':''}">${s.external?'Đang tiếp quản':s.type==='node'?'Node.js':'Static'}</span></td><td class="mono">${s.type==='node'?`127.0.0.1:${s.port}`:'Nginx static'}</td><td><div class="btnrow">${s.external?`${btn('⬆ Cập nhật build ZIP','existing-deploy','primary')}${btn('↶ Rollback','existing-releases')}${btn('Logs','existing-log')}${btn('Restart','existing-restart')}`:`${btn('Tải ZIP','zip:'+s.slug)}${btn('Deploy Git','git:'+s.slug)}${s.type==='node'?btn('npm install','npm:'+s.slug):''}${btn('Backup','backup-site:'+s.slug)}${btn('Xóa','delete-site:'+s.slug,'tiny warn')}`}</div></td></tr>`).join('')||'<tr><td colspan="4" class="empty">Chưa có website nào được Panel nhận diện.</td></tr>'}</tbody></table></div>
 <div class="sectionhead"><h2>Website MHC LAB</h2></div><div class="tablewrap"><table><thead><tr><th>Mã</th><th>Loại</th><th>Files</th><th>Readiness</th></tr></thead><tbody>${labRows||'<tr><td colspan="4">Chưa có website MHC LAB</td></tr>'}</tbody></table></div><p class="help">${esc(lab.notice)}</p><div class="info" style="margin-top:20px"><b>Thờ Phượng Pro hiện có:</b> cập nhật qua ZIP chứa <code>dist/index.html</code>, <code>dist/server.cjs</code> và <code>dist/assets</code>. Panel giữ nguyên <code>.env</code>, database, sheet và <code>node_modules</code>; có rollback bản build cũ. Nếu phiên bản mới thay đổi dependencies hoặc schema database, cần xử lý riêng trước.</div>`);}
function modalCreateSite(){modal('Tạo website',`<form id="siteForm">${input('slug','Mã website (chữ thường, ví dụ demo-web)','demo-web')}${input('hostname','Tên miền đầy đủ','demo.example.com')}<div class="inputgroup"><label>Loại website</label><select name="type" id="siteType"><option value="static">Website tĩnh / React build</option><option value="node">Node.js (server.js)</option></select></div><div class="inputgroup"><label>Node entrypoint (nếu Node.js)</label><input name="entry" value="server.js"></div><p class="hint">Không đụng tới website pro.thophuong.com. Domain mới phải được thêm route trên Cloudflare.</p><button class="primary wide">Tạo website</button></form>`);}
let selectedPath='';
async function filesPage(){const list=await loadSites();if(!state.selectedSite||!list.some(s=>s.slug===state.selectedSite)){state.selectedSite=list[0]?.slug||'';state.dir='';state.selectedFile='';}
 if(!state.selectedSite){page('File Manager','<div class="empty">Chưa có website được nhận diện.</div>');return;}
 const site=list.find(s=>s.slug===state.selectedSite),ro=false,isExisting=!!site.external;
 const result=await req(`/api/files/${state.selectedSite}/list?${qs({path:state.dir})}`);const selector=list.map(s=>`<option value="${esc(s.slug)}" ${s.slug===state.selectedSite?'selected':''}>${esc(s.slug)} — ${esc(s.hostname)}</option>`).join('');
 page('File Manager',`<div class="sectionhead"><div><h2>Tệp của website</h2><p>${isExisting?'Đọc/ghi dist và storage/sheets; bảo vệ .env, server.cjs, package, node_modules và backup.':'Chỉ hiển thị thư mục thuộc website đã chọn.'}</p></div><select id="fileSite">${selector}</select></div><div class="toolbar">${btn('← Lên một cấp','folder-up')}${btn('+ Thư mục','file-mkdir')}${btn('↑ Upload file','file-upload')}${isExisting?btn('⬆ Deploy ZIP','existing-deploy','primary'):''}<input id="filePicker" type="file" class="hide"/><small class="muted mono">/${esc(state.dir)}</small></div><div class="files-layout"><div class="card file-list">${result.files.map(f=>`<button class="fileitem" data-action="file-open" data-name="${esc(f.name)}" data-dir="${f.dir?'1':'0'}"><span>${f.dir?'📁':'📄'} ${esc(f.name)}</span><span class="muted mini">${f.dir?'':fmtBytes(f.size)}</span></button>`).join('')||'<div class="empty">Thư mục trống</div>'}</div><div class="card" id="editor"><div class="sectionhead" style="margin-top:0"><h2 id="editorTitle">Xem tệp</h2></div><p class="muted">Chọn file văn bản bên trái để xem${ro?' (chỉ đọc)':' hoặc chỉnh sửa'}.</p></div></div>`);
}
async function editFile(filename){state.selectedFile=state.dir?state.dir+'/'+filename:filename;const content=await req(`/api/files/${state.selectedSite}/read?${qs({path:state.selectedFile})}`);const ro=state.sites.find(s=>s.slug===state.selectedSite)?.external&&['dist/server.cjs','package.json','package-lock.json'].includes(state.selectedFile);const el=$('#editor');el.innerHTML=`<div class="sectionhead" style="margin-top:0"><h2 class="mono">${esc(state.selectedFile)}</h2></div><textarea id="editText" spellcheck="false" ${ro?'readonly':''}></textarea>${ro?'<p class="help">File hệ thống được bảo vệ; dùng Deploy ZIP để cập nhật backend.</p>':`<div class="btnrow" style="margin-top:10px">${btn('Lưu thay đổi','file-save','primary')}${btn('Xóa file','file-delete','warn')}</div>`}`;$('#editText').value=content.text;}
async function databases(){const {databases:list}=await req('/api/databases');page('Databases',`<div class="sectionhead"><div><h2>MariaDB</h2><p>Database được quản lý cục bộ, không mở cổng 3306 ra Internet.</p></div>${btn('+ Database mới','create-database','primary')}</div><div class="tablewrap"><table><thead><tr><th>Database</th><th>Hành động</th></tr></thead><tbody>${list.map(name=>`<tr><td class="titlecell mono">${esc(name)}</td><td><div class="btnrow">${btn('Xem tables','db-tables:'+name)}${btn('Backup SQL','db-backup:'+name)}${btn('Restore SQL','db-restore:'+name,'tiny warn')}</div></td></tr>`).join('')||'<tr><td colspan="2" class="empty">Chưa có database ứng dụng</td></tr>'}</tbody></table></div><div class="info" style="margin-top:18px">Khi tạo database mới, tên người dùng và mật khẩu được hiển thị <b>một lần duy nhất</b>. Root MariaDB được dùng qua socket nội bộ cho các tác vụ quản trị.</div>`);}
async function services(){const {services:list}=await req('/api/services');page('Dịch vụ & Logs',`<div class="sectionhead"><h2>Runit / Termux services</h2></div><div class="tablewrap"><table><thead><tr><th>Dịch vụ</th><th>Trạng thái</th><th>Hành động</th></tr></thead><tbody>${Object.entries(list).map(([name,s])=>`<tr><td class="titlecell mono">${esc(name)}</td><td>${serviceBadge(s)}</td><td><div class="btnrow">${btn('Logs','log:'+name)}${name==='amh-panel'?'':btn('Restart','restart:'+name)}${name.startsWith('amh-site-')?btn('Dừng','stop:'+name,'tiny warn'):''}</div></td></tr>`).join('')}</tbody></table></div><p class="help">Các dịch vụ quan trọng không thể bị dừng qua panel. Việc restart Nginx / Named Tunnel có thể gây gián đoạn ngắn.</p>`);}
async function backups(){
 const [managed,local,mhc]=await Promise.all([req('/api/backups'),req('/api/tpp-backup/status'),req('/api/mhc/backups')]);
 const list=managed.backups||[],shots=local.snapshots||[];const mhcRows=(mhc.snapshots||[]).map(x=>`<tr><td class="mono">${esc(x.date)}</td><td>${x.manifestPresent?'Có manifest':'Chưa có manifest'}</td><td>Chưa verify trong lượt này</td></tr>`).join('');
 const files=n=>n.files.map(f=>`<a href="/api/tpp-backup/download?${qs({name:n.name,file:f.name})}" class="mono" download>${esc(f.name)} (${fmtBytes(f.size)})</a>`).join(' · ');
 const current=shots.find(x=>x.name===local.latestName);
 const indicator=local.running?'Đang sao lưu':local.locked?'Khóa backup cần kiểm tra':local.service==='running'?'Đang bật':'Chưa hoạt động';
 page('Backups',`<div class="sectionhead"><div><h2>Thờ Phượng Pro — Backup tự động</h2><p>Đọc trực tiếp snapshot của dịch vụ tpp-backup, không lập lịch sao lưu thứ hai.</p></div></div>
 <div class="grid">
  <div class="card stat"><div class="tag">BACKUP GẦN NHẤT</div><b>${current?esc(new Date(current.createdAt).toLocaleDateString('vi-VN')):'—'}</b><small>${current?esc(local.latestName):'Chưa tìm thấy'}</small></div>
  <div class="card stat"><div class="tag">SỐ BẢN SAO LƯU</div><b>${shots.length}</b><small>Giữ ${esc(local.retention)} bản gần nhất</small></div>
  <div class="card stat"><div class="tag">LỊCH SAO LƯU</div><b>03:00</b><small>Lịch backup TPP của Panel gốc (nếu đã cấu hình)</small></div>
  <div class="card stat"><div class="tag">TRẠNG THÁI</div><b>${esc(indicator)}</b><small>Runit: ${esc(local.service)}</small></div>
 </div>
 <div class="toolbar">${btn('Sao lưu ngay','tpp-backup-now','primary')} ${btn('Xác minh bản mới nhất','tpp-verify')} ${btn('Làm mới','tpp-refresh')}</div>
 <div class="info">Bản backup chứa SQL, Sheet/Sheet+, code và cả <b>.env</b> có khóa bí mật. Chỉ tải về thiết bị tin cậy. Chưa hỗ trợ khôi phục ghi đè database qua Panel. Backup đám mây hiện <b>chưa cấu hình</b>.</div>
 <div class="sectionhead"><h2>Snapshot tự động</h2></div>
 <div class="tablewrap"><table><thead><tr><th>Snapshot</th><th>Dung lượng</th><th>Tình trạng</th><th>Tải từng phần</th></tr></thead><tbody>${shots.map(x=>`<tr><td class="mono titlecell">${esc(x.name)} ${x.name===local.latestName?'●':''}<div class="muted mini">${esc(new Date(x.createdAt).toLocaleString('vi-VN'))}</div></td><td>${fmtBytes(x.size)}</td><td>${x.complete?'<span class="badge good">Đầy đủ tệp</span>':'<span class="badge bad">Thiếu tệp</span>'}</td><td class="mini">${files(x)}</td></tr>`).join('')||'<tr><td class="empty" colspan="4">Chưa có snapshot. Kiểm tra dịch vụ tpp-backup.</td></tr>'}</tbody></table></div>
 <div class="sectionhead"><h2>MHC LAB — Backup theo ngày</h2></div><div class="tablewrap"><table><thead><tr><th>Ngày</th><th>Manifest</th><th>Kiểm tra</th></tr></thead><tbody>${mhcRows||'<tr><td colspan="3">Chưa có snapshot MHC</td></tr>'}</tbody></table></div><p class="help">${esc(mhc.notice)}</p><div class="sectionhead"><h2>Nhật ký Backup</h2></div><div class="card"><pre>${esc((local.log||local.manualLog||'Chưa có log').slice(-5000))}</pre></div>
 <div class="sectionhead"><h2>Backup website / database từ Panel</h2></div>
 <div class="tablewrap"><table><thead><tr><th>File</th><th>Kích thước</th><th>Ngày tạo</th><th>Tải</th></tr></thead><tbody>${list.map(x=>`<tr><td class="titlecell mono">${esc(x.name)}</td><td>${fmtBytes(x.size)}</td><td>${esc(new Date(x.createdAt).toLocaleString('vi-VN'))}</td><td>${btn('Tải xuống','download:'+x.name)}</td></tr>`).join('')||'<tr><td class="empty" colspan="4">Chưa có bản backup thủ công của Panel</td></tr>'}</tbody></table></div>`);
}

async function domains(){const n=await req('/api/nginx');const {sites:list}=await req('/api/domains');page('Domain & Nginx',`<div class="split"><div><div class="card"><div class="flex"><h2 style="margin:0">Nginx integration</h2><span class="badge ${n.configured?'good':'bad'}">${n.configured?'Đã tích hợp':'Chưa tích hợp'}</span></div><p class="muted">Panel tạo file cấu hình mỗi website và yêu cầu Nginx kiểm tra cú pháp trước khi reload.</p><pre>${esc(n.test.err||n.test.out||'')}</pre>${n.configured?'<div class="info success">Đã tích hợp. Các site mới sẽ được thêm vào Nginx tự động.</div>':`<div class="info">Thao tác này thêm một dòng <code>include</code> vào phần <code>http{}</code> của cấu hình Nginx hiện tại. Có sao lưu, kiểm tra cú pháp và hoàn tác nếu lỗi.</div><div style="margin-top:12px">${btn('Tích hợp Nginx (1 lần)','integrate','primary')}</div>`}</div><div class="sectionhead"><h2>Hostname đã khai báo</h2></div><div class="tablewrap"><table><thead><tr><th>Hostname</th><th>Origin URL</th></tr></thead><tbody>${list.map(s=>`<tr><td class="mono">${esc(s.hostname)}</td><td class="mono">${esc(s.serviceUrl)}</td></tr>`).join('')||'<tr><td colspan="2" class="empty">Chưa có hostname được panel quản lý</td></tr>'}</tbody></table></div></div><div class="card"><h2 style="margin-top:0">Cloudflare Tunnel</h2><p class="help">Tunnel hiện tại: <b>thophuong</b>. Không cần tạo Tunnel mới cho mỗi site.</p><div class="info"><b>Thêm domain:</b><br>Cloudflare Zero Trust → Networking → Tunnels → thophuong → Routes → Add route → Published application.<br><br>Hostname: tên miền site vừa tạo.<br>Service URL: <code>http://127.0.0.1:8080</code>.</div><p class="help">Panel không tự ghi đè cấu hình Tunnel của Cloudflare và không giữ Cloudflare API token. Như vậy route <b>pro.thophuong.com</b> hiện có không bị mất.</p><a target="_blank" rel="noreferrer" href="https://one.dash.cloudflare.com/">Mở Cloudflare Dashboard ↗</a></div></div>`);}
const actions={
 'tpp-backup-now':async()=>{if(!confirm('Tạo bản backup mới của Thờ Phượng Pro ngay bây giờ?'))return;await req('/api/tpp-backup/run',{method:'POST',body:{}});toast('Đã gửi lệnh backup. Làm mới để xem tiến độ.');nav('backups');},
 'tpp-verify':async()=>{const v=await req('/api/tpp-backup/verify',{method:'POST',body:{}});modal('Kiểm tra bản sao lưu',`<pre>${esc(v.report||'VERIFIED')}</pre>`);},
 'tpp-refresh':()=>nav('backups'),
 'create-site':modalCreateSite,
 'create-database':()=>modal('Tạo database',`<form id="dbForm">${input('name','Tên database','app_new')}<p class="hint">Tên chỉ chứa chữ thường, số và dấu gạch dưới.</p><button class="primary wide">Tạo database</button></form>`),
 'tab-services':()=>nav('services'),'tab-domains':()=>nav('domains'),
 'integrate':async()=>{if(!confirm('Tích hợp Nginx? Panel sẽ tạo bản sao cấu hình và kiểm tra nginx -t trước khi reload.'))return;const x=await req('/api/nginx/integrate',{method:'POST'});toast('Nginx đã tích hợp. Bản sao: '+x.backup);nav('domains');},
 'folder-up':()=>{state.dir=state.dir.split('/').slice(0,-1).join('/');filesPage();},
 'file-mkdir':async()=>{const name=prompt('Tên thư mục con (không chứa /):');if(!name)return;await req(`/api/files/${state.selectedSite}/mkdir`,{method:'POST',body:{path:[state.dir,name].filter(Boolean).join('/')}});filesPage();},
 'file-upload':()=>$('#filePicker').click(),
 'file-save':async()=>{if(!state.selectedFile)return;await req(`/api/files/${state.selectedSite}/write?${qs({path:state.selectedFile})}`,{method:'PUT',body:new Blob([$('#editText').value]),raw:true});toast('Đã lưu file');},
 'file-delete':async()=>{const file=state.selectedFile;if(!file||!confirm('Xóa '+file+'?'))return;await req(`/api/files/${state.selectedSite}/delete`,{method:'POST',body:{path:file,confirm:file}});state.selectedFile='';filesPage();},
};
async function dynamicAction(key,element){let [type,...rest]=key.split(':');const value=rest.join(':');
 if(type==='monitor-refresh'){state.monitorHistoryCache=new Map();await mhcMonitorPage();return;}
 if(type==='cluster-invite'){
  if(!confirm('Tạo mã ghép một lần, hết hạn sau 10 phút? Mã cũ chưa dùng sẽ không còn hiệu lực.'))return;
  const x=await req('/api/mhc/pairing/invite',{method:'POST',body:{}});
  const code=x.joinCode;
  if(!/^MHC1\.[A-Za-z0-9_-]{60,900}$/.test(code||''))throw Error('Mã ghép không hợp lệ từ Authority');
  state.pairingCode=code;state.pairingExpiresAt=Date.parse(x.expiresAt);
  modal('Ghép node mới (10 phút)',`<p class="help">Mã dùng một lần; hết hạn ${esc(x.expiresAt||'sau 10 phút')}. Không đăng mã này công khai.</p><p>Trên Termux điện thoại mới, chạy <code>~/mhc-full join</code>, rồi dán mã dưới đây khi được hỏi (mã sẽ ẩn khi nhập). Không dán mã vào dòng lệnh.</p><pre style="white-space:pre-wrap;word-break:break-all">${esc(code)}</pre><div class="btnrow">${btn('Sao chép mã','cluster-invite-copy','primary')}</div><p class="help">Sau khi ghép, thiết bị sẽ xuất hiện trong Cluster ở trạng thái Standby, không có quyền Primary.</p>`);
  return;
 }
 if(type==='cluster-invite-copy'){
  if(!state.pairingCode||!Number.isFinite(state.pairingExpiresAt)||Date.now()>=state.pairingExpiresAt){state.pairingCode=null;throw Error('Mã đã hết hạn; hãy tạo mã mới');}
  await navigator.clipboard.writeText(state.pairingCode);
  toast('Đã sao chép mã; dán vào lời nhắc ẩn của mhc-full join');return;
 }
 if(type==='cluster-overview'){state.clusterTechnical=false;await mhcClusterPage();return;}
 if(type==='cluster-advanced'){state.clusterTechnical=true;await mhcClusterTechnicalPage();if(state.tab==='cluster')$('#content').insertAdjacentHTML('afterbegin',`<div class='btnrow' style='margin:0 0 18px'>${btn('← Quay về tổng quan node','cluster-overview')}<span class='muted'>Các kiểm thử kỹ thuật LAB — không cấp quyền Primary</span></div>`);return;}

 if(['p33-switch','p33-control','p33-resume','p33-confirm','p33-cancel'].includes(type)){
  const id=$('#p33Target')?.value,action=type.slice(4),live=await req('/api/mhc/primary-selection');
  if(action==='switch'&&!confirm('Chuyển Primary và Control LAB sang node đã chọn, dùng DB sẵn có ở đó. Dữ liệu có thể khác hoặc cũ hơn node hiện tại; không tự đồng bộ. Tiếp tục?'))return;
  if(action==='control'&&!confirm('Chỉ chuyển Panel LAB sang node đã chọn; Primary và dữ liệu không đổi. Tiếp tục?'))return;
  if(action==='cancel'&&!confirm('Dừng writer LAB cả hai node và hủy trước đổi DNS. Website LAB sẽ tạm ngừng. Tiếp tục?'))return;
  const result=await req('/api/mhc/p33-action',{method:'POST',body:{action,id,requestId:crypto.randomUUID(),expectedRevision:live.revision,expectedP33Revision:live.p33.revision,acceptTargetData:action==='switch'}});
  toast(result.manualNotice||'Đã cập nhật tác vụ; tải lại Panel LAB nếu Control đã chuyển.');await nav('cluster');return;
 }
 if(['p32-route','p32-panel','p32-resume','p32-rollback','p32-confirm'].includes(type)){
  const live=await req('/api/mhc/primary-selection');if(!live.p32?.enabled)throw Error('Worker chưa cấu hình tuyến P3.2 LAB');
  if(type!=='p32-confirm'&&!confirm(type==='p32-rollback'?'Rollback chỉ hai tuyến LAB. Website cũ có thể cần chuẩn bị lại preview; không rollback dữ liệu. Tiếp tục?':'Thao tác DNS thật chỉ cho panel-lab.giaouoc.com và preview-lab.giaouoc.com. Không cấp Primary/writer. Tiếp tục?'))return;
  const id=$('#p32Target')?.value,action=type==='p32-panel'?'p32-route':type;
  await req('/api/mhc/p32-route',{method:'POST',body:{action,id,kind:type==='p32-panel'?'panel':'both',requestId:crypto.randomUUID(),expectedRevision:live.revision,expectedRouteRevision:live.p32.routeRevision}});
  toast('Đã cập nhật tuyến LAB; xem trạng thái DNS và xác minh HTTP');await nav('cluster');return;
 }
 if(type==='primary-p31-check'){
  state.p31Readiness=await req('/api/mhc/p31-readiness');toast('Đã kiểm proof mới; không cấp quyền writer');await nav('cluster');return;
 }
 if(type==='primary-p31-prepare'||type==='primary-p31-standby'){
  const target=$('#p31Target')?.value,live=await req('/api/mhc/primary-selection');
  if(!live.p31?.enabled)throw Error('P3.1 chưa được cấu hình');
  const action=type==='primary-p31-prepare'?'p31-prepare':'p31-standby',id=action==='p31-prepare'?live.pending?.targetNodeId:target;
  if(!id)throw Error('Chọn ứng viên trước khi bật preview');
  await req('/api/mhc/primary-selection',{method:'POST',body:{action,id,requestId:crypto.randomUUID(),expectedRevision:live.revision,epoch:live.epoch,operationId:live.pending?.operationId||null}});
  state.p31Readiness=await req('/api/mhc/p31-readiness');toast('Đã cập nhật preview/Standby; Primary và route giữ nguyên');await nav('cluster');return;
 }
 if(type==='primary-lab-route'||type==='primary-lab-resume'||type==='primary-lab-complete'){
  const p=await req('/api/mhc/primary-selection');
  if(p.mode!=='SHARED_AUTHORITY_PREPARE_ONLY'||!p.pending?.operationId)throw Error('Chưa có phiên chuyển P3 LAB hợp lệ');
  const action=type==='primary-lab-route'?'route':type==='primary-lab-resume'?'route-resume':'complete';
  const requiredStatus={route:'PREPARED_NO_WRITER_GRANT','route-resume':'ROUTING_REQUESTED',complete:'DNS_SWITCHED_AWAITING_HTTP_CONFIRM'};
  if(p.pending.status!==requiredStatus[action])throw Error('Trạng thái đã thay đổi. Làm mới Cluster.');
  const questions=action==='route'?[
   ['backupRestored','Đã sao lưu từ node cũ và KHÔI PHỤC dữ liệu trên node đích?'],
   ['oldWritersStopped','Đã thực sự dừng DB/site writers trên node cũ?'],
   ['targetHttpChecked','Đã kiểm tra HTTP + database của node mới qua đường nội bộ?'],
   ['targetPanelAccessChecked','Đã kiểm tra Panel node mới có thể truy cập qua Access?'],
   ['acceptDataLossRisk','Chấp nhận mất dữ liệu chưa backup và rủi ro split-brain do thiếu fencing?'],
   ['labOnly','Xác nhận đây chỉ là hostname thử nghiệm, KHÔNG phải website production?']
  ]:action==='complete'?[
   ['websitePublicChecked','Đã thử website PUBLIC và xác nhận đúng node đích?'],
   ['panelPublicChecked','Đã thử Panel PUBLIC qua Cloudflare Access, đúng node đích?'],
   ['noNewWritesOnOldNode','Đã xác nhận node cũ chưa nhận ghi mới sau khi chuyển?'],
   ['acceptNonFencedLabRisk','Chấp nhận nhãn LAB không fencing và không có writer lease?']
  ]:[];
  if(action==='route-resume'&&!confirm('Kiểm tra lại các bản ghi Cloudflare và tiếp tục phiên LAB? Lỗi giữa chừng phải đối chiếu DNS trước khi thử lại.'))return;
  const confirmations={};
  for(const [k,label] of questions){if(!confirm(label))return;confirmations[k]=true;}
  if(action==='route'&&!confirm('Xác nhận đổi CNAME của tất cả hostname LAB đã allowlist sang node đích? Đây là thay đổi Internet thật.'))return;
  if(action==='complete'&&!confirm('Chỉ GHI NHẬN Primary LAB (DNS đã đổi). KHÔNG có write fencing độc lập. Tiếp tục?'))return;
  await req('/api/mhc/primary-selection',{method:'POST',body:{action,id:p.pending.operationId,requestId:crypto.randomUUID(),expectedRevision:p.revision,...confirmations}});
  toast(action==='complete'?'Đã ghi nhận Primary LAB; không cấp writer lease':action==='route-resume'?'Đã kiểm tra/tái thực hiện route':'Đã gửi yêu cầu DNS LAB');
  await nav('cluster');return;
 }
 if(type==='primary-begin'){
  const id=$('#primaryTarget')?.value;
  if(!id||!confirm('Chuẩn bị chuyển Primary thủ công tới node đã chọn? CHƯA đổi tuyến hay dừng dịch vụ.'))return;
  // Re-check current shared revision + heartbeat instead of trusting stale 20s UI.
  const live=await req('/api/mhc/primary-selection');
  if(live.mode==='SHARED_AUTHORITY_PREPARE_ONLY'){
   if(live.pending)throw Error('Đã có phiên chuẩn bị khác. Làm mới trang Cluster.');
   if(!live.nodes?.some(n=>n.nodeId===id&&n.heartbeatRecent===true))throw Error('Node đã hết heartbeat hoặc không còn trong Cluster.');
  }
  const shared=live.mode==='SHARED_AUTHORITY_PREPARE_ONLY';
  await req('/api/mhc/primary-selection',{method:'POST',body:{action:'begin',id,...(shared?{requestId:crypto.randomUUID(),expectedRevision:live.revision}:{})}});toast('Đã tạo phiên chuẩn bị, chưa đổi Primary');await nav('cluster');return;
 }
 if(type==='primary-abort'){
  const p=await req('/api/mhc/primary-selection');if(!p.pending)return;
  if(p.pending.status!=='PREPARED_NO_WRITER_GRANT')throw Error('Đã yêu cầu chuyển DNS; không thể hủy mù. Kiểm tra route hiện tại trước.');
  if(!confirm('Hủy phiên? Nếu đã sửa Cloudflare hoặc dịch vụ, phải kiểm tra/hoàn tác bằng tay.'))return;
  await req('/api/mhc/primary-selection',{method:'POST',body:{action:'abort',id:p.pending.operationId,...(p.mode==='SHARED_AUTHORITY_PREPARE_ONLY'?{requestId:crypto.randomUUID(),expectedRevision:p.revision}:{})}});toast('Đã hủy bản ghi phiên');await nav('cluster');return;
 }
 if(type==='primary-complete'){
  const p=await req('/api/mhc/primary-selection');if(!p.pending)return;
  const items=[['backupRestored','Đã backup node cũ, RESTORE trên node mới và kiểm tra dữ liệu'],['oldWritesStopped','Đã dừng toàn bộ đường GHI ở node cũ'],['targetTested','Đã kiểm tra HTTP/database trên node mới'],['routingSwitched','Đã đổi routing Cloudflare THỦ CÔNG và kiểm tra truy cập']];
  const checks={};for(const [k,label] of items){if(!confirm(label+'?'))return;checks[k]=true;}
  if(!confirm('XÁC NHẬN CUỐI: chỉ GHI NHẬN node mới do bạn chọn, MHC KHÔNG tự chuyển DNS/HA. Tiếp tục?'))return;
  await req('/api/mhc/primary-selection',{method:'POST',body:{action:'complete',id:p.pending.operationId,...checks}});
  toast('Đã ghi nhận Primary do quản trị viên chọn (chưa có chứng cứ vận hành tự động)');await nav('cluster');return;
 }

 if(type==='existing-deploy'){modal('Cập nhật Thờ Phượng Pro',`<form id="existingDeployForm"><div class="info"><b>Chỉ thay dist:</b> không ghi đè .env, MariaDB, sheet, node_modules, package.json. Nếu bản mới cần migration hoặc dependency mới, phải xử lý riêng.</div><div class="inputgroup" style="margin-top:15px"><label>ZIP bản build mới (tối đa 64 MiB)</label><input name="zip" type="file" accept=".zip" required></div><p class="hint">Trên PC chạy build rồi nén thư mục dist; ZIP có dist/index.html và dist/server.cjs. Panel kiểm tra, lưu bản cũ, cập nhật, kiểm tra HTTP và tự phục hồi khi lỗi.</p><button class="primary wide">Triển khai lên pro.thophuong.com</button></form>`);return;}
 if(type==='existing-releases'){const d=await req('/api/existing/thophuongpro');modal('Khôi phục build Thờ Phượng Pro',`<p class="help">Các bản dist cũ trên Samsung M51. Phục hồi chỉ đổi code, không phục hồi database.</p><div class="btnrow">${d.releases.map(r=>btn('↶ '+new Date(r.time).toLocaleString('vi-VN'),'existing-rollback:'+r.id)).join('')||'<div class="info">Chưa có bản build cũ để khôi phục.</div>'}</div>`);return;}
 if(type==='existing-rollback'){if(!confirm('Khôi phục bản '+value+'? M51 sẽ khởi động lại Thờ Phượng Pro, database không thay đổi.'))return;const d=await req('/api/existing/thophuongpro/rollback',{method:'POST',body:{id:value}});closeModal();toast('Đã khôi phục '+d.restored);nav('sites');return;}
 if(type==='existing-log'){const d=await req('/api/existing/thophuongpro/log');modal('Node.js — mini-web',`<pre>${esc(d.log)}</pre>`);return;}
 if(type==='existing-restart'){if(!confirm('Khởi động lại Thờ Phượng Pro (mini-web)?'))return;const d=await req('/api/services/mini-web/action',{method:'POST',body:{action:'restart'}});toast(d.ok?'Đã gửi lệnh restart':'Lỗi: '+d.err,!d.ok);return;}
 if(type==='file-download'){
  const rel=[state.dir,element.dataset.name].filter(Boolean).join('/');
  const response=await fetch('/api/files/'+state.selectedSite+'/download?'+qs({path:rel}),{credentials:'same-origin'});
  if(!response.ok){let msg='Tải file thất bại';try{msg=(await response.json()).error||msg;}catch{}throw Error(msg);}
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=element.dataset.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);return;
 }
 if(type==='file-rename'){
  const from=[state.dir,element.dataset.name].filter(Boolean).join('/');
  const to=prompt('Tên hoặc đường dẫn mới (trong dist hoặc storage/sheets):',from);
  if(!to||to===from)return;
  await req('/api/files/'+state.selectedSite+'/rename',{method:'POST',body:{from,to}});toast('Đã đổi tên/di chuyển');filesPage();return;
 }
 if(type==='file-delete-entry'){
  const file=[state.dir,element.dataset.name].filter(Boolean).join('/');
  if(!confirm('Chuyển '+file+' vào thùng rác?'))return;
  await req('/api/files/'+state.selectedSite+'/delete',{method:'POST',body:{path:file,confirm:file}});toast('Đã đưa vào thùng rác');filesPage();return;
 }
if(type==='file-open'){const filename=element.dataset.name;const dir=element.dataset.dir==='1';if(dir){state.dir=[state.dir,filename].filter(Boolean).join('/');state.selectedFile='';filesPage();}else await editFile(filename);return;}
 if(type==='zip'){modal('Triển khai ZIP — '+value,`<form id="zipForm" data-site="${esc(value)}"><div class="inputgroup"><label>File ZIP (tối đa 30 MB)</label><input name="zip" type="file" accept=".zip" required></div><p class="hint">ZIP phải chứa index.html ở root (static), hoặc file Node entrypoint. Bản hiện tại được giữ lại dưới dạng thư mục previous để rollback thủ công.</p><button class="primary wide">Triển khai ZIP</button></form>`);return;}
 if(type==='git'){modal('Deploy Git — '+value,`<form id="gitForm" data-site="${esc(value)}">${input('url','URL HTTPS GitHub / GitLab / Bitbucket','https://github.com/user/repo.git')}<p class="hint">Chỉ deploy repository bạn tin cậy. Node dependencies được cài riêng bằng nút npm install (bỏ lifecycle scripts).</p><button class="primary wide">Clone và deploy</button></form>`);return;}
 if(type==='npm'){if(!confirm('Chỉ chạy trên mã nguồn đáng tin cậy. Cài npm packages cho '+value+'?'))return;const r=await req(`/api/sites/${value}/npm`,{method:'POST'});modal('npm install kết quả',`<pre>${esc(r.out||r.err||'')}</pre>`);return;}
 if(type==='backup-site'){const v=await req(`/api/sites/${value}/backup`,{method:'POST'});toast('Đã sao lưu '+v.file);nav('backups');return;}
 if(type==='delete-site'){const t=prompt(`Xóa website ${value}? Nhập đúng ${value} để xác nhận. File chuyển vào trash:`);if(t!==value)return;await req(`/api/sites/${value}`,{method:'DELETE',body:{confirm:value}});toast('Đã chuyển website vào trash');nav('sites');return;}
 if(type==='db-backup'){const v=await req(`/api/databases/${value}/backup`,{method:'POST'});toast('SQL backup: '+v.file);nav('backups');return;}
 if(type==='db-tables'){const {tables}=await req(`/api/databases/${value}/tables`);modal('Tables — '+value,`<pre>${esc(tables.join('\n')||'Database chưa có bảng')}</pre>`);return;}
 if(type==='db-restore'){modal('Restore database — '+value,`<div class="info danger">CẢNH BÁO: SQL có thể sửa/xóa dữ liệu. Panel sẽ tạo backup trước khi import, nhưng bạn chỉ nên dùng file tin cậy.</div><form id="restoreForm" data-name="${esc(value)}"><div class="inputgroup" style="margin-top:14px"><label>File .sql (dưới 10MB)</label><input type="file" name="file" accept=".sql" required></div><div class="inputgroup"><label>Nhập chính xác tên database để xác nhận</label><input name="confirm" autocomplete="off" required></div><button class="primary wide">Backup rồi Restore</button></form>`);return;}
 if(type==='restart'||type==='stop'){if(!confirm(`${type==='restart'?'Khởi động lại':'Dừng'} dịch vụ ${value}?`))return;const r=await req(`/api/services/${value}/action`,{method:'POST',body:{action:type==='restart'?'restart':'down'}});toast(r.ok?'Đã thực hiện':'Dịch vụ báo lỗi: '+r.err,!r.ok);nav('services');return;}
 if(type==='log'){const {log}=await req(`/api/services/${value}/log`);modal('Logs — '+value,`<pre>${esc(log)}</pre>`);return;}
 if(type==='download'){const resp=await fetch('/api/backups/download?'+qs({name:value}),{credentials:'same-origin'});if(!resp.ok)throw Error('Không tải được backup');const blob=await resp.blob(),url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=value;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);return;}
}
// Poll only while the compact view is visible; the LAB technical view stays unchanged.
setInterval(()=>{if(state.user==='admin'&&state.tab==='cluster'&&!state.clusterTechnical&&document.visibilityState==='visible')mhcClusterPage().catch(()=>{});},20000);
$('#navigation').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)nav(b.dataset.tab);});
$('#refreshBtn').addEventListener('click',()=>nav(state.tab));
// Refresh only while the administrator is viewing the dashboard.
setInterval(()=>{if(state.user==='admin'&&state.tab==='dashboard'&&document.visibilityState==='visible')dashboard().catch(()=>{});},60000);

$('#logoutBtn').addEventListener('click',async()=>{
 const remote=state.authMode==='cloudflare-access';
 await req('/api/logout',{method:'POST'});
 state.user=null;state.csrf='';state.authMode=null;
 if(remote){window.location.assign('/cdn-cgi/access/logout');return;}
 showLogin();
});
$('#modalClose').addEventListener('click',closeModal);
$('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;await busy(b,async()=>{const res=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:$('#username').value,password:$('#password').value})});const d=await res.json();if(!res.ok)throw Error(d.error||'Đăng nhập thất bại');state.csrf=d.csrf;state.authMode=d.authMode||'password';$('#password').value='';state.user='admin';showPanel();});});
$('#content').addEventListener('change',async e=>{if(e.target.id==='fileSite'){state.selectedSite=e.target.value;state.dir='';filesPage();}if(e.target.id==='filePicker'){const file=e.target.files?.[0];if(!file)return;try{const where=[state.dir,file.name].filter(Boolean).join('/');await req(`/api/files/${state.selectedSite}/write?${qs({path:where})}`,{method:'PUT',body:file,raw:true});toast('Đã upload '+file.name);filesPage();}catch(err){toast(err.message,true);}}});
$('#content').addEventListener('click',async e=>{const el=e.target.closest('[data-action]');if(!el)return;const key=el.dataset.action;try{await busy(el,()=>actions[key]?actions[key]():dynamicAction(key,el));}catch{}});
$('#modalBody').addEventListener('submit',async e=>{e.preventDefault();const form=e.target;const b=e.submitter;try{await busy(b,async()=>{
 if(form.id==='existingDeployForm'){const file=form.querySelector('input[type=file]').files[0];if(!file)throw Error('Chọn ZIP bản build');if(file.size>64*1024*1024)throw Error('ZIP lớn hơn 64 MiB');const d=await req('/api/existing/thophuongpro/deploy',{method:'POST',body:file,raw:true});closeModal();toast('Đã cập nhật Thờ Phượng Pro. Bản lưu: '+d.backup);nav('sites');}
 else if(form.id==='siteForm'){const data=Object.fromEntries(new FormData(form));await req('/api/sites',{method:'POST',body:data});toast('Website đã tạo');closeModal();nav('sites');}
 else if(form.id==='dbForm'){const data=Object.fromEntries(new FormData(form));const v=await req('/api/databases',{method:'POST',body:data});modal('Lưu thông tin database ngay!',`<div class="info success">Thông tin chỉ hiển thị một lần. Hãy sao chép vào trình quản lý mật khẩu.</div><pre class="copy" id="dbSecret">Database: ${esc(v.database)}\nUsername: ${esc(v.user)}\nPassword: ${esc(v.password)}\nHost: 127.0.0.1\nPort: 3306</pre><button id="copyDb" class="primary">Sao chép thông tin</button>`);$('#copyDb').addEventListener('click',()=>{navigator.clipboard.writeText(`Database: ${v.database}\nUsername: ${v.user}\nPassword: ${v.password}\nHost: 127.0.0.1\nPort: 3306`);toast('Đã sao chép');});}
 else if(form.id==='zipForm'){const file=form.querySelector('input[type=file]').files[0];if(!file)throw Error('Chọn ZIP');await req(`/api/sites/${form.dataset.site}/zip`,{method:'POST',body:file,raw:true});closeModal();toast('Đã deploy ZIP');nav('sites');}
 else if(form.id==='gitForm'){const {url}=Object.fromEntries(new FormData(form));await req(`/api/sites/${form.dataset.site}/git`,{method:'POST',body:{url}});closeModal();toast('Đã deploy repository');nav('sites');}
 else if(form.id==='restoreForm'){const file=form.querySelector('input[type=file]').files[0],yes=form.querySelector('[name=confirm]').value;if(yes!==form.dataset.name)throw Error('Tên xác nhận chưa đúng');await req(`/api/databases/${form.dataset.name}/restore?${qs({confirm:yes})}`,{method:'POST',body:file,raw:true});closeModal();toast('Database đã khôi phục');nav('databases');}
 });}catch{}});
(async()=>{try{const s=await req('/api/session');if(s.loggedIn){state.csrf=s.csrf;state.user=s.user;state.authMode=s.authMode||'password';showPanel();}else showLogin();}catch{showLogin();}})();
