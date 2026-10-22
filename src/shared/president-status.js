import { messengerHref } from "./contact-links.js?v=20261022-messenger";
import { personalOccurrences } from './personal-room.js?v=20261022-viewer-contacts';
import { captureSidePanelScroll } from './form-view.js?v=20261021-panel-scroll';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const seconds = time => { const [h = 0, m = 0, s = 0] = String(time).split(':').map(Number); return h * 3600 + m * 60 + s; };
const timeLabel = time => new Date(`2000-01-01T${time.slice(0, 8)}+08:00`).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });

function contactFor(mode, value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (mode === 'Phone' || mode === 'Phone number') {
    const number = text.replace(/[\s().-]/g, '');
    return /^\+?\d{6,15}$/.test(number) ? { mode: 'Phone', value: text, href: `tel:${number}` } : null;
  }
  if (mode === 'Messenger') {
    let href = '';
    try {
      const url = new URL(text);
      if (url.protocol === 'https:' && /(^|\.)(m\.me|messenger\.com|facebook\.com)$/.test(url.hostname)) href = url.href;
    } catch {
      if (/^@?[a-zA-Z0-9._-]+$/.test(text)) href = `https://m.me/${encodeURIComponent(text.replace(/^@/, ''))}`;
    }
    return { mode, value: text, href };
  }
  return { mode: 'Other', value: text, href: '' };
}

function scheduleAvailability(item, phone, messenger) {
  if (item.category === 'On duty') return { item, available: true, contact: contactFor('Phone', phone) };
  const details = item.details || {};
  if (['Study time', 'Personal Time'].includes(item.category)) {
    const available = details.availability === 'available';
    if (available && details.communication_mode === 'Both') return { item, available, contact: contactFor('Phone', phone) || (messenger ? contactFor('Messenger', messenger) : null) };
    return { item, available, contact: available && ['Phone', 'Messenger'].includes(details.communication_mode) ? contactFor(details.communication_mode, details.communication_contact) : null };
  }
  if (item.category === 'Free time') return { item, available: true, contact: contactFor(details.contact_method, details.contact_value) };
  return { item, available: false, contact: null };
}

// Compute against the actual Philippine clock, independently of the viewed calendar week.
export function officialAvailability(payload, now = new Date(), office = 'CSC President') {
  if (payload?.state !== 'ready') return { state: 'unknown', label: 'Availability unavailable', note: payload?.state === 'ambiguous' ? `More than one active admin is named ${office}. Identify one official in the profiles.` : `Set the Council Name or Officer to ${office} in the admin profiles.` };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(p => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const clock = seconds(`${parts.hour}:${parts.minute}:${parts.second}`);
  const today = personalOccurrences(payload.schedules || [], date, date);
  const active = today.filter(item => seconds(item.start_time) <= clock && clock < seconds(item.end_time))
    .map(item => scheduleAvailability(item, (payload.official || payload.president)?.phone, (payload.official || payload.president)?.messenger_url)).sort((a, b) => Number(a.available) - Number(b.available) || Number(Boolean(b.contact)) - Number(Boolean(a.contact)) || a.item.start_time.localeCompare(b.item.start_time) || a.item.id.localeCompare(b.item.id));
  if (!active.length) {
    const next = today.filter(item => seconds(item.start_time) > clock).sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
    return { state: 'available', label: 'Available', note: next ? `No schedule right now. Next schedule starts at ${timeLabel(next.start_time)}.` : 'No schedule right now.', contact: contactFor('Phone', (payload.official || payload.president)?.phone) };
  }
  const selected = active[0];
  const dnd = ['Study time', 'Personal Time'].includes(selected.item.category) && !selected.available;
  return { scheduleId: selected.item.id, profileContacts: selected.available && selected.item.details?.communication_mode === 'Both', state: selected.available ? 'available' : 'busy', label: `${selected.item.category} · ${selected.available ? 'Can be contacted' : dnd ? 'Do not disturb' : 'Busy'}`,
    note: `${selected.item.title && selected.item.title !== selected.item.category ? `${selected.item.title}. ` : ''}Scheduled until ${timeLabel(selected.item.end_time)}.${selected.available ? '' : ' Please contact during available time.'}${active.length > 1 ? ' Multiple schedules are active; the most restrictive availability applies.' : ''}`,
    contact: selected.contact };
}

export const presidentAvailability = (payload, now) => officialAvailability(payload, now);
const controllers = new Map();
const offices = { president: 'CSC President', adviser: 'CSC Adviser' };
export const mountPresidentStatus = (container, options) => mountOfficialStatus(container, options, 'president');
export const mountAdviserStatus = (container, options) => mountOfficialStatus(container, options, 'adviser');
function mountOfficialStatus(container, { accountId, token, request }, office) {
  const name = offices[office];
  const current = controllers.get(office);
  if (!container || !accountId || !token) { current?.dispose(); controllers.delete(office); return; }
  if (current?.accountId === accountId && current?.token === token) { current.move(container); return; }
  current?.dispose();
  let node = container, payload, error = '', rendered = '', pending = false, disposed = false;
  function draw() {
    if (disposed || !node.isConnected) return;
    const status = error ? { state: 'unknown', label: 'Availability unavailable', note: error } : !payload ? { state: 'unknown', label: 'Checking schedule' } : officialAvailability(payload, new Date(), name);
    const contact = status.contact;
    const html = `<h2>${escape(name)}</h2><div class="availability" data-state="${status.state}"${error ? ` title="${escape(error)}"` : ''}><span></span>${escape(status.label)}</div>${status.state === 'available' && contact?.href ? `<a class="blue-pill call-button" href="${escape(contact.href)}" ${contact.mode === 'Messenger' ? 'target="_blank" rel="noopener noreferrer"' : ''}>${contact.mode === 'Phone' ? 'Call' : 'Message'} ${escape(name)}</a>` : ''}${error ? '<button class="white-pill" type="button" data-president-retry>Retry</button>' : ''}`;
    if (rendered === html) return;
    rendered = html;
    const restore = captureSidePanelScroll(node.closest('#app'));
    node.innerHTML = html;
    node.querySelector('[data-president-retry]')?.addEventListener('click', refresh);
    restore();
  }
  async function refresh() {
    if (pending || disposed) return;
    pending = true;
    try {
      const next = await request('/rpc/official_personal_room', { method: 'POST', body: JSON.stringify({ p_office: office }) });
      const status = officialAvailability(next, new Date(), name);
      if (status.profileContacts) {
        const contact = await request('/rpc/personal_schedule_contact', { method: 'POST', body: JSON.stringify({ p_id: status.scheduleId }) });
        next.official = { ...next.official, phone: contact?.schedule_id === status.scheduleId ? contact.phone || '' : '', messenger_url: contact?.schedule_id === status.scheduleId ? messengerHref(contact.messenger_url) : '' };
      }
      if (!disposed) { payload = next; error = ''; }
    } catch (failure) {
      if (!disposed) error = /official_personal_room|schema cache|PGRST202/.test(failure.message) ? 'Official status needs database setup. Apply 032_adviser_status_on_duty.sql.' : `${name}'s schedule could not be refreshed. Please retry.`;
    } finally { pending = false; draw(); }
  }
  const visible = () => { if (!document.hidden) void refresh(); };
  const timer = setInterval(refresh, 8000);
  const clockTimer = setInterval(draw, 1000);
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', visible);
  controllers.set(office, { accountId, token, move(next) { if (node !== next) { node = next; rendered = ''; } draw(); }, dispose() { disposed = true; clearInterval(timer); clearInterval(clockTimer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); } });
  draw(); void refresh();
}
