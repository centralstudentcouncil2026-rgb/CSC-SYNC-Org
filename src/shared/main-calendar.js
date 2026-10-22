// Both dashboards share strip content and placement; role-specific actions stay in each dashboard.
export function calendarScheduleLabel(event, owner) {
  return `${event.title || 'Untitled schedule'} - ${owner?.organizationName || 'Organization'}`;
}

export function renderMainCalendarStrip(event, row, columnStart, columnEnd, lane, rowCount, owner, { escapeHtml, formatTime, color }) {
  const start = event.occurrenceFullStartsAt || event.startsAt;
  const end = event.occurrenceFullEndsAt || event.endsAt;
  const label = calendarScheduleLabel(event, owner);
  const status = event.hasPendingRevision ? "Change requested" : event.status;
  const details = `${label} | ${formatTime(start)}-${formatTime(end)} | ${status}`;
  return `<button class="month-span-chip ${color}" type="button"
    style="--bar-left: ${((columnStart - 1) / 7) * 100}%; --bar-top: ${((row - 1) / rowCount) * 100}%; --bar-width: ${((columnEnd - columnStart) / 7) * 100}%; --bar-height: ${100 / rowCount}%; --bar-lane: ${lane};"
    data-event-detail="${escapeHtml(event.id)}" data-event-starts-at="${escapeHtml(start)}" data-event-ends-at="${escapeHtml(end)}"
    title="${escapeHtml(details)}" aria-label="${escapeHtml(details)}">${escapeHtml(label)}</button>`;
}
