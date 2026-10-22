(function () {
  'use strict';
  const site = document.currentScript.dataset.cscSession;
  const settings = {
    'sync-admin': { key: 'csc-sync-admin-session', storage: localStorage, portal: 'https://centralstudentcouncil2026-rgb.github.io/CSC-SYNC-Admin/csc-officers.html' },
    'sync-org': { key: 'csc-sync-login-session', storage: localStorage, portal: 'https://centralstudentcouncil2026-rgb.github.io/CSC-SYNC-Org/cole.html' },
    'trace-admin': { key: 'csc-trace-google-session', storage: sessionStorage, portal: 'https://centralstudentcouncil2026-rgb.github.io/CSC-SYNC-Admin/csc-officers.html' }
  };
  const config = settings[site];
  if (!config) return;
  const idleMs = 30 * 60 * 1000;
  const activityKey = 'csc:last-activity:' + site;
  let last = 0;
  let leaving = false;
  try { last = Number(config.storage.getItem(activityKey)) || 0; } catch (_) {}
  function authenticated() {
    try {
      const saved = JSON.parse(config.storage.getItem(config.key) || 'null');
      return !!(saved && (saved.accessToken || saved.token || saved.session?.authenticated));
    } catch (_) { return false; }
  }
  function saveActivity(now) {
    last = now;
    try { config.storage.setItem(activityKey, String(now)); } catch (_) {}
  }
  function check() {
    if (leaving || !authenticated()) return false;
    try { last = Math.max(last, Number(config.storage.getItem(activityKey)) || 0); } catch (_) {}
    if (!last) saveActivity(Date.now());
    if (Date.now() - last < idleMs) return false;
    leaving = true;
    try { config.storage.removeItem(config.key); config.storage.removeItem(activityKey); } catch (_) {}
    window.location.replace(config.portal);
    return true;
  }
  window.CSCIdleSession = { start() { saveActivity(Date.now()); }, check, idleMs };
  for (const type of ['pointerdown', 'keydown', 'touchstart', 'scroll']) {
    window.addEventListener(type, function () {
      if (check() || !authenticated()) return;
      if (Date.now() - last >= 1000) saveActivity(Date.now());
    }, { passive: true });
  }
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  document.addEventListener('visibilitychange', check);
  check();
  window.setInterval(check, 15000);
})();
