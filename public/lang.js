// Browser language state: the current t(), the viewer's saved choice, and DOM translation of [data-i18n] elements.
import { makeT, isLang, LANGS, EN_T } from './i18n.js';

export let t = EN_T; // live binding: importers see the language after useLang()
const KEY = 'khatm:lang';
export const savedLang = () => {
  try {
    const l = localStorage.getItem(KEY);
    return isLang(l) ? l : null;
  } catch {
    return null;
  }
};
export const saveLang = (l) => {
  try { localStorage.setItem(KEY, l); } catch {}
};
export function browserLang() {
  for (const x of navigator.languages || [navigator.language || 'en']) {
    const b = String(x).toLowerCase().split('-')[0];
    if (b === 'in') return 'id'; // old code for Indonesian, still sent by some Android browsers
    if (isLang(b)) return b;
  }
  return 'en';
}
export async function useLang(l) {
  if (!isLang(l)) l = 'en';
  t = EN_T;
  if (l !== 'en') {
    try {
      t = makeT(l, (await import(`/i18n/${l}.js`)).default);
    } catch {}
  }
  document.documentElement.lang = t.lang;
  document.documentElement.dir = t.dir;
  translateDom();
  const sel = document.getElementById('lang');
  if (sel) sel.value = t.lang;
  return t;
}
// Same attribute conventions as the server renderer (lib/ssr.js).
export function translateDom(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of root.querySelectorAll('[data-i18n-content]')) el.setAttribute('content', t(el.dataset.i18nContent));
}
// Fills <select id="lang"> and calls onPick(lang) after saving the choice.
export function langPicker(onPick) {
  const sel = document.getElementById('lang');
  if (!sel) return;
  if (!sel.options.length) for (const [k, v] of Object.entries(LANGS)) sel.append(new Option(v.name, k));
  sel.value = t.lang;
  sel.addEventListener('change', () => {
    saveLang(sel.value);
    onPick(sel.value);
  });
}
