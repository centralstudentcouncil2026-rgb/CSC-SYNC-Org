import { mountPresidentStatus, mountAdviserStatus } from "./shared/president-status.js?v=20261022-viewer-contacts";
import { captureFormView, captureSidePanelScroll, deferFormRender } from "./shared/form-view.js?v=20261021-panel-scroll";
import { mountPersonalRoom } from "./shared/personal-room.js?v=20261022-viewer-contacts";
import { bindSchedulePopupColors } from "./shared/schedule-popups.js";
import { supabaseRequest } from "./services/supabase.js";
import { renderOrganizationDashboard, bindOrganizationForms } from "./dashboards/organization.js?v=20261022-compact-detail";
import { loginWithSupabase, logout, signupWithSupabase } from "./services/auth.js";
import { closeModal, navigate, route, setModal } from "./shared/ui.js";
import { bindFormDraft } from "./shared/form-drafts.js";
import { resetDevState, setState, getState, currentAccount } from "./services/store.js";

let toastTimer = null;
let activeToastKey = "";

function renderLogin() {
  const toast = getState().ui.toast;
  return `
    <main class="entry-screen">
      <section class="entry-card login-card">
        <img class="entry-logo" src="./src/assets/csc-logo.png" alt="CSC S.Y.N.C. logo">
        <div>
          <h1>CSC S.Y.N.C.</h1>
          <p>Systemized Year-round Network Calendar</p>
        </div>
        <form class="login-form" data-login-form>
          <label>User Account<input class="input" name="userAccount" type="email" autocomplete="username" required></label>
          <label>Password<input class="input" name="password" type="password" autocomplete="current-password" required></label>
          <button class="blue-pill" type="submit">Login</button>
        </form>
        ${toast?.message ? `<p class="login-message ${toast.type === "error" ? "error" : "success"}">${toast.message}</p>` : ""}
        <button class="white-pill" data-route="/signup">Create Organization Account</button>
      </section>
    </main>
  `;
}

function renderSignup() {
  const toast = getState().ui.toast;
  return `
    <main class="entry-screen">
      <section class="entry-card login-card">
        <img class="entry-logo" src="./src/assets/csc-logo.png" alt="CSC S.Y.N.C. logo">
        <div>
          <h1>Create Account</h1>
          <p>Register a real CSC S.Y.N.C. organization account.</p>
        </div>
        <form class="login-form" data-signup-form>
          <label>Officer name<input class="input" name="officerName" autocomplete="name" required></label>
          <label>User account<input class="input" name="userAccount" type="email" autocomplete="username" required></label>
          <label>Organization name<input class="input" name="organizationName" required></label>
          <label>Phone number<input class="input" name="phone" autocomplete="tel" required></label>
          <label>Password<input class="input" name="password" type="password" autocomplete="new-password" minlength="6" required></label>
          <label>Confirm password<input class="input" name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required></label>
          <button class="blue-pill" type="submit">Sign Up</button>
        </form>
        ${toast?.message ? `<p class="login-message ${toast.type === "error" ? "error" : "success"}">${toast.message}</p>` : ""}
        <button class="white-pill" data-route="/login">Back to Login</button>
      </section>
    </main>
  `;
}

function renderCurrentRoute(currentRoute) {
  const authenticated = getState().session.authenticated;
  if (currentRoute === "/signup") return renderSignup();
  if (currentRoute === "/login") return renderLogin();
  if (currentRoute.startsWith("/organization") && !authenticated) return renderLogin();
  if (currentRoute.startsWith("/organization")) return renderOrganizationDashboard(currentRoute);
  return renderLogin();
}

function bindGlobalEvents(root) {
  root.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => {
      setState((state) => ({ ...state, ui: { ...state.ui, sidePanelOpen: false } }));
      navigate(element.dataset.route);
    });
  });

  root.querySelectorAll("[data-modal]").forEach((element) => {
    element.addEventListener("click", () => {
      if (element.dataset.modal === "event-form") {
        setState((state) => ({
          ...state,
          ui: {
            ...state.ui,
            draftDate: state.ui.selectedDate,
            draftEndDate: state.ui.selectedDate,
            editEventId: "",
            editEventStartsAt: "",
            editEventEndsAt: "",
            modal: "event-form",
            sidePanelOpen: false,
          },
        }));
        return;
      }
      setModal(element.dataset.modal);
    });
  });

  root.querySelectorAll("[data-close-modal]").forEach((element) => {
    element.addEventListener("click", (event) => {
      const clickedOutsideCard = element.classList.contains("modal-backdrop") && !event.target.closest(".modal-card");
      if (clickedOutsideCard || event.target === element || element.hasAttribute("data-close-button")) closeModal();
    });
  });

  root.querySelectorAll("[data-control]").forEach((element) => {
    element.addEventListener("change", () => {
      setState((state) => ({
        ...state,
        ui: {
          ...state.ui,
          accountFilter: element.dataset.control === "account-filter" ? element.value : state.ui.accountFilter,
          selectedAccountId: element.dataset.control === "selected-account" ? element.value : state.ui.selectedAccountId,
          calendarView: element.dataset.control === "calendar-view" ? element.value : state.ui.calendarView,
        },
      }));
    });
  });

  root.querySelectorAll("[data-toggle-panel]").forEach((element) => {
    element.addEventListener("click", () => {
      setState((state) => ({
        ...state,
        ui: { ...state.ui, sidePanelOpen: state.ui.sidePanelOpen === false },
      }));
    });
  });

  root.querySelectorAll("[data-close-panel]").forEach((element) => {
    element.addEventListener("click", () => {
      setState((state) => ({
        ...state,
        ui: { ...state.ui, sidePanelOpen: false },
      }));
    });
  });

  root.querySelectorAll("[data-action='logout']").forEach((element) => {
    element.addEventListener("click", () => {
      logout();
      navigate("/login");
    });
  });

  root.querySelectorAll("[data-login-form]").forEach((form) => {
    const clearDraft = bindFormDraft(form, { name: "login" });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      button.disabled = true;
      try {
        await loginWithSupabase(Object.fromEntries(new FormData(form).entries()));
        clearDraft();
        navigate("/organization/calendar");
      } catch (error) {
        setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: error.message } } }));
      } finally {
        button.disabled = false;
      }
    });
  });

  root.querySelectorAll("[data-signup-form]").forEach((form) => {
    const clearDraft = bindFormDraft(form, { name: "signup" });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      button.disabled = true;
      try {
        const message = await signupWithSupabase(Object.fromEntries(new FormData(form).entries()));
        clearDraft();
        setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "success", message } } }));
        navigate("/login");
      } catch (error) {
        setState((state) => ({ ...state, ui: { ...state.ui, toast: { type: "error", message: error.message } } }));
      } finally {
        button.disabled = false;
      }
    });
  });

  root.onkeydown = (event) => {
    if (event.key === "Escape" && !event.isComposing) closeModal();
  };

  window.cscSyncReset = resetDevState;
}

export function renderApp(root) {
  if (deferFormRender(root, () => renderApp(root))) return;
  const restoreSidePanelScroll = captureSidePanelScroll(root);
  const currentRoute = route();
  const { session: formSession, ui } = getState();
  const restoreFormView = captureFormView(root, JSON.stringify([
    formSession.accountId, formSession.authenticated, currentRoute, ui.modal,
    ui.editEventId, ui.editBookingId, ui.draftDate, ui.draftEndDate,
    ui.profileEditing, ui.formResetVersion,
  ]), { preserveValues: true });
  root.innerHTML = renderCurrentRoute(currentRoute);
  restoreFormView();
  bindGlobalEvents(root);
  if (root.querySelector(".org-dashboard")) bindOrganizationForms();
  bindSchedulePopupColors(root);
  const { session } = getState();
  mountPersonalRoom(root.querySelector('[data-personal-room]'), {
    accountId: session.accountId, token: session.authenticated ? session.accessToken : '',
    profile: currentAccount,
    request: (path, options) => supabaseRequest(path, options, session.accessToken),
  });
  mountPresidentStatus(root.querySelector('[data-president-status]'), {
    accountId: session.accountId, token: session.authenticated ? session.accessToken : '',
    request: (path, options) => supabaseRequest(path, options, session.accessToken),
  });
  mountAdviserStatus(root.querySelector('[data-adviser-status]'), {
    accountId: session.accountId, token: session.authenticated ? session.accessToken : '',
    request: (path, options) => supabaseRequest(path, options, session.accessToken),
  });
  restoreFormView();
  restoreSidePanelScroll();
  scheduleToastDismiss();
}

function scheduleToastDismiss() {
  const toast = getState().ui.toast;
  const toastKey = toast?.message ? `${toast.type}:${toast.message}` : "";
  if (!toastKey) {
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = null;
    activeToastKey = "";
    return;
  }
  if (toastKey === activeToastKey) return;
  if (toastTimer) window.clearTimeout(toastTimer);
  activeToastKey = toastKey;
  const duration = toast.type === "error" ? 10000 : 3500;
  toastTimer = window.setTimeout(() => {
    setState((state) => ({ ...state, ui: { ...state.ui, toast: null } }));
    toastTimer = null;
    activeToastKey = "";
  }, duration);
}
