// The home page in one language, served at /ar, /ur, /id, /ms, /tr and /fr (English stays the static /).
import { tFor, localize, SECURITY_HEADERS } from './ssr.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const lang = url.pathname.split('/')[1];
  const t = tFor(lang);
  const self = `${url.origin}/${t.lang}`;
  const page = await env.ASSETS.fetch(new URL('/', url.origin));
  const out = localize(page, t, {
    'link[rel="canonical"]': (el) => el.setAttribute('href', self),
    'meta[property="og:url"]': (el) => el.setAttribute('content', self),
  });
  return new Response(out.body, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300', ...SECURITY_HEADERS },
  });
}
