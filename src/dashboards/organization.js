import { bindCalendarBlocks } from "../shared/calendar-blocks.js";
import { calendarOrganizationOptions } from "../shared/calendar-organization-filter.js";
import { renderOrganizerContact, mountOrganizerContacts } from "../shared/organizer-contact.js?v=20261022-dashboard-contact";
import { calendarScheduleLabel, renderMainCalendarStrip } from "../shared/main-calendar.js?v=20261022-title-first";
import { CONFERENCE_SLOT_COUNT, renderRoomBookingCard } from "../shared/room-booking-card.js";
import { loadNotificationTarget } from "../shared/notification-target.js";
import { mapEvent, mapBooking } from "../services/database.js?v=20261022-calendar-blocks";
import { supabaseRequest } from "../services/supabase.js";
import { adjacentMonth, bindScheduleValidation } from "../shared/schedule-controls.js";
import { monthSegments, renderMonthRows, bindMonthOverflow } from "../shared/calendar-layout.js?v=20261020-fit-strips";
import { bookingOccurrencesBetween, bookingOwner, createBooking, deleteBooking, updateBooking, refreshBookings } from "../services/bookings.js?v=20261021-notification-flow";
import { concernCategories, createConcern, visibleConcerns, refreshConcerns } from "../services/concerns.js?v=20261021-concern-progress";
import { categories, createEvent, deleteEvent, eventOccurrencesBetween, statusLabel, updateEvent } from "../services/events.js?v=20261022-calendar-blocks";
import { markNotificationRead, myNotifications, unreadCount, refreshNotifications } from "../services/notifications.js?v=20261021-notification-flow";
import { requestProfileUpdate, updateProfileImage } from "../services/profiles.js?v=20261022-messenger";
import { accountById, currentAccount, getState, setState } from "../services/store.js";
import { bindFormDraft, clearFormDraft } from "../shared/form-drafts.js";
import { escapeHtml, formatTime, monthTitle } from "../shared/ui.js";

const ROOM_SLOT_MINUTES = 30;
const BACK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg>`;
const PREV_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>`;
const NEXT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 6 6 6-6 6"/></svg>`;

function header(currentRoute) {
  const state = getState();
  const isSecondary = currentRoute === "/organization/rooms" || currentRoute === "/organization/personal-room" || currentRoute === "/organization/concerns" || currentRoute === "/organization/profile";
  const organizationOptions = calendarOrganizationOptions(state.accounts, state.session.accountId)
    .map((option) => `<option value="${escapeHtml(option.id)}" ${state.ui.selectedAccountId === option.id ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  return `
    <header class="org-header ${currentRoute === "/organization/calendar" ? "main-calendar-header" : ""} ${["/organization/calendar", "/organization/rooms", "/organization/personal-room"].includes(currentRoute) ? "schedule-calendar-header" : ""}">
      <div class="org-brand">
        ${
          isSecondary
            ? `<button class="hamburger nav-button back-button" type="button" data-route="/organization/calendar" aria-label="Back to Main Dashboard" title="Back to Main Dashboard">${BACK_ICON}</button>`
            : `<button class="hamburger" data-toggle-panel aria-label="Open side panel">☰</button>`
        }
        <img class="seal logo-mark" src="./src/assets/csc-logo.png" alt="CSC S.Y.N.C. logo">
        <div>
          <strong>CSC S.Y.N.C.</strong>
          <small>Systemized Year-round Network Calendar</small>
        </div>
      </div>
      <h1 ${currentRoute === '/organization/personal-room' ? 'data-personal-room-title' : ''}>${monthTitle(state.ui.selectedDate)}</h1>
      <div class="org-header-controls">
        ${currentRoute === '/organization/personal-room' ? '<div data-personal-room-controls></div>' : ''}
        ${
          currentRoute === "/organization/calendar"
            ? `
              <select class="top-pill" data-control="account-filter" aria-label="Organization filter">
                <option value="all" ${state.ui.accountFilter === "all" ? "selected" : ""}>Organizations</option>
                <option value="mine" ${state.ui.accountFilter === "mine" ? "selected" : ""}>My Calendar</option>
                ${organizationOptions}
              </select>
              <select class="top-pill" data-control="calendar-view" aria-label="Calendar view">
                ${["Month", "Year"].map((view) => `<option value="${view.toLowerCase()}" ${state.ui.calendarView === view.toLowerCase() ? "selected" : ""}>${view}</option>`).join("")}
              </select>
              <button class="round-button nav-button" type="button" data-month-step="-1" aria-label="Previous month" title="Previous month">${PREV_ICON}</button>
              <button class="round-button nav-button" type="button" data-month-step="1" aria-label="Next month" title="Next month">${NEXT_ICON}</button>
            `
            : currentRoute === "/organization/rooms"
              ? `<button class="round-button nav-button" type="button" data-week-step="-1" aria-label="Previous week" title="Previous week">${PREV_ICON}</button><button class="round-button nav-button" type="button" data-week-step="1" aria-label="Next week" title="Next week">${NEXT_ICON}</button>`
              : ""
        }
        <button class="round-button bell" data-modal="notifications" aria-label="Notifications">🔔${unreadCount() ? `<i>${unreadCount()}</i>` : ""}</button>
      </div>
    </header>
  `;
}

function sidePanel(currentRoute) {
  const account = currentAccount();
  const state = getState();
  const open = state.ui.sidePanelOpen === true;
  const initials = accountInitials(account);
  const profileImage = account.profileImageUrl || "";
  return `
    <aside class="org-side-panel ${open ? "open" : ""}">
      <div class="side-panel-scroll">
        <section class="side-section">
          <h2>Scheduling Actions</h2>
          <button class="blue-pill" data-modal="event-form">Create Schedule</button>
        </section>

        <section class="side-section">
          <h2>Personal</h2>
          <button class="${currentRoute === "/organization/rooms" ? "tab-pill active" : "white-pill"}" data-route="/organization/rooms">Conference Room</button>
          <button class="${currentRoute === "/organization/personal-room" ? "tab-pill active" : "white-pill"}" data-route="/organization/personal-room">Personal Room</button>
          <button class="${currentRoute === "/organization/concerns" ? "tab-pill active" : "white-pill"}" data-route="/organization/concerns">Concerns</button>
          <button class="${currentRoute === "/organization/profile" ? "tab-pill active" : "white-pill"}" data-route="/organization/profile">Profile</button>
        </section>

        <section class="official-card" data-president-status aria-live="polite">
          <h2>CSC President</h2>
          <div class="availability" data-state="unknown"><span></span>Checking schedule</div>
        </section>
        <section class="official-card" data-adviser-status aria-live="polite">
          <h2>CSC Adviser</h2>
          <div class="availability" data-state="unknown"><span></span>Checking schedule</div>
        </section>
      </div>

      <section class="account-strip">
        <h2>Account</h2>
        <div class="account-row">
          <div class="avatar">
            ${profileImage ? `<img src="${escapeHtml(profileImage)}" alt="">` : escapeHtml(initials)}
          </div>
          <div>
            <strong>${escapeHtml(account.officerName || "No account loaded")}</strong>
            <small>Organization Account</small>
          </div>
          <button class="logout-red" data-action="logout">Logout</button>
        </div>
      </section>
    </aside>
  `;
}

function calendarMonth() {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const state = getState();
  const selected = dateParts(state.ui.selectedDate);
  const firstDay = new Date(Date.UTC(selected.year, selected.month - 1, 1));
  const startOffset = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(selected.year, selected.month, 0)).getUTCDate();
  const monthStart = `${selected.year}-${String(selected.month).padStart(2, "0")}-01`;
  const monthEnd = `${selected.year}-${String(selected.month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const events = eventOccurrencesBetween(monthStart, monthEnd);
  const today = todayIsoDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const rowCount = totalCells / 7;
  const spanBars = renderMonthRows(monthSegments(events, selected.year, selected.month, startOffset), rowCount, monthSpanBar);
  const cells = Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - startOffset + 1;
    const day = dayNumber >= 1 && dayNumber <= daysInMonth ? String(dayNumber) : "";
    const cellDate = day ? `${selected.year}-${String(selected.month).padStart(2, "0")}-${day.padStart(2, "0")}` : "";
    
    const isToday = cellDate === today;
    return `
      <button class="month-cell ${isToday ? "today" : ""}" data-date-cell="${cellDate}" ${day ? "" : "disabled"}>
        ${day ? `<strong class="month-date-number">${day}</strong>` : ""}
        
      </button>
    `;
  });

  return `
    <section class="org-calendar-shell main-calendar">
      <div class="weekday-row">${days.map((day) => `<div>${day}</div>`).join("")}</div>
      <div class="month-grid rows-${rowCount}">${cells.join("")}${spanBars}</div>
    </section>
  `;
}

function toast() {
  const toastState = getState().ui.toast;
  if (!toastState?.message) return "";
  return `<div class="backend-toast ${toastState.type === "error" ? "error" : "success"}">${escapeHtml(toastState.message)}</div>`;
}

function eventChip(event) {
  const owner = accountById(event.ownerAccountId);
  const detailStartsAt = event.occurrenceFullStartsAt || event.startsAt;
  const detailEndsAt = event.occurrenceFullEndsAt || event.endsAt;
  return `
    <button type="button" class="event-chip ${eventColorClass(event)}" data-event-detail="${event.id}" data-event-starts-at="${escapeHtml(detailStartsAt)}" data-event-ends-at="${escapeHtml(detailEndsAt)}" title="${escapeHtml(calendarScheduleLabel(event, owner))} | ${formatTime(detailStartsAt)}-${formatTime(detailEndsAt)}">
      ${escapeHtml(calendarScheduleLabel(event, owner))}
    </button>
  `;
}

function eventColorClass(event) {
  const owner = accountById(event.ownerAccountId);
  if (event.status === "rejected") return "rejected";
  if (owner?.role === "administrator" || owner?.role === "admin") return "admin-schedule";
  if (event.status === "approved" && !event.hasPendingRevision) return "approved";
  return "pending";
}

function monthSpanBar(event, row, columnStart, columnEnd, lane, rowCount) {
  return renderMainCalendarStrip(event, row, columnStart, columnEnd, lane, rowCount, accountById(event.ownerAccountId), { escapeHtml, formatTime, color: eventColorClass(event) });
}

function calendarYear() {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const selected = dateParts(getState().ui.selectedDate);
  const events = eventOccurrencesBetween(`${selected.year}-01-01`, `${selected.year}-12-31`);
  return `
    <section class="year-grid">
      ${months.map((month, index) => miniMonthCalendar(month, index + 1, selected, events)).join("")}
    </section>
  `;
}

function miniMonthCalendar(monthName, month, selected, events) {
  const firstDay = new Date(Date.UTC(selected.year, month - 1, 1));
  const startOffset = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(selected.year, month, 0)).getUTCDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - startOffset + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) return `<span class="mini-day empty"></span>`;
    const date = `${selected.year}-${String(month).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
    const dayEvents = events.filter((event) => event.startsAt.startsWith(date));
    const eventTitle = dayEvents.map((event) => `${formatTime(event.startsAt)} ${event.title}`).join("\n");
    return `
      <span class="mini-day ${dayEvents.length ? "has-events" : ""}" title="${escapeHtml(eventTitle)}">
        <span class="mini-day-number">${dayNumber}</span>
        ${
          dayEvents.length
            ? `<span class="mini-event-strips">${dayEvents.slice(0, 2).map((event) => {
                const detailStartsAt = event.occurrenceFullStartsAt || event.startsAt;
                const detailEndsAt = event.occurrenceFullEndsAt || event.endsAt;
                return `<i class="${eventColorClass(event)}" data-event-detail="${event.id}" data-event-starts-at="${escapeHtml(detailStartsAt)}" data-event-ends-at="${escapeHtml(detailEndsAt)}" title="${escapeHtml(calendarScheduleLabel(event, accountById(event.ownerAccountId)))}">${escapeHtml(calendarScheduleLabel(event, accountById(event.ownerAccountId)))}</i>`;
              }).join("")}${dayEvents.length > 2 ? "<em>+</em>" : ""}</span>`
            : ""
        }
      </span>
    `;
  });
  return `
    <button class="${month === selected.month ? "mini-month active" : "mini-month"}" data-year-month="${selected.year}-${String(month).padStart(2, "0")}-01">
      <span class="mini-month-title"><strong>${monthName}</strong><small>${selected.year}</small></span>
      <span class="mini-weekdays">${["S", "M", "T", "W", "T", "F", "S"].map((day) => `<b>${day}</b>`).join("")}</span>
      <span class="mini-calendar-grid">${cells.join("")}</span>
    </button>
  `;
}

function calendarContent() {
  const view = getState().ui.calendarView;
  if (view === "year") return calendarYear();
  return calendarMonth();
}

function roomsView() {
  const selectedDate = getState().ui.selectedDate;
  const today = todayIsoDate();
  const selected = dateFromIso(selectedDate);
  const weekStart = new Date(selected);
  weekStart.setUTCDate(selected.getUTCDate() - selected.getUTCDay());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setUTCDate(weekStart.getUTCDate() + index);
    const value = date.toISOString().slice(0, 10);
    return {
      label: `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index]} ${date.getUTCDate()}`,
      value,
      selected: value === today,
    };
  });
  const times = Array.from({ length: CONFERENCE_SLOT_COUNT }, (_, index) => {
    const minutes = 7 * 60 + index * ROOM_SLOT_MINUTES;
    const endMinutes = Math.min(minutes + ROOM_SLOT_MINUTES, 22 * 60);
    const isHalfHour = minutes % 60 === ROOM_SLOT_MINUTES;
    return {
      label: formatClock(minutes),
      railLabel: isHalfHour ? "" : formatClock(minutes),
      value: minutesToTime(minutes),
      endValue: minutesToTime(endMinutes),
      isHalfHour,
    };
  });
  const weekEnd = days[days.length - 1].value;
  const bookingOccurrences = bookingOccurrencesBetween(days[0].value, weekEnd);
  return `
    <section class="org-page-panel room-page-panel">
      ${getState().ui.bookingsLoadError ? `<div class="room-refresh-notice" role="alert">${escapeHtml(getState().ui.bookingsLoadError)} <button type="button" data-retry-bookings>Retry</button></div>` : getState().ui.bookingsLoading ? `<div class="room-refresh-notice" role="status">Updating reservations…</div>` : ""}
      <div class="conference-week conference-room-calendar">
        <div class="week-head"><div></div>${days.map((day) => `<strong class="${day.selected ? "selected-day" : ""}">${day.label}</strong>`).join("")}</div>
        <div class="week-grid">
          ${times.map((time, rowIndex) => `<div class="time-label ${time.isHalfHour ? "half-hour" : ""}" style="grid-row: ${rowIndex + 1}; grid-column: 1;">${time.railLabel}</div>${days.map((day, dayIndex) => roomSlot(day, time, rowIndex, dayIndex)).join("")}`).join("")}
          ${bookingOccurrences.map((booking) => roomBookingBlock(booking, days)).join("")}
        </div>
      </div>
    </section>
  `;
}

function roomSlot(day, time, rowIndex, dayIndex) {
  return `
    <button class="week-slot room-slot ${time.isHalfHour ? "half-hour" : ""} ${day.selected ? "selected-day" : ""}" style="grid-row: ${rowIndex + 1}; grid-column: ${dayIndex + 2};" data-booking-date="${day.value}" data-booking-start="${time.value}" data-booking-end="${time.endValue}" aria-label="${day.label} ${time.label}"></button>
  `;
}

function roomBookingBlock(booking, days) {
  return renderRoomBookingCard(booking, days, bookingOwner(booking), { escape: escapeHtml, formatTime });
}

function bookingStatusLabel(status = "pending") {
  if (status === "rejected") return "reject";
  if (status === "approved") return "approved";
  return "pending";
}

function concernsView() {
  return `
    <section class="org-page-panel concerns-page">
      <div class="panel-heading">
        <div><p>Concerns</p><h2>Submit and monitor concerns</h2></div>
      </div>
      <div class="concerns-layout">
        <section class="concern-card">
          <h3>Concern Card</h3>
          ${concernForm(false)}
        </section>
        <section class="concern-card history-card">
          <div class="concern-history-heading"><h3>History Card</h3><button class="white-pill" type="button" data-refresh-concerns ${getState().ui.concernsLoading ? "disabled" : ""}>${getState().ui.concernsLoading ? "Updating…" : "Refresh progress"}</button></div>
          ${getState().ui.concernsLoadError ? `<p class="concern-refresh-error" role="alert">${escapeHtml(getState().ui.concernsLoadError)}</p>` : ""}
          <div class="simple-list concern-history" aria-live="polite">${visibleConcerns().map(concernHistoryCard).join("") || `<p class="empty-state">${getState().ui.concernsLoading ? "Loading your concerns…" : "You have not submitted any concerns yet."}</p>`}</div>
        </section>
      </div>
    </section>
  `;
}

function concernHistoryCard(concern) {
  const statuses = {
    open: ["Submitted", "Your concern is waiting for admin review."],
    in_progress: ["In progress", "The admin is working on your concern."],
    awaiting_response: ["Awaiting response", "The admin has marked this concern as awaiting a response."],
    resolved: ["Resolved", "The admin has marked your concern as resolved."],
  };
  const status = Object.hasOwn(statuses, concern.status) ? concern.status : "open";
  const [label, explanation] = statuses[status];
  const timestamp = (value) => {
    if (!value || !Number.isFinite(new Date(value).getTime())) return "";
    return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  };
  const created = timestamp(concern.createdAt);
  const updated = timestamp(concern.updatedAt);
  return `<article data-concern-history="${escapeHtml(concern.id)}">
    <div class="concern-history-top"><strong>${escapeHtml(concern.title)}</strong><span class="concern-status ${status}">${label}</span></div>
    <p class="concern-category">${escapeHtml(concern.category)}</p>
    <p>${escapeHtml(concern.description)}</p>
    <p class="concern-progress-message">${explanation}</p>
    ${created ? `<small>Submitted ${escapeHtml(created)}</small>` : ""}
    ${updated ? `<small>Last updated ${escapeHtml(updated)}</small>` : ""}
  </article>`;
}

function profileView() {
  const account = currentAccount();
  const userEmail = getState().session.userEmail || "";
  const editing = getState().ui.profileEditing === true;
  const saving = getState().ui.profileSaving === true;
  const readOnly = !editing || saving ? "readonly" : "";
  const initials = accountInitials(account);
  const profileImage = account.profileImageUrl || "";
  return `
    <section class="org-page-panel profile-page">
      <div class="panel-heading">
        <div><p>Profile</p><h2>Account information</h2></div>
      </div>
      <div class="profile-layout">
        <form class="profile-form" data-profile-form>
          <label>Name<input class="input" name="officerName" value="${escapeHtml(account.officerName)}" ${readOnly}></label>
          <label>Number<input class="input" name="phone" value="${escapeHtml(account.phone)}" ${readOnly}></label>
          <label>Messenger link<input class="input" name="messengerUrl" type="url" maxlength="500" placeholder="https://m.me/your.username" value="${escapeHtml(account.messengerUrl || '')}" ${readOnly}></label>
          <label>Organization name<input class="input" name="organizationName" value="${escapeHtml(account.organizationName)}" ${readOnly}></label>
          <label>User account<input class="input" name="userAccount" type="email" value="${escapeHtml(userEmail)}" readonly></label>
          <p class="field-note">Profile changes require admin approval before they take effect.</p>
          ${editing ? `<div class="profile-edit-actions"><button class="blue-pill" type="submit" ${saving ? "disabled" : ""}>${saving ? "Saving…" : "Save Changes"}</button><button class="white-pill" type="button" data-cancel-profile ${saving ? "disabled" : ""}>Cancel</button></div>` : `<button class="blue-pill" type="button" data-edit-profile ${saving ? "disabled" : ""}>${saving ? "Saving…" : "Edit Profile"}</button>`}
        </form>
        <aside class="profile-preview-card">
          <label class="profile-image-picker">
            <input type="file" accept="image/*" data-profile-image-input>
            <span class="profile-photo" data-profile-photo>
              <span data-profile-initials ${profileImage ? "hidden" : ""}>${escapeHtml(initials)}</span>
              <img alt="" data-profile-image ${profileImage ? `src="${escapeHtml(profileImage)}"` : "hidden"}>
            </span>
            <strong>Replace profile image</strong>
          </label>
          <div class="profile-preview-info">
            <strong data-profile-preview="officerName">${escapeHtml(account.officerName)}</strong>
            <span data-profile-preview="organizationName">${escapeHtml(account.organizationName)}</span>
            <small data-profile-preview="phone">${escapeHtml(account.phone)}</small>
            <small data-profile-preview="messengerUrl">${escapeHtml(account.messengerUrl || "")}</small>
            <small data-profile-preview="userAccount">${escapeHtml(userEmail)}</small>
          </div>
        </aside>
      </div>
    </section>
  `;
}

function content(currentRoute) {
  if (currentRoute === '/organization/personal-room') return '<div data-personal-room></div>';
  if (currentRoute === "/organization/rooms") return roomsView();
  if (currentRoute === "/organization/concerns") return concernsView();
  if (currentRoute === "/organization/profile") return profileView();
  return calendarContent();
}

function renderModal() {
  const state = getState();
  const modal = state.ui.modal;
  if (!modal) return "";
  const isCalendar = ['day-schedules', 'event-form', 'event-detail'].includes(modal);
  const isRoom = ['booking-form', 'booking-detail'].includes(modal);
  const event = state.events.find(item => item.id === (modal === 'event-form' ? state.ui.editEventId : state.ui.detailEventId));
  const booking = state.bookings.find(item => item.id === state.ui.detailBookingId);
  const popupAttributes = isCalendar || isRoom ? `data-popup-kind="${isRoom ? 'room' : 'calendar'}" data-popup-category="${escapeHtml(event?.category || '')}" data-popup-status="${escapeHtml(modal === 'booking-detail' ? booking?.status || '' : '')}"` : '';
  const body = modal === "day-schedules" ? daySchedules() : modal === "event-form" ? eventForm() : modal === "booking-form" ? bookingForm() : modal === "booking-detail" ? bookingDetail() : modal === "event-detail" ? eventDetail() : modal === "notifications" ? notificationsModal() : concernForm();
  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal-card ${modal === "event-detail" ? "main-schedule-detail-card" : ""} ${isCalendar || isRoom ? 'schedule-popup-card' : ''}" ${popupAttributes}>
        <div class="modal-topline">
          <span>${modalTitle(modal)}</span>
          <button class="modal-x" data-close-modal data-close-button>Close</button>
        </div>
        ${body}
      </section>
    </div>
  `;
}

function modalTitle(modal) {
  if (modal === "day-schedules") return `Schedules · ${escapeHtml(getState().ui.dayScheduleDate)}`;
  if (modal === "event-form") return getState().ui.editEventId ? "Edit Schedule" : "Create Schedule";
  if (modal === "booking-form") return "Conference Room Booking";
  if (modal === "booking-detail") return "Conference Room Booking";
  if (modal === "notifications") return "Notifications";
  if (modal === "event-detail") {
    const state = getState();
    const event = state.events.find((item) => item.id === state.ui.detailEventId);
    return event ? escapeHtml(event.title) : "Schedule Details";
  }
  return "Concern";
}

function announcementNotificationContent(notification) {
  const separator = notification.message.indexOf("\n\n");
  const title = separator < 0 ? notification.message : notification.message.slice(0, separator);
  const body = separator < 0 ? "" : notification.message.slice(separator + 2);
  return `<small class="announcement-label">Announcement</small><strong>${escapeHtml(title)}</strong>${body ? `<p class="notification-announcement-body">${escapeHtml(body)}</p>` : ""}`;
}

function notificationsModal() {
  const notifications = myNotifications();
  const unreadNotifications = notifications.filter((notification) => !notification.readAt);
  return `
    <section class="notifications-modal">
      ${getState().ui.notificationsLoadError ? `<p role="alert">${escapeHtml(getState().ui.notificationsLoadError)} <button type="button" data-refresh-notifications>Retry</button></p>` : ""}
      ${unreadNotifications.length ? `<button class="white-pill notification-mark-all" type="button" data-mark-all-notifications>Mark all as read</button>` : ""}
      ${
        notifications.length
          ? notifications.map((notification) => `
              <article class="${notification.readAt ? "" : "unread"}">
                <div class="notification-row">
                  <span>${notification.readAt ? "Read" : "Unread"}</span>
                  ${notification.readAt ? "" : `<button type="button" data-mark-notification-read="${notification.id}">Mark as read</button>`}
                </div>
                ${notification.targetType === "announcement" ? announcementNotificationContent(notification) : `<strong>${escapeHtml(notification.message)}</strong>`}
                <small>${escapeHtml(formatNotificationDate(notification.createdAt))}</small>
                ${["event", "booking"].includes(notification.targetType) ? `<button class="blue-pill" type="button" data-open-schedule-notification="${notification.id}">Open ${notification.targetType === "booking" ? "booking" : "schedule"}</button>` : ""}
              </article>
            `).join("")
          : `<div class="empty-state">${getState().ui.notificationsLoading ? "Loading notifications…" : "No notifications yet."}</div>`
      }
    </section>
  `;
}

function eventForm() {
  const account = currentAccount();
  const state = getState();
  const editRequested = Boolean(state.ui.editEventId);
  const editing = state.events.find((event) => event.id === state.ui.editEventId);
  if (editRequested && !editing) {
    return `<div class="empty-state">Schedule unavailable for editing. Please reload and open the schedule again.</div>`;
  }
  const editingStartsAt = state.ui.editEventStartsAt || editing?.startsAt || "";
  const editingEndsAt = state.ui.editEventEndsAt || editing?.endsAt || "";
  const startDate = editingStartsAt.slice(0, 10) || state.ui.draftDate || state.ui.selectedDate;
  const endDate = editingEndsAt.slice(0, 10) || state.ui.draftEndDate || startDate;
  const startTime = editingStartsAt.slice(11, 16) || "00:00";
  const endTime = editingEndsAt.slice(11, 16) || "00:00";
  const duration = startDate === endDate ? "single" : "multiple";
  return `
    <form class="stack-form schedule-form ${duration === "multiple" ? "is-multiple" : ""}" data-org-form="event" data-edit-intent="${editRequested ? "true" : "false"}" ${editing ? `data-event-id="${editing.id}"` : ""}>
      <label>Organization name<input class="input" value="${escapeHtml(account.organizationName)}" disabled></label>
      <label>Event title<input class="input" name="title" value="${escapeHtml(editing?.title || "")}" required></label>
      <label>Category<select class="input" name="category">${categories.map((item) => `<option ${editing?.category === item ? "selected" : ""}>${item}</option>`).join("")}</select></label>
      <label>Venue<input class="input" name="venue" value="${escapeHtml(editing?.venue || "")}" required></label>
      <label>Duration<select class="input" name="duration" data-duration-control><option value="single" ${duration === "single" ? "selected" : ""}>Single day</option><option value="multiple" ${duration === "multiple" ? "selected" : ""}>Multiple days</option></select></label>
      <label>Frequency<select class="input" name="frequency" data-repeat-frequency><option value="none" ${!editing || editing.frequency === "none" ? "selected" : ""}>None</option><option value="daily" ${editing?.frequency === "daily" ? "selected" : ""}>Daily</option><option value="weekly" ${editing?.frequency === "weekly" ? "selected" : ""}>Weekly</option><option value="monthly" ${editing?.frequency === "monthly" ? "selected" : ""}>Monthly</option><option value="yearly" ${editing?.frequency === "yearly" ? "selected" : ""}>Yearly</option></select></label>
      <label class="repeat-until-field" hidden>Repeat Until<input class="input" name="repeatUntil" type="date" min="${startDate}" value="${editing?.repeatUntil || ""}"></label>
      <div class="form-grid date-time-grid">
        <label>Start date<input class="input" type="date" name="startDate" value="${startDate}" required></label>
        <label class="multiple-day-field">End date<input class="input" type="date" name="endDate" value="${endDate}" required></label>
        <label>Start time<input class="input" type="time" name="startTime" value="${startTime}" required></label>
        <label>End time<input class="input" type="time" name="endTime" value="${endTime}" required></label>
      </div>
      <label>Expected attendees<input class="input" name="expectedAttendees" type="number" min="1" value="${escapeHtml(editing?.expectedAttendees || "")}" required></label>
      <label class="visibility-field">Visibility<select class="input" name="visibility"><option value="internal" ${editing?.visibility !== "public" ? "selected" : ""}>Internal</option><option value="public" ${editing?.visibility === "public" ? "selected" : ""}>Public</option></select></label>
      <div class="form-grid schedule-textarea-grid">
        <label>Short public description<textarea class="input" name="publicDescription" required>${escapeHtml(editing?.publicDescription || "")}</textarea></label>
        <label>Purpose<textarea class="input" name="purpose" required>${escapeHtml(editing?.purpose || "")}</textarea></label>
      </div>
      <input type="hidden" name="otherCategoryDetail" value="${escapeHtml(editing?.otherCategoryDetail || "")}">
      <button class="blue-pill" type="submit">${editing ? "Submit Changes for Review" : "Submit for Review"}</button>
    </form>
  `;
}

function bookingForm() {
  const account = currentAccount();
  const state = getState();
  const editing = state.bookings.find((booking) => booking.id === state.ui.editBookingId);
  const date = editing?.selectedDate || state.ui.draftDate || state.ui.selectedDate;
  const startTime = editing?.startTime?.slice(0, 5) || state.ui.draftStartTime || "07:00";
  const endTime = editing?.endTime?.slice(0, 5) || state.ui.draftEndTime || "08:00";
  const repeatUntil = editing?.repeatUntil || "";
  return `
    <form class="stack-form" data-org-form="booking" ${editing ? `data-booking-id="${editing.id}"` : ""}>
      <label>Organization name<input class="input" value="${escapeHtml(account.organizationName)}" disabled></label>
      <label>Selected date<input class="input" type="date" name="selectedDate" value="${date}" ${editing ? "" : "readonly"}></label>
      <div class="form-grid">
        <label>Start time<input class="input" name="startTime" type="time" min="07:00" max="21:30" step="1800" value="${startTime}"></label>
        <label>End time<input class="input" name="endTime" type="time" min="07:30" max="22:00" step="1800" value="${endTime}"></label>
      </div>
      <label>Frequency<select class="input" name="frequency" data-repeat-frequency><option value="none" ${!editing || editing.frequency === "none" ? "selected" : ""}>Does not repeat</option><option value="weekly" ${editing?.frequency === "weekly" ? "selected" : ""}>Weekly</option><option value="monthly" ${editing?.frequency === "monthly" ? "selected" : ""}>Monthly</option><option value="yearly" ${editing?.frequency === "yearly" ? "selected" : ""}>Yearly</option></select></label>
      <label class="repeat-until-field" hidden>Repeat Until<input class="input" name="repeatUntil" type="date" min="${date}" value="${repeatUntil}"></label>
      <button class="blue-pill" type="submit">${editing ? "Submit Booking Changes" : "Request Booking"}</button>
    </form>
  `;
}

function bookingDetail() {
  const state = getState();
  const booking = state.bookings.find((item) => item.id === state.ui.detailBookingId);
  if (!booking) return `<div class="empty-state">Booking unavailable.</div>`;
  const owner = bookingOwner(booking);
  const mine = booking.ownerAccountId === state.session.accountId;
  const startsAt = state.ui.detailBookingStartsAt || booking.startsAt;
  const endsAt = state.ui.detailBookingEndsAt || booking.endsAt;
  const repeatLabel = booking.frequency === "none" ? "Does not repeat" : `${booking.frequency} until ${booking.repeatUntil || "not set"}`;
  return `
    <section class="event-detail-modal">
      <div class="detail-list">
        <div><span>Room</span><strong>CSC Conference Room</strong></div>
        <div><span>Organization</span><strong>${escapeHtml(owner?.organizationName || "Unknown")}</strong></div>
        <div><span>Date and time</span><strong>${escapeHtml(startsAt.slice(0, 10))} · ${formatTime(startsAt)}-${formatTime(endsAt)}</strong></div>
        <div><span>Frequency</span><strong>${escapeHtml(repeatLabel)}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(booking.pendingRevision ? `${bookingStatusLabel(booking.status)}, ${booking.pendingRevision.request_type === "cancellation" ? "deletion" : "edit"} pending` : bookingStatusLabel(booking.status))}</strong></div>
      </div>
      ${booking.pendingRevision ? `<p role="status">Your ${booking.pendingRevision.request_type === "cancellation" ? "deletion" : "edit"} request is waiting for admin review.</p>` : ""}
      ${renderOrganizerContact(owner, 'booking', booking.id)}
      <div class="detail-actions">
        ${mine && !booking.pendingRevision && booking.status !== "cancelled" ? `<button class="blue-pill" data-edit-booking="${booking.id}">Edit Booking</button><button class="white-pill" data-delete-booking="${booking.id}">Request Delete</button>` : ""}
      </div>
    </section>
  `;
}

function concernForm(wrap = true) {
  const form = `
    <form class="stack-form" data-org-form="concern">
      ${wrap ? "<h2>Submit Concern</h2>" : ""}
      <label>Title<input class="input" name="title" required></label>
      <label>Category<select class="input" name="category">${concernCategories.map((item) => `<option>${item}</option>`).join("")}</select></label>
      <label>Description<textarea class="input" name="description" required></textarea></label>
      <button class="blue-pill" type="submit">Submit Concern</button>
    </form>
  `;
  return form;
}

function eventDetail() {
  const state = getState();
  const event = state.events.find((item) => item.id === state.ui.detailEventId);
  if (!event) return `<div class="empty-state">Event unavailable.</div>`;
  const owner = accountById(event.ownerAccountId);
  const mine = event.ownerAccountId === state.session.accountId;
  const detailStartsAt = state.ui.detailEventStartsAt || event.startsAt;
  const detailEndsAt = state.ui.detailEventEndsAt || event.endsAt;
  const startDate = detailStartsAt.slice(0, 10);
  const endDate = detailEndsAt.slice(0, 10);
  const dateLabel = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
  return `
    <section class="event-detail-modal compact-schedule-detail">
      <div class="detail-list schedule-detail-list">
        <div><span>Organization</span><strong>${escapeHtml(owner?.organizationName || "Unknown")}</strong></div>
        <div><span>Status</span><strong>${escapeHtml(statusLabel(event))}</strong></div>
        <div><span>Category</span><strong>${escapeHtml(event.category)}</strong></div>
        <div><span>Venue</span><strong>${escapeHtml(event.venue || "Not set")}</strong></div>
        <div><span>Date and time</span><strong>${escapeHtml(dateLabel)} · ${formatTime(detailStartsAt)}-${formatTime(detailEndsAt)}</strong></div>
        <div><span>Expected attendees</span><strong>${escapeHtml(event.expectedAttendees || "Not specified")}</strong></div>
        <div class="wide compact-text"><span>Short public description</span><strong>${escapeHtml(event.publicDescription || "Not provided")}</strong></div>
        <div class="wide compact-text"><span>Purpose</span><strong>${escapeHtml(event.purpose || "Not provided")}</strong></div>
      </div>
      ${event.pendingRevision ? `<p role="status">Your ${event.pendingRevision.requestType === "cancellation" ? "deletion" : "edit"} request is waiting for admin review.</p>` : ""}
      ${(event.creatorAccountId || event.ownerAccountId) !== state.session.accountId ? renderOrganizerContact(owner, 'event', event.id) : ''}
      <div class="detail-actions">
        ${mine && !event.hasPendingRevision && !["approved", "cancelled"].includes(event.status) ? `<button class="blue-pill" data-edit-event="${event.id}">Edit Unapproved Schedule</button><button class="white-pill" data-delete-event="${event.id}">Request Delete</button>` : ""}
        ${mine && !event.hasPendingRevision && event.status === "approved" ? `<button class="blue-pill" data-edit-event="${event.id}">Request Edit</button><button class="white-pill" data-delete-event="${event.id}">Request Delete</button>` : ""}
      </div>
    </section>
  `;
}

export function bindOrganizationForms() {
    const dashboard = document.querySelector(".org-dashboard");
    if (!dashboard) return;

    mountOrganizerContacts(dashboard, (path, options) => supabaseRequest(path, options, getState().session.accessToken));
    dashboard?.addEventListener("click", (event) => {
      const detailTarget = event.target.closest("[data-event-detail]");
      const bookingTarget = event.target.closest("[data-booking-detail]");
      if (detailTarget) {
        event.preventDefault();
        event.stopPropagation();
        openEventDetail(detailTarget);
      }
      if (bookingTarget) {
        event.preventDefault();
        event.stopPropagation();
        openBookingDetail(bookingTarget);
      }
    });
    document.querySelectorAll("[data-org-form]").forEach((form) => {
      const draftName = form.dataset.eventId ? `organization-event-${form.dataset.eventId}` : form.dataset.bookingId ? `organization-booking-${form.dataset.bookingId}` : form.dataset.orgForm === "event" ? `organization-event-${getState().ui.draftDate || getState().ui.selectedDate}-${getState().ui.draftEndDate || getState().ui.draftDate || getState().ui.selectedDate}` : `organization-${form.dataset.orgForm}`;
      const clearDraft = bindFormDraft(form, { scope: getState().session.accountId, name: draftName });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form).entries());
        const submitButton = form.querySelector("button[type='submit']");
        if (submitButton) submitButton.disabled = true;
        let message = "Saved.";
        try {
          if (form.dataset.orgForm === "event") {
            if (data.duration !== "multiple") data.endDate = data.startDate;
            if (form.dataset.eventId) {
              await updateEvent(form.dataset.eventId, data);
              message = "Schedule changes sent to admin.";
            } else if (form.dataset.editIntent === "true") {
              throw new Error("Schedule unavailable for editing. Please reload and open the schedule again.");
            } else {
              await createEvent(data);
              message = "Schedule request sent to admin.";
            }
          }
          if (form.dataset.orgForm === "booking") {
            const result = form.dataset.bookingId ? await updateBooking(form.dataset.bookingId, data) : await createBooking(data);
            if (result?.ok === false) {
              setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: result.message } } }));
              return;
            }
            message = form.dataset.bookingId ? "Conference room changes sent to admin." : "Conference room request saved.";
          }
          if (form.dataset.orgForm === "concern") {
            await createConcern(data);
            message = "Concern submitted.";
          }
          clearDraft();
          setState((state) => ({ ...state, ui: { ...state.ui, formResetVersion: (state.ui.formResetVersion || 0) + 1, modal: null, editEventId: "", editBookingId: "", draftDate: "", draftEndDate: "", draftStartTime: "", draftEndTime: "", toast: { type: "success", message } } }));
        } catch (error) {
          setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: error.message } } }));
        } finally {
          if (submitButton) submitButton.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-repeat-frequency]").forEach((control) => {
      const form = control.closest("form");
      const repeatField = form?.querySelector(".repeat-until-field");
      const repeatInput = repeatField?.querySelector("[name='repeatUntil']");
      const startDate = form?.querySelector("[name='startDate'], [name='selectedDate']");
      const syncRepeat = () => {
        const repeats = control.value !== "none";
        repeatField?.toggleAttribute("hidden", !repeats);
        if (repeatInput) {
          repeatInput.required = repeats;
          if (startDate?.value) repeatInput.min = startDate.value;
          if (!repeats) {
            repeatInput.value = "";
            repeatInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
      };
      control.addEventListener("change", syncRepeat);
      startDate?.addEventListener("change", syncRepeat);
      syncRepeat();
    });
    document.querySelectorAll("[data-duration-control]").forEach((control) => {
      const form = control.closest("form");
      const startDate = form?.querySelector("[name='startDate']");
      const endDate = form?.querySelector("[name='endDate']");
      const syncDuration = () => {
        const isMultiple = control.value === "multiple";
        form.classList.toggle("is-multiple", isMultiple);
        if (!isMultiple && startDate && endDate) endDate.value = startDate.value;
      };
      control.addEventListener("change", syncDuration);
      startDate?.addEventListener("change", () => {
        if (control.value !== "multiple" && endDate) endDate.value = startDate.value;
      });
      syncDuration();
    });
    document.querySelectorAll("[data-org-form=event]").forEach(bindScheduleValidation);
    bindMonthOverflow();
    bindCalendarDateSelection();
    bindConferenceRoomSelection();
    document.querySelector("[data-retry-bookings]")?.addEventListener("click", refreshBookings);
    bindBookingTimeGuards();
    bindProfilePreview();
    bindCalendarBlocks(dashboard, { blocks: getState().calendarBlocks || [], accountId: getState().session.accountId, request: (path, options) => supabaseRequest(path, options, getState().session.accessToken) });
    document.querySelector("[data-refresh-notifications]")?.addEventListener("click", refreshNotifications);
    document.querySelector("[data-refresh-concerns]")?.addEventListener("click", refreshConcerns);
    document.querySelectorAll("[data-edit-event]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            detailEventId: "",
            editEventId: button.dataset.editEvent,
            editEventStartsAt: state.ui.detailEventStartsAt,
            editEventEndsAt: state.ui.detailEventEndsAt,
            modal: "event-form",
          },
        }));
      });
    });
    document.querySelectorAll("[data-delete-event]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await deleteEvent(button.dataset.deleteEvent);
          setState((state) => ({
            ...state,
            ui: {
              ...state.ui,
              modal: null,
              detailEventId: "",
              detailEventStartsAt: "",
              detailEventEndsAt: "",
              toast: { type: "success", message: "Deletion request sent to admin." },
            },
          }));
        } catch (error) {
          setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: error.message } } }));
        } finally {
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-edit-booking]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            detailBookingId: "",
            detailBookingStartsAt: "",
            detailBookingEndsAt: "",
            editBookingId: button.dataset.editBooking,
            modal: "booking-form",
          },
        }));
      });
    });
    document.querySelectorAll("[data-delete-booking]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await deleteBooking(button.dataset.deleteBooking);
          setState((state) => ({
            ...state,
            ui: {
              ...state.ui,
              modal: null,
              detailBookingId: "",
              detailBookingStartsAt: "",
              detailBookingEndsAt: "",
              editBookingId: "",
              toast: { type: "success", message: "Booking deletion request sent to admin." },
            },
          }));
        } catch (error) {
          setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: error.message } } }));
        } finally {
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-open-schedule-notification]").forEach(button => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const notification = myNotifications().find(item => item.id === button.dataset.openScheduleNotification);
        const token = getState().session.accessToken;
        const target = await loadNotificationTarget(notification, path => supabaseRequest(path, {}, token));
        if (getState().session.accessToken !== token) return;
        // Resolve the target before marking read; an unavailable target remains unread.
        if (!notification.readAt) await markNotificationRead(notification.id);
        const item = target.kind === "event" ? mapEvent(target.row, target.occurrence, target.series, target.revision) : mapBooking(target.row);
        const path = `/organization/${target.kind === "event" ? "calendar" : "rooms"}`;
        location.hash = path;
        setState(state => ({ ...state,
          [target.kind === "event" ? "events" : "bookings"]: [item, ...state[target.kind === "event" ? "events" : "bookings"].filter(row => row.id !== item.id)],
          ui: { ...state.ui, route: path, selectedDate: target.date, calendarView: "month", accountFilter: "all", selectedAccountId: "", sidePanelOpen: false,
            modal: target.kind === "event" ? "event-detail" : "booking-detail",
            detailEventId: target.kind === "event" ? item.id : "", detailEventStartsAt: "", detailEventEndsAt: "",
            detailBookingId: target.kind === "booking" ? item.id : "", detailBookingStartsAt: "", detailBookingEndsAt: "" },
        }));
      } catch (error) {
        setState(state => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: error.message } } }));
      } finally { button.disabled = false; }
    }));
    document.querySelectorAll("[data-mark-notification-read]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await markNotificationRead(button.dataset.markNotificationRead);
        } catch (error) {
          setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: error.message } } }));
        } finally {
          button.disabled = false;
        }
      });
    });
    document.querySelectorAll("[data-mark-all-notifications]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          const unreadNotifications = myNotifications().filter((notification) => !notification.readAt);
          await Promise.all(unreadNotifications.map((notification) => markNotificationRead(notification.id)));
        } catch (error) {
          setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: error.message } } }));
        } finally {
          button.disabled = false;
        }
      });
    });
    document.querySelector("[data-control='account-filter']")?.addEventListener("change", (event) => {
      const value = event.currentTarget.value;
      setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          accountFilter: value === "all" ? "all" : value === "mine" ? "mine" : "selected",
          selectedAccountId: value === "all" || value === "mine" ? "" : value,
        },
      }));
    });
    document.querySelector("[data-control='calendar-view']")?.addEventListener("change", (event) => {
      setState((state) => ({ ...state, ui: { ...state.ui, calendarView: event.currentTarget.value } }));
    });
    document.querySelectorAll("[data-year-month]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((state) => ({ ...state, ui: { ...state.ui, selectedDate: button.dataset.yearMonth, calendarView: "month" } }));
      });
    });
    document.querySelectorAll("[data-month-step]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((state) => {
          return { ...state, ui: { ...state.ui, selectedDate: adjacentMonth(state.ui.selectedDate, Number(button.dataset.monthStep)) } };
        });
      });
    });
    document.querySelectorAll("[data-week-step]").forEach((button) => {
      button.addEventListener("click", () => {
        setState((state) => {
          const date = dateFromIso(state.ui.selectedDate);
          date.setUTCDate(date.getUTCDate() + Number(button.dataset.weekStep) * 7);
          return { ...state, ui: { ...state.ui, selectedDate: date.toISOString().slice(0, 10) } };
        });
      });
    });
}

function openEventDetail(target) {
  setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      detailEventId: target.dataset.eventDetail,
      detailEventStartsAt: target.dataset.eventStartsAt,
      detailEventEndsAt: target.dataset.eventEndsAt,
      modal: "event-detail",
    },
  }));
}

function openBookingDetail(target) {
  setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      detailBookingId: target.dataset.bookingDetail,
      detailBookingStartsAt: target.dataset.bookingStartsAt,
      detailBookingEndsAt: target.dataset.bookingEndsAt,
      modal: "booking-detail",
    },
  }));
}

function bindProfilePreview() {
  document.querySelectorAll("[data-profile-form]").forEach((form) => {
    const draftOptions = { scope: getState().session.accountId, name: "organization-profile" };
    if (getState().ui.profileEditing) bindFormDraft(form, draftOptions);
    // A saved draft must not replace the signed-in email with an old account ID.
    form.elements.userAccount.value = getState().session.userEmail || "";
    form.querySelector("[data-edit-profile]")?.addEventListener("click", () => {
      if (getState().ui.profileSaving) return;
      clearFormDraft(draftOptions);
      setState((state) => ({ ...state, ui: { ...state.ui, profileEditing: true } }));
    });
    form.querySelector("[data-cancel-profile]")?.addEventListener("click", () => {
      if (getState().ui.profileSaving) return;
      clearFormDraft(draftOptions);
      setState((state) => ({ ...state, ui: { ...state.ui, profileEditing: false } }));
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!getState().ui.profileEditing || getState().ui.profileSaving) return;
      const changes = Object.fromEntries(new FormData(form).entries());
      const accountId = getState().session.accountId;
      const sessionToken = getState().session.accessToken;
      setState((state) => ({ ...state, ui: { ...state.ui, profileSaving: true } }));
      try {
        await requestProfileUpdate(changes);
        clearFormDraft(draftOptions);
        if (getState().session.accountId !== accountId || getState().session.accessToken !== sessionToken) return;
        setState((state) => ({ ...state, ui: { ...state.ui, profileEditing: false, profileSaving: false, toast: { type: "success", message: "Profile changes sent to admin for approval." } } }));
      } catch (error) {
        if (getState().session.accountId !== accountId || getState().session.accessToken !== sessionToken) return;
        setState((state) => ({ ...state, ui: { ...state.ui, profileSaving: false, toast: { type: "error", message: error.message } } }));
      }
    });
    const fields = ["officerName", "phone", "messengerUrl", "organizationName", "userAccount"];
    const initialsTarget = document.querySelector("[data-profile-initials]");
    fields.forEach((name) => {
      const input = form.querySelector(`[name='${name}']`);
      const target = document.querySelector(`[data-profile-preview='${name}']`);
      if (!input || !target) return;
      target.textContent = input.value;
      if (name === "officerName" && initialsTarget) initialsTarget.textContent = initialsFromName(input.value);
      input.addEventListener("input", () => {
        target.textContent = input.value;
        if (name === "officerName" && initialsTarget) initialsTarget.textContent = initialsFromName(input.value);
      });
    });
  });

  document.querySelectorAll("[data-profile-image-input]").forEach((input) => {
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      const image = document.querySelector("[data-profile-image]");
      const initials = document.querySelector("[data-profile-initials]");
      if (!file || !image) return;
      try {
        const profileImageUrl = await resizeProfileImage(file);
        image.src = profileImageUrl;
        image.hidden = false;
        if (initials) initials.hidden = true;
        await updateProfileImage(profileImageUrl);
        setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "success", message: "Profile image updated." } } }));
      } catch (error) {
        input.value = "";
        setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: error.message } } }));
      }
    });
  });
}

function resizeProfileImage(file) {
  if (!file.type.startsWith("image/")) return Promise.reject(new Error("Please choose an image file."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () => reject(new Error("Profile image could not be read.")));
    reader.addEventListener("load", () => {
      const source = new Image();
      source.addEventListener("error", () => reject(new Error("Profile image could not be loaded.")));
      source.addEventListener("load", () => {
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");
        const shortest = Math.min(source.width, source.height);
        const sx = (source.width - shortest) / 2;
        const sy = (source.height - shortest) / 2;
        context.drawImage(source, sx, sy, shortest, shortest, 0, 0, size, size);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      });
      source.src = String(reader.result || "");
    });
    reader.readAsDataURL(file);
  });
}

function accountInitials(account) {
  return initialsFromName(account.officerName || account.organizationName || "");
}

function initialsFromName(value) {
  return String(value || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function openDay(date) {
  const hasSchedules = eventOccurrencesBetween(date, date).length > 0;
  setState((state) => ({ ...state, ui: { ...state.ui, selectedDate: date, dayScheduleDate: date, draftDate: date, draftEndDate: date, editEventId: "", editEventStartsAt: "", editEventEndsAt: "", modal: hasSchedules ? "day-schedules" : "event-form" } }));
}

function daySchedules() {
  const date = getState().ui.dayScheduleDate;
  const events = eventOccurrencesBetween(date, date);
  return `<div class="day-schedules-body"><section class="day-schedule-list">${events.length ? events.map(eventChip).join("") : "<p>No schedules for this date.</p>"}</section><button class="blue-pill" data-modal="event-form">Create Schedule</button></div>`;
}

function bindCalendarDateSelection() {
  const cells = [...document.querySelectorAll("[data-date-cell]")].filter((cell) => cell.dataset.dateCell);
  let dragStart = "";
  let dragEnd = "";
  let didDrag = false;

  function clearPreview() {
    cells.forEach((cell) => cell.classList.remove("range-preview"));
  }

  function previewRange(start, end) {
    clearPreview();
    const [from, to] = sortDates(start, end);
    cells.forEach((cell) => {
      const date = cell.dataset.dateCell;
      if (date >= from && date <= to) cell.classList.add("range-preview");
    });
  }

  function openRange(start, end) {
    const [from, to] = sortDates(start, end);
    setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        draftDate: from,
        draftEndDate: to,
        modal: "event-form",
      },
    }));
  }

  cells.forEach((cell) => {
    cell.addEventListener("pointerdown", (event) => {
      if (event.target.closest("[data-event-detail]")) return;
      
      dragStart = cell.dataset.dateCell;
      dragEnd = dragStart;
      didDrag = false;
      previewRange(dragStart, dragEnd);
    });

    cell.addEventListener("pointerenter", () => {
      if (!dragStart) return;
      dragEnd = cell.dataset.dateCell;
      didDrag = dragEnd !== dragStart;
      previewRange(dragStart, dragEnd);
    });

    cell.addEventListener("pointerup", () => {
      if (!dragStart) return;
      const start = dragStart;
      const end = dragEnd || dragStart;
      dragStart = "";
      dragEnd = "";
      clearPreview();
      if (start !== end) openRange(start, end);
    });

    cell.addEventListener("pointercancel", () => {
      dragStart = "";
      dragEnd = "";
      didDrag = false;
      clearPreview();
    });

    cell.addEventListener("click", (event) => {
      if (event.target.closest("[data-event-detail]")) return;
      if (didDrag) {
        event.preventDefault();
        didDrag = false;
        return;
      }
      openDay(cell.dataset.dateCell);
    });
  });
}

function bindConferenceRoomSelection() {
  const slots = [...document.querySelectorAll("[data-booking-date]")];
  let dragDate = "";
  let dragStart = null;
  let dragEnd = null;
  let didDrag = false;

  function clearPreview() {
    slots.forEach((slot) => slot.classList.remove("range-preview"));
  }

  function previewRange(date, startMinutes, endMinutes) {
    clearPreview();
    const from = Math.min(startMinutes, endMinutes);
    const to = Math.max(startMinutes, endMinutes);
    slots.forEach((slot) => {
      if (slot.dataset.bookingDate !== date) return;
      const slotStart = timeToMinutes(slot.dataset.bookingStart);
      if (slotStart >= from && slotStart <= to) slot.classList.add("range-preview");
    });
  }

  function openBookingRange(date, startMinutes, endMinutes) {
    const from = Math.min(startMinutes, endMinutes);
    const to = Math.max(startMinutes, endMinutes) + ROOM_SLOT_MINUTES;
    setState((state) => ({
      ...state,
      ui: {
        ...state.ui,
        draftDate: date,
        draftStartTime: minutesToTime(from),
        draftEndTime: minutesToTime(Math.min(to, 22 * 60)),
        modal: "booking-form",
      },
    }));
  }

  slots.forEach((slot) => {
    slot.addEventListener("pointerdown", () => {
      dragDate = slot.dataset.bookingDate;
      dragStart = timeToMinutes(slot.dataset.bookingStart);
      dragEnd = dragStart;
      didDrag = false;
      previewRange(dragDate, dragStart, dragEnd);
    });

    slot.addEventListener("pointerenter", () => {
      if (!dragDate || slot.dataset.bookingDate !== dragDate) return;
      dragEnd = timeToMinutes(slot.dataset.bookingStart);
      didDrag = dragEnd !== dragStart;
      previewRange(dragDate, dragStart, dragEnd);
    });

    slot.addEventListener("pointerup", () => {
      if (!dragDate) return;
      const date = dragDate;
      const start = dragStart;
      const end = dragEnd ?? dragStart;
      dragDate = "";
      dragStart = null;
      dragEnd = null;
      clearPreview();
      openBookingRange(date, start, end);
    });

    slot.addEventListener("pointercancel", () => {
      dragDate = "";
      dragStart = null;
      dragEnd = null;
      didDrag = false;
      clearPreview();
    });

    slot.addEventListener("click", (event) => {
      if (didDrag) {
        event.preventDefault();
        didDrag = false;
      }
    });
  });
}

function bindBookingTimeGuards() {
  document.querySelectorAll("[data-org-form='booking']").forEach((form) => {
    const start = form.querySelector("[name='startTime']");
    const end = form.querySelector("[name='endTime']");
    if (!start || !end) return;

    const syncTimes = () => {
      let startMinutes = clampMinutes(timeToMinutes(start.value), 7 * 60, 21 * 60 + ROOM_SLOT_MINUTES);
      let endMinutes = clampMinutes(timeToMinutes(end.value), 7 * 60 + ROOM_SLOT_MINUTES, 22 * 60);
      if (endMinutes <= startMinutes) endMinutes = Math.min(startMinutes + ROOM_SLOT_MINUTES, 22 * 60);
      if (endMinutes <= startMinutes) startMinutes = Math.max(endMinutes - ROOM_SLOT_MINUTES, 7 * 60);
      start.value = minutesToTime(startMinutes);
      end.value = minutesToTime(endMinutes);
    };

    start.addEventListener("change", syncTimes);
    end.addEventListener("change", syncTimes);
  });
}

function sortDates(first, second) {
  return first <= second ? [first, second] : [second, first];
}

function formatNotificationDate(value) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatClock(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return minute ? `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}` : `${displayHour} ${suffix}`;
}

function timeToMinutes(value) {
  const [hours = 0, minutes = 0] = String(value || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function clampMinutes(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function dateFromIso(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateParts(value) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function todayIsoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function renderOrganizationDashboard(currentRoute) {
  const panelOpen = getState().ui.sidePanelOpen === true;
  return `
    <div class="org-dashboard">
      ${header(currentRoute)}
      <div class="org-workspace">
        ${sidePanel(currentRoute)}
        ${panelOpen ? `<button class="side-panel-scrim" data-close-panel aria-label="Close side panel"></button>` : ""}
        <main class="org-main">${content(currentRoute)}</main>
      </div>
      ${renderModal()}
      ${toast()}
    </div>
  `;
}
