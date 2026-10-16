document.querySelectorAll('a[href="/logout"]').forEach(link=>{
  link.addEventListener('click',event=>{
    event.preventDefault();
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('auth_user');
    window.location.assign('/logout');
  });
});
