import { createBookingRefresh } from "../shared/booking-refresh.js";
import { accountById, currentAccount, getState, setState } from "./store.js";
import { mapBooking } from "./database.js?v=20261022-owner-contact";
import { supabaseRequest } from "./supabase.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export function visibleBookings() {
  return getState().bookings;
}

export function bookingOwner(booking) {
  return accountById(booking.ownerAccountId);
}

function dateFromIso(value) {
  return new Date(`${value}T00:00:00Z`);
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return isoDate(date);
}

function daysBetween(first, second) {
  return Math.round((dateFromIso(second) - dateFromIso(first)) / DAY_MS);
}

function endOfMonth(year, month) {
  return new Date(Date.UTC(Number(year), Number(month), 0)).toISOString().slice(0, 10);
}

function repeatUntilDate(booking) {
  if (booking.repeatUntil) return booking.repeatUntil;
  if (booking.repeatUntilYear && booking.repeatUntilMonth) return endOfMonth(booking.repeatUntilYear, booking.repeatUntilMonth);
  return booking.selectedDate;
}

function sameOrBefore(first, second) {
  return first <= second;
}

function sameOrAfter(first, second) {
  return first >= second;
}

function occursOn(booking, date) {
  const startDate = booking.selectedDate || booking.startsAt.slice(0, 10);
  if (date < startDate) return false;
  if (booking.frequency === "none") return date === startDate;
  if (!sameOrBefore(date, repeatUntilDate(booking))) return false;

  const diff = daysBetween(startDate, date);
  if (booking.frequency === "weekly") return diff % 7 === 0;
  if (booking.frequency === "monthly") return date.slice(8, 10) === startDate.slice(8, 10);
  if (booking.frequency === "yearly") return date.slice(5, 10) === startDate.slice(5, 10);
  return date === startDate;
}

function occurrenceDateTime(booking, date, field) {
  const localTime = field === "startsAt" ? booking.startTime : booking.endTime;
  return `${date}T${(localTime || booking[field].slice(11, 19))}+08:00`;
}

export function bookingOccurrencesBetween(startDate, endDate, sourceBookings = getState().bookings) {
  const occurrences = [];
  sourceBookings.forEach((booking) => {
    if (booking.status === "cancelled") return;
    for (let date = startDate; sameOrBefore(date, endDate); date = addDays(date, 1)) {
      if (!occursOn(booking, date)) continue;
      occurrences.push({
        ...booking,
        occurrenceDate: date,
        occurrenceStartsAt: occurrenceDateTime(booking, date, "startsAt"),
        occurrenceEndsAt: occurrenceDateTime(booking, date, "endsAt"),
      });
    }
  });
  return occurrences;
}

export function hasBookingConflict(candidate, ignoredBookingId = "") {
  const candidateDates = bookingOccurrencesBetween(candidate.selectedDate, repeatUntilDate(candidate), [candidate]);

  return getState().bookings.some((booking) => {
    if (booking.id === ignoredBookingId) return false;
    if (booking.status !== "approved") return false;
    const overlapStart = candidate.selectedDate > (booking.selectedDate || booking.startsAt.slice(0, 10)) ? candidate.selectedDate : booking.selectedDate || booking.startsAt.slice(0, 10);
    const overlapEnd = sameOrAfter(repeatUntilDate(candidate), repeatUntilDate(booking)) ? repeatUntilDate(booking) : repeatUntilDate(candidate);
    if (overlapEnd < overlapStart) return false;

    const bookingDates = bookingOccurrencesBetween(overlapStart, overlapEnd, [booking]);
    return candidateDates.some((candidateOccurrence) => bookingDates.some((bookingOccurrence) => {
      if (candidateOccurrence.occurrenceDate !== bookingOccurrence.occurrenceDate) return false;
      const candidateStart = new Date(candidateOccurrence.occurrenceStartsAt).getTime();
      const candidateEnd = new Date(candidateOccurrence.occurrenceEndsAt).getTime();
      const start = new Date(bookingOccurrence.occurrenceStartsAt).getTime();
      const end = new Date(bookingOccurrence.occurrenceEndsAt).getTime();
      return candidateStart < end && candidateEnd > start;
    }));
  });
}

async function conferenceRoomId() {
  const rows = await supabaseRequest(`/rooms?select=id&name=eq.${encodeURIComponent("CSC Conference Room")}&limit=1`, {}, getState().session.accessToken);
  if (!rows?.[0]?.id) throw new Error("Conference room record was not found. Please check the rooms table.");
  return rows[0].id;
}

export async function createBooking(formData) {
  const account = currentAccount();
  const roomId = await conferenceRoomId();
  const startsAt = `${formData.selectedDate}T${formData.startTime}:00+08:00`;
  const endsAt = `${formData.selectedDate}T${formData.endTime}:00+08:00`;
  const repeatUntil = formData.frequency === "none" ? "" : formData.repeatUntil || "";
  const [repeatUntilYear = "", repeatUntilMonth = ""] = repeatUntil.split("-");
  const candidate = {
    id: `book-${crypto.randomUUID().slice(0, 8)}`,
    ownerAccountId: account.id,
    selectedDate: formData.selectedDate,
    startsAt,
    endsAt,
    startTime: `${formData.startTime}:00`,
    endTime: `${formData.endTime}:00`,
    frequency: formData.frequency,
    repeatUntil,
    repeatUntilMonth,
    repeatUntilYear,
    status: "pending",
  };

  if (hasBookingConflict(candidate)) {
    return { ok: false, message: "This booking overlaps an approved reservation." };
  }
  const rows = await supabaseRequest("/room_bookings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      room_id: roomId,
      owner_account_id: account.id,
      creator_account_id: account.id,
      selected_date: formData.selectedDate,
      starts_at: startsAt,
      ends_at: endsAt,
      frequency: formData.frequency,
      repeat_until_month: repeatUntilMonth ? Number(repeatUntilMonth) : null,
      repeat_until_year: repeatUntilYear ? Number(repeatUntilYear) : null,
      repeat_until_resolved: repeatUntil || null,
      status: "pending",
    }),
  }, getState().session.accessToken);
  if (!rows?.[0]) throw new Error("The booking was not saved. Please try again.");
  const booking = mapBooking(rows[0]);

  setState((state) => ({
    ...state,
    bookings: [booking, ...state.bookings],
  }));

  return { ok: true, booking };
}

export async function updateBooking(bookingId, formData) {
  const account = currentAccount();
  const existing = getState().bookings.find((booking) => booking.id === bookingId);
  if (!existing) throw new Error("Conference room booking was not found. Please reload and try again.");
  if (existing.ownerAccountId !== account.id) throw new Error("You can only edit your own conference room booking.");

  const startsAt = `${formData.selectedDate}T${formData.startTime}:00+08:00`;
  const endsAt = `${formData.selectedDate}T${formData.endTime}:00+08:00`;
  const repeatUntil = formData.frequency === "none" ? "" : formData.repeatUntil || "";
  const [repeatUntilYear = "", repeatUntilMonth = ""] = repeatUntil.split("-");
  const candidate = {
    ...existing,
    selectedDate: formData.selectedDate,
    startsAt,
    endsAt,
    startTime: `${formData.startTime}:00`,
    endTime: `${formData.endTime}:00`,
    frequency: formData.frequency,
    repeatUntil,
    repeatUntilMonth,
    repeatUntilYear,
    status: "pending",
  };

  if (hasBookingConflict(candidate, bookingId)) {
    return { ok: false, message: "This booking overlaps an approved reservation." };
  }

  const revision = await supabaseRequest("/rpc/request_schedule_change", {
    method: "POST",
    body: JSON.stringify({ p_kind: "booking", p_id: bookingId, p_request_type: "edit", p_values: {
      selected_date: formData.selectedDate, starts_at: startsAt, ends_at: endsAt,
      frequency: formData.frequency, repeat_until_month: repeatUntilMonth ? Number(repeatUntilMonth) : null,
      repeat_until_year: repeatUntilYear ? Number(repeatUntilYear) : null, repeat_until_resolved: repeatUntil || null,
    } }),
  }, getState().session.accessToken);
  const updated = { ...existing, pendingRevision: revision };
  setState(state => ({ ...state, bookings: state.bookings.map(booking => booking.id === bookingId ? updated : booking) }));
  return { ok: true, booking: updated };
}

export async function deleteBooking(bookingId) {
  const existing = getState().bookings.find(booking => booking.id === bookingId);
  if (!existing || existing.ownerAccountId !== currentAccount().id) throw new Error("You can only request deletion of your own booking.");
  const revision = await supabaseRequest("/rpc/request_schedule_change", {
    method: "POST", body: JSON.stringify({ p_kind: "booking", p_id: bookingId, p_request_type: "cancellation", p_values: {} }),
  }, getState().session.accessToken);
  setState(state => ({ ...state, bookings: state.bookings.map(booking => booking.id === bookingId ? { ...booking, pendingRevision: revision } : booking) }));
  return revision;
}

export async function approveBooking(bookingId) {
  const booking = getState().bookings.find(item => item.id === bookingId);
  if (booking?.pendingRevision) {
    await supabaseRequest("/rpc/review_schedule_change", {
      method: "POST", body: JSON.stringify({ p_kind: "booking", p_revision_id: booking.pendingRevision.id, p_approve: true }),
    }, getState().session.accessToken);
    await refreshBookings();
    return getState().bookings.find(item => item.id === bookingId);
  }
  const rows = await supabaseRequest(`/room_bookings?id=eq.${encodeURIComponent(bookingId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "approved" }),
  }, getState().session.accessToken);
  if (!rows?.[0]) throw new Error("Conference room booking was not approved. Please check the Supabase table policies.");
  const updated = mapBooking(rows[0]);
  setState((state) => ({
    ...state,
    bookings: state.bookings.map((booking) => booking.id === bookingId ? updated : booking),
  }));
  return updated;
}

export const refreshBookings = createBookingRefresh({
  load: async () => (await supabaseRequest("/room_bookings?select=*,booking_revisions(*)&order=starts_at.asc", {}, getState().session.accessToken)).map(mapBooking),
  sessionKey: () => {
    const { session } = getState();
    return session.authenticated && session.accessToken ? `${session.accountId}:${session.accessToken}` : "";
  },
  bookings: () => getState().bookings,
  apply: (bookings) => setState((state) => ({ ...state, bookings })),
  status: ({ loading, error }) => setState((state) => ({ ...state, ui: { ...state.ui, bookingsLoading: loading, bookingsLoadError: error } })),
});
