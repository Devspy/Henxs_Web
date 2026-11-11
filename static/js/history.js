const $ = s => document.querySelector(s);
const apiFetch = (url,options={}) => { const token=sessionStorage.getItem('access_token'); return fetch(url,{...options,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(options.headers||{})}}); };
let events = [];
let selected = null;
let detail = null;
let currentPage = 1;
const EVENTS_PER_PAGE = 15;
const value = (...values) => values.find(v => v !== undefined && v !== null && v !== '') ?? '—';
const get = (obj, ...keys) => value(...keys.map(key => obj?.[key]));
function vehicleCamera(e) {
  const combined = String(get(e, 'camera_id', 'camera'));
  const match = combined.match(/^(.+?)\s+(Cam(?:era)?[-_ ]?\w+)\s*$/i);
  return {
    vehicle: get(e, 'vehicle_no', 'vehicle_number', 'vehicle', 'vehicleNo') !== '—' ? get(e, 'vehicle_no', 'vehicle_number', 'vehicle', 'vehicleNo') : (match?.[1]?.trim() || '—'),
    camera: match?.[2]?.trim() || combined
  };
}
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
function extractOperators(payload) { if(Array.isArray(payload)) return payload; if(!payload||typeof payload!=='object') return []; for(const key of ['users','items','results','data']) { const nested=payload[key]; if(Array.isArray(nested)) return nested; const result=extractOperators(nested); if(result.length) return result; } return []; }
function setAssignmentActions(assigned,status='') {
  const value=String(assigned??'').trim().toLowerCase(),state=String(status??'').trim().toLowerCase();
  const hasAssignee=Boolean(value)&&!['—','-','n/a','none','null','undefined','unassigned','not assigned'].includes(value);
  const isAssigned=hasAssignee||/assigned|in[ -]?progress|resolved|complete/.test(state);
  const assignButton=$('#assignBtn'),statusButton=$('#statusBtn');
  assignButton.hidden=isAssigned; statusButton.hidden=!isAssigned;
  assignButton.style.display=isAssigned?'none':''; statusButton.style.display=isAssigned?'':'none';
}
function badgeClass(status) { return String(status).toLowerCase().replaceAll(' ', '-'); }
function imageData(obj) {
  const raw = get(obj, 'image_base64', 'base64_image', 'image', 'image_data', 'photo');
  if (typeof raw !== 'string' || raw === '—') return '';
  if (/^(data:image\/|https?:\/\/)/i.test(raw)) return raw;
  const mime = get(obj, 'image_mime_type', 'mime_type', 'image_type');
  return `data:${String(mime).startsWith('image/') ? mime : 'image/jpeg'};base64,${raw}`;
}
function normalize(e) {
  const split = vehicleCamera(e);
  return { raw: e, id: eventId(e), module: eventType(e), vehicle: split.vehicle,
    location: get(e,'location','address','place'), zone: get(e,'zone','zone_name'),
    time: get(e,'event_time','detected_at','created_at','timestamp','time'), status: get(e,'status'),
    assigned: get(e,'assigned_to','assignee','assigned'), resolved: get(e,'resolved_at','resolved_on'),
    camera: split.camera, confidence: get(e,'confidence','score'), image: imageData(e),
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
  detail = entry.raw;
  const panel = $('#eventDetail');
  panel.classList.remove('hidden');
  document.querySelector('.history-layout').classList.remove('detail-hidden');
  const renderDetails = source => {
    const d = normalize(source || entry.raw);
    $('#dId').textContent=d.id; $('#dModule').innerHTML=`<span class="module-icon ${moduleClass(source || entry.raw)}" aria-hidden="true">${moduleSymbol(source || entry.raw)}</span> ${escapeHtml(eventTypeLabel(source || entry.raw))} Detection`; $('#dVehicle').textContent=d.vehicle;
    if (hasCoordinates(d)) {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.latitude},${d.longitude}`)}`;
      $('#dLocation').innerHTML = `GPS coordinates <a class="event-map-link" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Open GPS coordinates in Google Maps" title="Open GPS coordinates in Google Maps"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.4 5-8A5 5 0 1 0 3 7c0 3.6 5 8 5 8Zm0-6.2A1.8 1.8 0 1 1 8 5.2a1.8 1.8 0 0 1 0 3.6Z"/></svg><span>Map</span></a>`;
    } else $('#dLocation').textContent=d.location;
    $('#dZone').textContent=d.zone; $('#dZone').className='zone';
    $('#dTime').textContent=d.time; $('#dStatus').textContent=d.status; $('#dStatus').className=`status ${badgeClass(d.status)}`;
    $('#dAssigned').textContent=d.assigned; $('#dResolved').textContent=d.resolved; $('#dCamera').textContent=d.camera; setAssignmentActions(d.assigned,d.status);
    $('#dImage').innerHTML = d.image ? `<img src="${escapeHtml(d.image)}" alt="${escapeHtml(eventTypeLabel(source || entry.raw))} event ${escapeHtml(d.id)}">` : '<div class="history-event-image-empty">No event image available</div>';
  };
  renderDetails(entry.raw);
  render();
  try {
    await loadDetails(entry);
    if (selected === entry) renderDetails(detail);
  } catch (err) {
    if (selected === entry) toast(err.message);
  }
}
function updateSelectedEvent(patch) {
  if (!selected) return;
  const updatedRaw = { ...selected.raw, ...patch };
  Object.assign(selected, normalize(updatedRaw));
  selected.raw = updatedRaw;
  detail = updatedRaw;
  render();
  const d = normalize(updatedRaw);
  $('#dAssigned').textContent = d.assigned;
  $('#dStatus').textContent = d.status;
  $('#dStatus').className = `status ${badgeClass(d.status)}`;
  setAssignmentActions(d.assigned,d.status);
}
async function openAssignDialog() {
  if (!selected) return;
  let modal = $('#historyAssignModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'historyAssignModal'; modal.className = 'pothole-detail-overlay open';
    modal.innerHTML = '<section class="pothole-detail-dialog pothole-assign-dialog" role="dialog" aria-modal="true" aria-labelledby="historyAssignTitle"><button class="pothole-detail-close" type="button" aria-label="Close">×</button><h2 id="historyAssignTitle">Assign Event</h2><p class="assign-event-id"></p><form class="assign-form"><label for="historyOperatorSelect">Operator</label><select id="historyOperatorSelect" required><option value="">Loading operators…</option></select><p class="assign-error" role="alert"></p><div class="assign-actions"><button type="button" class="btn assign-cancel">Cancel</button><button type="submit" class="btn primary assign-submit" disabled>Assign</button></div></form></section>';
    document.body.append(modal); modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('.pothole-detail-close,.assign-cancel'))modal.remove()}); modal.addEventListener('keydown',e=>{if(e.key==='Escape')modal.remove()});
  }
  const event = selected, id = event.id; modal.querySelector('.assign-event-id').textContent = `Event ${id}`; modal.classList.add('open');
  const select=modal.querySelector('#historyOperatorSelect'),submit=modal.querySelector('.assign-submit'),error=modal.querySelector('.assign-error');
  error.textContent=''; submit.disabled=true; select.innerHTML='<option value="">Loading operators…</option>';
  try {
    const response=await apiFetch('/api/users'),payload=await response.json().catch(()=>({}));
    if(!response.ok) throw Error(payload.detail||payload.message||`Could not load operators (${response.status}).`);
    const operators=extractOperators(payload).filter(user=>String(user.role||user.user_role||user.userRole||'').toLowerCase().replaceAll('_',' ')==='operator'&&user.is_active!==false&&user.isActive!==false&&String(user.status||'active').toLowerCase()!=='inactive').map(user=>({id:String(user.id||user.user_id||user.userId||user._id||''),name:String(user.name||user.full_name||user.fullName||user.username||'').trim()})).filter(user=>user.name);
    if(!operators.length) throw Error('No active operators are available.');
    select.innerHTML='<option value="">Select an operator</option>'+operators.map((user,index)=>`<option value="${index}">${escapeHtml(user.name)}</option>`).join(''); submit.disabled=false;
    modal.querySelector('.assign-form').onsubmit=async e=>{e.preventDefault();const operator=operators[Number(select.value)];if(!operator)return;submit.disabled=true;error.textContent='';try{const result=await apiFetch(`/api/v1/events/${encodeURIComponent(id)}/assign`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({assigned_to:operator.id||operator.name})});const body=await result.json().catch(()=>({}));if(!result.ok)throw Error(body.detail||body.message||`Assignment failed (${result.status}).`);updateSelectedEvent({...body,assigned_to:operator.name,status:body.status||'In Progress'});modal.remove();toast(`${id} assigned to ${operator.name}`)}catch(err){error.textContent=err.message;submit.disabled=false}};
  } catch(err) { select.innerHTML='<option value="">Operators unavailable</option>';error.textContent=err.message; }
}
function openStatusDialog() {
  if (!selected) return;
  let modal=$('#historyStatusModal');
  if(!modal){modal=document.createElement('div');modal.id='historyStatusModal';modal.className='pothole-detail-overlay open';modal.innerHTML='<section class="pothole-detail-dialog pothole-assign-dialog" role="dialog" aria-modal="true" aria-labelledby="historyStatusTitle"><button class="pothole-detail-close" type="button" aria-label="Close">×</button><h2 id="historyStatusTitle">Update Event Status</h2><p class="assign-error" role="alert"></p><div class="assign-actions"><button type="button" class="btn assign-cancel">Cancel</button><button type="button" class="btn status-reopen">Reopen</button><button type="button" class="btn success status-resolve">Resolved</button></div></section>';document.body.append(modal);modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('.pothole-detail-close,.assign-cancel'))modal.remove()});modal.addEventListener('keydown',e=>{if(e.key==='Escape')modal.remove()})}
  const event=selected,id=event.id,error=modal.querySelector('.assign-error'),reopen=modal.querySelector('.status-reopen'),resolve=modal.querySelector('.status-resolve');error.textContent='';modal.classList.add('open');
  const save=async(status,assignedTo)=>{reopen.disabled=resolve.disabled=true;try{const response=await apiFetch(`/api/events/${encodeURIComponent(id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status,assigned_to:assignedTo})});const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.detail||body.message||`Status update failed (${response.status}).`);updateSelectedEvent({...body,status:body.status||status,assigned_to:body.assigned_to??assignedTo});modal.remove();toast(status==='resolved'?`${id} marked resolved`:`${id} reopened`)}catch(err){error.textContent=err.message;reopen.disabled=resolve.disabled=false}};
  reopen.disabled=resolve.disabled=false;reopen.onclick=()=>save('pending',null);resolve.onclick=()=>save('resolved',event.assigned);
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
$('#assignBtn').onclick=openAssignDialog;
$('#statusBtn').onclick=openStatusDialog;
$('#downloadBtn').onclick=()=>selected&&downloadEvent(selected.id);
$('#exportReport').onclick=()=>{const rows=[['Event ID','Module','Vehicle','Location','Zone','Time','Status'],...events.map(e=>[e.id,eventType(e.raw),e.vehicle,e.location,e.zone,e.time,e.status])];const csv=rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='historic-events.csv';a.click();URL.revokeObjectURL(a.href)};
initialize();
