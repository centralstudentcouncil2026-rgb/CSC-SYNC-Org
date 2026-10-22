import { escapeHtml, formatTime } from './ui.js';

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
  root.querySelectorAll('[data-date-cell], [data-calendar-date]').forEach(cell => {
    const date = cell.dataset.dateCell || cell.dataset.calendarDate;
    const relevant = blocks.filter(block => matches(block, date, date));
    if (!date || !relevant.length) return;
    cell.classList.add('has-calendar-block');
    const badge = document.createElement('span'); badge.className = 'calendar-block-marker'; badge.textContent = 'Blocked'; badge.title = relevant.map(block => block.reason).join('; '); cell.append(badge);
  });
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
  sync();
}
