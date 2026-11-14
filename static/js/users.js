let users=[];
const pageSize=10; let page=1; let selected=null; let tab='Details'; let activeTab='All';
const rows=document.querySelector('#userRows'), pagination=document.querySelector('#userPagination'), detail=document.querySelector('#userDetail'), toast=document.querySelector('#userToast');
detail.classList.add('hidden');document.querySelector('.users-workspace').classList.add('detail-hidden');
const getField=(user,...keys)=>{for(const key of keys){const value=user?.[key];if(value!==undefined&&value!==null&&value!=='')return value;}return '';};
const displayValue=value=>typeof value==='string'?value:value==null?'':String(value);
function normalizeUser(user){
 const name=displayValue(getField(user,'name','full_name','fullName','username'))||'Unnamed User';
 const roleRaw=displayValue(getField(user,'role','user_role','userRole'))||'Unknown';
 const role=roleRaw.replaceAll('_',' ').replace(/\b\w/g,char=>char.toUpperCase());
 const roleDepartments={'super admin':'Administration','admin':'Administration','operator':'Operations','viewer':'Monitoring','maintenance':'Field Operations','auditor':'Audit & Compliance'};
 const department=displayValue(getField(user,'department','team'))||roleDepartments[roleRaw.toLowerCase().replaceAll('_',' ')]||'—';
 const active=getField(user,'is_active','isActive','active');
 const statusRaw=displayValue(getField(user,'status','account_status','accountStatus'));
 const status=statusRaw?(/inactive|disabled|suspended/i.test(statusRaw)?'Inactive':'Active'):((active===false||active===0||active==='false')?'Inactive':'Active');
 const initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'?';
 return {id:displayValue(getField(user,'id','_id','user_id','userId'))||'—',username:displayValue(getField(user,'username','user_name','userName'))||'—',name,email:displayValue(getField(user,'email','email_address','emailAddress'))||'—',role,status,department,login:displayValue(getField(user,'last_login','lastLogin','last_login_at','lastLoginAt'))||'—',phone:displayValue(getField(user,'phone','phone_number','phoneNumber','contact_number'))||'—',designation:displayValue(getField(user,'designation','title','job_title'))||'—',joined:displayValue(getField(user,'created_at','createdAt','date_joined','dateJoined'))||'—',initials,color:'',raw:user};
}
function extractUsers(payload){if(Array.isArray(payload))return payload;if(!payload||typeof payload!=='object')return [];for(const key of ['users','data','items','results']){if(Array.isArray(payload[key]))return payload[key];if(payload[key]&&typeof payload[key]==='object'){const nested=extractUsers(payload[key]);if(nested.length)return nested;}}return [];}
function updateUserCounts(){const active=users.filter(user=>user.status==='Active').length;const inactive=users.length-active;const roles=new Set(users.map(user=>user.role));document.querySelector('#totalUsersCount').textContent=users.length;document.querySelector('#activeUsersCount').textContent=active;document.querySelector('#inactiveUsersCount').textContent=inactive;document.querySelector('#userRolesCount').textContent=roles.size;document.querySelector('#roleNames').textContent=[...roles].join(', ')||'—';document.querySelector('#allUsersTabCount').textContent=users.length;document.querySelector('#activeUsersTabCount').textContent=active;document.querySelector('#inactiveUsersTabCount').textContent=inactive;const roleFilter=document.querySelector('#roleFilter'),selectedRole=roleFilter.value;roleFilter.innerHTML='<option value="All">All Roles</option>';for(const role of roles){const option=document.createElement('option');option.value=role;option.textContent=role;roleFilter.append(option);}roleFilter.value=roles.has(selectedRole)?selectedRole:'All';}
async function loadUsers(){
 const token=sessionStorage.getItem('access_token');
 if(!token){rows.innerHTML='<tr><td colspan="8">Sign in again to load users.</td></tr>';document.querySelector('#showingUsers').textContent='Unable to load users';return;}
 rows.innerHTML='<tr><td colspan="8">Loading users…</td></tr>';
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),30000);
 try{
  const response=await fetch('/api/users',{headers:{'Accept':'application/json','Authorization':`Bearer ${token}`},signal:controller.signal});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(readableApiMessage(payload.detail??payload.message??payload.error)||'Unable to load users.');
  users=extractUsers(payload).map(normalizeUser);updateUserCounts();
  selected=null;page=1;render();renderDetail();
 }catch(error){users=[];selected=null;updateUserCounts();const message=error.name==='AbortError'?'Loading users timed out. Please retry.':error.message||'Unable to load users.';rows.innerHTML=`<tr><td colspan="8">${escapeHtml(message)}</td></tr>`;document.querySelector('#showingUsers').textContent='Unable to load users';renderDetail();}
 finally{clearTimeout(timeout);}
}
function filteredUsers(){const q=document.querySelector('#userSearch').value.trim().toLowerCase();const role=document.querySelector('#roleFilter').value;const status=document.querySelector('#statusFilter').value;return users.filter(u=>(activeTab==='All'||u.status===activeTab)&&(role==='All'||u.role===role)&&(status==='All'||u.status===status)&&(!q||`${u.name} ${u.email} ${u.role} ${u.department}`.toLowerCase().includes(q)));}
function render(){const filtered=filteredUsers();const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));page=Math.min(page,pageCount);const shown=filtered.slice((page-1)*pageSize,page*pageSize);
 rows.innerHTML=shown.length?shown.map((u,i)=>{const roleClass=u.role.toLowerCase().replace(/[^a-z0-9]+/g,'-');return `<tr data-user="${users.indexOf(u)}"><td><input type="checkbox" aria-label="Select ${escapeHtml(u.name)}"></td><td>${(page-1)*pageSize+i+1}</td><td><div class="user-cell"><span class="user-avatar">${escapeHtml(u.initials)}</span><div><span class="user-name">${escapeHtml(u.name)}</span><span class="user-email">${escapeHtml(u.email)}</span></div></div></td><td><span class="role-badge ${roleClass}">${escapeHtml(u.role)}</span></td><td>${escapeHtml(u.department)}</td><td><span class="user-status ${u.status.toLowerCase()}">${escapeHtml(u.status)}</span></td><td class="user-login">${escapeHtml(u.login)}</td><td><div class="row-actions"><button class="edit-row" aria-label="Edit ${escapeHtml(u.name)}" title="Edit user">✎</button></div></td></tr>`}).join(''):`<tr><td colspan="8">${users.length?'No users match these filters.':'No users found.'}</td></tr>`;
 rows.querySelectorAll('.edit-row').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();showUserDetails(Number(b.closest('tr').dataset.user));}));
 rows.querySelectorAll('.more-row').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();selected=users[Number(b.closest('tr').dataset.user)];selected.status=selected.status==='Active'?'Inactive':'Active';render();renderDetail();showToast(`${selected.name} is now ${selected.status.toLowerCase()}.`);}));
 document.querySelector('#showingUsers').textContent=filtered.length?`Showing ${(page-1)*pageSize+1} to ${Math.min(page*pageSize,filtered.length)} of ${filtered.length} users`:(users.length?'No users match these filters':'No users found');
 pagination.innerHTML=`<button data-page="1" aria-label="First page">«</button><button data-page="${page-1}" aria-label="Previous page">‹</button>${Array.from({length:pageCount},(_,i)=>`<button data-page="${i+1}" class="${page===i+1?'current':''}">${i+1}</button>`).join('')}<button data-page="${page+1}" aria-label="Next page">›</button>`;pagination.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{page=Math.max(1,Math.min(pageCount,Number(b.dataset.page)));render();}));
 document.querySelector('#selectAll').checked=false;
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function formatUserValue(value){if(value===null||value===undefined||value==='')return '—';return typeof value==='object'?JSON.stringify(value):String(value);}
function showUserDetails(index){selected=users[index];if(!selected)return;tab='Details';detail.classList.remove('hidden');document.querySelector('.users-workspace').classList.remove('detail-hidden');renderDetail();}
function renderDetail(){
 const container=document.querySelector('#detailContent');
 if(!selected){container.innerHTML='';return;}
 const badge=`<span class="user-status ${selected.status.toLowerCase()}">${escapeHtml(selected.status)}</span>`;
 const head=`<div class="user-summary"><span class="detail-avatar">${escapeHtml(selected.initials)}</span><div><div class="user-topline"><h2>${escapeHtml(selected.name)}</h2>${badge}</div><p>${escapeHtml(selected.email)}</p></div></div><div class="user-detail-tabs">${['Details','Roles & Permissions','Activity Log'].map(name=>`<button class="${tab===name?'selected':''}" data-tab="${name}">${name}</button>`).join('')}</div>`;
 const raw=selected.raw||{};
 let entries=[];
 if(tab==='Details')entries=Object.entries(raw).filter(([key,value])=>!/(password|token|secret|credential|hash)/i.test(key)&&value!==null&&value!==undefined);
 else if(tab==='Roles & Permissions')entries=Object.entries(raw).filter(([key])=>/(role|permission|scope|access)/i.test(key));
 else entries=Object.entries(raw).filter(([key])=>/(activity|login|sign.?in|created|updated)/i.test(key));
 const body=entries.length?`<dl class="detail-fields">${entries.map(([key,value])=>`<dt>${escapeHtml(key.replace(/[_-]/g,' ').replace(/\b\w/g,char=>char.toUpperCase()))}</dt><span>:</span><dd>${escapeHtml(formatUserValue(value))}</dd>`).join('')}</dl>`:`<p class="empty-detail">No ${tab.toLowerCase()} details are available from the user service.</p>`;
 const actions=tab==='Details'?`<div class="user-actions"><button type="button" class="edit-user" id="detailEditUser">✎ &nbsp; Edit User</button><button type="button" id="resetPassword">⊙ &nbsp; Reset Password</button><button type="button" class="deactivate-user">Deactivate User</button></div>`:'';
 container.innerHTML=head+body+actions;
 container.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.tab;renderDetail();}));
 container.querySelector('#detailEditUser')?.addEventListener('click',openEditUserModal);
 container.querySelector('#resetPassword')?.addEventListener('click',openResetPasswordModal);
 container.querySelector('.deactivate-user')?.addEventListener('click',deactivateSelectedUser);
}
async function deactivateSelectedUser(event){
 if(!selected?.id||selected.id===String.fromCharCode(0x2014)){showToast('This user does not have an ID and cannot be updated.');return;}
 if(selected.status==='Inactive'){showToast(`${selected.name} is already inactive.`);return;}
 const token=sessionStorage.getItem('access_token');
 if(!token){showToast('Your session has expired. Please sign in again.');return;}
 const button=event.currentTarget;button.disabled=true;button.textContent='Deactivating...';
 try{
  const response=await fetch(`/api/users/${encodeURIComponent(selected.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({is_active:false})});
  const result=await response.json().catch(()=>({}));
  const message=readableApiMessage(result.message??result.detail??result.error);
  if(!response.ok||result.success===false)throw new Error(message||'User deactivation failed.');
  selected.raw={...(selected.raw||{}),is_active:false,status:'Inactive'};selected.status='Inactive';updateUserCounts();render();renderDetail();showToast(message||`${selected.name} deactivated successfully.`);
 }catch(error){showToast(error.message||'User deactivation failed.');button.disabled=false;button.textContent='Deactivate User';}
}
function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.classList.remove('show'),2600);}
document.querySelectorAll('.user-tabs button').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.status;document.querySelectorAll('.user-tabs button').forEach(x=>x.classList.toggle('selected',x===b));page=1;render();}));
document.querySelector('#applyUsers').addEventListener('click',()=>{page=1;render();});document.querySelector('#userSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){page=1;render();}});document.querySelector('#resetUsers').addEventListener('click',()=>{document.querySelector('#userSearch').value='';document.querySelector('#roleFilter').value='All';document.querySelector('#statusFilter').value='All';activeTab='All';page=1;document.querySelectorAll('.user-tabs button').forEach((b,i)=>b.classList.toggle('selected',i===0));render();});document.querySelector('#selectAll').addEventListener('change',e=>rows.querySelectorAll('input[type=checkbox]').forEach(c=>c.checked=e.target.checked));document.querySelector('#closeDetail').addEventListener('click',()=>{detail.classList.add('hidden');document.querySelector('.users-workspace').classList.add('detail-hidden');});const addUserModal=document.querySelector('#addUserModal');
const addUserForm=document.querySelector('#addUserForm');
const addUserMessage=document.querySelector('#addUserMessage');
const submitAddUser=document.querySelector('#submitAddUser');
const editUserModal=document.querySelector('#editUserModal');
const editUserForm=document.querySelector('#editUserForm');
const editUserMessage=document.querySelector('#editUserMessage');
const submitEditUser=document.querySelector('#submitEditUser');
const resetPasswordModal=document.querySelector('#resetPasswordModal');
const resetPasswordForm=document.querySelector('#resetPasswordForm');
const resetPasswordMessage=document.querySelector('#resetPasswordMessage');
const submitResetPassword=document.querySelector('#submitResetPassword');
function openEditUserModal(){
 if(!selected)return;
 const form=editUserForm.elements,rawRole=displayValue(getField(selected.raw,'role','user_role','userRole'))||'operator',missing=String.fromCharCode(0x2014);
 const normalizedRole=rawRole.toLowerCase().replaceAll(' ','_'),unavailableRole=['maintenance','auditor'].includes(normalizedRole);
 if(!unavailableRole&&![...form.role.options].some(option=>option.value.toLowerCase()===normalizedRole)){const option=document.createElement('option');option.value=normalizedRole;option.textContent=rawRole;form.role.append(option);}
 form.name.value=selected.name===missing?'':selected.name;
 form.username.value=selected.username===missing?'':selected.username;
 form.email.value=selected.email===missing?'':selected.email;
 form.role.value=unavailableRole?'':normalizedRole;
 form.is_active.checked=selected.status==='Active';
 form.password.value='';
 editUserMessage.textContent=unavailableRole?`This user's current role (${rawRole}) is no longer available. Choose Admin, Operator, or Viewer before saving.`:'';editUserMessage.className='add-user-message';
 editUserModal.classList.add('open');editUserModal.setAttribute('aria-hidden','false');form.name.focus();
}
function closeEditUserModal(){editUserModal.classList.remove('open');editUserModal.setAttribute('aria-hidden','true');}
function openResetPasswordModal(){
 if(!selected)return;
 resetPasswordForm.reset();resetPasswordMessage.textContent='';resetPasswordMessage.className='add-user-message';
 resetPasswordModal.classList.add('open');resetPasswordModal.setAttribute('aria-hidden','false');resetPasswordForm.elements.password.focus();
}
function closeResetPasswordModal(){resetPasswordModal.classList.remove('open');resetPasswordModal.setAttribute('aria-hidden','true');resetPasswordForm.reset();}
function closeAddUserModal(){addUserModal.classList.remove('open');addUserModal.setAttribute('aria-hidden','true');}
function readableApiMessage(value){
 if(typeof value==='string')return value.trim();
 if(typeof value==='number'||typeof value==='boolean')return String(value);
 if(Array.isArray(value))return value.map(readableApiMessage).filter(Boolean).join(' ');
 if(value&&typeof value==='object'){
  for(const key of ['message','msg','detail','error','description']){
   if(value[key]!==undefined){const message=readableApiMessage(value[key]);if(message)return message;}
  }
 }
 return '';
}
document.querySelector('#closeEditUser').addEventListener('click',closeEditUserModal);
document.querySelector('#cancelEditUser').addEventListener('click',closeEditUserModal);
editUserModal.addEventListener('click',event=>{if(event.target===editUserModal)closeEditUserModal();});
document.querySelector('#closeResetPassword').addEventListener('click',closeResetPasswordModal);
document.querySelector('#cancelResetPassword').addEventListener('click',closeResetPasswordModal);
resetPasswordModal.addEventListener('click',event=>{if(event.target===resetPasswordModal)closeResetPasswordModal();});
document.querySelector('#addUser').addEventListener('click',()=>{addUserMessage.textContent='';addUserMessage.className='add-user-message';addUserModal.classList.add('open');addUserModal.setAttribute('aria-hidden','false');addUserForm.elements.name.focus();});
document.querySelector('#closeAddUser').addEventListener('click',closeAddUserModal);
document.querySelector('#cancelAddUser').addEventListener('click',closeAddUserModal);
addUserModal.addEventListener('click',event=>{if(event.target===addUserModal)closeAddUserModal();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(addUserModal.classList.contains('open'))closeAddUserModal();if(editUserModal.classList.contains('open'))closeEditUserModal();if(resetPasswordModal.classList.contains('open'))closeResetPasswordModal();}});
resetPasswordForm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!selected?.id||selected.id===String.fromCharCode(0x2014)){resetPasswordMessage.textContent='This user does not have an ID and cannot be updated.';return;}
 const token=sessionStorage.getItem('access_token');
 if(!token){resetPasswordMessage.textContent='Your session has expired. Please sign in again.';return;}
 const password=resetPasswordForm.elements.password.value,confirmPassword=resetPasswordForm.elements.confirmPassword.value;
 if(password!==confirmPassword){resetPasswordMessage.textContent='The passwords do not match.';return;}
 const payload={name:selected.name,username:selected.username,email:selected.email,role:getField(selected.raw,'role','user_role','userRole')||'operator',is_active:selected.status==='Active',password};
 submitResetPassword.disabled=true;submitResetPassword.textContent='Resetting...';resetPasswordMessage.textContent='';resetPasswordMessage.className='add-user-message';
 try{
  const response=await fetch(`/api/users/${encodeURIComponent(selected.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  const message=readableApiMessage(result.message??result.detail??result.error);
  if(!response.ok||result.success===false)throw new Error(message||'Password reset failed.');
  closeResetPasswordModal();showToast(message||`Password reset successfully for ${selected.name}.`);
 }catch(error){resetPasswordMessage.textContent=error.message||'Password reset failed.';}
 finally{submitResetPassword.disabled=false;submitResetPassword.textContent='Reset Password';}
});
editUserForm.addEventListener('submit',async event=>{
 event.preventDefault();
 if(!selected?.id||selected.id===String.fromCharCode(0x2014)){editUserMessage.textContent='This user does not have an ID and cannot be updated.';return;}
 const token=sessionStorage.getItem('access_token');
 if(!token){editUserMessage.textContent='Your session has expired. Please sign in again.';return;}
 const form=new FormData(editUserForm),payload={name:String(form.get('name')).trim(),username:String(form.get('username')).trim(),email:String(form.get('email')).trim(),role:form.get('role'),is_active:form.get('is_active')==='on'};
 const password=String(form.get('password')||'');if(password)payload.password=password;
 submitEditUser.disabled=true;submitEditUser.textContent='Saving...';editUserMessage.textContent='';editUserMessage.className='add-user-message';
 try{
  const response=await fetch(`/api/users/${encodeURIComponent(selected.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  const message=readableApiMessage(result.message??result.detail??result.error);
  if(!response.ok||result.success===false)throw new Error(message||'User update failed. Please check the submitted details.');
  const target=selected,responseUser=result.user??(result.data&&typeof result.data==='object'&&!Array.isArray(result.data)?result.data:null),{password:ignoredPassword,...safePayload}=payload;
  const updatedRaw={...(target.raw||{}),...safePayload,...(responseUser||{})};delete updatedRaw.password;
  Object.assign(target,normalizeUser(updatedRaw));selected=target;updateUserCounts();render();renderDetail();closeEditUserModal();showToast(message||`${target.name} updated successfully.`);
 }catch(error){editUserMessage.textContent=error.message||'User update failed.';}
 finally{submitEditUser.disabled=false;submitEditUser.textContent='Save Changes';}
});
addUserForm.addEventListener('submit',async event=>{
 event.preventDefault();
 const token=sessionStorage.getItem('access_token');
 if(!token){addUserMessage.textContent='Your session has expired. Please sign in again.';return;}
 const formData=new FormData(addUserForm);
 const payload={name:formData.get('name').trim(),username:formData.get('username').trim(),email:formData.get('email').trim(),password:formData.get('password'),role:formData.get('role')};
 submitAddUser.disabled=true;submitAddUser.textContent='Creating...';addUserMessage.textContent='';addUserMessage.className='add-user-message';
 try{
  const response=await fetch('/api/users',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  const detail=readableApiMessage(result.message??result.detail??result.error);
  if(!response.ok||result.success===false){addUserMessage.textContent=detail||'User creation failed. Please check the submitted details.';return;}
  addUserMessage.textContent=detail||'User created successfully.';addUserMessage.classList.add('success');addUserForm.reset();await loadUsers();
 }catch{
  addUserMessage.textContent='User creation failed. Unable to reach the user service.';
 }finally{
  submitAddUser.disabled=false;submitAddUser.textContent='Create User';
 }
});document.querySelector('#menuToggle')?.addEventListener('click',()=>document.querySelector('#sidebar').classList.toggle('open'));
loadUsers();
