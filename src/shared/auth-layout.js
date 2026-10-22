export function renderAuthPage({ admin = false, signup = false, content, assetBase = './src/assets/' }) {
  const role = admin ? 'Administrator' : 'Organization';
  return `<main class="auth-page ${signup ? 'auth-page-signup' : ''}">
    <header class="auth-topbar"><div class="auth-brand"><img class="auth-brand-logo" src="${assetBase}csc-logo.png" alt="Central Student Council logo"><div><strong>CSC S.Y.N.C.</strong><small>Systemized Year-round Network Calendar</small></div></div><span class="auth-portal-label">${role} portal</span></header>
    <div class="auth-content"><section class="auth-hero" aria-label="CSC SYNC account access">
      <section class="auth-story"><span class="auth-eyebrow">THE CENTRAL STUDENT COUNCIL</span>
        <h1>Every schedule.<br>One connected campus.</h1>
        <p>A shared space to plan activities, coordinate schedules, and keep our university community connected.</p>
        <div class="auth-large-flame"><img src="${assetBase}csc-logo.png" alt="" aria-hidden="true"></div>
        <span class="auth-story-tagline">PLAN TOGETHER. STAY IN SYNC.</span>
      </section>
      <section class="login-card auth-card ${signup ? 'auth-signup-card' : ''}">
        <div class="auth-card-icon"><img src="${assetBase}csc-logo.png" alt=""></div>
        <span class="auth-eyebrow">${role.toUpperCase()} ${signup ? 'REGISTRATION' : 'ACCESS'}</span>
        <h2>${signup ? 'Create your account.' : 'Welcome back.'}</h2>
        <p class="auth-card-intro">${signup ? admin ? 'Register your CSC Council account. An existing administrator will review your request.' : 'Register your organization to start planning and coordinating university activities.' : admin ? 'Sign in to manage schedules, bookings, and your university community.' : 'Sign in to plan your organization’s activities and manage your schedules.'}</p>
        ${content}
      </section>
    </section><p class="auth-footer">Central Student Council · CSC S.Y.N.C.</p></div>
  </main>`;
}
