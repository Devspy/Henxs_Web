const password=document.querySelector('#password');
const message=document.querySelector('#formMessage');
const setMessage=(text,state='')=>{
  message.textContent=text;
  message.className=`form-message${state?` ${state}`:''}`;
};
document.querySelector('#togglePassword').addEventListener('click',event=>{
  const visible=password.type==='password';
  password.type=visible?'text':'password';
  event.currentTarget.setAttribute('aria-label',visible?'Hide password':'Show password');
});
document.querySelector('#forgotPassword').addEventListener('click',()=>{
  setMessage('Password recovery is not configured. Contact your system administrator.','error');
});
const form=document.querySelector('#loginForm');
const submitButton=form.querySelector('.sign-in');
const submitLabel=submitButton.innerHTML;
form.addEventListener('submit',async event=>{
  event.preventDefault();
  setMessage('Signing in… please wait.','loading');
  submitButton.disabled=true;
  submitButton.innerHTML='Signing in…';
  submitButton.setAttribute('aria-busy','true');

  try{
    const response=await fetch('/api/auth/login',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({
        email:document.querySelector('#username').value.trim(),
        password:password.value
      })
    });
    const result=await response.json();

    if(!response.ok||result.success!==true||!result.access_token){
      setMessage(result.detail||result.message||'Login failed. Check your email and password.','error');
      return;
    }

    sessionStorage.setItem('access_token',result.access_token);
    sessionStorage.setItem('auth_user',JSON.stringify(result.user||{}));
    window.location.assign('/dashboard');
  }catch{
    setMessage('Unable to reach the login service. Please try again.','error');
  }finally{
    submitButton.disabled=false;
    submitButton.innerHTML=submitLabel;
    submitButton.removeAttribute('aria-busy');
  }
});
