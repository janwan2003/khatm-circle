// End-to-end test of the languages in real Chromium.
// - Every language home page (/ar, /ur, /id, /ms, /tr, /fr): served translated by the server, right lang/dir, canonical,
//   no sideways scroll at phone width, screenshot per language.
// - An Arabic phone opening / is sent to /ar; creating there makes an Arabic khatm (Arabic title, RTL page, Arabic link
//   preview). A reader whose phone is in English sees the khatm in Arabic; a reader whose phone is in Urdu sees Urdu.
// - API errors arrive translated (claim race in Arabic). The language picker switches the khatm page to French and the
//   choice survives a reload. A Turkish dhikr khatm shows a Turkish preview.
// - Zero console errors. Deletes every khatm it made.
// Usage: BASE=http://127.0.0.1:8790 node tests/e2e/i18n.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tFor } from '../../lib/ssr.js';
import { describe } from '../../functions/k/[id].js';
import { purposeTitle } from '../../public/juz.js';

const BASE = process.env.BASE || 'http://127.0.0.1:8790';
const SHOTS = process.env.SHOTS || 'shots';
fs.mkdirSync(SHOTS, { recursive: true });
function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const root = path.join(os.homedir(), '.cache/ms-playwright');
  for (const d of fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    const p = path.join(root, d, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
const phone = (locale) => ({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale });
const errors = [];
const made = []; // [id, token] to delete at the end
const browser = await chromium.launch({ executablePath: findChrome() });
const step = (s) => console.log('·', s);
async function person(label, opts, allow409 = false) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && !(allow409 && /status of 409/.test(m.text())) && errors.push(`${label}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  return page;
}
async function shot(p, name) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `${name}: page scrolls sideways by ${over}px`);
  await p.screenshot({ path: path.join(SHOTS, name), fullPage: true });
}
const meta = (html, prop) => (html.match(new RegExp(`property="${prop}"[^>]*? content="([^"]*)"`)) || [])[1];
const unesc = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

try {
  for (const l of ['ar', 'ur', 'id', 'ms', 'tr', 'fr']) {
    const t = tFor(l);
    step(`/${l}: server-translated home page`);
    const res = await fetch(`${BASE}/${l}`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-security-policy'), `/${l} has a CSP`);
    const html = await res.text();
    assert.match(html, new RegExp(`<html lang="${l}" dir="${t.dir}"`));
    assert.ok(html.includes(`<link rel="canonical" href="${BASE}/${l}">`), `/${l} canonical`);
    assert.ok(unesc(html).includes(t('hero.h1')), `/${l} h1 in the page source`);
    assert.equal(unesc(meta(html, 'og:description')), t('og.desc'));
    const p = await person(`home-${l}`, phone('en-US'));
    await p.goto(`${BASE}/${l}`);
    await p.locator('#purposes .chip').first().waitFor();
    assert.equal(await p.locator('h1').textContent(), t('hero.h1'));
    assert.equal(await p.locator('#purposes .chip').first().textContent(), t('purpose.memorial'));
    assert.equal(await p.locator('#title').inputValue(), t('title.memorial.none'));
    assert.equal(await p.locator('#lang').inputValue(), l);
    await shot(p, `home-${l}-phone.png`);
    await p.context().close();
  }

  step('an Arabic phone opening / goes to /ar and creates an Arabic khatm');
  const ar = tFor('ar');
  const hp = await person('organiser-ar', phone('ar'));
  await hp.goto(BASE + '/');
  await hp.waitForURL(/\/ar$/);
  assert.equal(await hp.evaluate(() => document.documentElement.dir), 'rtl');
  await hp.locator('#honoree').fill('أمينة');
  assert.equal(await hp.locator('#title').inputValue(), purposeTitle(ar, 'memorial', 'أمينة'));
  await hp.getByRole('button', { name: ar('f.submit') }).click();
  await hp.locator('#err', { hasText: ar('f.err.name') }).waitFor();
  await hp.locator('#name').fill('سارة');
  await hp.getByRole('button', { name: ar('f.submit') }).click();
  await hp.waitForURL(/\/k\/[A-Za-z0-9]+$/);
  const id = hp.url().split('/').pop();
  made.push([id, await hp.evaluate((id) => localStorage.getItem(`khatm:${id}`), id)]);
  await hp.getByRole('heading', { name: ar('new.h') }).waitFor();
  assert.equal(await hp.locator('h2', { hasText: ar('grid.h') }).count(), 1);
  assert.equal(await hp.evaluate(() => [document.documentElement.lang, document.documentElement.dir].join()), 'ar,rtl');
  await shot(hp, 'khatm-ar-phone.png');

  step('Arabic link preview');
  let html = await (await fetch(`${BASE}/k/${id}`)).text();
  assert.match(html, /<html lang="ar" dir="rtl"/);
  assert.equal(unesc(meta(html, 'og:title')), purposeTitle(ar, 'memorial', 'أمينة'));
  assert.equal(unesc(meta(html, 'og:description')), describe({ kind: 'quran', deadline: '' }, { taken: 0, done: 0, readers: 0, completed: false }, ar));

  step('reader with an English phone sees the khatm in Arabic and takes juz 1');
  const rp = await person('reader-en', phone('en-US'), true);
  await rp.goto(`${BASE}/k/${id}`);
  await rp.locator('.juz[data-juz="1"]').click();
  await rp.locator('.sheet h2', { hasText: ar('juz.n', { n: 1 }) }).waitFor();
  assert.ok((await rp.locator('.sheet').textContent()).includes('الفاتحة 1'), 'juz start in Arabic script');
  await rp.locator('#your-name').fill('Yusuf');
  await rp.getByRole('button', { name: ar('juz.take', { n: 1 }) }).click();
  await rp.locator('.toast:not(.hidden)', { hasText: ar('juz.ok.mine', { n: 1 }) }).waitFor();
  await shot(rp, 'khatm-ar-reader-phone.png');

  step('claim race: the API error arrives in Arabic');
  await rp.locator('.juz[data-juz="2"]').click();
  await rp.locator('.sheet h2', { hasText: ar('juz.n', { n: 2 }) }).waitFor();
  await hp.evaluate(async (id) => {
    const r = await fetch(`/api/k/${id}/claim`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': localStorage.getItem(`khatm:${id}`) }, body: JSON.stringify({ juz: 2 }) });
    if (!r.ok) throw new Error('claim failed ' + r.status);
  }, id);
  await rp.getByRole('button', { name: ar('juz.take', { n: 2 }) }).click();
  await rp.locator('.toast:not(.hidden)', { hasText: ar('err.taken', { name: 'سارة', n: 2 }) }).waitFor();

  step('a reader whose phone is in Urdu sees Urdu');
  const ur = tFor('ur');
  const up = await person('reader-ur', phone('ur-PK'));
  await up.goto(`${BASE}/k/${id}`);
  await up.locator('h2', { hasText: ur('grid.h') }).waitFor();
  assert.equal(await up.evaluate(() => document.documentElement.dir), 'rtl');
  assert.equal(await up.locator('.juz[data-juz="3"] .who').textContent(), ur('grid.free'));
  await shot(up, 'khatm-ur-phone.png');

  step('language picker switches to French and the choice survives a reload');
  const fr = tFor('fr');
  await up.locator('#lang').selectOption('fr');
  await up.locator('h2', { hasText: fr('grid.h') }).waitFor();
  assert.equal(await up.evaluate(() => [document.documentElement.lang, document.documentElement.dir].join()), 'fr,ltr');
  assert.equal(await up.locator('footer span').textContent(), fr('foot.khatm'));
  await up.reload();
  await up.locator('h2', { hasText: fr('grid.h') }).waitFor();
  assert.equal(await up.locator('#own').getAttribute('href'), '/fr');

  step('Turkish dhikr khatm: Turkish title and preview');
  const tr = tFor('tr');
  const tp = await person('organiser-tr', phone('tr-TR'));
  await tp.goto(BASE + '/');
  await tp.waitForURL(/\/tr$/);
  await tp.locator('.seg button[data-kind=dhikr]').click();
  await tp.locator('#target').fill('1000');
  await tp.locator('#name').fill('Ayşe');
  const trTitle = await tp.locator('#title').inputValue();
  assert.equal(trTitle, tr('title.dhikr.none', { p: tr('phrase.salawat') }));
  await tp.getByRole('button', { name: tr('f.submit') }).click();
  await tp.waitForURL(/\/k\/[A-Za-z0-9]+$/);
  const tid = tp.url().split('/').pop();
  made.push([tid, await tp.evaluate((id) => localStorage.getItem(`khatm:${id}`), tid)]);
  await tp.locator('.tap').waitFor();
  await shot(tp, 'dhikr-tr-phone.png');
  html = await (await fetch(`${BASE}/k/${tid}`)).text();
  assert.equal(unesc(meta(html, 'og:description')), describe({ kind: 'dhikr', phrase: 'salawat', target: 1000, deadline: '' }, { total: 0, people: 0, completed: false }, tr));

  assert.deepEqual(errors, [], 'console errors');
  console.log('PASS i18n e2e');
} finally {
  for (const [kid, tok] of made) await fetch(`${BASE}/api/k/${kid}`, { method: 'DELETE', headers: { 'x-token': tok || '' } }).catch(() => {});
  await browser.close();
}
