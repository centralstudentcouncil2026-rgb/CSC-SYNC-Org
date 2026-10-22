import "./shared/notices.js?v=20261022-overlay";
import { refreshNotifications } from "./services/notifications.js?v=20261021-notification-flow";
import { refreshConcerns } from "./services/concerns.js?v=20261021-concern-progress";
import { refreshBookings } from "./services/bookings.js?v=20261021-notification-flow";
import { route } from "./shared/ui.js";
import { renderApp } from "./app.js?v=20261022-headerless-login";
import { restoreSavedLogin } from "./services/auth.js";
import { loadDatabaseState } from "./services/database.js?v=20261022-calendar-blocks";
import { getState, setState, subscribe } from "./services/store.js";

const root = document.querySelector("#app");

let roomSession = "";
let concernsSession = "";
let notificationSession = "";
let previousRoute = "";
function paint() {
  const firstPaint = previousRoute === "";
  const activeRoute = route();
  const enteringRooms = activeRoute === "/organization/rooms" && previousRoute !== activeRoute;
  const enteringProfile = activeRoute === "/organization/profile" && previousRoute !== activeRoute;
  previousRoute = activeRoute;
  if (enteringProfile && !firstPaint && getState().ui.profileEditing) {
    setState((state) => ({ ...state, ui: { ...state.ui, profileEditing: false } }));
    return;
  }
  if (enteringRooms && getState().ui.modal !== "booking-detail") {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const today = `${values.year}-${values.month}-${values.day}`;
    if (getState().ui.selectedDate !== today) {
      setState((state) => ({ ...state, ui: { ...state.ui, selectedDate: today } }));
      return;
    }
  }
  renderApp(root);
  const { session } = getState();
  const key = route() === "/organization/rooms" && session.authenticated && session.accessToken ? `${session.accountId}:${session.accessToken}` : "";
  if (key !== roomSession) {
    roomSession = key;
    if (key) void refreshBookings();
  }
  const concernsKey = route() === "/organization/concerns" && session.authenticated && session.accessToken ? `${session.accountId}:${session.accessToken}` : "";
  if (concernsKey !== concernsSession) {
    concernsSession = concernsKey;
    if (concernsKey) void refreshConcerns();
  }
  const notificationKey = getState().ui.modal === "notifications" && session.authenticated && session.accessToken ? `${session.accountId}:${session.accessToken}` : "";
  if (notificationKey !== notificationSession) {
    notificationSession = notificationKey;
    if (notificationKey) void refreshNotifications();
  }
}

window.addEventListener("hashchange", paint);
subscribe(paint);
paint();
restoreSavedLogin().finally(paint);

let lastRefreshAt = 0;
let refreshInFlight = null;

async function refreshOpenSession(force = false) {
  const state = getState();
  if (!state.session.authenticated || !state.session.accessToken) return;
  const now = Date.now();
  if (!force && now - lastRefreshAt < 10000) return;
  void refreshBookings();
  void refreshConcerns();
  void refreshNotifications();
  if (refreshInFlight) return refreshInFlight;
  lastRefreshAt = now;
  const sessionToken = state.session.accessToken;
  refreshInFlight = loadDatabaseState(sessionToken, { includeBookings: false, includeConcerns: false, includeNotifications: false })
    .then(({ bookings: ignoredBookings, concerns: ignoredConcerns, notifications: ignoredNotifications, ...databaseState }) => {
      if (getState().session.accessToken !== sessionToken) return;
      setState((current) => ({
        ...current,
        ...databaseState,
        accounts: databaseState.accounts.some((account) => account.id === current.session.accountId)
          ? databaseState.accounts
          : current.accounts,
      }));
    })
    .catch(() => {})
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

window.addEventListener("focus", () => refreshOpenSession(true));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshOpenSession(true);
});
window.setInterval(() => refreshOpenSession(true), 8000);
