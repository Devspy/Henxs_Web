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
    const dates=events.map(eventDate).filter(Boolean).sort((a,b)=>a-b);
    if(dates.length){$('#dateFrom').value=dates[0].toISOString().slice(0,10);$('#dateTo').value=dates.at(-1).toISOString().slice(0,10);}
    render();
  } catch(error) { document.querySelectorAll('.metric strong').forEach(e=>e.textContent='—'); $('#zoneChart').innerHTML=`<p class="empty-state">${esc(error.message)}</p>`; $('#zoneRankings').innerHTML=''; $('#areaRows').innerHTML=`<tr><td colspan="5">${esc(error.message)}</td></tr>`; }
}
$('#applyFilters').onclick=render;
$('#resetFilters').onclick=()=>{ $('#zoneFilter').value='All Zones';$('#moduleFilter').value='All Modules';$('#globalSearch').value='';const dates=events.map(eventDate).filter(Boolean).sort((a,b)=>a-b);$('#dateFrom').value=dates[0]?.toISOString().slice(0,10)||'';$('#dateTo').value=dates.at(-1)?.toISOString().slice(0,10)||'';render(); };
$('#moduleFilter').onchange=render; $('#zoneFilter').onchange=render; $('#dateFrom').onchange=render; $('#dateTo').onchange=render;
$('#globalSearch').oninput=render;
$('#menuToggle').onclick=()=>$('#sidebar').classList.toggle('open');
initialize();
