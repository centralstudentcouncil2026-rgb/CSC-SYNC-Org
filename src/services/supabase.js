export const SUPABASE_URL = "https://udnyppmvkklcbyylqsxp.supabase.co";
export const SUPABASE_KEY = "sb_publishable_d9-iqfjWlUdXUaj1qfwDag_VUp-wheE";
export const AUTH_URL = `${SUPABASE_URL}/auth/v1`;
export const API_URL = `${SUPABASE_URL}/rest/v1`;

export async function supabaseRequest(pathOrUrl, options = {}, token = SUPABASE_KEY) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${API_URL}${pathOrUrl}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.msg || payload?.message || payload?.error_description || response.statusText);
  return payload;
}
