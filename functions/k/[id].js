// Serves the khatm page with a link preview (Open Graph) that shows live state, e.g.
// "Khatm in memory of Grandma Amina" / "18 of 30 juz taken · 9 read · 12 still free. Tap to pick a juz, no app or sign-up."
import { phraseLabel } from '../../public/juz.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString('en-US');

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00Z');
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function describe(k, s) {
  const bits = [];
  if (k.kind === 'dhikr') {
    if (s.completed) bits.push(`Target reached: ${fmt(s.total)} ${phraseLabel(k.phrase)} by ${s.people} ${s.people === 1 ? 'person' : 'people'}.`);
    else bits.push(`${fmt(s.total)} of ${fmt(k.target)} ${phraseLabel(k.phrase)} so far, from ${s.people} ${s.people === 1 ? 'person' : 'people'}.`);
    if (k.deadline && !s.completed) bits.push(`Until ${fmtDate(k.deadline)}.`);
    bits.push(s.completed ? 'Start your own group dhikr, free.' : 'Tap to add your count, no app or sign-up.');
    return bits.join(' ');
  }
  if (s.completed) return `Khatm complete: all 30 juz read by ${s.readers} ${s.readers === 1 ? 'person' : 'people'}. Start one for your own family, free.`;
  const free = 30 - s.taken;
  let line = `${s.taken} of 30 juz taken · ${s.done} read`;
  line += free ? ` · ${free} still free.` : '.';
  bits.push(line);
  if (k.deadline) bits.push(`Finish by ${fmtDate(k.deadline)}.`);
  bits.push(free ? 'Tap to pick a juz, no app or sign-up.' : 'Tap to follow along, no app or sign-up.');
  return bits.join(' ');
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new URL('/k', url.origin));
  let html = await page.text();
  let title = 'Khatm Circle · A group Quran khatm in one link';
  let desc = 'Tap to pick a juz and read it with your family or community. No app, no sign-up.';
  try {
    const id = String(params.id || '');
    if (/^[A-Za-z0-9]{6,16}$/.test(id)) {
      const stub = env.KHATM.get(env.KHATM.idFromName('main'));
      const r = await stub.fetch(new Request(`${url.origin}/__preview/${id}`));
      const out = r.ok ? await r.json() : null;
      if (out) {
        title = out.k.round > 1 ? `${out.k.title} · round ${out.k.round}` : out.k.title;
        desc = describe(out.k, out.s);
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
<meta property="og:image" content="${url.origin}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="noindex">`;
  html = html.replace(/<!--META-->[\s\S]*?<!--\/META-->/, meta);
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}
