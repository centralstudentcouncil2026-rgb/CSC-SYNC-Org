export function normalizeMessengerLink(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let url;
  try { url = new URL(text); } catch { throw new Error('Enter a Messenger link such as https://m.me/your.username.'); }
  if (text.length > 500 || url.href.length > 500 || url.protocol !== 'https:' || url.username || url.password || url.port ||
    !['m.me', 'www.m.me', 'messenger.com', 'www.messenger.com'].includes(url.hostname) ||
    !url.pathname.replaceAll('/', '')) {
    throw new Error('Use an HTTPS m.me or messenger.com link to your Messenger account.');
  }
  return url.href;
}

export function messengerHref(value) {
  try { return normalizeMessengerLink(value); } catch { return ''; }
}

export function phoneHref(value) {
  const phone = String(value || '').replace(/[\s().-]/g, '');
  return /^\+?\d{6,15}$/.test(phone) ? `tel:${phone}` : '';
}
