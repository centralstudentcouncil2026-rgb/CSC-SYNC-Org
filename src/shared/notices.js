// One portal keeps messages above every dashboard and modal stacking context.
let portal, dismissed = '', previous = '', sourceKey = '', timer;
const sources = '.backend-toast, .admin-toast, .toast.error, .toast.success, [role="alert"], .profile-save-notice.error, .announcement-notice.error';
export function showNotice({ message, type = 'error', title, actions = [] }) {
  if (!message?.trim()) return;
  clearTimeout(timer);
  sourceKey = '';
  if (!portal) { portal = document.createElement('aside'); portal.className = 'global-notice'; document.body.append(portal); }
  portal.replaceChildren(); portal.hidden = false;
  portal.dataset.type = type; portal.setAttribute('role', type === 'error' ? 'alert' : 'status');
  const icon = document.createElement('span'); icon.className = 'global-notice-icon'; icon.textContent = type === 'error' ? '!' : '✓'; icon.setAttribute('aria-hidden','true');
  const body = document.createElement('div'); body.className = 'global-notice-body';
  const heading = document.createElement('strong'); heading.textContent = title || (type === 'error' ? 'Please check' : 'Saved');
  const text = document.createElement('p'); text.textContent = message;
  body.append(heading, text);
  if (actions.length) {
    const buttons = document.createElement('div'); buttons.className = 'global-notice-actions';
    for (const action of actions) { const button = document.createElement('button'); button.type = 'button'; button.textContent = action.label; button.onclick = () => { portal.hidden = true; action.run(); }; buttons.append(button); }
    body.append(buttons);
  }
  const close = document.createElement('button'); close.type = 'button'; close.className = 'global-notice-close'; close.setAttribute('aria-label','Dismiss notification'); close.textContent = '×'; close.onclick = () => { dismissed = previous; portal.hidden = true; };
  portal.append(icon, body, close);
  if (type === 'success') timer = setTimeout(() => { portal.hidden = true; }, 4000);
}

let queued = false;
function collect() {
  queued = false;
  const messages = [];
  for (const node of document.querySelectorAll(sources)) {
    if (portal?.contains(node) || node === portal || node.hidden || node.closest('[hidden]')) continue;
    const copy = node.cloneNode(true); copy.querySelectorAll('button').forEach(button => button.remove());
    const message = copy.textContent.trim(); if (!message) continue;
    node.setAttribute('data-notice-source', '');
    messages.push({ message, type: node.classList.contains('success') ? 'success' : 'error', actions: [...node.querySelectorAll('button')].filter(button => !button.hasAttribute('data-dismiss-toast')).map(button => ({ label: button.textContent.trim(), run: () => button.click() })) });
  }
  const notice = messages.findLast(item => item.type === 'error') || messages.at(-1);
  const key = notice ? `${notice.type}:${notice.message}` : '';
  if (!key) { if (sourceKey && portal) portal.hidden = true; sourceKey = ''; previous = ''; dismissed = ''; return; }
  if (key === previous || key === dismissed) return;
  previous = key; showNotice(notice); sourceKey = key;
}
const observer = new MutationObserver(records => {
  if (records.every(record => record.target === portal || portal?.contains(record.target) || record.type === 'attributes' && record.attributeName === 'data-notice-source')) return;
  if (!queued) { queued = true; queueMicrotask(collect); }
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden','class','role','data-notice-source'] });
let invalid = null;
document.addEventListener('invalid', event => {
  event.preventDefault();
  if (invalid) return;
  invalid = event.target;
  queueMicrotask(() => { const field = invalid; invalid = null; showNotice({ message: field.validationMessage }); field.focus({ preventScroll: true }); });
}, true);
document.addEventListener('submit', () => { previous = ''; dismissed = ''; }, true);
collect();
