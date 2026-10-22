import { normalizeMessengerLink } from "../shared/contact-links.js?v=20261022-messenger";
import { currentAccount, getState, persistAuthState, setState } from "./store.js";
import { supabaseRequest } from "./supabase.js";

export async function requestProfileUpdate(formData) {
  const account = currentAccount();
  const proposedProfile = {
    officer_name: formData.officerName.trim(),
    organization_name: formData.organizationName.trim(),
    phone: formData.phone.trim(),
    messenger_url: normalizeMessengerLink(formData.messengerUrl),
  };
  const previousProfile = {
    officer_name: account.officerName || "",
    organization_name: account.organizationName || "",
    phone: account.phone || "",
    messenger_url: account.messengerUrl || "",
  };

  try {
    await supabaseRequest("/account_change_requests", {
      method: "POST",
      body: JSON.stringify({
        account_id: account.id,
        previous_login_identifier: getState().session.userEmail || formData.userAccount || "",
        proposed_login_identifier: getState().session.userEmail || formData.userAccount || "",
        previous_values: { profile: previousProfile },
        proposed_values: { profile: proposedProfile },
        status: "pending",
      }),
    }, getState().session.accessToken);
  } catch (error) {
    if (/account_change_requests|previous_values|proposed_values/.test(error.message) && /schema cache|does not exist|could not find/i.test(error.message)) {
      throw new Error("Profile approval is not set up in the database yet. Ask the administrator to apply migration 017_account_profile_change_requests.sql, then try again.");
    }
    throw error;
  }
}

export async function updateProfileImage(profileImageUrl) {
  const account = currentAccount();
  const rows = await supabaseRequest(`/profiles?account_id=eq.${encodeURIComponent(account.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      profile_image_url: profileImageUrl,
      updated_at: new Date().toISOString(),
    }),
  }, getState().session.accessToken);

  if (!rows?.[0]) throw new Error("Profile image was not saved. Please check the Supabase table policies.");

  setState((state) => ({
    ...state,
    accounts: state.accounts.map((candidate) => (
      candidate.id === account.id ? { ...candidate, profileImageUrl: rows[0].profile_image_url || "" } : candidate
    )),
  }));
  persistAuthState();
  return rows[0].profile_image_url || "";
}
