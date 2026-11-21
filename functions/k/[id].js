// Serves the khatm page in the khatm's language, with a link preview (Open Graph) that shows live state, e.g.
// "Khatm in memory of Grandma Amina" / "18 of 30 juz taken · 9 read · 12 still free. Tap to pick a juz, no app or sign-up."
import { phraseLabel } from '../../public/juz.js';
import { tFor, localize, SECURITY_HEADERS } from '../../lib/ssr.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function describe(k, s, t = tFor('en')) {
  const bits = [];
  const phrase = phraseLabel(t, k.phrase);
  if (k.kind === 'dhikr') {
    if (s.completed) bits.push(t('pv.dhikr.done', { n: s.people, total: s.total, phrase }));
    else bits.push(t('pv.dhikr', { n: s.people, total: s.total, target: k.target, phrase }));
    if (k.deadline && !s.completed) bits.push(t('pv.until', { date: t.date(k.deadline) }));
    bits.push(t(s.completed ? 'pv.dhikr.cta.done' : 'pv.dhikr.cta'));
    return bits.join(' ');
  }
  if (s.completed) return t('pv.complete', { n: s.readers });
  const free = 30 - s.taken;
  bits.push(t(free ? 'pv.quran' : 'pv.quran.full', { taken: s.taken, done: s.done, free }));
  if (k.deadline) bits.push(t('pv.finishBy', { date: t.date(k.deadline) }));
  bits.push(t(free ? 'pv.cta.free' : 'pv.cta.follow'));
  return bits.join(' ');
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new URL('/k', url.origin));
  let t = tFor('en');
  let title = t('pv.title');
  let desc = t('pv.desc');
  try {
    const id = String(params.id || '');
    if (/^[A-Za-z0-9]{6,16}$/.test(id)) {
      const stub = env.KHATM.get(env.KHATM.idFromName('main'));
      const r = await stub.fetch(new Request(`${url.origin}/__preview/${id}`));
      const out = r.ok ? await r.json() : null;
      if (out) {
        t = tFor(out.k.lang);
        title = out.k.round > 1 ? t('pv.round', { title: out.k.title, n: out.k.round }) : out.k.title;
        desc = describe(out.k, out.s, t);
      }
    }
  } catch (e) {
    console.error(e);
  }
  const canonical = `${url.origin}${url.pathname}`;
  const meta = `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Khatm Circle">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:locale" content="${t.lang}">
<meta property="og:image" content="${url.origin}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">`;
  const html = (await page.text()).replace(/<!--META-->[\s\S]*?<!--\/META-->/, meta);
  const res = localize(new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }), t);
  return new Response(res.body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY_HEADERS } });
}
