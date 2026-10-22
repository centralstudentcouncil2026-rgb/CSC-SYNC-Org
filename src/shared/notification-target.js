// Resolve from the database so notifications never open a stale approval card.
export async function loadNotificationTarget(notification, request) {
  if (!['event', 'booking'].includes(notification?.targetType)) throw new Error('This notification has no calendar link.');
  const id = encodeURIComponent(notification.targetId);
  if (notification.targetType === 'booking') {
    const rows = await request(`/room_bookings?select=*,booking_revisions(*)&id=eq.${id}`);
    if (!rows?.[0]) throw new Error('This booking is no longer available.');
    return { kind: 'booking', row: rows[0], date: rows[0].selected_date };
  }
  const [rows, occurrences, series, revisions] = await Promise.all([
    request(`/events?select=*&id=eq.${id}`),
    request(`/event_occurrences?select=*&event_id=eq.${id}&order=starts_at.asc&limit=1`),
    request(`/event_series?select=*&event_id=eq.${id}&limit=1`),
    request(`/event_revisions?select=*&event_id=eq.${id}&status=eq.pending&order=created_at.desc&limit=1`),
  ]);
  if (!rows?.[0] || !occurrences?.[0]) throw new Error('This schedule is no longer available.');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(occurrences[0].starts_at));
  const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { kind: 'event', row: rows[0], occurrence: occurrences[0], series: series[0], revision: revisions[0], date: `${date.year}-${date.month}-${date.day}` };
}

// Compare the proposed payload with the saved schedule, not a selected recurring occurrence.
export function scheduleRequestChanges(revision, current = {}) {
  const proposed = revision?.proposedValues || revision?.proposed_values || {};
  const previous = revision?.previousValues || revision?.previous_values || {};
  const isEvent = Boolean(proposed.event);
  const fields = isEvent ? [
    ['Title', 'event', 'title', ['title']],
    ['Category', 'event', 'category', ['category']],
    ['Other category details', 'event', 'other_category_detail', ['otherCategoryDetail']],
    ['Venue', 'event', 'venue', ['venue']],
    ['Visibility', 'event', 'visibility', ['visibility']],
    ['Short public description', 'event', 'public_description', ['publicDescription']],
    ['Purpose', 'event', 'purpose', ['purpose']],
    ['Expected attendees', 'event', 'expected_attendees', ['expectedAttendees'], 'number'],
    ['Start date and time', 'occurrence', 'starts_at', ['startsAt'], 'datetime'],
    ['End date and time', 'occurrence', 'ends_at', ['endsAt'], 'datetime'],
    ['Frequency', 'series', 'frequency', ['frequency']],
    ['Repeat until', 'series', 'repeat_until', ['repeatUntil'], 'date'],
  ] : [
    ['Selected date', '', 'selected_date', ['selectedDate'], 'date'],
    ['Start date and time', '', 'starts_at', ['startsAt'], 'datetime'],
    ['End date and time', '', 'ends_at', ['endsAt'], 'datetime'],
    ['Frequency', '', 'frequency', ['frequency']],
    ['Repeat until', '', 'repeat_until_resolved', ['repeatUntil'], 'date'],
  ];
  const normalize = (value, type) => {
    if (value === undefined || value === null || value === '') return '';
    if (type === 'datetime' && !Number.isNaN(Date.parse(value))) return Date.parse(value);
    if (type === 'number' && Number.isFinite(Number(value))) return Number(value);
    return String(value);
  };
  return fields.flatMap(([label, section, key, aliases, type]) => {
    const values = section ? proposed[section] : proposed;
    if (!values || !Object.hasOwn(values, key)) return [];
    const currentKey = [...aliases, key].find(name => Object.hasOwn(current, name));
    const oldValues = section ? previous[section] || previous : previous;
    const before = currentKey ? current[currentKey] : oldValues?.[key];
    const after = values[key];
    return normalize(before, type) === normalize(after, type) ? [] : [{ label, before, after, type }];
  });
}

export function changeRequestSummary(revision, escape, current = {}) {
  if (!revision) return '';
  const requestType = revision.requestType || revision.request_type;
  if (requestType === 'cancellation') return '<article class="wide schedule-change-review"><h3>Deletion requested</h3><p>The schedule remains active until this request is approved.</p></article>';
  const changes = scheduleRequestChanges(revision, current);
  const display = (value, type) => {
    if (value === undefined || value === null || value === '') return '<em>Not set</em>';
    let text = String(value);
    if (type === 'datetime' && !Number.isNaN(Date.parse(value))) {
      text = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    } else if (type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
      text = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium' }).format(new Date(`${text}T00:00:00+08:00`));
    } else if (text === 'none') text = 'Does not repeat';
    else if (['daily', 'weekly', 'monthly', 'yearly', 'internal', 'public'].includes(text)) text = text[0].toUpperCase() + text.slice(1);
    return escape(text);
  };
  return `<article class="wide schedule-change-review" aria-label="Requested schedule changes">
    <header><h3>Requested changes</h3><b>${changes.length} ${changes.length === 1 ? 'field' : 'fields'} changed</b></header>
    <p>Compare the saved details with the requested edits. Changes take effect only after approval. Times are shown in Philippine time.</p>
    ${changes.length ? `<div class="schedule-change-list">${changes.map(change => `<section class="schedule-change-field" data-changed-field="${escape(change.label)}">
      <h4>${escape(change.label)}</h4>
      <div class="schedule-change-values">
        <div class="schedule-change-before"><span>Current</span><p>${display(change.before, change.type)}</p></div>
        <div class="schedule-change-after"><span>Requested</span><p>${display(change.after, change.type)}</p></div>
      </div>
    </section>`).join('')}</div>` : '<p>No changes to the saved schedule details were found in this request.</p>'}
  </article>`;
}
