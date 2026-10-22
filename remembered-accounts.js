(function () {
 'use strict';
 const scopes = new Set(['sync-admin','sync-org','trace-admin','live-admin','live-committee']);
 const bound = new WeakMap();
 function read(scope) {
  try { const rows = JSON.parse(localStorage.getItem('csc:remembered-accounts:'+scope) || '[]'); return Array.isArray(rows) ? rows.filter(v=>typeof v==='string'&&v.length<=254).slice(0,5) : []; } catch (_) { return []; }
 }
 function remember(scope, account) {
  if (!scopes.has(scope) || typeof account !== 'string' || !account.trim()) return;
  const value = account.trim().slice(0,254);
  try { localStorage.setItem('csc:remembered-accounts:'+scope,JSON.stringify([value,...read(scope).filter(v=>v!==value)].slice(0,5))); } catch (_) {}
 }
 function bind(form) {
  const scope = form.dataset.cscAccountScope;
  if (!scopes.has(scope)) return;
  const username = form.querySelector('[data-csc-username]');
  const password = form.querySelector('[data-csc-password]');
  if (!username || !password) return;
  const previous = bound.get(form);
  if (previous === scope) return;
  if (previous) { username.value = ''; password.value = ''; }
  form.name = scope+'-login';
  form.autocomplete = 'on';
  username.id = username.id || scope+'-account';
  username.setAttribute('autocomplete','section-csc-'+scope+' username');
  password.setAttribute('autocomplete','section-csc-'+scope+' current-password');
  const listId='csc-accounts-'+scope;
  username.setAttribute('list',listId);
  let list = document.getElementById(listId);
  if (!list) { list=document.createElement('datalist'); list.id=listId; form.append(list); }
  list.replaceChildren(...read(scope).map(value=>{const option=document.createElement('option');option.value=value;return option;}));
  if (!username.value) username.value=read(scope)[0] || '';
  bound.set(form,scope);
 }
 window.CSCAccounts = { remember, bind };
 function scan() { document.querySelectorAll('form[data-csc-account-scope]').forEach(bind); }
 function start() { scan(); new MutationObserver(scan).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-csc-account-scope']}); }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
