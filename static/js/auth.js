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
      <p id="logout-description">Are you sure you want to logout from SMART CITY SURVEILLANCE?</p>
      <div class="logout-actions"><button class="logout-cancel" type="button">Cancel</button><button class="logout-confirm" type="button">Logout</button></div>
    </section>`;
  document.body.append(activeDialog);
  activeDialog.querySelector('.logout-close').addEventListener('click', closeLogoutDialog);
  activeDialog.querySelector('.logout-cancel').addEventListener('click', closeLogoutDialog);
  activeDialog.addEventListener('click', event => { if (event.target === activeDialog) closeLogoutDialog(); });
  activeDialog.querySelector('.logout-confirm').addEventListener('click', () => {
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
updateSignedInProfile();