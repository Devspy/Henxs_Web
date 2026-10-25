const $ = s => document.querySelector(s);
const apiFetch = url => { const token=sessionStorage.getItem('access_token'); return fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}}); };
let events = [];
let selected = null;
let detail = null;
const value = (...values) => values.find(v => v !== undefined && v !== null && v !== '') ?? '—';
const get = (obj, ...keys) => value(...keys.map(key => obj?.[key]));
const eventId = e => String(get(e, 'id', 'event_id', 'eventId'));
const eventType = e => String(get(e, 'event_type', 'type', 'module', 'eventType'));
const eventTypeLabel = e => eventType(e).toLowerCase() === 'manhole' ? 'Open Manhole' : eventType(e);
const isPothole = e => eventType(e).toLowerCase() === 'pothole';
const listFrom = data => Array.isArray(data) ? data : (data?.events || data?.items || data?.results || (Array.isArray(data?.data) ? data.data : []));
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); }
function badgeClass(status) { return String(status).toLowerCase().replaceAll(' ', '-'); }
function imageData(obj) {
  const raw = get(obj, 'image_base64', 'base64_image', 'image', 'image_data', 'photo');
  if (typeof raw !== 'string') return '';
  if (/^(data:image\/|https?:\/\/)/i.test(raw)) return raw;
  const mime = get(obj, 'image_mime_type', 'mime_type', 'image_type');
  return `data:${String(mime).startsWith('image/') ? mime : 'image/jpeg'};base64,${raw}`;
}
function normalize(e) {
  return { raw: e, id: eventId(e), module: eventType(e), vehicle: get(e,'vehicle_no','vehicle_number','vehicle','vehicleNo'),
    location: get(e,'location','address','place'), zone: get(e,'zone','zone_name'),
    time: get(e,'event_time','detected_at','created_at','timestamp','time'), status: get(e,'status'),
    assigned: get(e,'assigned_to','assignee','assigned'), resolved: get(e,'resolved_at','resolved_on'),
    camera: get(e,'camera_id','camera'), confidence: get(e,'confidence','score'), image: imageData(e) };
}
async function loadDetails(e) {
  detail = e.raw;
  if (!isPothole(e.raw)) return;
  const response = await apiFetch(`/api/events/${encodeURIComponent(e.id)}`);
  if (!response.ok) throw new Error(`Unable to load event details (${response.status}).`);
  detail = await response.json();
  if (detail?.data && !Array.isArray(detail.data)) detail = detail.data;
}
function setImage(container, src, fallback = 'No event image available') {
  container.innerHTML = src ? `<img src="${escapeHtml(src)}" alt="Pothole event ${escapeHtml(selected?.id || '')}">` : `<div class="event-image-empty">${fallback}</div>`;
}
function render() {
  const q = ($('#eventSearch').value || '').toLowerCase().trim();
  const module = $('#moduleFilter').value, zone = $('#zoneFilter').value, status = $('#statusFilter').value;
  const shown = events.filter(e => (!q || Object.values(e).join(' ').toLowerCase().includes(q)) &&
    (module === 'All Modules' || (module === 'Pothole' ? isPothole(e.raw) : eventType(e.raw).toLowerCase() === module.toLowerCase())) &&
    (zone === 'All Zones' || e.zone === zone) && (status === 'All Status' || e.status === status));
  $('#eventRows').innerHTML = shown.map(e => `<tr class="event-row ${e.id===selected?.id?'chosen':''}" data-id="${escapeHtml(e.id)}"><td><input type="checkbox" class="row-check"></td><td class="task-id">${escapeHtml(e.id)}</td><td><div class="event-image">${e.image ? `<img src="${escapeHtml(e.image)}" alt="Event ${escapeHtml(e.id)}">` : '<span>—</span>'}</div></td><td class="event-module">${escapeHtml(eventTypeLabel(e.raw))}</td><td>${escapeHtml(e.vehicle)}</td><td>${escapeHtml(e.location)}</td><td>${escapeHtml(e.zone)}</td><td>${escapeHtml(e.time)}</td><td><span class="status ${badgeClass(e.status)}">${escapeHtml(e.status)}</span></td><td class="actions"><button class="view-btn" data-view="${escapeHtml(e.id)}" title="View">View</button></td></tr>`).join('');
  $('#eventCount').textContent = shown.length;
  $('#showingText').textContent = `Showing ${shown.length ? 1 : 0} to ${shown.length} of ${shown.length} events`;
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => show(b.dataset.view));
  document.querySelectorAll('.event-row').forEach(el => el.onclick = ev => { if (!ev.target.closest('button,input')) show(el.dataset.id); });
}
async function show(id) {
  const entry = events.find(e => e.id === String(id)); if (!entry) return;
  selected = entry;
  try { await loadDetails(entry); } catch (err) { detail = entry.raw; toast(err.message); }
  const d = normalize(detail || entry.raw);
  $('#dId').textContent=d.id; $('#dModule').textContent=`${eventTypeLabel(detail || entry.raw)} Detection`; $('#dVehicle').textContent=d.vehicle;
  $('#dLocation').textContent=d.location; $('#dZone').textContent=d.zone; $('#dZone').className='zone';
  $('#dTime').textContent=d.time; $('#dStatus').textContent=d.status; $('#dStatus').className=`status ${badgeClass(d.status)}`;
  $('#dAssigned').textContent=d.assigned; $('#dResolved').textContent=d.resolved; $('#dCamera').textContent=d.camera; $('#dConfidence').textContent=d.confidence;
  setImage(document.querySelector('.event-preview'), d.image);
  document.querySelectorAll('.preview-thumbs .road-art, .preview-thumbs .video-thumb').forEach(el => el.remove());
  if (d.image) document.querySelector('.preview-thumbs').insertAdjacentHTML('afterbegin', `<img class="event-thumb" src="${escapeHtml(d.image)}" alt="Event image">`);
  $('#eventDetail').classList.remove('hidden'); document.querySelector('.history-layout').classList.remove('detail-hidden'); render();
}
function downloadEvent(id) {
  const e=events.find(x=>x.id===String(id)); if(!e)return;
  const csv='Event ID,Module,Vehicle,Location,Zone,Time,Status\n'+[e.id,eventType(e.raw),e.vehicle,e.location,e.zone,e.time,e.status].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`${e.id}.csv`;a.click();URL.revokeObjectURL(a.href);
}
async function initialize() {
  try {
    const response = await apiFetch('/api/events'); if (!response.ok) throw new Error(`Unable to load events (${response.status}).`);
    events = listFrom(await response.json()).map(normalize);
    const stats=document.querySelectorAll('.history-stat strong');
    if(stats.length>=5){stats[0].textContent=events.filter(e=>isPothole(e.raw)).length;stats[1].textContent=events.filter(e=>eventType(e.raw).toLowerCase()==='garbage').length;stats[2].textContent=new Set(events.map(e=>e.vehicle).filter(v=>v!=='—')).size;stats[3].textContent=new Set(events.map(e=>e.camera).filter(v=>v!=='—')).size;stats[4].textContent='—';}
    render(); if (events.length) await show(events[0].id);
    else $('#eventRows').innerHTML='<tr><td colspan="10">No events found.</td></tr>';
  } catch (err) { $('#eventRows').innerHTML=`<tr><td colspan="10">${escapeHtml(err.message)}</td></tr>`; toast(err.message); }
}
$('#eventSearch').addEventListener('input',render); $('#globalSearch').addEventListener('input',e=>{$('#eventSearch').value=e.target.value;render()});
$('#applyFilters').onclick=()=>{render();toast('Filters applied')};
$('#resetFilters').onclick=()=>{$('#eventSearch').value='';$('#globalSearch').value='';$('#moduleFilter').value='All Modules';$('#zoneFilter').value='All Zones';$('#statusFilter').value='All Status';render();toast('Filters reset')};
$('#selectAll').onchange=e=>document.querySelectorAll('.row-check').forEach(c=>c.checked=e.target.checked);
$('#showFilters').onclick=()=>$('#statusFilter').focus(); $('#menuToggle').onclick=()=>$('#sidebar').classList.toggle('open');
$('#closeDetail').onclick=()=>{$('#eventDetail').classList.add('hidden');document.querySelector('.history-layout').classList.add('detail-hidden')};
$('#assignBtn').onclick=()=>toast('Event assignment is not available from the event service.');
$('#statusBtn').onclick=()=>toast('Status updates are not available from the event service.');
$('#downloadBtn').onclick=()=>selected&&downloadEvent(selected.id);
$('#exportReport').onclick=()=>{const rows=[['Event ID','Module','Vehicle','Location','Zone','Time','Status'],...events.map(e=>[e.id,eventType(e.raw),e.vehicle,e.location,e.zone,e.time,e.status])];const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='historic-events.csv';a.click();URL.revokeObjectURL(a.href)};
initialize();
