import { matchesCalendarOrganization } from "../shared/calendar-organization-filter.js";
import { requireValidSchedule } from "../shared/schedule-controls.js";
import { accountById, currentAccount, getState, setState } from "./store.js";
import { mapEvent, mapEventRevision, loadDatabaseState } from "./database.js?v=20261022-owner-contact";
import { supabaseRequest } from "./supabase.js";

export const eventStatuses = ["draft", "pending", "changes_requested", "approved", "rejected", "cancelled"];
export const categories = ["Worship", "Gathering", "Outreach", "Others"];

const DAY_MS = 24 * 60 * 60 * 1000;

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

function baseStartDate(event) {
  return event.startsAt.slice(0, 10);
}

function baseEndDate(event) {
  return event.endsAt.slice(0, 10);
}

function eventSpanDays(event) {
  return Math.max(0, daysBetween(baseStartDate(event), baseEndDate(event)));
}

function repeatUntilDate(event) {
  return event.frequency === "none" ? baseStartDate(event) : event.repeatUntil || baseStartDate(event);
}

function anchorOccursOn(event, date) {
  const startDate = baseStartDate(event);
  if (date < startDate) return false;
  if (date > repeatUntilDate(event)) return false;
  if (event.frequency === "none") return date === startDate;

  const diff = daysBetween(startDate, date);
  if (event.frequency === "daily") return diff >= 0;
  if (event.frequency === "weekly") return diff % 7 === 0;
  if (event.frequency === "monthly") return date.slice(8, 10) === startDate.slice(8, 10);
  if (event.frequency === "yearly") return date.slice(5, 10) === startDate.slice(5, 10);
  return date === startDate;
}

function occurrenceDateTime(event, date, field) {
  return `${date}T${event[field].slice(11, 19)}+08:00`;
}

function multiDayOccurrenceDateTime(event, date, offset, spanDays, field) {
  if (field === "startsAt") {
    return offset === 0 ? occurrenceDateTime(event, date, "startsAt") : `${date}T00:00:00+08:00`;
  }
  return offset === spanDays ? occurrenceDateTime(event, date, "endsAt") : `${date}T23:59:59+08:00`;
}

function requireRow(rows, label) {
  if (!rows?.[0]) throw new Error(`${label} was not saved. Please check the Supabase table policies.`);
  return rows[0];
}

function eventPayloadFromForm(formData, account, status = "pending") {
  return {
    title: formData.title.trim(),
    category: formData.category,
    other_category_detail: formData.otherCategoryDetail.trim(),
    venue: formData.venue.trim(),
    visibility: formData.visibility,
    public_description: formData.publicDescription.trim(),
    purpose: formData.purpose.trim(),
    expected_attendees: Number(formData.expectedAttendees),
    contact_person_snapshot: account.officerName || account.organizationName || "",
    contact_number_snapshot: account.phone || "",
    status,
  };
}

function proposedValuesFromForm(formData, account, context) {
  return {
    event: eventPayloadFromForm(formData, account, "approved"),
    series: {
      frequency: formData.frequency,
      recurrence_rule: {},
      local_start_template: context.startTemplate,
      local_end_template: context.endTemplate,
      repeat_until: formData.repeatUntil || null,
    },
    occurrence: {
      original_occurrence_key: context.startsAt,
      starts_at: context.startsAt,
      ends_at: context.endsAt,
      cancelled: false,
    },
  };
}

export function eventOccurrencesBetween(startDate, endDate, sourceEvents = visibleEvents()) {
  const occurrences = [];
  const seen = new Set();
  sourceEvents.forEach((event) => {
    if (event.status === "cancelled") return;
    const spanDays = eventSpanDays(event);
    const firstAnchorDate = addDays(startDate, -spanDays);
    for (let anchorDate = firstAnchorDate; anchorDate <= endDate; anchorDate = addDays(anchorDate, 1)) {
      if (!anchorOccursOn(event, anchorDate)) continue;
      const occurrenceFullStartsAt = occurrenceDateTime(event, anchorDate, "startsAt");
      const occurrenceFullEndsAt = occurrenceDateTime(event, addDays(anchorDate, spanDays), "endsAt");
      for (let offset = 0; offset <= spanDays; offset += 1) {
        const date = addDays(anchorDate, offset);
        if (date < startDate || date > endDate) continue;
        const startsAt = multiDayOccurrenceDateTime(event, date, offset, spanDays, "startsAt");
        const endsAt = multiDayOccurrenceDateTime(event, date, offset, spanDays, "endsAt");
        const key = `${event.id}:${anchorDate}:${date}`;
        const duplicateScheduleKey = [
          event.ownerAccountId,
          event.title.trim().toLowerCase(),
          startsAt.slice(11, 19),
          endsAt.slice(11, 19),
          date,
        ].join("|");
        if (seen.has(key)) continue;
        if (seen.has(duplicateScheduleKey)) continue;
        seen.add(key);
        seen.add(duplicateScheduleKey);
        occurrences.push({
          ...event,
          baseStartsAt: event.startsAt,
          baseEndsAt: event.endsAt,
          occurrenceFullStartsAt,
          occurrenceFullEndsAt,
          occurrenceAnchorDate: anchorDate,
          occurrenceDate: date,
          startsAt,
          endsAt,
        });
      }
    }
  });
  return occurrences;
}

export function visibleEvents() {
  const state = getState();
  const filter = state.ui.accountFilter;
  const selectedAccountId = state.ui.selectedAccountId;

  return state.events.filter((event) => {
    if (filter === "mine") return event.ownerAccountId === state.session.accountId;
    if (filter === "selected" && selectedAccountId) return matchesCalendarOrganization(event, selectedAccountId, state.accounts);
    return true;
  });
}

export function publicEvents() {
  return getState().events.filter((event) => event.status === "approved" && event.visibility === "public");
}

export function publicEventOccurrencesBetween(startDate, endDate) {
  return eventOccurrencesBetween(startDate, endDate, publicEvents());
}

export function calendarTone(event) {
  const state = getState();
  if (event.ownerAccountId !== state.session.accountId) return "other";
  if (event.status !== "approved" || event.hasPendingRevision) return "pending";
  return "approved";
}

export function statusLabel(event) {
  if (event.hasPendingRevision && event.status === "approved") return `approved, ${event.pendingRevision?.requestType === "cancellation" ? "deletion" : "edit"} pending`;
  return event.status.replaceAll("_", " ");
}

export function eventSummary(event, mode = "internal") {
  const owner = accountById(event.ownerAccountId);
  const base = {
    id: event.id,
    title: event.title,
    organizationName: owner?.organizationName || "Unknown account",
    category: event.category,
    venue: event.venue,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    expectedAttendees: event.expectedAttendees,
    publicDescription: event.publicDescription,
    contactPerson: owner?.officerName || "",
    contactNumber: owner?.phone || "",
    status: statusLabel(event),
  };

  if (mode === "public") {
    return {
      title: base.title,
      organizationName: base.organizationName,
      category: base.category,
      venue: base.venue,
      startsAt: base.startsAt,
      endsAt: base.endsAt,
      publicDescription: base.publicDescription,
    };
  }

  return base;
}

export async function createEvent(formData) {
  requireValidSchedule(formData);
  const account = currentAccount();
  const startsAt = `${formData.startDate}T${formData.startTime}:00+08:00`;
  const endsAt = `${formData.endDate}T${formData.endTime}:00+08:00`;
  const startTemplate = `${formData.startDate}T${formData.startTime}:00`;
  const endTemplate = `${formData.endDate}T${formData.endTime}:00`;

  const eventPayload = {
    owner_account_id: account.id,
    creator_account_id: account.id,
    title: formData.title.trim(),
    category: formData.category,
    other_category_detail: formData.otherCategoryDetail.trim(),
    venue: formData.venue.trim(),
    visibility: formData.visibility,
    public_description: formData.publicDescription.trim(),
    purpose: formData.purpose.trim(),
    expected_attendees: Number(formData.expectedAttendees),
    contact_person_snapshot: account.officerName || account.organizationName || "",
    contact_number_snapshot: account.phone || "",
    status: "pending",
    version: 1,
  };
  const rows = await supabaseRequest("/events", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(eventPayload),
  }, getState().session.accessToken);
  const eventRow = requireRow(rows, "Schedule");
  const seriesRows = await supabaseRequest("/event_series", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      event_id: eventRow.id,
      timezone: "Asia/Manila",
      frequency: formData.frequency,
      recurrence_rule: {},
      local_start_template: startTemplate,
      local_end_template: endTemplate,
      repeat_until: formData.repeatUntil || null,
    }),
  }, getState().session.accessToken);
  const seriesRow = requireRow(seriesRows, "Schedule recurrence");
  const occurrenceRows = await supabaseRequest("/event_occurrences", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      event_id: eventRow.id,
      series_id: seriesRow.id,
      original_occurrence_key: startsAt,
      starts_at: startsAt,
      ends_at: endsAt,
    }),
  }, getState().session.accessToken);
  const occurrenceRow = requireRow(occurrenceRows, "Schedule calendar date");
  const event = mapEvent(eventRow, occurrenceRow, seriesRow);

  setState((state) => ({
    ...state,
    events: [event, ...state.events],
  }));

  return event;
}

export async function updateEvent(eventId, formData) {
  requireValidSchedule(formData);
  const account = currentAccount();
  const startsAt = `${formData.startDate}T${formData.startTime}:00+08:00`;
  const endsAt = `${formData.endDate}T${formData.endTime}:00+08:00`;
  const startTemplate = `${formData.startDate}T${formData.startTime}:00`;
  const endTemplate = `${formData.endDate}T${formData.endTime}:00`;
  const original = getState().events.find((event) => event.id === eventId);
  if (!original) throw new Error("Schedule unavailable for editing.");
  if (original.ownerAccountId !== account.id) throw new Error("You can only edit your own schedule.");

  return requestEventEdit(eventId, formData, { startsAt, endsAt, startTemplate, endTemplate, original, account });
}

export async function deleteEvent(eventId) {
  const original = getState().events.find(event => event.id === eventId);
  if (!original || original.ownerAccountId !== currentAccount().id) throw new Error("You can only request deletion of your own schedule.");
  const row = await supabaseRequest("/rpc/request_schedule_change", {
    method: "POST", body: JSON.stringify({ p_kind: "event", p_id: eventId, p_request_type: "cancellation", p_values: {} }),
  }, getState().session.accessToken);
  const revision = mapEventRevision(row);
  setState(state => ({ ...state, events: state.events.map(event => event.id === eventId ? { ...event, hasPendingRevision: true, pendingRevision: revision } : event) }));
  return revision;
}

async function requestEventEdit(eventId, formData, context) {
  const proposedValues = proposedValuesFromForm(formData, context.account, context);
  const row = await supabaseRequest("/rpc/request_schedule_change", {
    method: "POST",
    body: JSON.stringify({ p_kind: "event", p_id: eventId, p_request_type: "edit", p_values: proposedValues }),
  }, getState().session.accessToken);
  const revision = mapEventRevision(row);

  setState((state) => ({
    ...state,
    events: state.events.map((event) => event.id === eventId ? { ...event, hasPendingRevision: true, pendingRevision: revision } : event),
  }));

  return { ...context.original, hasPendingRevision: true, pendingRevision: revision };
}

export async function approveEvent(eventId) {
  const event = getState().events.find((item) => item.id === eventId);
  if (event?.pendingRevision) return approveEventRevision(event);

  const rows = await supabaseRequest(`/events?id=eq.${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "approved" }),
  }, getState().session.accessToken);
  setState((state) => ({
    ...state,
    events: state.events.map((event) => {
      if (event.id !== eventId) return event;
      return { ...event, ...mapEvent(requireRow(rows, "Schedule approval"), { id: event.occurrenceId, starts_at: event.startsAt, ends_at: event.endsAt }, { id: event.seriesId, frequency: event.frequency, repeat_until: event.repeatUntil }) };
    }),
  }));
}

async function approveEventRevision(event) {
  const token = getState().session.accessToken;
  await supabaseRequest("/rpc/review_schedule_change", {
    method: "POST", body: JSON.stringify({ p_kind: "event", p_revision_id: event.pendingRevision.id, p_approve: true }),
  }, token);
  const database = await loadDatabaseState(token, { includeBookings: false, includeConcerns: false, includeNotifications: false });
  if (getState().session.accessToken === token) setState(state => ({ ...state, events: database.events }));
}
