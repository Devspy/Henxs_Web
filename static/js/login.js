const password=document.querySelector('#password');
const message=document.querySelector('#formMessage');
document.querySelector('#togglePassword').addEventListener('click',event=>{
  const visible=password.type==='password';
  password.type=visible?'text':'password';
  event.currentTarget.setAttribute('aria-label',visible?'Hide password':'Show password');
});
document.querySelector('#forgotPassword').addEventListener('click',()=>{
  message.textContent='Password recovery is not configured. Contact your system administrator.';
});
document.querySelector('#loginForm').addEventListener('submit',event=>{
  event.preventDefault();
  message.textContent='Sign-in service is not configured. Contact your system administrator.';
});
