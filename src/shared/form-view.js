const views = new WeakMap();
const compositions = new WeakMap();

// Side panels also need scroll restoration when no form is open, or a modal changes.
export function captureSidePanelScroll(root) {
  const selector = '.org-side-panel.open .side-panel-scroll, .admin-side-panel.open .side-panel-scroll';
  const panel = root.querySelector(selector);
  if (!panel) return () => {};
  const top = panel.scrollTop;
  const left = panel.scrollLeft;
  return () => {
    const next = root.querySelector(selector);
    if (next) {
      next.scrollTop = top;
      next.scrollLeft = left;
    }
  };
}

// Keep a refresh from interrupting an unfinished IME/composition input.
export function deferFormRender(root, render) {
  if (!compositions.has(root)) {
    const state = { active: false, pending: null };
    compositions.set(root, state);
    root.addEventListener('compositionstart', () => { state.active = true; });
    root.addEventListener('compositionend', () => {
      state.active = false;
      const pending = state.pending;
      state.pending = null;
      if (pending) queueMicrotask(pending);
    });
  }
  const state = compositions.get(root);
  if (!state.active) return false;
  state.pending = render;
  return true;
}

function pathFrom(root, node) {
  const path = [];
  while (node && node !== root) {
    const parent = node.parentElement;
    if (!parent) return null;
    path.unshift([...parent.children].indexOf(node));
    node = parent;
  }
  return node === root ? path : null;
}

function nodeAt(root, path) {
  return path?.reduce((node, index) => node?.children[index], root);
}

function formKey(form, index) {
  return JSON.stringify([form.id, [...form.attributes].filter(attr => attr.name.startsWith('data-')).map(attr => [attr.name, attr.value]), index]);
}

// A context change means an intentional navigation, new form, or successful save.
// Values are transient here; durable, non-password drafts remain in form-drafts.js.
export function captureFormView(root, context, { preserveValues = false } = {}) {
  const previous = views.get(root);
  const generation = (previous?.generation || 0) + 1;
  views.set(root, { context, generation });
  if (previous?.context !== context) return () => {};

  const forms = [...root.querySelectorAll('form')];
  if (!forms.length) return () => {};
  const active = document.activeElement;
  const activeForm = active?.closest?.('form');
  const formIndex = forms.indexOf(activeForm);
  const focus = formIndex < 0 ? null : {
    key: formKey(activeForm, formIndex),
    index: [...activeForm.elements].indexOf(active),
    name: active.name,
    start: active.selectionStart,
    end: active.selectionEnd,
    direction: active.selectionDirection,
  };
  const values = forms.map((form, index) => ({
    key: formKey(form, index),
    validation: [...form.querySelectorAll('.schedule-validation-message')].map(node => ({ hidden: node.hidden, text: node.textContent })),
    fields: [...form.elements].flatMap((field, fieldIndex) => {
      if (!field.name || field.disabled || field.readOnly || ['file', 'submit', 'button', 'reset', 'hidden'].includes(field.type)) return [];
      if (!preserveValues && field.type !== 'password') return [];
      return [{ index: fieldIndex, name: field.name, value: field.value, checked: field.checked }];
    }),
  }));
  const scrolls = [root, ...root.querySelectorAll('*')]
    .filter(node => node.scrollTop || node.scrollLeft)
    .map(node => ({ path: pathFrom(root, node), top: node.scrollTop, left: node.scrollLeft }));
  const windowScroll = { x: window.scrollX, y: window.scrollY };
  let restored = false;
  return () => {
    if (views.get(root)?.generation !== generation) return;
    const nextForms = [...root.querySelectorAll('form')];
    const byKey = new Map(nextForms.map((form, index) => [formKey(form, index), form]));
    for (const saved of values) {
      const messages = byKey.get(saved.key)?.querySelectorAll('.schedule-validation-message') || [];
      saved.validation.forEach((message, index) => {
        if (messages[index]) { messages[index].hidden = message.hidden; messages[index].textContent = message.text; }
      });
    }
    if (!restored) {
      for (const saved of values) {
        const form = byKey.get(saved.key);
        for (const item of saved.fields) {
          const field = form?.elements[item.index];
          if (!field || field.name !== item.name || field.disabled || field.readOnly) continue;
          field.value = item.value;
          if (field.type === 'checkbox' || field.type === 'radio') field.checked = item.checked;
        }
      }
    }
    const field = focus ? byKey.get(focus.key)?.elements[focus.index] : null;
    // Do not steal focus if the user has moved to another control since rendering.
    if (field && field.name === focus.name && !field.disabled &&
      (document.activeElement === document.body || document.activeElement === field || !restored)) {
      if (document.activeElement !== field) {
        field.focus({ preventScroll: true });
        if (focus.start !== null && focus.start !== undefined && field.setSelectionRange) {
          try { field.setSelectionRange(focus.start, focus.end, focus.direction); } catch { /* Non-text control. */ }
        }
      }
    }
    for (const scroll of scrolls) {
      const node = nodeAt(root, scroll.path);
      if (node) { node.scrollTop = scroll.top; node.scrollLeft = scroll.left; }
    }
    window.scrollTo(windowScroll.x, windowScroll.y);
    restored = true;
  };
}
