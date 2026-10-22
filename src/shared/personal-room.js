import { messengerHref, phoneHref } from "./contact-links.js?v=20261022-messenger";
import { captureFormView, deferFormRender } from "./form-view.js?v=20261021-panel-scroll";
const CATEGORIES = ['Class', 'Meeting', 'Study time', 'Personal Time', 'Worship', 'Free time', 'On duty', 'Others'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const timeString = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sunday = date => addDays(date, -new Date(`${date}T00:00:00Z`).getUTCDay());
let current = null;
let cache = null;

export function personalDetails(category, details = {}) {
  const pick = (...keys) => Object.fromEntries(keys.map(key => [key, String(details[key] || '').trim()]));
  if (category === 'Class') return pick('subject', 'room');
  if (category === 'Meeting') return pick('meeting_title', 'location');
  if (['Worship', 'On duty'].includes(category)) return pick('location');
  if (category === 'Study time' || category === 'Personal Time') {
    return details.availability === 'available' ? { availability: 'available', communication_mode: 'Both' } : { availability: 'dnd' };
  }
  if (category === 'Free time') return pick('contact_method', 'contact_value');
  return {};
}

function scheduleTitle(category, details, fallback = '') {
  return category === 'Class' ? details.subject : category === 'Meeting' ? details.meeting_title : fallback || category;
}

function duration(start, end) {
  const total = minutes(end || '00:00') - minutes(start || '00:00');
  if (total <= 0) return 'Choose an end time later than the start time.';
  return `${Math.floor(total / 60) ? `${Math.floor(total / 60)}h ` : ''}${total % 60 ? `${total % 60}m` : ''}`.trim();
}

function categoryFields(item, contacts, profile = {}) {
  const details = item.details || {};
  const input = (label, key, type = 'text') => `<label>${label}<input class="input" type="${type}" name="detail_${key}" value="${escape(details[key] || '')}" maxlength="500" required></label>`;
  const contactFields = (method, field) => {
    const phone = method === 'Phone' || method === 'Phone number';
    const savedKey = phone ? 'phone' : method === 'Messenger' ? 'messenger' : '';
    return input(phone ? 'Phone number' : method === 'Messenger' ? 'Messenger account or link' : 'Other contact details', field, phone ? 'tel' : 'text') +
      (savedKey ? `<button class="white-pill" type="button" data-personal-saved-contact="${savedKey}" data-personal-contact-field="detail_${field}" ${contacts[savedKey] ? '' : 'hidden'}>Use saved ${phone ? 'phone number' : 'Messenger'}</button><label class="personal-room-remember"><input type="checkbox" name="remember_contact" ${item.remember_contact !== false ? 'checked' : ''}>Remember this ${phone ? 'phone number' : 'Messenger'} for next time</label>` : '');
  };
  if (item.category === 'Class') return input('Subject name', 'subject') + input('Room', 'room');
  if (item.category === 'Meeting') return input('Meeting title', 'meeting_title') + input('Location', 'location');
  if (['Worship', 'On duty'].includes(item.category)) return input('Location', 'location');
  if (['Study time', 'Personal Time'].includes(item.category)) {
    return `<label>Availability<select class="input" name="detail_availability"><option value="dnd" ${details.availability !== 'available' ? 'selected' : ''}>DND � Do not disturb</option><option value="available" ${details.availability === 'available' ? 'selected' : ''}>Can be messaged</option></select></label>${details.availability === 'available' ? `<div class="personal-room-profile-contacts"><span>Uses your profile contacts automatically</span><div><span>Phone</span><strong>${escape(profile.phone || 'Not set in profile')}</strong></div><div><span>Messenger</span><strong>${escape(profile.messengerUrl || 'Not set in profile')}</strong></div></div>` : ''}`;
  }
  if (item.category === 'Free time') {
    const method = details.contact_method || 'Phone number';
    return `<label>Where can you be contacted?<select class="input" name="detail_contact_method">${['Phone number', 'Messenger', 'Other'].map(value => `<option ${value === method ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
      ${contactFields(method, 'contact_value')}`;
  }
  return `<label>Title (optional)<input class="input" name="title" maxlength="200" value="${escape(item.title)}"></label>`;
}

function categoryInformation(item, includeCategory = true, contact = null, canContact = false) {
  const details = personalDetails(item.category, item.details);
  let fields = [];
  if (item.category === 'Class') fields = [['Subject name', details.subject], ['Room', details.room]];
  if (item.category === 'Meeting') fields = [['Meeting title', details.meeting_title], ['Location', details.location]];
  if (['Worship', 'On duty'].includes(item.category)) fields = [['Location', details.location]];
  if (['Study time', 'Personal Time'].includes(item.category)) fields = [['Availability', !item.details?.availability ? 'Not provided' : details.availability === 'available' ? 'Can be messaged' : 'DND - Do not disturb']];
  if (item.category === 'Free time') fields = [['Contact method', details.contact_method], ['Contact details', details.contact_value]];
  return `<dl class="personal-room-information">${[...(includeCategory ? [['Category', item.category]] : []), ...fields].map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value || 'Not provided')}</dd></div>`).join('')}</dl>${canContact && ['Study time', 'Personal Time'].includes(item.category) && details.availability === 'available' ? personalContactActions(contact) : ''}`;
}

function personalContactActions(contact) {
  if (!contact || contact.state === 'loading') return '<p class="personal-room-contact-note">Loading contact options...</p>';
  if (contact.state === 'error') return '<button class="white-pill" type="button" data-personal-contact-retry>Retry contact options</button>';
  const phone = phoneHref(contact.phone), messenger = messengerHref(contact.messenger_url);
  return `<div class="personal-room-contact-options" aria-label="Contact schedule owner">${phone ? `<a class="blue-pill" data-personal-contact-phone href="${escape(phone)}">Phone</a>` : ''}${messenger ? `<a class="blue-pill" data-personal-contact-messenger href="${escape(messenger)}" target="_blank" rel="noopener noreferrer">Messenger</a>` : ''}${!phone && !messenger ? '<p>No contact details provided in the profile.</p>' : ''}</div>`;
}

export function personalOccurrences(rows, first, last) {
  const result = [];
  for (const row of rows) {
    for (let date = first; date <= last; date = addDays(date, 1)) {
      if (date < row.selected_date) continue;
      const diff = (Date.parse(date) - Date.parse(row.selected_date)) / 86400000;
      const repeats = row.frequency !== 'none' && date <= row.repeat_until;
      if (date === row.selected_date || repeats && (
        row.frequency === 'weekly' && diff % 7 === 0 ||
        row.frequency === 'monthly' && date.slice(8) === row.selected_date.slice(8) ||
        row.frequency === 'yearly' && date.slice(5) === row.selected_date.slice(5)
      )) result.push({ ...row, occurrenceDate: date });
    }
  }
  return result;
}

// Each connected overlap group shares the available column width.
export function personalLanes(events) {
  const sorted = events.map(item => ({ ...item, start: minutes(item.start_time), end: minutes(item.end_time) })).sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  let group = [], ends = [], groupEnd = -1;
  const result = [];
  const flush = () => {
    result.push(...group.map(item => ({ ...item, columns: ends.length })));
    group = []; ends = []; groupEnd = -1;
  };
  for (const item of sorted) {
    if (group.length && item.start >= groupEnd) flush();
    let lane = ends.findIndex(end => end <= item.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = item.end;
    group.push({ ...item, lane });
    groupEnd = Math.max(groupEnd, item.end);
  }
  flush();
  return result;
}

function loadDraft(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

export function mountPersonalRoom(container, { accountId, token, request, variant = 'org', profile = () => ({}) }) {
  const previous = current;
  const continuing = previous?.accountId === accountId && previous?.token === token && !!container;
  if (continuing) {
    previous.move(container);
    return;
  }
  previous?.dispose();
  current = null;
  if (!container || !accountId || !token) {
    cache = null;
    return;
  }
  if (!cache || cache.token !== token || cache.accountId !== accountId) {
    const key = `csc-sync-personal-room-draft:${accountId}`;
    const draft = loadDraft(key);
    cache = { accountId, token, key, rows: [], users: [], contacts: {}, filter: accountId, week: sunday(today()), editor: draft, detail: null, notice: '', error: false, busy: false, loaded: false, sequence: 0, version: 0 };
  }
  const data = cache;
  if (!continuing) data.week = sunday(today());
  let disposed = false;
  let drag = null;
  let ignoreClick = false;
  let timer;
  let focusedField = null;
  const resizeObserver = new ResizeObserver(() => syncTimeRail());
  const isLive = () => !disposed && container.isConnected && current?.token === token;
  const persist = () => {
    if (data.editor) localStorage.setItem(data.key, JSON.stringify(data.editor));
    else localStorage.removeItem(data.key);
  };
  const label = id => data.users.find(user => user.account_id === id)?.display_name || (id === accountId ? 'My schedule' : 'User');
  const notice = (message, error = false) => { data.notice = message; data.error = error; };

  async function refresh() {
    if (!isLive()) return;
    const sequence = ++data.sequence;
    const version = data.version;
    try {
      const [rows, users, contacts] = await Promise.all([
        request('/personal_schedules?select=*&order=selected_date.asc,start_time.asc'),
        request('/rpc/personal_room_users', { method: 'POST', body: '{}' }),
        request(`/personal_schedule_contacts?owner_account_id=eq.${encodeURIComponent(accountId)}&select=phone,messenger`).catch(() => null),
      ]);
      if (!isLive() || sequence !== data.sequence) return;
      if (version === data.version) data.rows = rows;
      data.users = users;
      if (contacts?.[0]) data.contacts = contacts[0];
      container.querySelectorAll('[data-personal-saved-contact]').forEach(button => { button.hidden = !data.contacts[button.dataset.personalSavedContact]; });
      data.loaded = true;
      if (data.error) notice('');
      if (!data.editor && !data.busy) draw();
      void refreshDetailContact();
    } catch (error) {
      if (!isLive() || sequence !== data.sequence) return;
      notice(`Personal schedules could not be refreshed: ${error.message}. If setup is missing, run 021_personal_room.sql.`, true);
      if (!data.editor && !data.busy) draw();
    }
  }

  const contactRequests = new Set();
  async function refreshDetailContact() {
    const id = data.detail?.id;
    const item = data.rows.find(row => row.id === id);
    if (!isLive() || !item || item.owner_account_id === accountId || !['Study time', 'Personal Time'].includes(item.category) || item.details?.availability !== 'available' || contactRequests.has(id)) return;
    contactRequests.add(id);
    const stillOpen = () => isLive() && data.detail?.id === id && data.rows.some(row => row.id === id && row.owner_account_id !== accountId && row.details?.availability === 'available');
    try {
      const result = await request('/rpc/personal_schedule_contact', { method: 'POST', body: JSON.stringify({ p_id: id }) });
      if (!stillOpen()) return;
      const next = { state: 'ready', phone: result?.schedule_id === id ? result.phone || '' : '', messenger_url: result?.schedule_id === id ? messengerHref(result.messenger_url) : '' };
      if (JSON.stringify(next) !== JSON.stringify(data.detailContact)) { data.detailContact = next; draw(); }
    } catch {
      if (stillOpen()) { data.detailContact = { state: 'error' }; draw(); }
    } finally { contactRequests.delete(id); }
  }

  function openEditor(date, start = '07:00', end = '08:00') {
    if (data.busy) return;
    data.detail = null;
    data.editor = { title: '', category: 'Class', details: {}, selected_date: date, start_time: start, end_time: end, frequency: 'none', repeat_until: '' };
    persist(); draw();
  }

  function dialog() {
    const item = data.editor || data.rows.find(row => row.id === data.detail?.id);
    if (!item) return '';
    const editing = !!data.editor;
    const mine = item.owner_account_id === accountId;
    const heading = editing ? item.id ? 'Edit personal schedule' : 'Create personal schedule' : `${item.category} · ${item.title || 'Personal schedule'}`;
    const dateLabel = date => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : 'Not set';
    const clockLabel = time => `${Number(time.slice(0, 2)) % 12 || 12}:${time.slice(3, 5)} ${Number(time.slice(0, 2)) >= 12 ? 'PM' : 'AM'}`;
    return `<div class="modal-backdrop personal-room-overlay"><section class="modal-card personal-room-dialog ${editing ? '' : 'personal-room-detail-dialog'}" data-category="${escape(item.category)}" role="dialog" aria-modal="true" aria-label="Personal schedule">
      <div class="modal-topline">${!editing ? `<div class="personal-room-detail-heading"><span class="personal-room-category-badge">${escape(item.category)}</span><h2>${escape(item.title || item.category)}</h2></div>` : variant === 'admin' ? `<strong>${escape(heading)}</strong>` : `<span>${escape(heading)}</span>`}<button class="${variant === 'admin' ? 'white-pill' : 'modal-x'}" type="button" data-personal-close>Close</button></div>
      ${editing ? `<form class="${variant === 'admin' ? 'modal-form' : 'stack-form'}" data-personal-form>
        <label>Category<select class="input" name="category" required>${CATEGORIES.map(category => `<option ${category === item.category ? 'selected' : ''}>${category}</option>`).join('')}</select></label>
        <label>Date<input class="input" type="date" name="selected_date" value="${escape(item.selected_date)}" required></label>
        <div data-personal-category-fields>${categoryFields(item, data.contacts, profile())}</div>
        <fieldset class="personal-room-duration" aria-label="Schedule times"><div class="form-grid"><label>Start time<input class="input" type="time" name="start_time" value="${escape(item.start_time?.slice(0, 5))}" required></label><label>End time<input class="input" type="time" name="end_time" value="${escape(item.end_time?.slice(0, 5))}" required></label></div><output data-personal-duration>${escape(duration(item.start_time, item.end_time))}</output></fieldset>
        <label>Repeat<select class="input" name="frequency">${['none', 'weekly', 'monthly', 'yearly'].map(value => `<option value="${value}" ${value === item.frequency ? 'selected' : ''}>${value === 'none' ? 'Does not repeat' : value[0].toUpperCase() + value.slice(1)}</option>`).join('')}</select></label>
        <label data-personal-repeat ${item.frequency === 'none' ? 'hidden' : ''}>Repeat until<input class="input" type="date" name="repeat_until" min="${escape(item.selected_date)}" value="${escape(item.repeat_until || '')}" ${item.frequency !== 'none' ? 'required' : ''}></label>
        <p data-personal-form-error role="alert"></p>
        <div class="personal-room-actions"><button class="blue-pill" type="submit">${data.busy ? 'Saving…' : 'Save schedule'}</button><button class="white-pill" type="button" data-personal-cancel>Cancel</button></div>
      </form>` : `<section class="personal-room-detail-body">
        <div class="personal-room-owner-row"><div class="personal-room-owner"><span>Scheduled by</span><strong>${escape(label(item.owner_account_id))}</strong></div>${!mine ? '<span class="personal-room-view-only" title="Only the schedule owner can edit or delete this schedule."><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>View only</span>' : ''}</div>
        <dl class="personal-room-summary"><div><dt>Date</dt><dd>${escape(dateLabel(data.detail.date))}</dd></div><div><dt>Time</dt><dd>${escape(clockLabel(item.start_time))} – ${escape(clockLabel(item.end_time))}<small>${escape(duration(item.start_time, item.end_time))}</small></dd></div><div class="personal-room-repeat-summary"><dt>Repeat</dt><dd>${item.frequency === 'none' ? 'Does not repeat' : `${escape(item.frequency[0].toUpperCase() + item.frequency.slice(1))} until ${escape(dateLabel(item.repeat_until))}`}</dd></div></dl>
        ${categoryInformation(item, false, data.detailContact, !mine)}
      </section>${mine ? '<footer class="personal-room-detail-actions"><button class="blue-pill" data-personal-edit>Edit schedule</button><button class="white-pill personal-room-delete" data-personal-delete>Delete schedule</button></footer>' : ''}`}
    </section></div>`;
  }

  function syncTimeRail() {
    const calendar = container.querySelector('.personal-room-calendar');
    const rail = calendar?.querySelector('.week-head > div');
    if (rail) calendar.style.setProperty('--personal-time-rail', `${rail.getBoundingClientRect().width}px`);
  }

  function drawHeader() {
    const controls = document.querySelector('[data-personal-room-controls]');
    if (!controls) return;
    const arrow = direction => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${direction < 0 ? 'm14 6-6 6 6 6' : 'm10 6 6 6-6 6'}"/></svg>`;
    controls.innerHTML = `<select class="top-pill" data-personal-filter aria-label="Personal Room user filter"><option value="${escape(accountId)}" ${data.filter === accountId ? 'selected' : ''}>My schedules</option>${data.users.filter(user => user.account_id !== accountId).map(user => `<option value="${escape(user.account_id)}" ${data.filter === user.account_id ? 'selected' : ''}>${escape(user.display_name)}</option>`).join('')}</select><button class="round-button nav-button" type="button" data-personal-week="-1" aria-label="Previous week" title="Previous week">${arrow(-1)}</button><button class="round-button nav-button" type="button" data-personal-week="1" aria-label="Next week" title="Next week">${arrow(1)}</button><button class="round-button nav-button" type="button" data-personal-create aria-label="Create personal schedule" title="Create personal schedule"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>`;
    const title = document.querySelector('[data-personal-room-title]');
    if (title) {
      title.textContent = new Date(`${addDays(data.week, 3)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      title.title = `Personal Room · ${data.week} – ${addDays(data.week, 6)}`;
    }
    controls.querySelector('[data-personal-filter]').onchange = event => { data.filter = event.target.value; draw(); };
    controls.querySelector('[data-personal-create]').onclick = () => openEditor(today());
    controls.querySelectorAll('[data-personal-week]').forEach(button => { button.onclick = () => { data.week = addDays(data.week, Number(button.dataset.personalWeek) * 7); draw(); }; });
  }

  function draw() {
    if (!isLive()) return;
    if (deferFormRender(container, draw)) return;
    const restoreFormView = captureFormView(container, JSON.stringify([accountId, data.editor?.id || Boolean(data.editor), data.detail?.id, data.week, data.filter]));
    const days = Array.from({ length: 7 }, (_, i) => addDays(data.week, i));
    const events = personalOccurrences(data.rows.filter(row => row.owner_account_id === data.filter), days[0], days[6]);
    // Match Conference Room's fitted half-hour week; extend it only when a
    // visible personal schedule falls outside the conference room hours.
    const firstMinute = Math.min(420, ...events.map(item => Math.floor(minutes(item.start_time) / 30) * 30));
    const lastMinute = Math.max(1320, ...events.map(item => Math.ceil(minutes(item.end_time) / 30) * 30));
    const slots = Array.from({ length: (lastMinute - firstMinute) / 30 }, (_, index) => firstMinute + index * 30);
    const clock = value => `${Math.floor(value / 60) % 12 || 12}${value % 60 ? `:${String(value % 60).padStart(2, '0')}` : ''} ${value >= 720 ? 'PM' : 'AM'}`;
    container.innerHTML = `<section class="${variant === 'org' ? 'org-page-panel room-page-panel ' : ''}personal-room">
      <section class="conference-week conference-room-calendar personal-room-calendar">
        <div class="week-head"><div></div>${days.map((date, day) => `<strong class="${date === today() ? 'selected-day' : ''}">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]} ${Number(date.slice(8))}</strong>`).join('')}</div>
        <div class="week-grid" style="grid-template-rows:repeat(${slots.length},minmax(0,1fr))">
        ${slots.map((minute, row) => `<div class="time-label ${minute % 60 ? 'half-hour' : ''}" style="grid-row:${row + 1};grid-column:1">${minute % 60 ? '' : clock(minute)}</div>${days.map((date, day) => `<button type="button" class="week-slot room-slot ${minute % 60 ? 'half-hour' : ''} ${date === today() ? 'selected-day' : ''}" style="grid-row:${row + 1};grid-column:${day + 2}" data-personal-slot="${date}" data-minute="${minute}" aria-label="Create personal schedule ${date} ${timeString(minute)}"></button>`).join('')}`).join('')}
        ${days.map((date, day) => `<div class="personal-room-event-column" style="left:calc(var(--personal-time-rail) + (100% - var(--personal-time-rail)) * ${day} / 7)">${personalLanes(events.filter(event => event.occurrenceDate === date)).map(item => `<button type="button" class="room-booking-chip ${item.owner_account_id === accountId ? 'admin-booking' : 'approved'} personal-room-event" ${item.end - item.start <= 30 ? 'data-room-compact' : ''} data-personal-detail="${escape(item.id)}" data-date="${date}" style="top:${(item.start - firstMinute) * 100 / (lastMinute - firstMinute)}%;height:calc(${(item.end - item.start) * 100 / (lastMinute - firstMinute)}% - 4px);left:${item.lane * 100 / item.columns}%;width:calc(${100 / item.columns}% - 4px)" title="${escape(`${item.category} · ${item.title || item.category} · ${label(item.owner_account_id)} · ${item.start_time.slice(0, 5)}–${item.end_time.slice(0, 5)}`)}"><strong>${escape(clock(item.start))}–${escape(clock(item.end))}</strong><small>${escape(item.category)}${item.title && item.title !== item.category ? ` · ${escape(item.title)}` : ''}</small><small>${escape(label(item.owner_account_id))}</small></button>`).join('')}</div>`).join('')}
        </div>
        ${data.notice || !data.loaded ? `<p class="room-refresh-notice personal-room-notice ${data.error ? 'error' : ''}" role="${data.error ? 'alert' : 'status'}">${escape(data.notice || 'Loading personal schedules…')}${data.error ? '<button type="button" data-personal-refresh>Retry</button>' : ''}</p>` : ''}
      </section></section>${dialog()}`;
    drawHeader();
    resizeObserver.disconnect();
    resizeObserver.observe(container.querySelector('.week-grid'));
    syncTimeRail();
    bind();
    restoreFormView();
    }

  function bind() {
    container.querySelector('[data-personal-refresh]')?.addEventListener('click', refresh);
    container.querySelectorAll('[data-personal-close], [data-personal-cancel]').forEach(button => { button.onclick = () => { if (data.busy) return; data.editor = null; data.detail = null; persist(); draw(); }; });
    container.querySelectorAll('[data-personal-detail]').forEach(button => { button.onclick = () => { data.detail = { id: button.dataset.personalDetail, date: button.dataset.date }; data.detailContact = null; draw(); void refreshDetailContact(); }; });
    container.querySelector('[data-personal-contact-retry]')?.addEventListener('click', refreshDetailContact);
    container.querySelector('[data-personal-edit]')?.addEventListener('click', () => {
      const item = data.rows.find(row => row.id === data.detail.id);
      if (item?.owner_account_id !== accountId) return;
      data.editor = { ...item, details: { subject: item.title || '', meeting_title: item.title || '', ...item.details } }; data.detail = null; persist(); draw();
    });
    container.querySelector('[data-personal-delete]')?.addEventListener('click', async () => {
      const id = data.detail?.id;
      if (data.busy || data.rows.find(row => row.id === id)?.owner_account_id !== accountId || !window.confirm('Delete this personal schedule and all its repeats?')) return;
      data.busy = true; draw(); disableForm();
      try {
        const rows = await request(`/personal_schedules?id=eq.${encodeURIComponent(id)}&owner_account_id=eq.${encodeURIComponent(accountId)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } });
        if (!rows?.some(row => row.id === id)) throw new Error('Deletion was not confirmed. You can only delete your own schedules.');
        data.version++; data.rows = data.rows.filter(row => row.id !== id); data.detail = null; notice('Personal schedule deleted.');
      } catch (error) { notice(error.message, true); }
      finally { data.busy = false; draw(); }
    });
    container.querySelectorAll('[data-personal-slot]').forEach(slot => {
      slot.onclick = () => { if (ignoreClick) { ignoreClick = false; return; } openEditor(slot.dataset.personalSlot, timeString(Number(slot.dataset.minute)), timeString(Math.min(1439, Number(slot.dataset.minute) + 30))); };
      slot.onpointerdown = event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        event.preventDefault(); drag = { date: slot.dataset.personalSlot, start: Number(slot.dataset.minute), end: Number(slot.dataset.minute) };
      };
      slot.onpointerenter = () => {
        if (!drag || drag.date !== slot.dataset.personalSlot) return;
        drag.end = Number(slot.dataset.minute);
        container.querySelectorAll('[data-personal-slot]').forEach(item => item.classList.toggle('range-preview', item.dataset.personalSlot === drag.date && Number(item.dataset.minute) >= Math.min(drag.start, drag.end) && Number(item.dataset.minute) <= Math.max(drag.start, drag.end)));
      };
    });
    const form = container.querySelector('[data-personal-form]');
    if (!form) return;
    form.addEventListener('focusin', event => { focusedField = event.target; });
    form.addEventListener('focusout', event => { if (event.relatedTarget) focusedField = null; });
    const saveDraft = () => {
      const values = Object.fromEntries(new FormData(form).entries());
      const details = { ...data.editor.details };
      for (const [name, value] of Object.entries(values)) if (name.startsWith('detail_')) details[name.slice(7)] = value;
      data.editor = { ...data.editor, ...values, details, remember_contact: form.elements.remember_contact?.checked ?? data.editor.remember_contact }; persist();
      const repeating = form.elements.frequency.value !== 'none';
      form.querySelector('[data-personal-repeat]').hidden = !repeating;
      form.elements.repeat_until.required = repeating;
      form.elements.repeat_until.min = form.elements.selected_date.value;
      form.elements.end_time.setCustomValidity(form.elements.end_time.value <= form.elements.start_time.value ? 'End time must be later than start time.' : '');
      form.querySelector('[data-personal-duration]').textContent = duration(form.elements.start_time.value, form.elements.end_time.value);
    };
    form.addEventListener('input', saveDraft); form.addEventListener('change', saveDraft);
    form.addEventListener('change', event => {
      if (!['category', 'detail_availability', 'detail_contact_method'].includes(event.target.name)) return;
      if (event.target.name === 'detail_contact_method') {
        // A saved number must never become a Messenger or Other contact accidentally.
        data.editor.details.contact_value = '';
        persist();
      }

      form.querySelector('[data-personal-category-fields]').innerHTML = categoryFields(data.editor, data.contacts, profile());
      form.closest('.personal-room-dialog').dataset.category = data.editor.category;
    });
    form.addEventListener('click', event => {
      const button = event.target.closest('[data-personal-saved-contact]');
      if (!button) return;
      form.elements[button.dataset.personalContactField].value = data.contacts[button.dataset.personalSavedContact] || '';
      saveDraft();
    });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (data.busy) return;
      saveDraft(); if (!form.reportValidity()) return;
      const values = data.editor;
      if (values.id && data.rows.find(row => row.id === values.id)?.owner_account_id !== accountId) return;
      const details = personalDetails(values.category, values.details);
      const payload = { title: scheduleTitle(values.category, details, values.category === 'Others' ? values.title?.trim() : '').slice(0, 200), category: values.category, details, selected_date: values.selected_date, start_time: values.start_time, end_time: values.end_time, frequency: values.frequency, repeat_until: values.frequency === 'none' ? null : values.repeat_until, updated_at: new Date().toISOString() };
      if (!values.id) payload.owner_account_id = accountId;
      if (details.communication_mode === 'Both' && !phoneHref(profile().phone) && !messengerHref(profile().messengerUrl)) {
        notice('Add a phone number or Messenger link to your profile before choosing Can be messaged.', true);
        disableForm(); return;
      }
      data.busy = true; disableForm();
      try {
        const path = values.id ? `/personal_schedules?id=eq.${encodeURIComponent(values.id)}&owner_account_id=eq.${encodeURIComponent(accountId)}` : '/personal_schedules';
        const rows = await request(path, { method: values.id ? 'PATCH' : 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(payload) });
        if (!rows?.[0]) throw new Error('Save was not confirmed. Please check database permissions.');
        data.version++; data.rows = [rows[0], ...data.rows.filter(row => row.id !== rows[0].id)];
        data.week = sunday(values.selected_date); data.filter = accountId; data.editor = null; persist(); notice('Personal schedule saved. No approval required.');
        const contactMethod = values.category === 'Free time' ? details.contact_method : '';
        const contactValue = values.category === 'Free time' ? details.contact_value : '';
        if (values.remember_contact !== false && ['Phone', 'Phone number', 'Messenger'].includes(contactMethod)) {
          const key = contactMethod === 'Messenger' ? 'messenger' : 'phone';
          try {
            const saved = await request('/personal_schedule_contacts?on_conflict=owner_account_id', {
              method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
              body: JSON.stringify({ owner_account_id: accountId, [key]: contactValue }),
            });
            if (!saved?.[0]) throw new Error('Contact save was not confirmed.');
            data.contacts = { ...data.contacts, ...saved[0] };
          } catch (error) { notice(`Schedule saved, but the reusable contact could not be saved: ${error.message}`, true); }
        }
      } catch (error) { notice(`Personal schedule could not be saved: ${error.message}. Your draft is saved.`, true); }
      finally { data.busy = false; draw(); }
    });
    disableForm();
  }

  function disableForm() {
    container.querySelectorAll('.personal-room-dialog input, .personal-room-dialog select, .personal-room-dialog button').forEach(field => { field.disabled = data.busy; });
    const error = container.querySelector('[data-personal-form-error]');
    if (error) error.textContent = data.error ? data.notice : '';
  }
  function pointerUp() {
    if (!drag || !isLive()) return;
    const range = drag; drag = null; ignoreClick = true;
    openEditor(range.date, timeString(Math.min(range.start, range.end)), timeString(Math.min(1439, Math.max(range.start, range.end) + 30)));
    window.setTimeout(() => { ignoreClick = false; }, 0);
  }
  function keyDown(event) {
    if (event.key === 'Escape' && !data.busy && (data.editor || data.detail)) { data.editor = null; data.detail = null; persist(); draw(); }
  }
  const controller = { accountId, token,
    move(next) {
      if (container === next) return;
      next.replaceChildren(...container.childNodes);
      container = next;
      drawHeader();
      syncTimeRail();
      if (focusedField?.isConnected && !focusedField.disabled) focusedField.focus({ preventScroll: true });
    },
    dispose() { disposed = true; clearInterval(timer); resizeObserver.disconnect(); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); document.removeEventListener('pointerup', pointerUp); document.removeEventListener('keydown', keyDown); } };
  function visible() { if (!document.hidden) void refresh(); }
  current = controller;
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', visible);
  document.addEventListener('pointerup', pointerUp);
  document.addEventListener('keydown', keyDown);
  draw(); void refresh();
  timer = window.setInterval(refresh, 8000);
}
