// Only the latest request for the current session may replace a collection.
// A local create/edit/delete while a request is pending also makes it stale.
export function createCollectionRefresh({ load, sessionKey, items, apply, status, errorMessage }) {
  let sequence = 0;
  return async function refresh() {
    const session = sessionKey();
    if (!session) return;
    const request = ++sequence;
    const snapshot = JSON.stringify(items());
    status({ loading: true, error: "" });
    try {
      const rows = await load();
      if (request !== sequence || session !== sessionKey()) return;
      if (JSON.stringify(items()) === snapshot) apply(rows);
    } catch {
      if (request === sequence && session === sessionKey()) {
        status({ loading: false, error: errorMessage || "Updates could not be loaded. Please try again." });
        return;
      }
    }
    if (request === sequence && session === sessionKey()) status({ loading: false, error: "" });
  };
}
