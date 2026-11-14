const logoutStyles = `
  .logout-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(7,24,48,.58);backdrop-filter:blur(2px)}
  .logout-dialog{position:relative;width:min(436px,100%);padding:32px 28px 29px;border:1px solid #e5eaf2;border-radius:15px;background:#fff;box-shadow:0 18px 55px #061a3540;text-align:center;color:#101c56;font-family:Inter,Arial,sans-serif}
  .logout-close{position:absolute;top:19px;right:19px;width:25px;height:25px;border:0;background:transparent;color:#10205b;font-size:25px;line-height:20px;cursor:pointer}
  .logout-symbol{display:grid;place-items:center;width:84px;height:84px;margin:0 auto 16px;border-radius:50%;background:#ffe3e6;color:#ec2635}
  .logout-symbol svg{width:42px;height:42px}
  .logout-dialog h2{margin:0 0 12px;font-size:25px;line-height:1.25;letter-spacing:-.5px}
  .logout-dialog p{max-width:320px;margin:0 auto 30px;color:#536b9e;font-size:16px;line-height:1.55}
  .logout-actions{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .logout-actions button{height:47px;border:1px solid #4d81ff;border-radius:8px;background:#fff;color:#0860f5;font:600 15px Inter,Arial,sans-serif;cursor:pointer}
  .logout-actions .logout-confirm{border-color:#0860f5;background:#0860f5;color:#fff}
  .logout-actions button:focus-visible,.logout-close:focus-visible{outline:3px solid #83aaff;outline-offset:2px}
  @media(max-width:480px){.logout-dialog{padding:30px 20px 22px}.logout-dialog h2{font-size:22px}.logout-dialog p{font-size:14px}}
`;

const style = document.createElement('style');
style.textContent = logoutStyles;
document.head.append(style);

let activeDialog;
let previousFocus;

function closeLogoutDialog() {
  if (!activeDialog) return;
  activeDialog.remove();
  activeDialog = null;
  document.removeEventListener('keydown', handleDialogKeydown);
  previousFocus?.focus();
}

function handleDialogKeydown(event) {
  if (event.key === 'Escape') closeLogoutDialog();
  if (event.key === 'Tab' && activeDialog) {
    const controls = [...activeDialog.querySelectorAll('button')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}

function openLogoutDialog(link) {
  if (activeDialog) return;
  previousFocus = link;
  activeDialog = document.createElement('div');
  activeDialog.className = 'logout-overlay';
  activeDialog.innerHTML = `
    <section class="logout-dialog" role="alertdialog" aria-modal="true" aria-labelledby="logout-title" aria-describedby="logout-description">
      <button class="logout-close" type="button" aria-label="Close">×</button>
      <div class="logout-symbol" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 8H10a3 3 0 0 0-3 3v26a3 3 0 0 0 3 3h10"/><path d="M27 15l10 9-10 9M15 24h22"/></svg></div>
      <h2 id="logout-title">Confirm Logout</h2>
      <p id="logout-description">Are you sure you want to logout from CIVIC SURVEILLANCE?</p>
      <div class="logout-actions"><button class="logout-cancel" type="button">Cancel</button><button class="logout-confirm" type="button">Logout</button></div>
    </section>`;
  document.body.append(activeDialog);
  activeDialog.querySelector('.logout-close').addEventListener('click', closeLogoutDialog);
  activeDialog.querySelector('.logout-cancel').addEventListener('click', closeLogoutDialog);
  activeDialog.addEventListener('click', event => { if (event.target === activeDialog) closeLogoutDialog(); });
  activeDialog.querySelector('.logout-confirm').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.textContent = 'Logging out…';
    const token = sessionStorage.getItem('access_token');
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
    } catch (error) {
      console.error('Logout service request failed:', error);
    }
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('auth_user');
    sessionStorage.removeItem('auth_username');
    window.location.assign(link.href);
  });
  document.addEventListener('keydown', handleDialogKeydown);
  activeDialog.querySelector('.logout-cancel').focus();
}

document.querySelectorAll('a[href="/logout"]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    openLogoutDialog(link);
  });
});

function updateSignedInProfile(){
  let user={};
  try{user=JSON.parse(sessionStorage.getItem('auth_user')||'{}')||{}}catch{}
  const username=String(user.username||user.user_name||user.userName||user.login||user.identifier||user.email||sessionStorage.getItem('auth_username')||'User');
  const rawRole=user.role||user.user_role||user.userRole||(Array.isArray(user.roles)?user.roles[0]:'')||'User';
  const role=String(rawRole).replaceAll('_',' ').replace(/\b\w/g,letter=>letter.toUpperCase());
  const initials=username.split(/[\s._-]+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'U';
  document.querySelectorAll('.profile-name b,.admin b').forEach(node=>node.textContent=username);
  document.querySelectorAll('.profile-name small,.admin small').forEach(node=>node.textContent=role);
  document.querySelectorAll('.profile-avatar,.avatar').forEach(node=>node.textContent=initials);
}
function standardizeSidebarIcons(){
  if(!document.querySelector('#standardSidebarIconStyles')){const style=document.createElement('style');style.id='standardSidebarIconStyles';style.textContent='.nav a>span svg,.side-nav nav a>span svg{display:block;width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}';document.head.append(style);}
  const icons={
    '/dashboard':'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    '/garbage-detection':'<path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/>',
    '/pothole-detection':'<path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
    '/manhole-detection':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 7v10m-5-5h10"/>',
    '/analytics':'<path d="M4 19V5m0 14h17M8 16v-5m5 5V7m5 9v-8"/>',
    '/tasks':'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6M8 10h8m-8 4h8m-8 4h5"/>',
    '/historic-events':'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    '/user-management':'<path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-3A4.5 4.5 0 0 0 4 18.5V20m6-10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm5-6.5a3.5 3.5 0 0 1 0 6.8m1 3.3h.5a4.5 4.5 0 0 1 4.5 4.5V20"/>',
    '/helpdesk':'<path d="M4 13v-2a8 8 0 0 1 16 0v2"/><path d="M4 12h3v7H6a2 2 0 0 1-2-2zm16 0h-3v7h1a2 2 0 0 0 2-2zm0 7a4 4 0 0 1-4 3h-2"/>',
    '/logout':'<path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5m4-4 4-4-4-4m4 4H9"/>',
    map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/>'
  };
  document.querySelectorAll('.nav a').forEach(link=>{
    const icon=link.href.includes('google.com/maps')?icons.map:icons[new URL(link.href,location.href).pathname];
    const holder=link.querySelector(':scope > span');
    if(!icon||!holder)return;
    holder.replaceChildren();
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.innerHTML=icon;
    holder.append(svg);
  });
}
updateSignedInProfile();
standardizeSidebarIcons();
