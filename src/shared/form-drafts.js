const FORM_DRAFTS_KEY = "csc-sync-form-drafts";

function storageAvailable() {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readDrafts() {
  if (!storageAvailable()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(FORM_DRAFTS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeDrafts(drafts) {
  if (!storageAvailable()) return;
  window.localStorage.setItem(FORM_DRAFTS_KEY, JSON.stringify(drafts));
}

function draftId(scope, name) {
  return `${scope || "public"}:${name}`;
}

function canPersistField(field) {
  if (!field.name || field.disabled) return false;
  const type = String(field.type || "").toLowerCase();
  return !["button", "submit", "reset", "password", "file", "hidden"].includes(type);
}

function serializeForm(form) {
  return [...form.elements].reduce((draft, field) => {
    if (!canPersistField(field)) return draft;
    if (field.type === "checkbox") draft[field.name] = field.checked;
    else if (field.type === "radio") {
      if (field.checked) draft[field.name] = field.value;
    } else {
      draft[field.name] = field.value;
    }
    return draft;
  }, {});
}

export function restoreFormDraft(form, { scope = "public", name } = {}) {
  const drafts = readDrafts();
  const draft = drafts[draftId(scope, name)];
  if (!draft) return false;
  [...form.elements].forEach((field) => {
    if (!canPersistField(field) || !(field.name in draft)) return;
    if (field.type === "checkbox") field.checked = Boolean(draft[field.name]);
    else if (field.type === "radio") field.checked = field.value === draft[field.name];
    else field.value = draft[field.name];
  });
  return true;
}

export function saveFormDraft(form, { scope = "public", name } = {}) {
  const drafts = readDrafts();
  drafts[draftId(scope, name)] = serializeForm(form);
  writeDrafts(drafts);
}

export function clearFormDraft({ scope = "public", name } = {}) {
  const drafts = readDrafts();
  delete drafts[draftId(scope, name)];
  writeDrafts(drafts);
}

export function bindFormDraft(form, options = {}) {
  restoreFormDraft(form, options);
  const save = () => saveFormDraft(form, options);
  form.addEventListener("input", save);
  form.addEventListener("change", save);
  return () => clearFormDraft(options);
}
