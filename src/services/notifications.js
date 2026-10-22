import { createCollectionRefresh } from "../shared/collection-refresh.js";
import { getState, setState } from "./store.js";
import { mapNotification } from "./database.js?v=20261022-calendar-blocks";
import { supabaseRequest } from "./supabase.js";

export function myNotifications() {
  const state = getState();
  return state.notifications.filter((notification) => notification.recipientAccountId === state.session.accountId);
}

export function unreadCount() {
  return myNotifications().filter((notification) => !notification.readAt).length;
}

export async function markNotificationRead(id) {
  const rows = await supabaseRequest(`/notifications?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  }, getState().session.accessToken);
  if (!rows?.[0]) throw new Error("The notification could not be marked as read.");
  const updated = mapNotification(rows[0]);
  setState((state) => ({
    ...state,
    notifications: state.notifications.map((notification) =>
      notification.id === id ? updated : notification,
    ),
  }));
}

export const refreshNotifications = createCollectionRefresh({
  load: async () => {
    const { session } = getState();
    const rows = await supabaseRequest(`/notifications?select=*&recipient_account_id=eq.${encodeURIComponent(session.accountId)}&order=created_at.desc`, {}, session.accessToken);
    return rows.map(mapNotification);
  },
  sessionKey: () => {
    const { session } = getState();
    return session.authenticated && session.accessToken ? `${session.accountId}:${session.accessToken}` : "";
  },
  items: () => getState().notifications,
  apply: (notifications) => setState((state) => ({ ...state, notifications })),
  status: ({ loading, error }) => setState((state) => ({ ...state, ui: { ...state.ui, notificationsLoading: loading, notificationsLoadError: error } })),
  errorMessage: "Notifications could not be refreshed. Please try again.",
});
