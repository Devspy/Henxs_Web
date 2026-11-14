const $ = s => document.querySelector(s);
const apiFetch = (url, options = {}) => {
  const token = sessionStorage.getItem('access_token');
  return fetch(url, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
};
const missing = '—';
let events = [];
let filtered = [];
const areaLookups = new Map();
let lastAreaLookup = 0;
const pick = (item, ...keys) => keys.map(k => item?.[k]).find(v => v !== undefined && v !== null && v !== '') ?? missing;
const listFrom = data => Array.isArray(data) ? data : (data?.events || data?.items || data?.results || (Array.isArray(data?.data) ? data.data : []));
const moduleName = e => { const v = String(pick(e, 'event_type', 'type', 'module', 'eventType')).toLowerCase(); return v.includes('pothole') ? 'Pothole' : v.includes('garbage') ? 'Garbage' : v.includes('manhole') ? 'Open Manhole' : 'Other'; };
const zoneName = e => String(pick(e, 'zone', 'zone_name'));
const locationName = e => String(pick(e, 'location', 'address', 'place'));
const coordinates = e => {
  const lat = Number(pick(e, 'latitude', 'lat', 'langitude', 'location_latitude'));
  const lng = Number(pick(e, 'longitude', 'lng', 'lon', 'longitute', 'location_longitude'));
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};
const statusName = e => String(pick(e, 'status')).toLowerCase();
const eventDate = e => { const d = new Date(pick(e, 'event_time', 'detected_at', 'created_at', 'timestamp', 'time')); return Number.isNaN(+d) ? null : d; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function metric(i, value) { document.querySelectorAll('.metric strong')[i].textContent = value; }
function render() {
  const module = $('#moduleFilter').value, zone = $('#zoneFilter').value;
  const query = $('#globalSearch').value.trim().toLowerCase();
  const from = $('#dateFrom').value ? new Date(`${$('#dateFrom').value}T00:00:00`) : null;
  const to = $('#dateTo').value ? new Date(`${$('#dateTo').value}T23:59:59.999`) : null;
  filtered = events.filter(e => (!module || module === 'All Modules' || moduleName(e) === module) && (!zone || zone === 'All Zones' || zoneName(e) === zone) && (!from || (eventDate(e) && eventDate(e) >= from)) && (!to || (eventDate(e) && eventDate(e) <= to)) && (!query || JSON.stringify(e).toLowerCase().includes(query)));
  const potholes = filtered.filter(e => moduleName(e) === 'Pothole').length;
  const garbage = filtered.filter(e => moduleName(e) === 'Garbage').length;
  const resolved = filtered.filter(e => /resolved|complete|closed/.test(statusName(e))).length;
  metric(0, potholes); metric(1, garbage); metric(2, resolved); metric(3, '');
  const total = filtered.length || 0;
  const pct = n => total ? (n / total * 100) : 0;
  document.querySelector('.issue-donut strong').textContent = total;
  document.querySelector('.issue-donut').style.background = `conic-gradient(#ed3f59 0 ${pct(potholes)}%,#347feb ${pct(potholes)}% 100%)`;
  document.querySelectorAll('.distribution-key strong').forEach((el,i)=>el.textContent=i===0?potholes:garbage);
  document.querySelectorAll('.distribution-key small').forEach((el,i)=>el.textContent=`${pct(i===0?potholes:garbage).toFixed(1)}%`);
  document.querySelector('.resolution-donut strong').textContent = total;
  document.querySelectorAll('.resolution-key strong').forEach((el,i)=>el.textContent=[resolved, filtered.filter(e=>/assigned|progress/.test(statusName(e))).length, filtered.filter(e=>/pending|open|new/.test(statusName(e))).length][i]);
  const counts = [resolved, filtered.filter(e=>/assigned|progress/.test(statusName(e))).length, filtered.filter(e=>/pending|open|new/.test(statusName(e))).length];
  const resolvedEnd=pct(counts[0]), assignedEnd=resolvedEnd+pct(counts[1]);
  document.querySelector('.resolution-donut').style.background = `conic-gradient(#10a98e 0 ${resolvedEnd}%,#f69b24 ${resolvedEnd}% ${assignedEnd}%,#ed3f59 ${assignedEnd}% 100%)`;
  document.querySelectorAll('.resolution-key small').forEach((el,i)=>el.textContent=`${pct(counts[i]).toFixed(1)}%`);
  const zones = new Map();
  filtered.forEach(e=>{ const z=zoneName(e); if(z===missing)return; const row=zones.get(z)||{p:0,g:0}; if(moduleName(e)==='Pothole')row.p++; if(moduleName(e)==='Garbage')row.g++; zones.set(z,row); });
  const maxZone=Math.max(1,...[...zones.values()].map(z=>Math.max(z.p,z.g)));
  $('#zoneChart').innerHTML = [...zones].map(([name,z])=>`<div class="zone-group"><div class="zone-bar pothole" style="height:${z.p/maxZone*100}%"><b>${z.p||''}</b></div><div class="zone-bar garbage" style="height:${z.g/maxZone*100}%"><b>${z.g||''}</b></div><span class="zone-label">${esc(name)}</span></div>`).join('') || '<p class="empty-state">No zone data for this selection.</p>';
  const sorted=[...zones].sort((a,b)=>(b[1].p+b[1].g)-(a[1].p+a[1].g));
  const top=sorted.slice(0,5), maxTop=Math.max(1,...top.map(([,z])=>Math.max(z.p,z.g)));
  $('#zoneRankings').innerHTML=top.map(([name,z])=>`<div class="rank-row"><span>${esc(name)}</span><div class="rank-bars"><div class="rank-track"><div class="rank-fill red" style="width:${z.p/maxTop*100}%"></div></div><div class="rank-track"><div class="rank-fill blue" style="width:${z.g/maxTop*100}%"></div></div></div><span class="rank-values">${z.p}<br>${z.g}</span></div>`).join('') || '<p class="empty-state">No zone data for this selection.</p>';
  const areas=new Map();
  filtered.forEach(e=>{
    const point=coordinates(e);
    if(!point)return;
    // Group nearby detections into an area using a ~10 m coordinate grid.
    const lat=point.lat.toFixed(4),lng=point.lng.toFixed(4),key=`${lat},${lng}`;
    const row=areas.get(key)||{lat,lng,p:0,g:0};
    if(moduleName(e)==='Pothole')row.p++;
    if(moduleName(e)==='Garbage')row.g++;
    areas.set(key,row);
  });
  const topAreas=[...areas].sort((a,b)=>(b[1].p+b[1].g)-(a[1].p+a[1].g)).slice(0,5);
  $('#areaRows').innerHTML=topAreas.map(([key,z],i)=>`<tr><td>${i+1}</td><td data-area-key="${key}">${esc(areaLookups.get(key)||'Loading area name…')}</td><td>${z.p}</td><td>${z.g}</td><td>${z.p+z.g}</td></tr>`).join('') || '<tr><td colspan="5">No coordinate data for this selection.</td></tr>';
  resolveAreaNames(topAreas);
  const days=new Map(); filtered.forEach(e=>{const d=eventDate(e);if(!d)return; const key=d.toISOString().slice(0,10);const row=days.get(key)||{p:0,g:0,r:0};if(moduleName(e)==='Pothole')row.p++;if(moduleName(e)==='Garbage')row.g++;if(/resolved|complete|closed/.test(statusName(e)))row.r++;days.set(key,row);});
  renderTrend([...days].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14));
}
async function resolveAreaNames(areas) {
  for (const [key, point] of areas) {
    if (areaLookups.has(key)) continue;
    const cached=localStorage.getItem(`analytics-area:${key}`);
    if(cached){areaLookups.set(key,cached);updateAreaCell(key,cached);continue;}
    areaLookups.set(key,'Loading area name…');
    const wait=Math.max(0,1100-(Date.now()-lastAreaLookup));
    if(wait) await new Promise(resolve=>setTimeout(resolve,wait));
    lastAreaLookup=Date.now();
    try {
      const response=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(point.lat)}&lon=${encodeURIComponent(point.lng)}&zoom=18&addressdetails=1`);
      if(!response.ok) throw new Error('Reverse geocoding unavailable');
      const data=await response.json(), address=data.address||{};
      const name=address.neighbourhood||address.suburb||address.city_district||address.quarter||address.village||address.town||address.city||address.county||address.state||'Area name unavailable';
      areaLookups.set(key,name);localStorage.setItem(`analytics-area:${key}`,name);updateAreaCell(key,name);
    } catch { areaLookups.set(key,'Area name unavailable');updateAreaCell(key,'Area name unavailable'); }
  }
}
function updateAreaCell(key,name) {
  const cell=[...document.querySelectorAll('[data-area-key]')].find(el=>el.dataset.areaKey===key);
  if(cell)cell.textContent=name;
}
function renderTrend(days) {
  const chart=$('#trendChart'), w=650,h=145,left=27,top=7,bottom=23,max=Math.max(1,...days.flatMap(([,d])=>[d.p,d.g,d.r])), step=(w-left-10)/Math.max(days.length,1);
  let svg=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Daily event counts">`;
  [0,.25,.5,.75,1].forEach(v=>{const y=top+(h-top-bottom)*(1-v);svg+=`<line x1="${left}" y1="${y}" x2="${w}" y2="${y}" stroke="#eaf0f7"/><text x="${left-5}" y="${y+3}" text-anchor="end" font-size="8" fill="#8493aa">${Math.round(max*v)}</text>`;});
  days.forEach(([date,d],i)=>{const x=left+step*i+3,bw=Math.max(2,step*.18);[d.p,d.g,d.r].forEach((v,j)=>{const height=v/max*(h-top-bottom);svg+=`<rect x="${x+j*(bw+2)}" y="${h-bottom-height}" width="${bw}" height="${height}" rx="1.5" fill="${['#ed4059','#367fed','#10a98e'][j]}"/>`;});svg+=`<text x="${x+step*.27}" y="${h-6}" text-anchor="middle" font-size="7.5" fill="#74839c">${date.slice(5)}</text>`;});
  chart.innerHTML=days.length?svg+'</svg>':'<p class="empty-state">No dated events for this selection.</p>';
}
async function initialize() {
  try {
    const response=await apiFetch('/api/events?page=1&page_size=100');
    if(!response.ok) throw new Error(`Unable to load analytics data (${response.status}).`);
    const payload=await response.json(); events=listFrom(payload);
    const zones=[...new Set(events.map(zoneName).filter(v=>v!==missing))].sort();
    $('#zoneFilter').innerHTML='<option>All Zones</option>'+zones.map(z=>`<option>${esc(z)}</option>`).join('');
    render();
  } catch(error) { document.querySelectorAll('.metric strong').forEach(e=>e.textContent='—'); $('#zoneChart').innerHTML=`<p class="empty-state">${esc(error.message)}</p>`; $('#zoneRankings').innerHTML=''; $('#areaRows').innerHTML=`<tr><td colspan="5">${esc(error.message)}</td></tr>`; }
}
$('#applyFilters').onclick=render;
$('#resetFilters').onclick=()=>{ $('#zoneFilter').value='All Zones';$('#moduleFilter').value='All Modules';$('#globalSearch').value='';$('#dateFrom').value='';$('#dateTo').value='';render(); };
$('#moduleFilter').onchange=render; $('#zoneFilter').onchange=render; $('#dateFrom').onchange=render; $('#dateTo').onchange=render;
$('#globalSearch').oninput=render;
$('#menuToggle').onclick=()=>$('#sidebar').classList.toggle('open');
function reportCanvas(){
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1800;const ctx=canvas.getContext('2d');
  const colors={ink:'#152e62',muted:'#7585a0',line:'#e4ebf5',red:'#ed3f59',blue:'#367fed',teal:'#10a98e',orange:'#f69b24',pale:'#f7faff'};
  const text=(value,x,y,size=20,color=colors.ink,weight=500)=>{ctx.fillStyle=color;ctx.font=`${weight} ${size}px Inter,Arial,sans-serif`;ctx.fillText(String(value??''),x,y)};
  const card=(x,y,w,h,title,subtitle='')=>{ctx.fillStyle='#fff';ctx.strokeStyle=colors.line;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,w,h,16);ctx.fill();ctx.stroke();text(title,x+24,y+38,22,colors.ink,700);if(subtitle)text(subtitle,x+24,y+65,15,colors.muted,400);};
  const potholes=filtered.filter(e=>moduleName(e)==='Pothole').length,garbage=filtered.filter(e=>moduleName(e)==='Garbage').length,total=filtered.length;
  const resolved=filtered.filter(e=>/resolved|complete|closed/.test(statusName(e))).length,assigned=filtered.filter(e=>/assigned|progress/.test(statusName(e))).length,pending=filtered.filter(e=>/pending|open|new/.test(statusName(e))).length;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);text('Analytics & Report',64,70,40,colors.ink,700);
  const dateFrom=$('#dateFrom').value,dateTo=$('#dateTo').value,filterParts=[`Module: ${$('#moduleFilter').value}`,`Zone: ${$('#zoneFilter').value}`],dateRange=dateFrom||dateTo?`Date range: ${dateFrom||'Any'} to ${dateTo||'Any'}`:'Date range: All dates';
  text(filterParts.join('   •   '),64,108,17,colors.muted,500);text(dateRange,64,136,17,colors.muted,500);text(`Generated ${new Date().toLocaleString()}`,64,164,15,colors.muted,400);
  const metricData=[['Total Potholes',potholes,colors.red],['Total Garbage',garbage,colors.orange],['Resolved Issues',resolved,colors.blue],['Average Resolution Time','—','#8753e8']];
  metricData.forEach(([label,value,color],i)=>{const x=64+i*370,y=190,w=350,h=98;ctx.fillStyle='#fff';ctx.strokeStyle=colors.line;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,w,h,14);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x+16,y+19,58,58,12);ctx.fill();text(label,x+91,y+38,17,colors.muted,500);text(value,x+91,y+72,27,colors.ink,700);});
  const trend={x:64,y:310,w:950,h:400},distribution={x:1034,y:310,w:502,h:400},zoneBox={x:64,y:730,w:950,h:410},resolution={x:1034,y:730,w:502,h:410},topZonesBox={x:64,y:1160,w:720,h:590},areasBox={x:804,y:1160,w:732,h:590};
  card(trend.x,trend.y,trend.w,trend.h,'Daily Detection Trend','Potholes, garbage, and resolved events over time');
  card(distribution.x,distribution.y,distribution.w,distribution.h,'Issue Type Distribution','Share of events in the selected range');
  card(zoneBox.x,zoneBox.y,zoneBox.w,zoneBox.h,'Zone-wise Issues','Potholes and garbage across zones');
  card(resolution.x,resolution.y,resolution.w,resolution.h,'Issue Resolution Status','Status distribution of recorded events');
  card(topZonesBox.x,topZonesBox.y,topZonesBox.w,topZonesBox.h,'Top 5 Zones by Issues','Highest reporting zones');
  card(areasBox.x,areasBox.y,areasBox.w,areasBox.h,'Top 5 Areas by Issues','Nearby detections grouped by coordinates');
  const dayMap=new Map();filtered.forEach(e=>{const date=eventDate(e);if(!date)return;const key=date.toISOString().slice(0,10),row=dayMap.get(key)||{p:0,g:0,r:0};if(moduleName(e)==='Pothole')row.p++;if(moduleName(e)==='Garbage')row.g++;if(/resolved|complete|closed/.test(statusName(e)))row.r++;dayMap.set(key,row);});
  const days=[...dayMap].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14),plot={x:trend.x+55,y:trend.y+100,w:trend.w-85,h:trend.h-145},maxDaily=Math.max(1,...days.flatMap(([,d])=>[d.p,d.g,d.r]));
  ctx.strokeStyle=colors.line;ctx.lineWidth=1;for(let i=0;i<5;i++){const y=plot.y+plot.h*i/4;ctx.beginPath();ctx.moveTo(plot.x,y);ctx.lineTo(plot.x+plot.w,y);ctx.stroke();text(Math.round(maxDaily*(1-i/4)),trend.x+20,y+5,13,colors.muted,400);}
  const dayStep=plot.w/Math.max(days.length,1),barW=Math.min(13,dayStep*.17);days.forEach(([date,d],i)=>{const base=plot.x+i*dayStep+dayStep*.16;[d.p,d.g,d.r].forEach((value,j)=>{const h=value/maxDaily*(plot.h-5);ctx.fillStyle=[colors.red,colors.blue,colors.teal][j];ctx.fillRect(base+j*(barW+4),plot.y+plot.h-h,barW,h);});text(date.slice(5),base-5,plot.y+plot.h+24,11,colors.muted,400);});
  const donut=(cx,cy,r,values,palette)=>{const sum=values.reduce((a,b)=>a+b,0);let angle=-Math.PI/2;if(!sum){ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.strokeStyle=colors.line;ctx.lineWidth=22;ctx.stroke();return;}values.forEach((value,i)=>{const end=angle+value/sum*Math.PI*2;ctx.beginPath();ctx.arc(cx,cy,r,angle,end);ctx.strokeStyle=palette[i];ctx.lineWidth=24;ctx.stroke();angle=end;});};
  donut(distribution.x+170,distribution.y+230,92,[potholes,Math.max(0,total-potholes)],[colors.red,colors.blue]);text(total,distribution.x+144,distribution.y+235,30,colors.ink,700);text('Total Issues',distribution.x+119,distribution.y+263,14,colors.muted,500);
  text(`Potholes   ${potholes}   (${total?(potholes/total*100).toFixed(1):'0.0'}%)`,distribution.x+290,distribution.y+203,16,colors.ink,500);text(`Garbage    ${garbage}   (${total?(garbage/total*100).toFixed(1):'0.0'}%)`,distribution.x+290,distribution.y+243,16,colors.ink,500);
  const zones=new Map();filtered.forEach(e=>{const name=zoneName(e);if(name===missing)return;const row=zones.get(name)||{p:0,g:0};if(moduleName(e)==='Pothole')row.p++;if(moduleName(e)==='Garbage')row.g++;zones.set(name,row);});
  const zoneEntries=[...zones].sort((a,b)=>(b[1].p+b[1].g)-(a[1].p+a[1].g)),maxZone=Math.max(1,...zoneEntries.map(([,z])=>Math.max(z.p,z.g))),zonePlot={x:zoneBox.x+80,y:zoneBox.y+112,w:zoneBox.w-120,h:zoneBox.h-175};
  zoneEntries.forEach(([name,z],i)=>{const groupW=zonePlot.w/Math.max(zoneEntries.length,1),base=zonePlot.x+i*groupW+groupW*.2,bw=Math.min(25,groupW*.26);ctx.fillStyle=colors.red;ctx.fillRect(base,zonePlot.y+zonePlot.h-z.p/maxZone*(zonePlot.h-28),bw,z.p/maxZone*(zonePlot.h-28));ctx.fillStyle=colors.blue;ctx.fillRect(base+bw+5,zonePlot.y+zonePlot.h-z.g/maxZone*(zonePlot.h-28),bw,z.g/maxZone*(zonePlot.h-28));text(name.slice(0,13),base-8,zonePlot.y+zonePlot.h+22,12,colors.muted,400);});
  donut(resolution.x+165,resolution.y+235,88,[resolved,assigned,pending],[colors.teal,colors.orange,colors.red]);text(total,resolution.x+143,resolution.y+240,30,colors.ink,700);text('Total Issues',resolution.x+118,resolution.y+267,14,colors.muted,500);
  [['Resolved',resolved,colors.teal],['Assigned',assigned,colors.orange],['Pending',pending,colors.red]].forEach(([label,value,color],i)=>{const y=resolution.y+190+i*44;ctx.fillStyle=color;ctx.beginPath();ctx.arc(resolution.x+295,y-5,7,0,Math.PI*2);ctx.fill();text(label,resolution.x+315,y,16,colors.muted,500);text(`${value}  (${total?(value/total*100).toFixed(1):'0.0'}%)`,resolution.x+395,y,16,colors.ink,600);});
  zoneEntries.slice(0,5).forEach(([name,z],i)=>{const y=topZonesBox.y+125+i*82;text(`${i+1}. ${name}`,topZonesBox.x+25,y+5,17,colors.ink,500);const max=Math.max(1,...zoneEntries.slice(0,5).map(([,item])=>Math.max(item.p,item.g))),barX=topZonesBox.x+255,barW=topZonesBox.w-345;ctx.fillStyle='#f0f4fa';ctx.fillRect(barX,y-14,barW,14);ctx.fillStyle=colors.red;ctx.fillRect(barX,y-14,barW*z.p/max,14);ctx.fillStyle='#f0f4fa';ctx.fillRect(barX,y+7,barW,14);ctx.fillStyle=colors.blue;ctx.fillRect(barX,y+7,barW*z.g/max,14);text(`${z.p} / ${z.g}`,barX+barW+12,y+5,13,colors.muted,500);});
  const areas=new Map();filtered.forEach(e=>{const point=coordinates(e);if(!point)return;const lat=point.lat.toFixed(4),lng=point.lng.toFixed(4),key=`${lat},${lng}`,row=areas.get(key)||{p:0,g:0};if(moduleName(e)==='Pothole')row.p++;if(moduleName(e)==='Garbage')row.g++;areas.set(key,row);});
  const topAreas=[...areas].sort((a,b)=>(b[1].p+b[1].g)-(a[1].p+a[1].g)).slice(0,5),col=[areasBox.x+24,areasBox.x+100,areasBox.x+445,areasBox.x+535,areasBox.x+625];
  ctx.fillStyle='#f3f7fc';ctx.fillRect(areasBox.x+18,areasBox.y+97,areasBox.w-36,42);[['RANK',col[0]],['AREA',col[1]],['POTHOLES',col[2]],['GARBAGE',col[3]],['TOTAL',col[4]]].forEach(([label,x])=>text(label,x,areasBox.y+124,13,colors.muted,700));
  topAreas.forEach(([key,z],i)=>{const y=areasBox.y+177+i*65,areaName=areaLookups.get(key)||key;ctx.strokeStyle=colors.line;ctx.beginPath();ctx.moveTo(areasBox.x+18,y+19);ctx.lineTo(areasBox.x+areasBox.w-18,y+19);ctx.stroke();text(i+1,col[0],y,16,colors.ink,500);text(areaName.slice(0,32),col[1],y,14,colors.ink,500);text(z.p,col[2],y,15,colors.red,600);text(z.g,col[3],y,15,colors.blue,600);text(z.p+z.g,col[4],y,15,colors.ink,700);});
  return canvas;
}
function pdfFromJpeg(jpeg,width,height){
  const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
  const append=data=>{const bytes=typeof data==='string'?encoder.encode(data):data;parts.push(bytes);length+=bytes.length;};
  append('%PDF-1.4\n');
  const object=(number,body)=>{offsets[number]=length;append(`${number} 0 obj\n${body}\nendobj\n`);};
  object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 720 810] /Resources << /XObject << /Report 4 0 R >> >> /Contents 5 0 R >>');
  offsets[4]=length;append(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);append(jpeg);append('\nendstream\nendobj\n');
  const stream='q\n720 0 0 810 0 0 cm\n/Report Do\nQ\n';object(5,`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`);
  const xref=length;append(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const pdf=new Uint8Array(length);let cursor=0;for(const part of parts){pdf.set(part,cursor);cursor+=part.length;}return pdf;
}
async function downloadAnalyticsPdf(){
  const button=$('#downloadReport'),label=button.textContent;button.disabled=true;button.textContent='Preparing PDF...';
  try{const canvas=reportCanvas(),blob=await new Promise((resolve,reject)=>canvas.toBlob(result=>result?resolve(result):reject(new Error('Could not create the PDF report image.')),'image/jpeg',.94)),jpeg=new Uint8Array(await blob.arrayBuffer()),pdf=pdfFromJpeg(jpeg,canvas.width,canvas.height),url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'})),link=document.createElement('a'),date=new Date().toISOString().slice(0,10);link.href=url;link.download=`analytics-report-${date}.pdf`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#toast').textContent='PDF report downloaded.';$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2400);}catch(error){$('#toast').textContent=error.message||'Could not download the PDF report.';$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),3000);}finally{button.disabled=false;button.textContent=label;}
}
$('#downloadReport').addEventListener('click',downloadAnalyticsPdf);
initialize();
