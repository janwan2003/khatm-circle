// Translation runtime, shared by the browser, the Pages Functions and the Worker.
// Strings live in public/i18n/<lang>.js (English is the source and the fallback for any missing key).
import EN from './i18n/en.js';

export const LANGS = {
  en: { name: 'English' },
  ar: { name: 'العربية', dir: 'rtl' },
  ur: { name: 'اردو', dir: 'rtl' },
  id: { name: 'Bahasa Indonesia' },
  ms: { name: 'Bahasa Melayu' },
  tr: { name: 'Türkçe' },
  fr: { name: 'Français' },
};
export const isLang = (l) => typeof l === 'string' && Object.prototype.hasOwnProperty.call(LANGS, l);
export const dirOf = (l) => (LANGS[l] && LANGS[l].dir) || 'ltr';
// Western digits everywhere: juz numbers and counts read the same in every group chat.
export const locale = (l) => `${isLang(l) ? l : 'en'}-u-nu-latn`;

// t(key, vars): fills {placeholders}; numbers are formatted for the language. A plural entry is picked by
// vars.count, else vars.n, else the first numeric var. Missing keys fall back to English, then to the key itself.
export function makeT(lang, dict = EN) {
  const pr = new Intl.PluralRules(locale(lang));
  const nf = new Intl.NumberFormat(locale(lang));
  const val = (x) => (x == null ? '' : typeof x === 'number' ? nf.format(x) : String(x));
  const pick = (key, vars) => {
    let v = dict[key] ?? EN[key] ?? key;
    if (typeof v === 'object') {
      // vars.count overrides when {n} is not the counted thing (e.g. a juz number next to a number of days).
      const n = typeof vars.count === 'number' ? vars.count : typeof vars.n === 'number' ? vars.n : Object.values(vars).find((x) => typeof x === 'number');
      v = v[pr.select(n ?? 0)] ?? v.other;
    }
    return v;
  };
  const t = (key, vars = {}) => pick(key, vars).replace(/\{(\w+)\}/g, (_, k) => val(vars[k]));
  // Same, but returns an array where the vars named in `bold` are passed through wrap() (e.g. into <b>).
  t.nodes = (key, vars, bold, wrap) => {
    const tpl = pick(key, vars);
    const out = [];
    let last = 0;
    tpl.replace(/\{(\w+)\}/g, (m, k, i) => {
      out.push(tpl.slice(last, i), bold.includes(k) ? wrap(val(vars[k])) : val(vars[k]));
      last = i + m.length;
      return m;
    });
    out.push(tpl.slice(last));
    return out.filter((x) => x !== '');
  };
  t.lang = isLang(lang) ? lang : 'en';
  t.dir = dirOf(t.lang);
  t.fmt = (n) => nf.format(Number(n || 0));
  t.date = (d, long) => {
    if (!d) return '';
    const dt = new Date(d + 'T12:00:00Z');
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString(t.lang === 'en' ? 'en-GB' : locale(t.lang), { weekday: long ? 'long' : 'short', month: long ? 'long' : 'short', day: 'numeric', timeZone: 'UTC' });
  };
  return t;
}
export const EN_T = makeT('en', EN);

