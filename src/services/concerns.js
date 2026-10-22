import { createCollectionRefresh } from "../shared/collection-refresh.js";
import { currentAccount, getState, setState } from "./store.js";
import { mapConcern, mapNotification } from "./database.js?v=20261022-owner-contact";
import { supabaseRequest } from "./supabase.js";

export const concernCategories = [
  "Miscommunication",
  "Venue Concern",
  "Document Submission Issue",
  "Activity Approval Concern",
  "Schedule Conflict",
  "Others",
];

export function visibleConcerns() {
  const state = getState();
  const account = currentAccount();
  if (account.role === "administrator" || account.role === "reviewer") return state.concerns;
  return state.concerns.filter((concern) => concern.submitterAccountId === account.id);
}

async function createConcernNotification(concern, account) {
  try {
    const rows = await supabaseRequest("/notifications", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        recipient_account_id: getState().accounts.find((candidate) => candidate.role === "administrator")?.id || account.id,
        target_type: "concern",
        target_id: concern.id,
        message: `${account.organizationName} submitted a concern.`,
      }),
    }, getState().session.accessToken);
    return rows?.[0] ? mapNotification(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function createConcern(formData) {
  const account = currentAccount();
  const rows = await supabaseRequest("/concerns", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      submitter_account_id: account.id,
      title: formData.title.trim(),
      category: formData.category,
      description: formData.description.trim(),
      status: "open",
    }),
  }, getState().session.accessToken);
  const concern = mapConcern(rows[0]);

  setState((state) => ({
    ...state,
    concerns: [concern, ...state.concerns],
  }));

  createConcernNotification(concern, account).then((notification) => {
    if (!notification) return;
    setState((state) => ({ ...state, notifications: [notification, ...state.notifications] }));
  });
}

export const refreshConcerns = createCollectionRefresh({
  load: async () => {
    const { session } = getState();
    const rows = await supabaseRequest(`/concerns?select=*&submitter_account_id=eq.${encodeURIComponent(session.accountId)}&order=created_at.desc`, {}, session.accessToken);
    return rows.map(mapConcern);
  },
  sessionKey: () => {
    const { session } = getState();
    return session.authenticated && session.accessToken ? `${session.accountId}:${session.accessToken}` : "";
  },
  items: () => getState().concerns,
  apply: (concerns) => setState((state) => ({ ...state, concerns })),
  status: ({ loading, error }) => setState((state) => ({ ...state, ui: { ...state.ui, concernsLoading: loading, concernsLoadError: error } })),
  errorMessage: "Concern progress could not be refreshed. Please try again.",
});
