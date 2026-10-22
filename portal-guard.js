(function () {
  'use strict';
  const script = document.currentScript;
  const site = script && script.dataset.cscSite;
  const policy = window.CSCPortalPolicy;
  if (!policy || !policy.policies[site]) return;
  const key = 'csc:portal:' + site;
  let previous = null;
  try { previous = sessionStorage.getItem(key); } catch (_) { /* Safe default if storage is unavailable. */ }
  const context = policy.resolve(site, window.location.href, previous);
  try { sessionStorage.setItem(key, context.portal); } catch (_) { /* Query context remains usable. */ }
  const current = new URL(window.location.href);
  current.searchParams.delete('csc_portal');
  current.searchParams.set('csc_portal', context.portal);
  try { history.replaceState(history.state, '', current.href); } catch (_) { /* Return links still use the allowlist. */ }
  Object.defineProperty(window, 'CSCPortalContext', { value: context, configurable: true });

  function updateLinks() {
    let links = document.querySelectorAll('[data-csc-portal-back], a.csc-dashboard-back');
    if (!links.length) {
      const mount = document.querySelector('.auth-card, .login-card, .auth-panel, .org-header-controls, .admin-header-controls, header .brand, .admin-header-row');
      if (mount) {
        const link = document.createElement('a');
        link.className = 'csc-return-guard';
        link.setAttribute('data-csc-portal-back', '');
        link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 5-7 7 7 7M5 12h14"/></svg><span>CSC Websites</span>';
        mount.insertBefore(link, mount.firstChild);
        links = [link];
      }
    }
    for (const link of links) {
      if (link.getAttribute('href') !== context.returnUrl) link.setAttribute('href', context.returnUrl);
      const label = 'Back to ' + context.name + ' dashboard';
      if (link.getAttribute('aria-label') !== label) link.setAttribute('aria-label', label);
      if (link.getAttribute('title') !== label) link.setAttribute('title', label);
    }
  }
  // Capture before application click handlers; navigation is always to a fixed portal URL.
  document.addEventListener('click', function (event) {
    const target = event.target instanceof Element ? event.target.closest('[data-csc-portal-back], a.csc-dashboard-back') : null;
    if (!target) return;
    target.setAttribute('href', context.returnUrl);
  }, true);
  let scheduled = false;
  const observer = new MutationObserver(function () {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(function () { scheduled = false; updateLinks(); });
  });
  function start() { updateLinks(); observer.observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
