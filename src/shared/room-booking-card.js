// Both Conference Room calendars use the same card content and time placement.
export const CONFERENCE_SLOT_COUNT = 30;

export function renderRoomBookingCard(booking, days, owner, { escape, formatTime }) {
  const date = booking.occurrenceDate || booking.selectedDate;
  const dayIndex = days.findIndex(day => day.value === date);
  if (dayIndex < 0 || booking.status === 'cancelled') return '';
  const startsAt = booking.occurrenceStartsAt || booking.startsAt;
  const endsAt = booking.occurrenceEndsAt || booking.endsAt;
  const minute = value => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return Number(byType.hour) * 60 + Number(byType.minute);
  };
  const start = Math.max(420, minute(startsAt));
  const end = Math.min(1320, minute(endsAt));
  if (end <= start) return '';
  const startRow = Math.floor((start - 420) / 30) + 1;
  const endRow = Math.min(CONFERENCE_SLOT_COUNT + 1, Math.max(startRow + 1, Math.ceil((end - 420) / 30) + 1));
  const status = booking.status || 'pending';
  const statusClass = status === 'rejected' ? 'rejected' : ['administrator', 'admin'].includes(owner?.role) ? 'admin-booking' : status === 'approved' ? 'approved' : 'pending';
  const organization = owner?.organizationName || 'Unknown organization';
  const times = `${formatTime(startsAt)}-${formatTime(endsAt)}`;
  const title = `${organization} · ${date} · ${times} · ${status}`;
  return `<button class="room-booking-chip ${statusClass}" type="button" style="grid-column:${dayIndex + 2};grid-row:${startRow}/${endRow};" ${endRow - startRow === 1 ? 'data-room-compact' : ''} data-booking-detail="${escape(booking.id)}" data-booking-starts-at="${escape(startsAt)}" data-booking-ends-at="${escape(endsAt)}" title="${escape(title)}" aria-label="${escape(title)}">
    <strong>${escape(times)}</strong>
    <small>${escape(organization)} · ${escape(status)}</small>
  </button>`;
}
