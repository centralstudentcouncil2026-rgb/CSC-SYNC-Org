import { messengerHref, phoneHref } from './contact-links.js?v=20261022-messenger';
import { escapeHtml } from './ui.js';

export function renderOrganizerContact(owner, kind, id) {
  const phone = phoneHref(owner?.phone);
  const messenger = messengerHref(owner?.messengerUrl);
  return `<section class="organizer-contact" aria-label="Contact organizer" data-organizer-kind="${escapeHtml(kind)}" data-organizer-id="${escapeHtml(id)}">
    <strong>Contact Organizer</strong>
    <div class="organizer-contact-links">
      ${phone ? `<a class="white-pill" href="${escapeHtml(phone)}">Phone</a>` : ''}
      ${messenger ? `<a class="blue-pill" href="${escapeHtml(messenger)}" target="_blank" rel="noopener noreferrer">Messenger</a>` : ''}
      ${!phone && !messenger ? '<span class="field-note">No contact details provided.</span>' : ''}
    </div>
  </section>`;
}

// Update only this contact section, preserving modal scroll and form focus.
export function mountOrganizerContacts(root, request) {
  root.querySelectorAll('[data-organizer-id]').forEach(section => {
    const load = async () => {
      try {
        const result = await request('/rpc/schedule_organizer_contact', {
          method: 'POST', body: JSON.stringify({ p_kind: section.dataset.organizerKind, p_id: section.dataset.organizerId }),
        });
        if (!section.isConnected) return;
        if (result && result.schedule_id !== section.dataset.organizerId) throw new Error('Contact unavailable.');
        const owner = result ? { phone: result.phone, messengerUrl: result.messenger_url } : null;
        const template = document.createElement('template');
        template.innerHTML = renderOrganizerContact(owner, section.dataset.organizerKind, section.dataset.organizerId);
        section.querySelector('.organizer-contact-links').replaceChildren(...template.content.querySelector('.organizer-contact-links').childNodes);
      } catch {
        if (!section.isConnected || section.querySelector('a')) return;
        const links = section.querySelector('.organizer-contact-links');
        links.innerHTML = '<span class="field-note">Contact details could not be loaded.</span><button type="button" class="white-pill">Retry</button>';
        links.querySelector('button').onclick = load;
      }
    };
    void load();
  });
}
