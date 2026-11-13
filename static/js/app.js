const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const tokenHeaders = headers => { const token=sessionStorage.getItem('access_token'); return token?{...headers,Authorization:`Bearer ${token}`}:{...headers}; };
const fallback='—';
const pick=(obj,...keys)=>keys.map(key=>obj?.[key]).find(value=>value!==undefined&&value!==null&&String(value).trim()!=='')??fallback;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const listFrom=data=>Array.isArray(data)?data:(data?.events||data?.items||data?.results||(Array.isArray(data?.data)?data.data:[]));
const formatDate=value=>{if(!value||value===fallback)return fallback;const date=new Date(value);return Number.isNaN(date.getTime())?String(value):date.toLocaleString();};
let tasks=[];
let activeStatus='All Tasks';
let selectedTask=null;
let currentPage=1;
let loadingMoreTasks=false;
const pageSize=10;
const detailModal=$('#taskDetailModal');

function statusFor(event,due){
  const status=String(pick(event,'status','state')).toLowerCase().replaceAll('_',' ').replaceAll('-',' ');
  if(/resolved|complete|closed/.test(status))return 'Completed';
  if(/progress|assigned/.test(status))return 'In Progress';
  if(/pending|open|new|detected/.test(status))return 'Pending';
  if(due!==fallback&&!/progress|assigned/.test(status)){const date=new Date(due);if(!Number.isNaN(date.getTime())&&date<new Date())return 'Overdue';}
  return status===fallback?fallback:status.replace(/\b\w/g,letter=>letter.toUpperCase());
}
function normalizeTask(event){
  const id=String(pick(event,'id','event_id','eventId','_id'));
  const due=pick(event,'due_date','due_at','deadline','dueDate');
  const rawModule=String(pick(event,'event_type','type','module','eventType'));
  const module=/manhole/i.test(rawModule)?'Open Manhole':/garbage/i.test(rawModule)?'Garbage':/pothole/i.test(rawModule)?'Pothole':rawModule;
  const cameraRaw=String(pick(event,'camera_name','camera_id','camera'));
  const cameraMatch=cameraRaw.match(/^(.+?)\s+(Cam(?:era)?[-_ ]?\w+)\s*$/i);
  const vehicleValue=pick(event,'vehicle_no','vehicle_number','vehicle','vehicleNo');
  return {raw:event,id,module,issue:pick(event,'issue_id','issueId','ticket_id','ticketId','reference_id'),vehicle:vehicleValue===fallback?(cameraMatch?.[1]?.trim()||fallback):vehicleValue,camera:cameraMatch?.[2]?.trim()||cameraRaw,location:pick(event,'location','address','place'),zone:pick(event,'zone','zone_name'),severity:pick(event,'severity','level'),detected:pick(event,'event_time','detected_at','created_at','timestamp','time'),status:statusFor(event,due),rawStatus:pick(event,'status','state'),assigned:pick(event,'assigned_to','assignee','assigned','operator_name'),due,created:pick(event,'created_at','event_time','detected_at','timestamp'),remarks:pick(event,'remarks','description','notes','comment'),image:pick(event,'image_base64','base64_image','image','image_data','photo'),score:pick(event,'confidence','score'),latitude:Number.parseFloat(pick(event,'latitude','lat','langitude','location_latitude')),longitude:Number.parseFloat(pick(event,'longitude','lng','lon','longitute','location_longitude'))};
}
function toast(message){const node=$('#toast');node.textContent=message;node.classList.add('show');setTimeout(()=>node.classList.remove('show'),2400)}
function statusClass(status){return status.toLowerCase().replaceAll(' ','-')}
function imageSource(task){if(!task||task.image===fallback)return '';if(/^(data:image\/|https?:\/\/)/i.test(task.image))return task.image;const mime=pick(task.raw,'image_mime_type','mime_type');return `data:${mime.startsWith('image/')?mime:'image/jpeg'};base64,${task.image}`}
function populateFilters(){
  const zones=[...new Set(tasks.map(task=>task.zone).filter(value=>value!==fallback))].sort();
  const modules=[...new Set(tasks.map(task=>task.module).filter(Boolean))].sort();
  $('#zoneFilter').innerHTML='<option>All Zones</option>'+zones.map(value=>`<option>${escapeHtml(value)}</option>`).join('');
  $('#moduleFilter').innerHTML='<option>All Modules</option>'+modules.map(value=>`<option>${escapeHtml(value)}</option>`).join('');
}
function filteredTasks(){
  const query=$('#globalSearch').value.toLowerCase().trim(),zone=$('#zoneFilter').value,module=$('#moduleFilter').value;
  return tasks.filter(task=>(activeStatus==='All Tasks'||task.status===activeStatus)&&(!query||[task.id,task.module,task.issue,task.location,task.zone,task.status,task.assigned,task.due].join(' ').toLowerCase().includes(query))&&(zone==='All Zones'||task.zone===zone)&&(module==='All Modules'||task.module===module));
}
function renderStats(){
  const counts={total:tasks.length,pending:0,progress:0,completed:0};
  tasks.forEach(task=>{if(task.status==='Pending')counts.pending++;else if(task.status==='In Progress')counts.progress++;else if(task.status==='Completed')counts.completed++;});
  Object.entries(counts).forEach(([key,count])=>{const node=$(`[data-task-stat="${key}"]`);if(node)node.textContent=count.toLocaleString();});
}
function renderPagination(pageCount){
  const pagination=$('#taskPagination');
  pagination.innerHTML='';
  if(pageCount<=1)return;
  const button=(label,page,disabled=false,current=false)=>{const element=document.createElement('button');element.type='button';element.textContent=label;element.disabled=disabled;if(current)element.className='page-current';element.onclick=()=>{currentPage=page;renderRows()};pagination.append(element)};
  button('‹',currentPage-1,currentPage===1);
  for(let page=1;page<=pageCount;page++)button(String(page),page,false,page===currentPage);
  button('›',currentPage+1,currentPage===pageCount);
}
function taskLocationMarkup(task){
  const hasCoordinates=Number.isFinite(task.latitude)&&Number.isFinite(task.longitude)&&Math.abs(task.latitude)<=90&&Math.abs(task.longitude)<=180;
  const place=task.location===fallback?'GPS coordinates':task.location;
  const icon='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.4 5-8A5 5 0 1 0 3 7c0 3.6 5 8 5 8Zm0-6.2A1.8 1.8 0 1 1 8 5.2a1.8 1.8 0 0 1 0 3.6Z"/></svg>';
  const mapUrl=hasCoordinates?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${task.latitude},${task.longitude}`)}`:'';
  const mapAction=hasCoordinates?`<a class="event-map-link" href="${mapUrl}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(place)} in Google Maps" title="Open location in Google Maps">${icon}<span>Map</span></a>`:`<button type="button" class="event-map-link" data-map-task-id="${escapeHtml(task.id)}" aria-label="Open ${escapeHtml(place)} in Google Maps" title="Open location in Google Maps">${icon}<span>Map</span></button>`;
  return `<div class="task-location" title="${escapeHtml(place)}"><span>${escapeHtml(place)}</span>${mapAction}</div>`;
}
async function openTaskMap(id,button){
  const popup=window.open('about:blank','_blank');if(!popup)return;
  const task=tasks.find(item=>item.id===id);if(!task){popup.close();return;}
  let latitude=task.latitude,longitude=task.longitude;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180){
    try{const response=await fetch(`/api/events/${encodeURIComponent(id)}`,{headers:tokenHeaders({})});if(response.ok){let data=await response.json();if(data?.data&&!Array.isArray(data.data))data=data.data;const updated=normalizeTask({...task.raw,...data});Object.assign(task,updated);latitude=task.latitude;longitude=task.longitude;}}
    catch{}
  }
  if(Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180)popup.location.replace(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`);
  else{popup.close();if(button)button.title='Coordinates are unavailable for this event';}
}
function renderRows(){
  const filtered=filteredTasks(),pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  currentPage=Math.min(currentPage,pageCount);
  const start=(currentPage-1)*pageSize,visible=filtered.slice(start,start+pageSize);
  $('#taskRows').innerHTML=visible.length?visible.map(task=>`<tr data-id="${escapeHtml(task.id)}" class="${task.id===selectedTask?'chosen':''}">
    <td class="task-id">${escapeHtml(task.id)}</td>
    <td><span class="module-icon ${task.module==='Pothole'?'pothole':task.module==='Garbage'?'garbage':'manhole'}">${task.module==='Pothole'?'▲':task.module==='Garbage'?'▤':'◉'}</span>${escapeHtml(task.module)}</td>
    <td title="${escapeHtml(task.vehicle)}">${escapeHtml(task.vehicle)}</td><td class="task-location-cell">${taskLocationMarkup(task)}</td><td title="${escapeHtml(task.zone)}">${escapeHtml(task.zone)}</td>
    <td title="${escapeHtml(task.detected)}">${escapeHtml(task.detected)}</td><td class="task-status-cell">${escapeHtml(task.rawStatus===fallback?task.status:task.rawStatus)}</td>
    <td class="task-actions-cell"><button class="view-btn" data-view="${escapeHtml(task.id)}" title="View task" aria-label="View task ${escapeHtml(task.id)}">View</button></td></tr>`).join(''):`<tr><td colspan="8">${tasks.length?'No tasks match these filters.':'No task data is available.'}</td></tr>`;
  const end=Math.min(start+visible.length,filtered.length);
  $('#showingText').textContent=`Showing ${filtered.length?start+1:0} to ${end} of ${filtered.length} tasks${loadingMoreTasks?' · Loading more…':''}`;
  renderPagination(pageCount);
  $$('[data-view]').forEach(button=>button.onclick=()=>showTask(button.dataset.view,button));
  $$('[data-map-task-id]').forEach(button=>button.onclick=()=>openTaskMap(button.dataset.mapTaskId,button));
}
async function showTask(id,button){
  const task=tasks.find(item=>item.id===id);if(!task)return;
  selectedTask=id;
  const title=$('#taskDetailTitle'),body=$('#taskDetailBody');title.textContent=`${task.module} Event Details`;body.innerHTML='<p>Loading event details…</p>';detailModal.classList.add('open');detailModal.setAttribute('aria-hidden','false');$('#taskDetailClose').focus();if(button)button.disabled=true;
  let data=task.raw;
  try{const response=await fetch(`/api/events/${encodeURIComponent(id)}`,{headers:tokenHeaders({})});if(response.ok){data=await response.json();if(data?.data&&!Array.isArray(data.data))data=data.data;}}
  catch{/* Keep the event list details available if the detail request fails. */}
  finally{if(button)button.disabled=false;}
  const event={...task.raw,...data},detailsTask=normalizeTask(event);Object.assign(task,detailsTask);
  const eventType=pick(event,'event_type','type','module','eventType'),rawType=eventType===fallback?task.module:/manhole/i.test(eventType)?'Open Manhole':eventType,titleType=task.module;
  title.textContent=`${titleType} Event Details`;
  const hasCoordinates=Number.isFinite(task.latitude)&&Number.isFinite(task.longitude)&&Math.abs(task.latitude)<=90&&Math.abs(task.longitude)<=180;
  const location=hasCoordinates?`GPS coordinates <a class="event-map-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${task.latitude},${task.longitude}`)}" target="_blank" rel="noopener noreferrer" aria-label="Open GPS coordinates in Google Maps" title="Open GPS coordinates in Google Maps"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 15s5-4.4 5-8A5 5 0 1 0 3 7c0 3.6 5 8 5 8Zm0-6.2A1.8 1.8 0 1 1 8 5.2a1.8 1.8 0 0 1 0 3.6Z"/></svg><span>Map</span></a>`:escapeHtml(task.location);
  const fields=[['Event ID',task.id],['Event Type',rawType],['Vehicle No.',task.vehicle],['Location',location],['Zone',task.zone],['Severity',task.severity],['Detected On',task.detected],['Status',task.rawStatus],['Assigned To',task.assigned],['Camera Name',task.camera]];
  const src=imageSource(task);
  body.innerHTML=`${src?`<img class="dashboard-event-detail-image" src="${escapeHtml(src)}" alt="${escapeHtml(titleType)} event ${escapeHtml(task.id)}">`:'<div class="dashboard-event-detail-no-image">Event image unavailable</div>'}<dl>${fields.map(([label,value])=>`<dt>${escapeHtml(label)}</dt><dd${label==='Location'?' class="detail-location"':''}>${label==='Location'?location:escapeHtml(value)}</dd>`).join('')}</dl>`;
  $$('#taskRows tr[data-id]').forEach(row=>row.classList.toggle('chosen',row.dataset.id===id));
}
async function loadTasks(){
  const cacheKey='dashboard-events-cache';let hasCache=false,hasData=false;
  try{const cached=JSON.parse(sessionStorage.getItem(cacheKey)||'null');if(cached?.savedAt&&Date.now()-cached.savedAt<300000&&Array.isArray(cached.events)){tasks=cached.events.map(normalizeTask).filter(task=>task.id!==fallback&&task.id!=='');hasCache=true;hasData=tasks.length>0;populateFilters();renderStats();renderRows();}}catch{}
  try{
    const response=await fetch('/api/events?page=1&page_size=100',{headers:tokenHeaders({})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.detail||`Unable to load tasks (${response.status}).`);
    let all=listFrom(payload);loadingMoreTasks=all.length===100;tasks=all.map(normalizeTask).filter(task=>task.id!==fallback&&task.id!=='');hasData=true;populateFilters();renderStats();renderRows();
    try{sessionStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),events:all}));}catch{}
    for(let page=2;loadingMoreTasks;page++){
      const nextResponse=await fetch(`/api/events?page=${page}&page_size=100`,{headers:tokenHeaders({})});const nextPayload=await nextResponse.json().catch(()=>({}));if(!nextResponse.ok)throw new Error(nextPayload.detail||`Unable to load more tasks (${nextResponse.status}).`);
      const batch=listFrom(nextPayload);all=all.concat(batch);loadingMoreTasks=batch.length===100;tasks=all.map(normalizeTask).filter(task=>task.id!==fallback&&task.id!=='');populateFilters();renderStats();renderRows();
      try{sessionStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),events:all}));}catch{}
    }
  }catch(error){loadingMoreTasks=false;renderRows();if(!hasData){$('#taskRows').innerHTML=`<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;$('#showingText').textContent='Tasks could not be loaded';['total','pending','progress','completed'].forEach(key=>{const node=$(`[data-task-stat="${key}"]`);if(node)node.textContent=fallback;});toast(error.message);}else if(hasCache)toast(error.message);}
}

$$('.tab').forEach(button=>button.addEventListener('click',()=>{$$('.tab').forEach(item=>item.classList.remove('selected'));button.classList.add('selected');activeStatus=button.dataset.status;currentPage=1;renderRows()}));
$('#applyFilters').addEventListener('click',()=>{currentPage=1;renderRows()});
$('#resetFilters').addEventListener('click',()=>{$('#zoneFilter').value='All Zones';$('#moduleFilter').value='All Modules';$('#globalSearch').value='';activeStatus='All Tasks';currentPage=1;$$('.tab').forEach(button=>button.classList.toggle('selected',button.dataset.status==='All Tasks'));renderRows()});
$('#globalSearch').addEventListener('input',()=>{currentPage=1;renderRows()});
['zoneFilter','moduleFilter'].forEach(id=>$(`#${id}`).addEventListener('change',()=>{currentPage=1;renderRows()}));
function closeTaskDetails(){detailModal.classList.remove('open');detailModal.setAttribute('aria-hidden','true');const button=$$('[data-view]').find(item=>item.dataset.view===selectedTask);if(button&&!button.disabled)button.focus()}
$('#taskDetailClose').addEventListener('click',closeTaskDetails);
detailModal.addEventListener('click',event=>{if(event.target===detailModal)closeTaskDetails()});
detailModal.addEventListener('keydown',event=>{if(event.key==='Escape')closeTaskDetails()});
$('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
loadTasks();
