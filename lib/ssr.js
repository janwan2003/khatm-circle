// Server-side translation for the Pages Functions: all dictionaries, and an HTMLRewriter pass that fills the
// same [data-i18n*] attributes as public/lang.js, so a page arrives already in its language (good for search
// engines and slow phones).
import { makeT, isLang, LANGS } from '../public/i18n.js';
import en from '../public/i18n/en.js';
import ar from '../public/i18n/ar.js';
import ur from '../public/i18n/ur.js';
import id from '../public/i18n/id.js';
import ms from '../public/i18n/ms.js';
import tr from '../public/i18n/tr.js';
import fr from '../public/i18n/fr.js';

export const DICTS = { en, ar, ur, id, ms, tr, fr };
export const tFor = (l) => makeT(isLang(l) ? l : 'en', DICTS[isLang(l) ? l : 'en']);
export { LANGS, isLang };

export function localize(res, t, extra = {}) {
  let rw = new HTMLRewriter()
    .on('html', { element: (el) => { el.setAttribute('lang', t.lang); el.setAttribute('dir', t.dir); } })
    .on('[data-i18n]', { element: (el) => el.setInnerContent(t(el.getAttribute('data-i18n'))) })
    .on('[data-i18n-ph]', { element: (el) => el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))) })
    .on('[data-i18n-aria]', { element: (el) => el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))) })
    .on('[data-i18n-content]', { element: (el) => el.setAttribute('content', t(el.getAttribute('data-i18n-content'))) })
    .on(`#lang option[value="${t.lang}"]`, { element: (el) => el.setAttribute('selected', '') });
  for (const [sel, fn] of Object.entries(extra)) rw = rw.on(sel, { element: fn });
  return rw.transform(res);
}

// Pages' _headers file applies to static assets only, so Function responses set the same headers themselves.
export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
