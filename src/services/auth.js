import { clearAuthState, getState, persistAuthState, setState } from "./store.js";
import { loadDatabaseState } from "./database.js?v=20261022-owner-contact";
import { API_URL, AUTH_URL, supabaseRequest } from "./supabase.js";

function roleFromRows(rows = []) {
  return rows.find((row) => row.role === "administrator")?.role || rows[0]?.role || "registered";
}

function mapProfile(profile, role = "registered") {
  return {
    id: profile.account_id,
    officerName: profile.officer_name,
    organizationName: profile.organization_name,
    councilName: profile.council_name || '',
    messengerUrl: profile.messenger_url || '',
    phone: profile.phone,
    profileImageUrl: profile.profile_image_url || "",
    role,
    active: profile.active,
  };
}

async function loadAccountProfile(accountId, accessToken) {
  const profiles = await supabaseRequest(`${API_URL}/profiles?account_id=eq.${encodeURIComponent(accountId)}&select=*`, {}, accessToken);
  if (!profiles.length) throw new Error("Your login exists, but no CSC SYNC profile is connected to it yet.");
  if (profiles[0].active === false) throw new Error("This organization account is blocked. Please contact the CSC administrator.");
  const roles = await supabaseRequest(`${API_URL}/staff_roles?user_id=eq.${encodeURIComponent(accountId)}&select=role`, {}, accessToken);
  return mapProfile(profiles[0], roleFromRows(roles));
}

async function insertProfile(accountId, accessToken, formData) {
  const rows = await supabaseRequest(`${API_URL}/profiles?on_conflict=account_id`, {
    method: "POST",
    headers: { Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({
      account_id: accountId,
      officer_name: formData.officerName.trim(),
      organization_name: formData.organizationName.trim(),
      phone: formData.phone.trim(),
    }),
  }, accessToken);
  return mapProfile(rows[0]);
}

async function setAuthenticatedSession(auth, account, fallbackEmail) {
  const bookingSnapshot = JSON.stringify(getState().bookings);
  const concernSnapshot = JSON.stringify(getState().concerns);
  const notificationSnapshot = JSON.stringify(getState().notifications);
  const databaseState = await loadDatabaseState(auth.access_token);
  const accounts = databaseState.accounts.some((candidate) => candidate.id === account.id)
    ? databaseState.accounts
    : [account, ...databaseState.accounts];
  setState((state) => ({
    ...state,
    session: {
      ...state.session,
      accountId: account.id,
      authenticated: true,
      accessToken: auth.access_token,
      refreshToken: auth.refresh_token,
      userEmail: auth.user?.email || fallbackEmail,
    },
    ...databaseState,
    bookings: state.session.accountId === account.id && JSON.stringify(state.bookings) !== bookingSnapshot ? state.bookings : databaseState.bookings,
    concerns: state.session.accountId === account.id && JSON.stringify(state.concerns) !== concernSnapshot ? state.concerns : databaseState.concerns,
    notifications: state.session.accountId === account.id && JSON.stringify(state.notifications) !== notificationSnapshot ? state.notifications : databaseState.notifications,
    accounts,
    ui: { ...state.ui, route: "/organization/calendar", toast: null, profileEditing: false, profileSaving: false },
  }));
  persistAuthState();
}

export async function loginWithSupabase(formData) {
  const userAccount = formData.userAccount.trim();
  const auth = await supabaseRequest(`${AUTH_URL}/token?grant_type=password`, {
    method: "POST",
    body: JSON.stringify({ email: userAccount, password: formData.password }),
  });
  const account = await loadAccountProfile(auth.user.id, auth.access_token);
  await setAuthenticatedSession(auth, account, userAccount);
}

export async function signupWithSupabase(formData) {
  const userAccount = formData.userAccount.trim();
  if (formData.password !== formData.confirmPassword) throw new Error("Passwords do not match.");
  const auth = await supabaseRequest(`${AUTH_URL}/signup`, {
    method: "POST",
    body: JSON.stringify({
      email: userAccount,
      password: formData.password,
      data: {
        officer_name: formData.officerName.trim(),
        organization_name: formData.organizationName.trim(),
        phone: formData.phone.trim(),
      },
    }),
  });

  if (auth.access_token && auth.user?.id) {
    try {
      await loadAccountProfile(auth.user.id, auth.access_token);
    } catch {
      await insertProfile(auth.user.id, auth.access_token, formData);
    }
  }

  setState((state) => ({
    ...state,
    session: {
      accountId: "",
      authenticated: false,
      accessToken: "",
      refreshToken: "",
      userEmail: "",
    },
    accounts: [],
    ui: {
      ...state.ui,
      route: "/login",
      modal: null,
      sidePanelOpen: false,
    },
  }));
  clearAuthState();

  return auth.access_token
    ? "Account created. Please log in to access your calendar."
    : "Signup submitted. Confirm the account, then log in.";
}

export function logout() {
  setState((state) => ({
    ...state,
    session: {
      accountId: "",
      authenticated: false,
      accessToken: "",
      refreshToken: "",
      userEmail: "",
    },
    accounts: [],
    events: [],
    bookings: [],
    concerns: [],
    notifications: [],
    announcements: [],
    officialStatuses: [],
    ui: { ...state.ui, modal: null, toast: null, sidePanelOpen: false, profileEditing: false, profileSaving: false },
  }));
  clearAuthState();
}

export async function restoreSavedLogin() {
  const state = getState();
  if (!state.session.authenticated || !state.session.accessToken || !state.session.accountId) return;

  const bookingSnapshot = JSON.stringify(state.bookings);
  const concernSnapshot = JSON.stringify(state.concerns);
  const notificationSnapshot = JSON.stringify(state.notifications);
  try {
    const databaseState = await loadDatabaseState(state.session.accessToken);
    if (getState().session.accessToken !== state.session.accessToken || getState().session.accountId !== state.session.accountId) return;
    const currentAccount = databaseState.accounts.find((account) => account.id === state.session.accountId);
    if (!currentAccount || currentAccount.active === false) {
      logout();
      return;
    }
    setState((current) => ({
      ...current,
      ...databaseState,
      bookings: JSON.stringify(current.bookings) === bookingSnapshot ? databaseState.bookings : current.bookings,
      concerns: JSON.stringify(current.concerns) === concernSnapshot ? databaseState.concerns : current.concerns,
      notifications: JSON.stringify(current.notifications) === notificationSnapshot ? databaseState.notifications : current.notifications,
      accounts: databaseState.accounts.some((account) => account.id === current.session.accountId)
        ? databaseState.accounts
        : current.accounts,
    }));
  } catch {
    logout();
  }
}
