const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const tokenHeaders = headers => { const token=sessionStorage.getItem('access_token'); return token?{...headers,Authorization:`Bearer ${token}`}:{...headers}; };
const fallback='—';
const pick=(obj,...keys)=>keys.map(key=>obj?.[key]).find(value=>value!==undefined&&value!==null&&String(value).trim()!=='')??fallback;
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const listFrom=data=>Array.isArray(data)?data:(data?.events||data?.items||data?.results||(Array.isArray(data?.data)?data.data:[]));
function assignedDisplay(event){if(Object.prototype.hasOwnProperty.call(event,'assigned_to')&&(event.assigned_to===null||event.assigned_to===undefined||event.assigned_to===''||['unassigned','none','null','undefined','not assigned'].includes(String(event.assigned_to).trim().toLowerCase())))return fallback;const explicit=event.assigned_to_name||event.assigned_user_name||event.assignee_name||event.assignedToName||event.assigneeName;if(explicit)return explicit;let assigned=event.assigned_to??event.assignee??event.assigned??event.operator_name,object=assigned&&typeof assigned==='object'?assigned:{};const name=object.name||object.username||object.user_name||object.full_name||object.display_name;if(name)return name;assigned=object.id||object.user_id||object.userId||object._id||assigned;let names={};try{names=JSON.parse(sessionStorage.getItem('assigned_user_names')||'{}')||{}}catch{}const id=String(assigned);if(names[id])return names[id];try{const user=JSON.parse(sessionStorage.getItem('auth_user')||'{}')||{},userIds=[user.id,user.user_id,user.userId,user._id].map(value=>String(value??'')),userName=user.name||user.full_name||user.fullName||user.username||user.user_name||user.userName||sessionStorage.getItem('auth_username');if(userName&&userIds.includes(id))return userName}catch{}return assigned||fallback}
function userListFrom(data){if(Array.isArray(data))return data;if(!data||typeof data!=='object')return[];for(const key of ['users','items','results','data']){const nested=data[key];if(Array.isArray(nested))return nested;const users=userListFrom(nested);if(users.length)return users}return[]}
const formatDate=value=>{if(!value||value===fallback)return fallback;const date=new Date(value);return Number.isNaN(date.getTime())?String(value):date.toLocaleString();};
let tasks=[];
let allTasks=[];
let activeStatus='All Tasks';
let selectedTask=null;
let currentPage=1;
let loadingMoreTasks=false;
const pageSize=10;
const detailModal=$('#taskDetailModal');
function isAssignedToCurrentUser(task){
  let user={};try{user=JSON.parse(sessionStorage.getItem('auth_user')||'{}')||{}}catch{}
  const normalize=value=>String(value??'').trim().toLowerCase(),userNames=[user.name,user.full_name,user.fullName,user.username,user.user_name,user.userName,sessionStorage.getItem('auth_username')].map(normalize).filter(Boolean),userIds=[user.id,user.user_id,user.userId,user._id].map(normalize).filter(Boolean),raw=task.raw||{};
  const hasCanonicalAssignee=Object.prototype.hasOwnProperty.call(raw,'assigned_to'),canonicalAssignee=raw.assigned_to;
  if(hasCanonicalAssignee&&(canonicalAssignee===null||canonicalAssignee===undefined||canonicalAssignee===''||['unassigned','none','null','undefined','not assigned'].includes(normalize(canonicalAssignee))))return false;
  const assigned=hasCanonicalAssignee?canonicalAssignee:(raw.assignee??raw.assignedTo??raw.assigned??raw.operator_name),object=assigned&&typeof assigned==='object'?assigned:{},assignedId=normalize(object.id??object.user_id??object.userId??object._id??raw.assigned_to_id??raw.assigned_user_id);
  // An explicit assignee ID is authoritative; do not let a display name override it.
  if(assignedId)return userIds.includes(assignedId);
  const assignedValue=typeof assigned==='string'||typeof assigned==='number'?normalize(assigned):'',namesById=(()=>{try{return JSON.parse(sessionStorage.getItem('assigned_user_names')||'{}')||{}}catch{return {}}})();
  if(assignedValue&&Object.prototype.hasOwnProperty.call(namesById,String(assigned).trim()))return userIds.includes(assignedValue);
  const names=[raw.assigned_to_name,raw.assigned_user_name,raw.assignee_name,raw.assignedToName,raw.assigneeName,object.name,object.username,object.user_name,object.full_name,object.display_name,assignedValue,task.assigned].map(normalize).filter(value=>value&&value!==normalize(fallback)&&!['unassigned','none','null','undefined','not assigned'].includes(value));
  return names.some(name=>userNames.includes(name));
}
function isAdminUser(){try{const user=JSON.parse(sessionStorage.getItem('auth_user')||'{}')||{},role=user.role||user.user_role||user.userRole||(Array.isArray(user.roles)?user.roles[0]:'');return ['admin','super_admin'].includes(String(role).trim().toLowerCase().replaceAll(' ','_'))}catch{return false}}
function canViewTask(task){return isAdminUser()||isAssignedToCurrentUser(task)}
function configurePendingSection(){const admin=isAdminUser(),pendingTab=$('.tab[data-status="Pending"]'),pendingStat=$('[data-task-stat="pending"]')?.closest('.stat-card'),stats=$('.stats');if(pendingTab)pendingTab.hidden=!admin;if(pendingStat)pendingStat.hidden=!admin;if(stats)stats.classList.toggle('operator-view',!admin);if(!admin&&activeStatus==='Pending'){activeStatus='All Tasks';$$('.tab').forEach(tab=>tab.classList.toggle('selected',tab.dataset.status==='All Tasks'));}}
configurePendingSection();

function statusCategory(value){const status=String(value??'').trim().toLowerCase().replace(/[_-]+/g,' ');if(/resolved|complete|closed|done|finished/.test(status))return 'Completed';if(/progress|assigned|in work|working|processing/.test(status))return 'In Progress';if(/pending|open|new|detected|unassigned/.test(status))return 'Pending';return '';}
function statusFor(event,due){
  const rawStatus=pick(event,'status','state','event_status','task_status','resolution_status'),status=String(rawStatus).trim().toLowerCase().replace(/[_-]+/g,' '),category=statusCategory(status);
  if(category)return category;
  if(due!==fallback){const date=new Date(due);if(!Number.isNaN(date.getTime())&&date<new Date())return 'Overdue';}
  return status===String(fallback).toLowerCase()?fallback:status.replace(/\b\w/g,letter=>letter.toUpperCase());
}
function normalizeTask(event){
  const id=String(pick(event,'id','event_id','eventId','_id'));
  const due=pick(event,'due_date','due_at','deadline','dueDate');
  const rawModule=String(pick(event,'event_type','type','module','eventType'));
  const module=/manhole/i.test(rawModule)?'Open Manhole':/garbage/i.test(rawModule)?'Garbage':/pothole/i.test(rawModule)?'Pothole':rawModule;
  const cameraRaw=String(pick(event,'camera_name','camera_id','camera'));
  const cameraMatch=cameraRaw.match(/^(.+?)\s+(Cam(?:era)?[-_ ]?\w+)\s*$/i);
  const vehicleValue=pick(event,'vehicle_no','vehicle_number','vehicle','vehicleNo');
  return {raw:event,id,module,issue:pick(event,'issue_id','issueId','ticket_id','ticketId','reference_id'),vehicle:vehicleValue===fallback?(cameraMatch?.[1]?.trim()||fallback):vehicleValue,camera:cameraMatch?.[2]?.trim()||cameraRaw,location:pick(event,'location','address','place'),zone:pick(event,'zone','zone_name'),severity:pick(event,'severity','level'),detected:pick(event,'event_time','detected_at','created_at','timestamp','time'),status:statusFor(event,due),rawStatus:pick(event,'status','state','event_status','task_status','resolution_status'),assigned:assignedDisplay(event),due,created:pick(event,'created_at','event_time','detected_at','timestamp'),remarks:pick(event,'remarks','description','notes','comment'),image:pick(event,'image_base64','base64_image','image','image_data','photo'),score:pick(event,'confidence','score'),latitude:Number.parseFloat(pick(event,'latitude','lat','langitude','location_latitude')),longitude:Number.parseFloat(pick(event,'longitude','lng','lon','longitute','location_longitude'))};
}
function toast(message){const node=$('#toast');node.textContent=message;node.classList.add('show');setTimeout(()=>node.classList.remove('show'),2400)}
function openTaskStatusDialog(task){
  if(!isAssignedToCurrentUser(task)){toast('You can update only events assigned to you.');return;}
  let modal=$('#taskStatusModal');
  if(!modal){modal=document.createElement('div');modal.id='taskStatusModal';modal.className='dashboard-event-detail-overlay';modal.innerHTML='<section class="dashboard-event-detail-dialog task-status-dialog" role="dialog" aria-modal="true" aria-labelledby="taskStatusTitle"><button type="button" class="dashboard-event-detail-close" aria-label="Close">×</button><h2 id="taskStatusTitle">Update Event Status</h2><p class="task-status-error" role="alert"></p><div class="task-status-actions"><button type="button" class="btn outline task-status-cancel">Cancel</button><button type="button" class="btn outline task-status-reopen">Reopen</button><button type="button" class="btn primary task-status-resolve">Mark Resolved</button></div></section>';document.body.append(modal);modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('.dashboard-event-detail-close,.task-status-cancel'))modal.classList.remove('open')});modal.addEventListener('keydown',event=>{if(event.key==='Escape')modal.classList.remove('open')});}
  modal.classList.add('open');const error=$('.task-status-error',modal),reopen=$('.task-status-reopen',modal),resolve=$('.task-status-resolve',modal);error.textContent='';
  const save=async status=>{reopen.disabled=resolve.disabled=true;try{const response=await fetch(`/api/events/${encodeURIComponent(task.id)}`,{method:'PATCH',headers:tokenHeaders({'Content-Type':'application/json','Accept':'application/json'}),body:JSON.stringify({status,assigned_to:task.raw.assigned_to??task.raw.assignee??task.raw.assigned??null})});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.detail||result.message||`Status update failed (${response.status}).`);const updated={...task.raw,...result,status:result.status||status};Object.assign(task,normalizeTask(updated));task.raw=updated;const statusField=$$('#taskDetailBody dt').find(node=>node.textContent==='Status')?.nextElementSibling;if(statusField)statusField.textContent=task.rawStatus;const assignedField=$$('#taskDetailBody dt').find(node=>node.textContent==='Assigned To')?.nextElementSibling;if(assignedField)assignedField.textContent=task.assigned;renderStats();renderRows();modal.classList.remove('open');closeTaskDetails();toast(result.message||`Event ${task.id} status updated.`);}catch(err){error.textContent=err.message;reopen.disabled=resolve.disabled=false}};
  reopen.onclick=()=>save('pending');resolve.onclick=()=>save('resolved');
}
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
  return tasks.filter(task=>canViewTask(task)&&(activeStatus==='All Tasks'||task.status===activeStatus)&&(!query||[task.id,task.module,task.issue,task.location,task.zone,task.status,task.assigned,task.due].join(' ').toLowerCase().includes(query))&&(zone==='All Zones'||task.zone===zone)&&(module==='All Modules'||task.module===module));
}
function renderStats(){
  const visibleTasks=tasks.filter(canViewTask),counts={total:visibleTasks.length,pending:0,progress:0,completed:0};
  visibleTasks.forEach(task=>{const category=statusCategory(task.status);if(category==='Pending')counts.pending++;else if(category==='In Progress')counts.progress++;else if(category==='Completed')counts.completed++;});
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
  body.innerHTML=`${src?`<img class="dashboard-event-detail-image" src="${escapeHtml(src)}" alt="${escapeHtml(titleType)} event ${escapeHtml(task.id)}">`:'<div class="dashboard-event-detail-no-image">Event image unavailable</div>'}<dl>${fields.map(([label,value])=>`<dt>${escapeHtml(label)}</dt><dd${label==='Location'?' class="detail-location"':''}>${label==='Location'?location:escapeHtml(value)}</dd>`).join('')}</dl>${isAssignedToCurrentUser(task)?'<div class="task-detail-actions"><button type="button" class="btn primary" id="taskUpdateStatus">Update Status</button></div>':''}`;
  $('#taskUpdateStatus')?.addEventListener('click',()=>openTaskStatusDialog(task));
  $$('#taskRows tr[data-id]').forEach(row=>row.classList.toggle('chosen',row.dataset.id===id));
}
async function loadTasks(){
  const cacheKey='dashboard-events-cache';let hasData=false;
  try{
    const response=await fetch('/api/events?page=1&page_size=100',{headers:tokenHeaders({})});const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.detail||`Unable to load tasks (${response.status}).`);
    let all=listFrom(payload);loadingMoreTasks=all.length===100;allTasks=all.map(normalizeTask).filter(task=>task.id!==fallback&&task.id!=='');tasks=allTasks.filter(canViewTask);hasData=true;populateFilters();renderStats();renderRows();
    try{sessionStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),events:all}));}catch{}
    for(let page=2;loadingMoreTasks;page++){
      const nextResponse=await fetch(`/api/events?page=${page}&page_size=100`,{headers:tokenHeaders({})});const nextPayload=await nextResponse.json().catch(()=>({}));if(!nextResponse.ok)throw new Error(nextPayload.detail||`Unable to load more tasks (${nextResponse.status}).`);
      const batch=listFrom(nextPayload);all=all.concat(batch);loadingMoreTasks=batch.length===100;allTasks=all.map(normalizeTask).filter(task=>task.id!==fallback&&task.id!=='');tasks=allTasks.filter(canViewTask);populateFilters();renderStats();renderRows();
      try{sessionStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),events:all}));}catch{}
    }
  }catch(error){loadingMoreTasks=false;renderRows();if(!hasData){$('#taskRows').innerHTML=`<tr><td colspan="8">${escapeHtml(error.message)}</td></tr>`;$('#showingText').textContent='Tasks could not be loaded';['total','pending','progress','completed'].forEach(key=>{const node=$(`[data-task-stat="${key}"]`);if(node)node.textContent=fallback;});toast(error.message);}}
}

async function loadAssignedUserNames(){
 try{
  const response=await fetch('/api/users',{headers:tokenHeaders({'Accept':'application/json'})});if(!response.ok)return;
  const payload=await response.json(),names=JSON.parse(sessionStorage.getItem('assigned_user_names')||'{}')||{};
  for(const user of userListFrom(payload)){const id=String(user.id||user.user_id||user.userId||user._id||''),name=String(user.name||user.full_name||user.fullName||user.username||'').trim();if(id&&name)names[id]=name;}
  try{sessionStorage.setItem('assigned_user_names',JSON.stringify(names));}catch{}
  allTasks=allTasks.map(task=>normalizeTask(task.raw));tasks=allTasks.filter(canViewTask);renderStats();renderRows();
  const selected=tasks.find(task=>task.id===selectedTask),assignedField=$$('#taskDetailBody dt').find(node=>node.textContent==='Assigned To')?.nextElementSibling;if(selected&&assignedField)assignedField.textContent=selected.assigned;
 }catch{}
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
loadTasks();loadAssignedUserNames();
