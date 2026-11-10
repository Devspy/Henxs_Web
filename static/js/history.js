const $ = s => document.querySelector(s);
const apiFetch = url => { const token=sessionStorage.getItem('access_token'); return fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{}}); };
let events = [];
let selected = null;
let detail = null;
let currentPage = 1;
const EVENTS_PER_PAGE = 15;
const value = (...values) => values.find(v => v !== undefined && v !== null && v !== '') ?? '—';
const get = (obj, ...keys) => value(...keys.map(key => obj?.[key]));
const eventId = e => String(get(e, 'id', 'event_id', 'eventId'));
const eventType = e => String(get(e, 'event_type', 'type', 'module', 'eventType'));
const moduleKey = e => eventType(e).toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ');
const eventTypeLabel = e => moduleKey(e).includes('manhole') ? 'Open Manhole' : moduleKey(e).includes('pothole') ? 'Pothole' : moduleKey(e).includes('garbage') ? 'Garbage' : eventType(e);
const moduleClass = e => moduleKey(e).includes('pothole') ? 'pothole' : moduleKey(e).includes('garbage') ? 'garbage' : moduleKey(e).includes('manhole') ? 'manhole' : 'other';
const moduleSymbol = e => moduleClass(e) === 'pothole' ? '▲' : moduleClass(e) === 'garbage' ? '▤' : moduleClass(e) === 'manhole' ? '◉' : '•';
const isPothole = e => moduleKey(e).includes('pothole');
const listFrom = data => Array.isArray(data) ? data : (data?.events || data?.items || data?.results || (Array.isArray(data?.data) ? data.data : []));
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2600); }
function badgeClass(status) { return String(status).toLowerCase().replaceAll(' ', '-'); }
function imageData(obj) {
  const raw = get(obj, 'image_base64', 'base64_image', 'image', 'image_data', 'photo');
  if (typeof raw !== 'string' || raw === '—') return '';
  if (/^(data:image\/|https?:\/\/)/i.test(raw)) return raw;
  const mime = get(obj, 'image_mime_type', 'mime_type', 'image_type');
  return `data:${String(mime).startsWith('image/') ? mime : 'image/jpeg'};base64,${raw}`;
}
function normalize(e) {
  return { raw: e, id: eventId(e), module: eventType(e), vehicle: get(e,'vehicle_no','vehicle_number','vehicle','vehicleNo'),
    location: get(e,'location','address','place'), zone: get(e,'zone','zone_name'),
    time: get(e,'event_time','detected_at','created_at','timestamp','time'), status: get(e,'status'),
    assigned: get(e,'assigned_to','assignee','assigned'), resolved: get(e,'resolved_at','resolved_on'),
    camera: get(e,'camera_id','camera'), confidence: get(e,'confidence','score'), image: imageData(e),
    latitude: Number.parseFloat(get(e,'latitude','lat','langitude','location_latitude')),
    longitude: Number.parseFloat(get(e,'longitude','lng','lon','longitute','location_longitude')) };
}
function hasCoordinates(e) { return Number.isFinite(e.latitude) && Number.isFinite(e.longitude) && Math.abs(e.latitude) <= 90 && Math.abs(e.longitude) <= 180; }
function mapUrl(e) {
  const query = hasCoordinates(e) ? `${e.latitude},${e.longitude}` : e.location !== '—' ? e.location : '';
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}
async function loadDetails(e) {
  detail = e.raw;

  const response = await apiFetch(`/api/events/${encodeURIComponent(e.id)}`);
  if (!response.ok) throw new Error(`Unable to load event details (${response.status}).`);
  detail = await response.json();
  if (detail?.data && !Array.isArray(detail.data)) detail = detail.data;
}
function render() {
  const q = ($('#eventSearch').value || '').toLowerCase().trim();
  const module = $('#moduleFilter').value, zone = $('#zoneFilter').value, status = $('#statusFilter').value;
  const filtered = events.filter(e => (!q || Object.values(e).join(' ').toLowerCase().includes(q)) &&
    (module === 'All Modules' || (module === 'Pothole' ? isPothole(e.raw) : eventType(e.raw).toLowerCase() === module.toLowerCase())) &&
    (zone === 'All Zones' || e.zone === zone) && (status === 'All Status' || e.status === status));
  const pageCount = Math.max(1, Math.ceil(filtered.length / EVENTS_PER_PAGE));
  currentPage = Math.min(currentPage, pageCount);
  const start = (currentPage - 1) * EVENTS_PER_PAGE;
  const shown = filtered.slice(start, start + EVENTS_PER_PAGE);
  $('#eventRows').innerHTML = shown.map(e => { const url=mapUrl(e), location=e.location==='—'?'GPS Coordinates':e.location; return `<tr class="event-row ${e.id===selected?.id?'chosen':''}" data-id="${escapeHtml(e.id)}"><td class="task-id">${escapeHtml(e.id)}</td><td class="event-module"><span class="module-icon ${moduleClass(e.raw)}" aria-hidden="true">${moduleSymbol(e.raw)}</span>${escapeHtml(eventTypeLabel(e.raw))}</td><td>${escapeHtml(e.vehicle)}</td><td class="event-location"><span>${escapeHtml(location)}</span>${url?`<a class="event-map-link" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(location)} in Google Maps" title="Open location in Google Maps"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.4 5-8A5 5 0 1 0 3 7c0 3.6 5 8 5 8Zm0-6.2A1.8 1.8 0 1 1 8 5.2a1.8 1.8 0 0 1 0 3.6Z"/></svg><span>Map</span></a>`:''}</td><td>${escapeHtml(e.zone)}</td><td>${escapeHtml(e.time)}</td><td><span class="status ${badgeClass(e.status)}">${escapeHtml(e.status)}</span></td><td class="actions"><button class="view-btn" data-view="${escapeHtml(e.id)}" title="View">View</button></td></tr>`; }).join('');
  $('#eventCount').textContent = filtered.length;
  $('#showingText').textContent = `Showing ${filtered.length ? start + 1 : 0} to ${Math.min(start + shown.length, filtered.length)} of ${filtered.length} events`;
  renderPagination(pageCount);
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => show(b.dataset.view));
  document.querySelectorAll('.event-row').forEach(el => el.onclick = ev => { if (!ev.target.closest('button,a')) show(el.dataset.id); });
}
function renderPagination(pageCount) {
  const nav = $('#eventPagination');
  const pageButtons = [];
  const first = Math.max(1, Math.min(currentPage - 2, pageCount - 4));
  const last = Math.min(pageCount, first + 4);
  for (let page = first; page <= last; page++) pageButtons.push(`<button type="button" class="${page === currentPage ? 'page-current' : ''}" data-page="${page}" aria-current="${page === currentPage ? 'page' : 'false'}">${page}</button>`);
  nav.innerHTML = `<button type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous page">‹</button><span>Page ${currentPage} of ${pageCount}</span>${pageButtons.join('')}<button type="button" data-page="${currentPage + 1}" ${currentPage === pageCount ? 'disabled' : ''} aria-label="Next page">›</button>`;
  nav.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => {
    const page = Number(button.dataset.page);
    if (page < 1 || page > pageCount || page === currentPage) return;
    currentPage = page;
    render();
  }));
}
async function show(id) {
  const entry = events.find(e => e.id === String(id)); if (!entry) return;
  selected = entry;
  try { await loadDetails(entry); } catch (err) { detail = entry.raw; toast(err.message); }
  const d = normalize(detail || entry.raw);
  $('#dId').textContent=d.id; $('#dModule').innerHTML=`<span class="module-icon ${moduleClass(detail || entry.raw)}" aria-hidden="true">${moduleSymbol(detail || entry.raw)}</span> ${escapeHtml(eventTypeLabel(detail || entry.raw))} Detection`; $('#dVehicle').textContent=d.vehicle;
  $('#dLocation').textContent=d.location; $('#dZone').textContent=d.zone; $('#dZone').className='zone';
  $('#dTime').textContent=d.time; $('#dStatus').textContent=d.status; $('#dStatus').className=`status ${badgeClass(d.status)}`;
  $('#dAssigned').textContent=d.assigned; $('#dResolved').textContent=d.resolved; $('#dCamera').textContent=d.camera; $('#dConfidence').textContent=d.confidence;
  $('#dImage').innerHTML = d.image ? `<img src="${escapeHtml(d.image)}" alt="${escapeHtml(eventTypeLabel(detail || entry.raw))} event ${escapeHtml(d.id)}">` : '<div class="history-event-image-empty">No event image available</div>';
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
    const modules = [...new Set(events.map(e => eventType(e.raw)).filter(Boolean))].sort();
    const zones = [...new Set(events.map(e => e.zone).filter(v => v && v !== '—'))].sort();
    const statuses = [...new Set(events.map(e => e.status).filter(v => v && v !== '—'))].sort();
    $('#moduleFilter').innerHTML = '<option>All Modules</option>' + modules.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(eventTypeLabel({event_type:v}))}</option>`).join('');
    $('#zoneFilter').innerHTML = '<option>All Zones</option>' + zones.map(v => `<option>${escapeHtml(v)}</option>`).join('');
    $('#statusFilter').innerHTML = '<option>All Status</option>' + statuses.map(v => `<option>${escapeHtml(v)}</option>`).join('');
    const stats=document.querySelectorAll('.history-stat strong');
    if(stats.length>=4){stats[0].textContent=events.filter(e=>isPothole(e.raw)).length;stats[1].textContent=events.filter(e=>moduleKey(e.raw).includes('garbage')).length;stats[2].textContent=events.filter(e=>moduleKey(e.raw).includes('manhole')).length;stats[3].textContent=new Set(events.map(e=>e.camera).filter(v=>v!=='—')).size;}
    render(); document.querySelector('.history-layout').classList.add('detail-hidden');
    if (!events.length) $('#eventRows').innerHTML='<tr><td colspan="9">No events found.</td></tr>';
  } catch (err) { $('#eventRows').innerHTML=`<tr><td colspan="9">${escapeHtml(err.message)}</td></tr>`; toast(err.message); }
}
$('#eventSearch').addEventListener('input',()=>{currentPage=1;render()}); $('#globalSearch').addEventListener('input',e=>{$('#eventSearch').value=e.target.value;currentPage=1;render()});
$('#applyFilters').onclick=()=>{currentPage=1;render();toast('Filters applied')};
$('#resetFilters').onclick=()=>{$('#eventSearch').value='';$('#globalSearch').value='';$('#moduleFilter').value='All Modules';$('#zoneFilter').value='All Zones';$('#statusFilter').value='All Status';currentPage=1;render();toast('Filters reset')};
$('#showFilters').onclick=()=>$('#statusFilter').focus(); $('#menuToggle').onclick=()=>$('#sidebar').classList.toggle('open');
$('#closeDetail').onclick=()=>{$('#eventDetail').classList.add('hidden');document.querySelector('.history-layout').classList.add('detail-hidden')};
$('#assignBtn').onclick=()=>toast('Event assignment is not available from the event service.');
$('#statusBtn').onclick=()=>toast('Status updates are not available from the event service.');
$('#downloadBtn').onclick=()=>selected&&downloadEvent(selected.id);
$('#exportReport').onclick=()=>{const rows=[['Event ID','Module','Vehicle','Location','Zone','Time','Status'],...events.map(e=>[e.id,eventType(e.raw),e.vehicle,e.location,e.zone,e.time,e.status])];const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='historic-events.csv';a.click();URL.revokeObjectURL(a.href)};
initialize();
