import { getState, setState } from "../services/store.js";

export function route() {
  const active = location.hash.replace(/^#/, "") || getState().ui.route || "/organization/calendar";
  if (active === "/calendar") return "/organization/calendar";
  if (active === "/rooms") return "/organization/rooms";
  if (active === "/concerns") return "/organization/concerns";
  if (active === "/notifications" || active === "/organization/notifications") return "/organization/calendar";
  if (active === "/profile") return "/organization/profile";
  return active;
}

export function navigate(path) {
  setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      route: path,
      profileEditing: false,
      modal: null,
      editEventId: "",
      editEventStartsAt: "",
      editEventEndsAt: "",
      editBookingId: "",
      detailBookingId: "",
      detailBookingStartsAt: "",
      detailBookingEndsAt: "",
    },
  }));
  location.hash = path;
}

export function setModal(modal) {
  setState((state) => ({
    ...state,
    ui: {
      ...state.ui,
      modal,
      editEventId: modal ? state.ui.editEventId : "",
      editEventStartsAt: modal ? state.ui.editEventStartsAt : "",
      editEventEndsAt: modal ? state.ui.editEventEndsAt : "",
      editBookingId: modal ? state.ui.editBookingId : "",
      detailBookingId: modal ? state.ui.detailBookingId : "",
      detailBookingStartsAt: modal ? state.ui.detailBookingStartsAt : "",
      detailBookingEndsAt: modal ? state.ui.detailBookingEndsAt : "",
    },
  }));
}

export function closeModal() {
  setModal(null);
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function monthTitle(dateString) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateString}T00:00:00+08:00`));
}

export function formatTime(value) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
