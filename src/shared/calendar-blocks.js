import { escapeHtml, formatTime } from './ui.js';
import { showNotice } from './notices.js?v=20261022-overlay';

const dateOf = time => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
const dayStart = date => new Date(`${date}T00:00:00+08:00`).getTime();
function fullDayBlocked(blocks, date) {
  let cursor = dayStart(date); const end = cursor + 86400000;
  const ranges = blocks.map(block => [Date.parse(block.starts_at), Date.parse(block.ends_at)]).filter(([a,b]) => a < end && b > cursor).sort((a,b) => a[0]-b[0]);
  for (const [a,b] of ranges) { if (a > cursor) return false; cursor = Math.max(cursor,b); }
  return cursor >= end;
}
export function calendarBlockOverlap(blocks, accountId, first, last = first, startTime = '00:00', endTime) {
  const start = new Date(`${first}T${startTime}:00+08:00`).getTime();
  const end = endTime ? new Date(`${last}T${endTime}:00+08:00`).getTime() : dayStart(last) + 86400000;
  return blocks.filter(block => block.created_by !== accountId && Date.parse(block.starts_at) < end && Date.parse(block.ends_at) > start);
}
function availableTime(blocks, accountId, date) {
  const start = dayStart(date), end = start + 86400000;
  const ranges = calendarBlockOverlap(blocks, accountId, date).map(block => [Math.max(start, Date.parse(block.starts_at)), Math.min(end, Date.parse(block.ends_at))]).sort((a,b) => a[0]-b[0]);
  const gaps = []; let cursor = start;
  for (const [a,b] of ranges) { if (a > cursor) gaps.push([cursor,a]); cursor = Math.max(cursor,b); }
  if (cursor < end) gaps.push([cursor,end]);
  for (const preferred of [start+8*3600000,start]) for (const [a,b] of gaps) {
    const from = Math.ceil(Math.max(a,preferred)/60000)*60000, to = Math.floor(Math.min(b,from+3600000)/60000)*60000;
    if (to-from < 60000) continue;
    const time = value => new Date(value+8*3600000).toISOString().slice(11,16);
    return { startDate: dateOf(from), endDate: dateOf(to), startTime: time(from), endTime: time(to) };
  }
  return null;
}
export function requestCalendarCreation(blocks, { accountId, first, last = first, onOpen }) {
  const conflicts = calendarBlockOverlap(blocks, accountId, first, last);
  if (!conflicts.length) { onOpen({ startDate: first, endDate: last }); return; }
  const slot = first === last ? availableTime(blocks, accountId, first) : null;
  let wholeDay = false;
  for (let day = dayStart(first); day <= dayStart(last); day += 86400000) if (fullDayBlocked(conflicts, dateOf(day))) { wholeDay = true; break; }
  showNotice({ title: wholeDay ? 'Date blocked' : 'Time blocked',
    message: `${wholeDay ? 'This day is blocked by the admin.' : 'This hour is blocked by the admin.'}\n${conflicts.map(block => `${dateOf(block.starts_at)} · ${formatTime(block.starts_at)} – ${dateOf(block.ends_at)} · ${formatTime(block.ends_at)}\n${block.reason}`).join('\n')}`,
    actions: slot ? [{ label: `Use available time: ${slot.startTime}–${slot.endTime}`, run: () => onOpen(slot) }] : [],
  });
}
export function calendarBlockStrips(blocks, first, last) {
  const rows = [];
  for (let day = dayStart(first); day <= dayStart(last); day += 86400000) {
    const date = dateOf(day), next = day + 86400000;
    if (fullDayBlocked(blocks, date)) continue;
    for (const block of blocks) {
      const start = Math.max(day, Date.parse(block.starts_at)), end = Math.min(next, Date.parse(block.ends_at));
      if (start >= end || start === day && end === next) continue;
      const local = value => new Date(value+8*3600000).toISOString().replace('Z','+08:00');
      rows.push({ id: `block-${block.id}-${date}`, isCalendarBlock: true, blockId: block.id, startsAt: local(start), endsAt: local(Math.min(end,next-1)), title: `Blocked · ${formatTime(local(start))}–${formatTime(local(end))}`, reason: block.reason });
    }
  }
  return rows;
}
export function renderCalendarBlockStrip(event, row, start, end, lane) {
  return `<button class="month-span-chip calendar-block-strip" type="button" data-calendar-block="${escapeHtml(event.blockId)}" data-block-date="${event.startsAt.slice(0,10)}" style="--bar-left:${(start-1)*100/7}%;--bar-width:${(end-start)*100/7}%;--bar-lane:${lane}" title="${escapeHtml(`${event.title} · ${event.reason}`)}"><strong>Blocked</strong> · ${escapeHtml(`${formatTime(event.startsAt)}–${formatTime(event.endsAt)}`)}</button>`;
}

export function calendarScheduleValues(values, account) {
  return {
    event: { title: values.title.trim(), category: values.category, other_category_detail: values.category === 'Others' ? values.otherCategoryDetail || 'Other schedule' : '', venue: values.venue.trim(), visibility: values.visibility, public_description: values.publicDescription.trim(), purpose: values.purpose.trim(), expected_attendees: Number(values.expectedAttendees || 1), contact_person_snapshot: account.officerName || account.organizationName || '', contact_number_snapshot: account.phone || '' },
    series: { frequency: values.frequency, local_start_template: `${values.startDate}T${values.startTime}:00`, local_end_template: `${values.endDate}T${values.endTime}:00`, repeat_until: values.frequency === 'none' ? null : values.repeatUntil || null },
    occurrence: { starts_at: `${values.startDate}T${values.startTime}:00+08:00`, ends_at: `${values.endDate}T${values.endTime}:00+08:00` },
  };
}
export async function saveCalendarSchedule(request, values, account, original) {
  try {
    const saved = await request('/rpc/save_calendar_schedule', { method: 'POST', body: JSON.stringify({ p_values: calendarScheduleValues(values, account), p_id: original?.id || null, p_version: original?.version || null }) });
    if (!saved?.event?.id || !saved.series?.id || !saved.occurrence?.id) throw new Error('Schedule saving was not confirmed.');
    return saved;
  } catch (error) {
    if (/save_calendar_schedule|schema cache|PGRST202/.test(error.message)) throw new Error('Apply database migration 042_calendar_time_blocks.sql before saving schedules. Your draft is preserved.');
    throw error;
  }
}
export function calendarBlockValues(values, accountId) {
  const date = values.startDate, last = values.duration === 'multiple' ? values.endDate : date;
  const allDay = values.blockAllDay === 'on';
  const next = new Date(`${last}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const starts_at = `${date}T${allDay ? '00:00' : values.startTime}:00+08:00`;
  const ends_at = allDay ? `${next.toISOString().slice(0, 10)}T00:00:00+08:00` : `${last}T${values.endTime}:00+08:00`;
  if (!values.blockReason?.trim() || !(new Date(ends_at) > new Date(starts_at))) throw new Error('Enter a reason and a valid blocked date/time range.');
  return { created_by: accountId, starts_at, ends_at, reason: values.blockReason.trim() };
}
export function bindCalendarBlocks(root, { blocks = [], accountId, request, admin = false, onChange }) {
  const dateOf = time => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
  const matches = (block, first, last) => new Date(block.starts_at).getTime() < new Date(`${last}T23:59:59.999+08:00`).getTime() && new Date(block.ends_at).getTime() > new Date(`${first}T00:00:00+08:00`).getTime();
  root.querySelectorAll('[data-date-cell], [data-calendar-date], [data-block-calendar-date]').forEach(cell => {
    const date = cell.dataset.dateCell || cell.dataset.calendarDate || cell.dataset.blockCalendarDate;
    const relevant = blocks.filter(block => matches(block, date, date));
    if (!date || !relevant.length) return;
    const full = fullDayBlocked(relevant, date);
    cell.classList.toggle('has-calendar-block', full);
    if (full && !cell.dataset.blockCalendarDate) { const badge = document.createElement('span'); badge.className = 'calendar-block-marker'; badge.textContent = 'Blocked'; badge.title = relevant.map(block => block.reason).join('; '); cell.append(badge); }
  });
  root.querySelectorAll('[data-calendar-block]').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    const block = blocks.find(item => item.id === button.dataset.calendarBlock);
    if (block) showNotice({ title: 'Time blocked', message: `This hour is blocked by the admin.\n${formatTime(block.starts_at)} – ${formatTime(block.ends_at)}\n${block.reason}` });
  }));
  const form = root.querySelector('[data-admin-event-form], [data-org-form="event"]');
  if (!form) return;
  const list = document.createElement('section'); list.className = 'calendar-block-list'; list.setAttribute('aria-label', 'Blocked calendar times');
  form.insertBefore(list, form.querySelector('button[type="submit"]'));
  const kind = form.elements.entryType;
  const heading = root.querySelector('.modal-card .modal-topline > strong, .modal-card .modal-topline > span');
  const headingText = heading?.textContent;
  const submit = form.querySelector('button[type="submit"]'), originalText = submit.textContent;
  const sync = () => {
    const blockMode = kind?.value === 'block';
    if (kind) {
      if (heading) heading.textContent = blockMode ? 'Block Date / Time' : headingText;
      for (const name of ['title','category','venue','frequency','repeatUntil','expectedAttendees','visibility','publicDescription','purpose','otherCategoryDetail']) {
        const input = form.elements[name]; if (!input) continue;
        input.disabled = blockMode;
        const label = input.closest('label');
        if (label) label.hidden = blockMode || name === 'repeatUntil' && form.elements.frequency.value === 'none';
      }
      form.querySelector('.schedule-textarea-grid')?.toggleAttribute('hidden', blockMode);
      for (const name of ['blockReason','blockAllDay']) { const input = form.elements[name]; input.closest('label').hidden = !blockMode; input.disabled = !blockMode; }
      form.elements.blockReason.required = blockMode;
      const allDay = blockMode && form.elements.blockAllDay.checked;
      for (const name of ['startTime','endTime']) { const input = form.elements[name]; input.disabled = allDay; input.closest('label').hidden = allDay; }
      form.querySelector('[data-block-help]').hidden = !blockMode;
      submit.textContent = blockMode ? 'Block Date / Time' : originalText;
    }
    const first = form.elements.startDate?.value, last = form.elements.duration?.value === 'multiple' ? form.elements.endDate?.value || first : first;
    list.innerHTML = blocks.filter(block => first && matches(block, first, last)).map(block => `<article><div><strong>${escapeHtml(block.reason)}</strong><p>${escapeHtml(dateOf(block.starts_at))} ${formatTime(block.starts_at)} – ${escapeHtml(dateOf(block.ends_at))} ${formatTime(block.ends_at)}${block.created_by === accountId ? ' · Your block: you may create schedules here.' : ''}</p></div>${admin && block.created_by === accountId ? `<button class="white-pill" type="button" data-remove-calendar-block="${escapeHtml(block.id)}">Remove Block</button>` : ''}</article>`).join('');
    list.hidden = !list.children.length;
    list.querySelectorAll('[data-remove-calendar-block]').forEach(button => { button.onclick = async () => {
      if (!window.confirm('Remove this date/time block? Other users will be able to create schedules here.')) return;
      button.disabled = true;
      try { const rows = await request(`/calendar_blocks?id=eq.${encodeURIComponent(button.dataset.removeCalendarBlock)}&created_by=eq.${encodeURIComponent(accountId)}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } }); if (!rows?.length) throw new Error('The block was not removed.'); await onChange(); }
      catch (error) { button.disabled = false; const message = document.createElement('p'); message.setAttribute('role','alert'); message.textContent = error.message; list.append(message); }
    }; });
  };
  form.addEventListener('change', sync);
  form.addEventListener('submit', event => {
    if (kind?.value === 'block') return;
    const values = Object.fromEntries(new FormData(form));
    const last = values.duration === 'multiple' ? values.endDate : values.startDate;
    if (!values.startDate || !last || !values.startTime || !values.endTime) return;
    const conflicts = calendarBlockOverlap(blocks, accountId, values.startDate, last, values.startTime, values.endTime);
    if (!conflicts.length) return;
    event.preventDefault(); event.stopImmediatePropagation();
    showNotice({ title: 'Schedule blocked', message: `This hour is blocked by the admin. Choose a different date or time.\n${conflicts.map(block => block.reason).join('\n')}` });
  }, true);
  sync();
}
