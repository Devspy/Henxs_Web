const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const authHeaders = headers => {
  const token = sessionStorage.getItem('access_token');
  return token ? {...headers, Authorization:`Bearer ${token}`} : headers;
};
let activeStatus = "All Tasks";
let selectedTask = "TK-2026-1084";
const tasks = [...$$('#taskRows tr')].map(row => {
  const cells = row.querySelectorAll('td');
  return {id:row.dataset.id,module:cells[2].innerText.trim(),issue:cells[3].innerText.trim(),location:cells[4].innerText.trim(),zone:cells[5].innerText.trim(),status:cells[6].innerText.trim(),assigned:cells[7].innerText.trim(),due:cells[8].innerText.trim()};
});
const detailPanel = $('#detailPanel');
function notify(message){const t=$('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2300)}
function statusClass(s){return s.toLowerCase().replaceAll(' ','-')}
function updateStatusBadge(el,status){el.textContent=status;el.className='status '+statusClass(status)}
function renderRows(){
  const q=$('#taskSearch').value.toLowerCase().trim();
  const zone=$('#zoneFilter').value, module=$('#moduleFilter').value;
  let visible=0;
  $$('#taskRows tr').forEach(row=>{
    const t=tasks.find(x=>x.id===row.dataset.id);
    const ok=(activeStatus==='All Tasks'||t.status===activeStatus)&&(!q||row.innerText.toLowerCase().includes(q))&&(zone==='All Zones'||t.zone===zone)&&(module==='All Modules'||t.module===module);
    row.hidden=!ok;if(ok)visible++;
  });
  $('#showingText').textContent=`Showing ${visible?1:0} to ${visible} of ${visible} matching tasks`;
}
function showTask(id){
  const t=tasks.find(x=>x.id===id);if(!t)return;selectedTask=id;
  const rows=$$('#taskRows tr');const row=rows.find(r=>r.dataset.id===id);const cells=row.querySelectorAll('td');
  $('#dId').textContent=t.id;$('#dIssue').textContent=t.issue;$('#dLocation').textContent=t.location;$('#dZone').textContent=t.zone;$('#dZone').className='zone '+t.zone.toLowerCase().replace(' zone','');$('#dDue').textContent=t.due;$('#dAssigned').textContent=t.assigned;
  $('#dModule').innerHTML=`<span class="module-icon ${t.module==='Pothole'?'pothole':'garbage'}">${t.module==='Pothole'?'▲':'▤'}</span> ${t.module==='Pothole'?'Pothole Detection':'Garbage Detection'}`;
  updateStatusBadge($('#detailStatus'),t.status);updateStatusBadge($('#detailStatus2'),t.status);
  const original=window.taskDetails?.[id];if(original){$('#dCreated').textContent=original.created;$('#dRemarks').textContent=original.remarks}
  $$('#taskRows tr').forEach(r=>r.classList.toggle('chosen',r.dataset.id===id));
}
function setStatus(status){
  const t=tasks.find(x=>x.id===selectedTask);if(!t)return;
  t.status=status;const row=$(`#taskRows tr[data-id="${selectedTask}"]`);
  const badge=$('td:nth-child(7) .status',row);updateStatusBadge(badge,status);
  updateStatusBadge($('#detailStatus'),status);updateStatusBadge($('#detailStatus2'),status);
  const next=status==='Pending'?'Mark In Progress':status==='In Progress'?'Mark Completed':'Mark In Progress';
  $('#progressBtn').textContent=next;
  fetch(`/api/tasks/${encodeURIComponent(selectedTask)}`,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({status})}).catch(()=>{});
  renderRows();notify(`${selectedTask} updated to ${status}`);
}
$$('.tab').forEach(btn=>btn.addEventListener('click',()=>{$$('.tab').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');activeStatus=btn.dataset.status;renderRows()}));
$('#taskSearch').addEventListener('input',renderRows);
$('#applyFilters').addEventListener('click',()=>{renderRows();notify('Filters applied')});
$('#resetFilters').addEventListener('click',()=>{$('#zoneFilter').value='All Zones';$('#moduleFilter').value='All Modules';$('#taskSearch').value='';$('#globalSearch').value='';activeStatus='All Tasks';$$('.tab').forEach(b=>b.classList.toggle('selected',b.dataset.status==='All Tasks'));renderRows();notify('Filters reset')});
$('#globalSearch').addEventListener('input',e=>{$('#taskSearch').value=e.target.value;renderRows()});
$('#selectAll').addEventListener('change',e=>$$('.row-check').forEach(c=>{if(!c.closest('tr').hidden)c.checked=e.target.checked}));
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>showTask(b.dataset.view)));
$$('[data-more]').forEach(b=>b.addEventListener('click',()=>{showTask(b.dataset.more);setStatus('In Progress')}));
$('#progressBtn').addEventListener('click',()=>setStatus(tasks.find(t=>t.id===selectedTask)?.status==='In Progress'?'Completed':'In Progress'));
$('#completeBtn').addEventListener('click',()=>setStatus('Completed'));
$('#reassignBtn').addEventListener('click',()=>{const name=prompt('Enter assignee name:',tasks.find(t=>t.id===selectedTask)?.assigned||'');if(name&&name.trim()){const t=tasks.find(x=>x.id===selectedTask);t.assigned=name.trim();$('#dAssigned').textContent=t.assigned;fetch(`/api/tasks/${encodeURIComponent(selectedTask)}`,{method:'PATCH',headers:authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({assigned:t.assigned})}).catch(()=>{});notify('Task reassigned')}})
$('#closeDetail').addEventListener('click',()=>{detailPanel.classList.add('hidden');$('.workspace').classList.add('detail-hidden')});
$('#showFilters').addEventListener('click',()=>{$('#zoneFilter').focus();notify('Choose zone or module above, then click Apply')});
$('#viewImages').addEventListener('click',e=>{e.preventDefault();notify('Issue image gallery is a demo placeholder')});
$('#menuToggle').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$$('.pagination button').forEach(b=>b.addEventListener('click',()=>{if(/^\d+$/.test(b.textContent.trim())){$$('.pagination button').forEach(x=>x.classList.remove('page-current'));b.classList.add('page-current');notify(`Page ${b.textContent.trim()} selected (demo data)`)} }));
showTask(selectedTask);
