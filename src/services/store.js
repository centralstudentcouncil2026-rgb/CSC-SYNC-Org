import {
  accounts,
  announcements,
  bookings,
  concerns,
  currentAccountId,
  events,
  notifications,
  officialStatuses,
} from "../data/seed.js";

const AUTH_STORAGE_KEY = "csc-sync-login-session";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const initialState = {
  session: {
    accountId: currentAccountId,
    authenticated: false,
    accessToken: "",
    refreshToken: "",
    userEmail: "",
  },
  ui: {
    route: "/organization/calendar",
    calendarView: "month",
    selectedDate: todayIsoDate(),
    accountFilter: "all",
    selectedAccountId: "",
    modal: null,
    sidePanelOpen: false,
  },
  accounts,
  events,
  bookings,
  concerns,
  notifications,
  announcements,
  officialStatuses,
};

function todayIsoDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

let state = loadState();
const listeners = new Set();

function loadState() {
  const authState = loadAuthState();
  return normalizeState({
    ...clone(initialState),
    session: { ...initialState.session, ...(authState.session || {}) },
    ui: { ...initialState.ui, ...(authState.ui || {}) },
    accounts: authState.accounts || initialState.accounts,
  });
}

function loadAuthState() {
  try {
    return JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function normalizeState(nextState) {
  const ui = { ...initialState.ui, ...nextState.ui };
  if (!["month", "year"].includes(ui.calendarView)) ui.calendarView = "month";
  ui.detailEventId = ui.detailEventId || "";
  ui.detailEventStartsAt = ui.detailEventStartsAt || "";
  ui.detailEventEndsAt = ui.detailEventEndsAt || "";
  ui.editEventId = ui.editEventId || "";
  ui.editEventStartsAt = ui.editEventStartsAt || "";
  ui.editEventEndsAt = ui.editEventEndsAt || "";
  ui.detailBookingId = ui.detailBookingId || "";
  ui.detailBookingStartsAt = ui.detailBookingStartsAt || "";
  ui.detailBookingEndsAt = ui.detailBookingEndsAt || "";
  ui.editBookingId = ui.editBookingId || "";
  ui.draftDate = ui.draftDate || "";
  ui.draftEndDate = ui.draftEndDate || "";
  ui.draftStartTime = ui.draftStartTime || "";
  ui.draftEndTime = ui.draftEndTime || "";
  ui.sidePanelOpen = false;
  ui.toast = null;
  return { ...nextState, ui };
}

export function getState() {
  return state;
}

export function setState(updater) {
  const next = typeof updater === "function" ? updater(clone(state)) : updater;
  state = next;
  persistUiState();
  for (const listener of listeners) listener(state);
}

export function persistAuthState() {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    session: state.session,
    ui: persistentUiState(state.ui),
    accounts: state.accounts.filter((account) => account.id === state.session.accountId),
  }));
}

function persistUiState() {
  if (!state.session.authenticated) return;
  const saved = loadAuthState();
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    ...saved,
    session: state.session,
    ui: persistentUiState(state.ui),
  }));
}

function persistentUiState(ui) {
  return {
    route: ui.route,
    calendarView: ui.calendarView,
    selectedDate: ui.selectedDate,
    accountFilter: ui.accountFilter,
    selectedAccountId: ui.selectedAccountId,
    modal: ui.modal,
    profileEditing: ui.profileEditing === true,
    dayScheduleDate: ui.dayScheduleDate,
    detailEventId: ui.detailEventId,
    detailEventStartsAt: ui.detailEventStartsAt,
    detailEventEndsAt: ui.detailEventEndsAt,
    editEventId: ui.editEventId,
    editEventStartsAt: ui.editEventStartsAt,
    editEventEndsAt: ui.editEventEndsAt,
    detailBookingId: ui.detailBookingId,
    detailBookingStartsAt: ui.detailBookingStartsAt,
    detailBookingEndsAt: ui.detailBookingEndsAt,
    editBookingId: ui.editBookingId,
    draftDate: ui.draftDate,
    draftEndDate: ui.draftEndDate,
    draftStartTime: ui.draftStartTime,
    draftEndTime: ui.draftEndTime,
  };
}

export function clearAuthState() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentAccount() {
  return state.accounts.find((account) => account.id === state.session.accountId) || {
    id: state.session.accountId,
    officerName: "",
    organizationName: "",
    phone: "",
    profileImageUrl: "",
    role: "registered",
  };
}

export function accountById(id) {
  return state.accounts.find((account) => account.id === id);
}

export function resetDevState() {
  clearAuthState();
  state = normalizeState(clone(initialState));
  for (const listener of listeners) listener(state);
}
