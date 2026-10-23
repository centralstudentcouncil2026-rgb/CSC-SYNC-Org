/* Shared mobile shortcut; anchor navigation stays outside application routing. */
(()=>{
 const mount=()=>{
  const story=document.querySelector('.auth-story,.login-story,.live-login-story');
  const row=document.querySelector('.login-form-row');
  if(!story||!row||story.querySelector('[data-login-continue]'))return;
  if(!row.id)row.id='csc-login-card';
  const link=document.createElement('a');
  link.className='csc-login-continue';link.dataset.loginContinue='';
  link.href='#'+row.id;
  link.append(document.createTextNode('Continue to staff login '));
  const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='↓';link.append(arrow);
  story.append(link);
 };
 document.addEventListener('click',event=>{
  const link=event.target.closest('[data-login-continue]');if(!link)return;
  const target=document.getElementById(link.hash.slice(1));if(!target)return;
  event.preventDefault();event.stopPropagation();
  target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
 },true);
 const observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});mount();
})();
