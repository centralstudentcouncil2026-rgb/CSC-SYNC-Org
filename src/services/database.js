import { supabaseRequest } from "./supabase.js";

function roleByUserId(rows = []) {
  return rows.reduce((roles, row) => ({ ...roles, [row.user_id]: row.role }), {});
}

function mapProfile(profile, roles = {}) {
  return {
    id: profile.account_id,
    officerName: profile.officer_name || "",
    organizationName: profile.organization_name || "",
    councilName: profile.council_name || '',
    messengerUrl: profile.messenger_url || '',
    phone: profile.phone || "",
    profileImageUrl: profile.profile_image_url || "",
    role: roles[profile.account_id] || "registered",
    active: profile.active !== false,
  };
}

export function mapEventRevision(row = null) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    baseVersion: row.base_version,
    requestType: row.request_type,
    previousValues: row.previous_values || {},
    proposedValues: row.proposed_values || {},
    requesterId: row.requester_id,
    status: row.status || "pending",
  };
}

export function mapEvent(row, occurrence = {}, series = {}, revision = null) {
  return {
    id: row.id,
    seriesId: series.id || "",
    occurrenceId: occurrence.id || "",
    ownerAccountId: row.owner_account_id,
    creatorAccountId: row.creator_account_id,
    title: row.title || "",
    category: row.category || "",
    otherCategoryDetail: row.other_category_detail || "",
    venue: row.venue || "",
    startsAt: localScheduleTimestamp(occurrence.starts_at || row.starts_at),
    endsAt: localScheduleTimestamp(occurrence.ends_at || row.ends_at),
    frequency: series.frequency || row.frequency || "none",
    repeatUntil: series.repeat_until || row.repeat_until || "",
    expectedAttendees: row.expected_attendees || "",
    visibility: row.visibility || "internal",
    publicDescription: row.public_description || "",
    purpose: row.purpose || "",
    status: row.status || "pending",
    version: row.version || 1,
    hasPendingRevision: row.has_pending_revision === true || Boolean(revision),
    pendingRevision: mapEventRevision(revision),
  };
}

export function mapBooking(row) {
  const repeatUntil = row.repeat_until_resolved || "";
  const [repeatUntilYear = "", repeatUntilMonth = ""] = repeatUntil.split("-");
  const startTime = manilaTime(row.starts_at);
  const endTime = manilaTime(row.ends_at);
  return {
    id: row.id,
    version: row.version || 1,
    pendingRevision: row.booking_revisions?.find(revision => revision.status === "pending") || null,
    ownerAccountId: row.owner_account_id,
    selectedDate: row.selected_date || manilaDate(row.starts_at),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    startTime,
    endTime,
    frequency: row.frequency || "none",
    repeatUntil,
    repeatUntilMonth,
    repeatUntilYear,
    status: row.status || "pending",
  };
}

function localScheduleTimestamp(value) {
  return value ? `${manilaDate(value)}T${manilaTime(value)}+08:00` : "";
}

function manilaDate(value = "") {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function manilaTime(value = "") {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.hour}:${byType.minute}:${byType.second}`;
}

export function mapConcern(row) {
  return {
    id: row.id,
    submitterAccountId: row.submitter_account_id,
    title: row.title || "",
    category: row.category || "",
    description: row.description || "",
    status: row.status || "open",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
  };
}

export function mapNotification(row) {
  return {
    id: row.id,
    recipientAccountId: row.recipient_account_id,
    targetType: row.target_type || "",
    targetId: row.target_id || "",
    message: row.message || "",
    createdAt: row.created_at || "",
    readAt: row.read_at || "",
  };
}

function mapAnnouncement(row) {
  return {
    id: row.id,
    title: row.title || "",
    body: row.body || "",
    status: row.status || "draft",
  };
}

function mapOfficialStatus(row) {
  return {
    id: row.id,
    role: row.role || "",
    officialUserId: row.official_user_id || "",
    displayName: row.display_name || "",
    availabilityState: row.availability_state || "",
    note: row.note || "",
    contact: row.contact || "",
    expiresAt: row.expires_at || "",
  };
}

async function optionalTable(path, token) {
  try {
    return await supabaseRequest(path, {}, token);
  } catch {
    return [];
  }
}

export async function loadDatabaseState(accessToken, { includeBookings = true, includeConcerns = true, includeNotifications = true } = {}) {
  const [profiles, staffRoles, events, eventSeries, eventOccurrences, eventRevisions, bookings, concerns, notifications, announcements, officialStatuses, adminAccounts] = await Promise.all([
    optionalTable("/profiles?select=*", accessToken),
    optionalTable("/staff_roles?select=user_id,role", accessToken),
    optionalTable("/events?select=*&order=created_at.desc", accessToken),
    optionalTable("/event_series?select=*", accessToken),
    optionalTable("/event_occurrences?select=*&order=starts_at.asc", accessToken),
    optionalTable("/event_revisions?select=*&status=eq.pending&order=created_at.desc", accessToken),
    includeBookings ? optionalTable("/room_bookings?select=*,booking_revisions(*)&order=starts_at.asc", accessToken) : Promise.resolve([]),
    includeConcerns ? optionalTable("/concerns?select=*&order=created_at.desc", accessToken) : Promise.resolve([]),
    includeNotifications ? optionalTable("/notifications?select=*&order=created_at.desc", accessToken) : Promise.resolve([]),
    optionalTable("/announcements?select=*&order=created_at.desc", accessToken),
    optionalTable("/official_statuses?select=*", accessToken),
    supabaseRequest("/rpc/calendar_admin_accounts", { method: "POST", body: "{}" }, accessToken).catch(() => []),
  ]);
  const roles = roleByUserId(staffRoles);
  for (const account of adminAccounts) roles[account.account_id] = 'administrator';
  const calendarProfiles = [...profiles, ...adminAccounts
    .filter(account => !profiles.some(profile => profile.account_id === account.account_id))
    .map(account => ({ account_id: account.account_id, organization_name: 'Central Student Council' }))];
  const seriesByEventId = eventSeries.reduce((items, series) => ({ ...items, [series.event_id]: series }), {});
  const occurrencesByEventId = eventOccurrences.filter((occurrence) => occurrence.cancelled !== true).reduce((items, occurrence) => {
    if (!items[occurrence.event_id]) items[occurrence.event_id] = occurrence;
    return items;
  }, {});
  const revisionsByEventId = eventRevisions.reduce((items, revision) => {
    if (!items[revision.event_id]) items[revision.event_id] = revision;
    return items;
  }, {});
  return {
    accounts: calendarProfiles.map((profile) => mapProfile(profile, roles)),
    events: events
      .map((event) => mapEvent(event, occurrencesByEventId[event.id], seriesByEventId[event.id], revisionsByEventId[event.id]))
      .filter((event) => event.startsAt && event.endsAt),
    bookings: bookings.map(mapBooking),
    concerns: concerns.map(mapConcern),
    notifications: notifications.map(mapNotification),
    announcements: announcements.map(mapAnnouncement),
    officialStatuses: officialStatuses.map(mapOfficialStatus),
  };
}
