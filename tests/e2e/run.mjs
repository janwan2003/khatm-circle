// End-to-end test in real Chromium with separate browser contexts (organiser on desktop, readers on phones).
// Quran mode: create, link preview before/after, join + take a juz, mark read, claim race, organiser adds a juz
// for someone not on the link, organiser frees a juz, live update without reload, copy as a list, personal link
// on a new device, completion card + result card, next round. Dhikr mode: tap counter, quick add with a name,
// target reached, undo. Then delete both khatms. Screenshots at phone and desktop width go to shots/.
// Usage: BASE=http://127.0.0.1:8790 node tests/e2e/run.mjs
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-US" };
const DESKTOP = { viewport: { width: 1280, height: 860 }, locale: "en-US" };
const errors = [];
const browser = await chromium.launch({ executablePath: findChrome() });
const expect409 = new Set(['Bilal']);
let deleted = false;

async function person(label, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (expect409.has(label) && /status of 409/.test(m.text())) return;
    if (deleted && /status of 404/.test(m.text())) return;
    errors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  return { label, ctx, page };
}
const step = (s) => console.log('·', s);
async function shot(p, name) {
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 0, `${name}: page scrolls sideways by ${over}px`);
  await p.screenshot({ path: path.join(SHOTS, name), fullPage: true });
}
const sheet = (p) => p.locator('.sheet');
const tile = (p, n) => p.locator(`.juz[data-juz="${n}"]`);
const toastHas = (p, re) => p.locator('.toast:not(.hidden)', { hasText: re }).waitFor({ timeout: 5000 });
async function og(url) {
  const html = await (await fetch(url)).text();
  return { title: html.match(/og:title" content="([^"]*)"/)[1], desc: html.match(/og:description" content="([^"]*)"/)[1] };
}

try {
  // ---------- create (organiser, desktop) ----------
  const host = await person('Sara', DESKTOP);
  const hp = host.page;
  step('home page renders, defaults to Quran khatm in memory');
  await hp.goto(BASE + '/');
  await shot(hp, 'home-desktop.png');
  assert.equal(await hp.locator('.seg button[data-kind=quran]').getAttribute('aria-pressed'), 'true');
  await hp.getByRole('button', { name: 'Create the link' }).click();
  await hp.locator('#err', { hasText: 'Please enter your name.' }).waitFor();
  await hp.locator('#honoree').fill('Grandma Amina');
  assert.equal(await hp.locator('#title').inputValue(), 'Khatm in memory of Grandma Amina');
  await hp.getByRole('button', { name: '1 week' }).click();
  await hp.locator('#note').fill('Please also make du‘a for her and the family.');
  await hp.locator('#name').fill('Sara');
  await hp.getByRole('button', { name: 'Create the link' }).click();
  await hp.waitForURL(/\/k\/[A-Za-z0-9]+$/);
  const url = hp.url();
  const id = url.split('/').pop();
  await hp.getByRole('heading', { name: 'Your khatm link is ready' }).waitFor();
  await hp.locator('h1', { hasText: 'Khatm in memory of Grandma Amina' }).waitFor();
  assert.match(await hp.locator('.pill').first().innerText(), /Finish by .* in 7 days/);
  assert.equal(await hp.locator('.juz.free').count(), 30);

  step('link preview shows live state');
  let o = await og(url);
  assert.equal(o.title, 'Khatm in memory of Grandma Amina');
  assert.match(o.desc, /^0 of 30 juz taken · 0 read · 30 still free\. Finish by .*\. Tap to pick a juz/);

  // ---------- reader on a phone takes a juz ----------
  const a = await person('Yusuf', PHONE);
  const ap = a.page;
  step('reader opens the link, taps juz 5, types a name, takes it');
  await ap.goto(url);
  await ap.getByText('Tap a free juz to take it. You only need to type your name.').waitFor();
  await tile(ap, 5).click();
  await sheet(ap).getByRole('heading', { name: 'Juz 5' }).waitFor();
  assert.ok(await sheet(ap).getByRole('link', { name: /Quran\.com/ }).getAttribute('href') === 'https://quran.com/juz/5');
  await shot(ap, 'claim-sheet-phone.png');
  await sheet(ap).getByRole('button', { name: 'Take Juz 5' }).click();
  await sheet(ap).locator('.err', { hasText: 'Please type your name first.' }).waitFor();
  await sheet(ap).getByLabel('Your name').fill('Yusuf');
  await sheet(ap).getByRole('button', { name: 'Take Juz 5' }).click();
  await toastHas(ap, 'Juz 5 is yours');
  await ap.locator('.juz.taken.mine[data-juz="5"]').waitFor();
  await ap.locator('.mine-list').getByText('Kullu t-Ta‘am').count().then((c) => assert.equal(c, 0));
  await ap.locator('.mine-list').getByText('Wal-Muhsanat').waitFor();
  await shot(ap, 'khatm-phone-reader.png');

  step('reader takes a second juz, then marks juz 5 read from "Your juz"');
  await tile(ap, 6).click();
  await sheet(ap).getByRole('button', { name: 'Take Juz 6' }).click();
  await toastHas(ap, 'Juz 6 is yours');
  await ap.locator('.mine-list .row', { hasText: 'Wal-Muhsanat' }).getByRole('button', { name: 'I’ve read it' }).click();
  await toastHas(ap, 'Juz 5 marked as read');
  await ap.locator('.juz.done.mine[data-juz="5"]').waitFor();

  step('organiser page updates live without reload');
  await hp.locator('.juz.done[data-juz="5"]', { hasText: 'Yusuf' }).waitFor({ timeout: 16000 });
  await hp.locator('.juz.taken[data-juz="6"]', { hasText: 'Yusuf' }).waitFor({ timeout: 16000 });

  // ---------- claim race ----------
  const b = await person('Bilal', PHONE);
  const bp = b.page;
  step('claim race: second person gets "X just took Juz 7"');
  await bp.goto(url);
  await tile(bp, 7).click();
  await sheet(bp).getByLabel('Your name').fill('Bilal');
  await tile(ap, 7).click();
  await sheet(ap).getByRole('button', { name: 'Take Juz 7' }).click();
  await toastHas(ap, 'Juz 7 is yours');
  await sheet(bp).getByRole('button', { name: 'Take Juz 7' }).click();
  await toastHas(bp, 'Yusuf just took Juz 7');
  await bp.locator('.juz.taken[data-juz="7"]', { hasText: 'Yusuf' }).waitFor();
  assert.equal(await bp.locator('.sheet').count(), 0);
  step('the second person is joined anyway and takes juz 8');
  await tile(bp, 8).click();
  assert.equal(await sheet(bp).getByLabel('Your name').count(), 0);
  await sheet(bp).getByRole('button', { name: 'Take Juz 8' }).click();
  await toastHas(bp, 'Juz 8 is yours');
  step('a reader cannot act on someone else’s juz');
  await tile(bp, 6).click();
  await sheet(bp).getByText('Yusuf is reading this juz').waitFor();
  assert.equal(await sheet(bp).getByRole('button').filter({ hasNotText: '×' }).count(), 0);
  await bp.keyboard.press('Escape');

  step('reader gives a juz back');
  await tile(ap, 7).click();
  await sheet(ap).getByRole('button', { name: /give it back/ }).click();
  await toastHas(ap, 'Juz 7 is free again');
  await ap.locator('.juz.free[data-juz="7"]').waitFor();

  // ---------- organiser tools ----------
  step('organiser adds juz 9 for someone not on the link, already read');
  await hp.reload();
  await tile(hp, 9).click();
  await sheet(hp).getByRole('button', { name: 'Someone not on the link' }).click();
  await sheet(hp).getByLabel('Their name').fill('Aunt Fatima');
  await sheet(hp).getByText('They have already read it').click();
  await sheet(hp).getByRole('button', { name: 'Take Juz 9' }).click();
  await toastHas(hp, 'Juz 9 is down for Aunt Fatima');
  await hp.locator('.juz.done[data-juz="9"]', { hasText: 'Aunt Fatima' }).waitFor();
  step('organiser frees up Yusuf’s juz 6 and marks Bilal’s juz 8 read');
  await tile(hp, 6).click();
  await sheet(hp).getByRole('button', { name: 'Free it up for someone else' }).click();
  await hp.locator('.juz.free[data-juz="6"]').waitFor();
  await tile(hp, 8).click();
  await sheet(hp).getByRole('button', { name: 'Mark as read for Bilal' }).click();
  await hp.locator('.juz.done[data-juz="8"]').waitFor();
  await shot(hp, 'khatm-desktop-organiser.png');

  step('copy as a list for WhatsApp');
  await hp.getByRole('button', { name: 'Copy as a list' }).click();
  await toastHas(hp, 'List copied');
  const list = await hp.evaluate(() => navigator.clipboard.readText());
  assert.match(list, /^\*Khatm in memory of Grandma Amina\*\nFinish by /);
  assert.match(list, /\n5\. Yusuf ✅\n6\. \n/);
  assert.match(list, /\n9\. Aunt Fatima ✅\n/);
  assert.ok(list.includes(url));

  o = await og(url);
  assert.match(o.desc, /^3 of 30 juz taken · 3 read · 27 still free\./);

  step('personal link opens as the same person on a new device');
  await ap.reload();
  await ap.getByRole('button', { name: 'Copy my personal link' }).click();
  const personal = await ap.evaluate(() => navigator.clipboard.readText());
  assert.match(personal, /#k=/);
  const a2 = await person('Yusuf2', PHONE);
  await a2.page.goto(personal);
  await a2.page.getByRole('heading', { name: 'You joined as Yusuf' }).waitFor();
  assert.ok(!a2.page.url().includes('#k='), 'token stripped from the address bar');
  await a2.ctx.close();

  // ---------- completion ----------
  step('fill the rest (organiser, via the API) and see the completion card');
  await hp.evaluate(async (kid) => {
    const tok = localStorage.getItem('khatm:' + kid);
    for (let n = 1; n <= 30; n++) {
      if ([5, 8, 9].includes(n)) continue;
      const r = await fetch(`/api/k/${kid}/claim`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': tok }, body: JSON.stringify({ juz: n, reader: n % 2 ? 'Cousin Ali' : 'Sara', done: true }) });
      if (!r.ok) throw new Error(await r.text());
    }
  }, id);
  await hp.reload();
  await hp.getByRole('heading', { name: 'The khatm is complete' }).waitFor();
  await hp.getByText(/All 30 juz were read by 5 people in one day\./).waitFor();
  await ap.reload();
  await ap.getByRole('heading', { name: 'The khatm is complete' }).waitFor();
  await ap.getByRole('link', { name: 'Start a khatm for your family' }).waitFor();
  assert.equal(await ap.getByRole('button', { name: /Start round 2/ }).count(), 0, 'only the organiser starts a round');
  await shot(ap, 'complete-phone.png');
  o = await og(url);
  assert.match(o.desc, /^Khatm complete: all 30 juz read by 5 people\. Start one for your own family/);
  step('result card');
  await ap.getByRole('button', { name: 'Share the good news' }).click();
  await sheet(ap).locator('img[alt="Result card"]').waitFor();
  const w = await sheet(ap).locator('img').evaluate((img) => new Promise((r) => (img.complete ? r(img.naturalWidth) : (img.onload = () => r(img.naturalWidth)))));
  assert.equal(w, 1080);
  await shot(ap, 'result-card-phone.png');
  await ap.keyboard.press('Escape');

  step('organiser starts round 2 on the same link');
  await hp.getByRole('button', { name: 'Start round 2 on this link' }).click();
  await sheet(hp).getByRole('button', { name: 'Start the next round' }).click();
  await toastHas(hp, 'Round 2 has started');
  assert.equal(await hp.locator('.juz.free').count(), 30);
  await hp.getByText(/Round 1: completed .* by 5 people/).waitFor();
  await hp.locator('.kicker', { hasText: 'round 2' }).waitFor();
  o = await og(url);
  assert.equal(o.title, 'Khatm in memory of Grandma Amina · round 2');

  // ---------- dhikr ----------
  step('dhikr: create a salawat counter with a target of 1,000');
  await hp.goto(BASE + '/');
  await hp.locator('.seg button[data-kind=dhikr]').click();
  await hp.getByRole('button', { name: 'For someone who is ill' }).click();
  await hp.locator('#honoree').fill('Uncle Hamza');
  await hp.getByRole('button', { name: '1,000', exact: true }).click();
  assert.equal(await hp.locator('#title').inputValue(), 'Salawat on the Prophet ﷺ for Uncle Hamza');
  await hp.locator('#name').fill('Sara');
  await hp.getByRole('button', { name: 'Create the link' }).click();
  await hp.waitForURL(/\/k\/[A-Za-z0-9]+$/);
  const durl = hp.url();
  await hp.locator('.total', { hasText: /^0$/ }).waitFor();
  step('organiser taps 5 times and adds them');
  for (let i = 0; i < 5; i++) await hp.getByRole('button', { name: 'Count one' }).click();
  await hp.getByRole('button', { name: 'Add 5 to the total' }).click();
  await toastHas(hp, 'Added 5');
  await hp.locator('.total', { hasText: /^5$/ }).waitFor();
  const c = await person('Maryam', PHONE);
  step('reader on a phone adds +1,000 with a name: target reached');
  await c.page.goto(durl);
  await c.page.getByRole('button', { name: '+1,000' }).click();
  await sheet(c.page).getByLabel('Your name').fill('Maryam');
  await sheet(c.page).getByRole('button', { name: 'Add to the total' }).click();
  await toastHas(c.page, 'Added 1,000');
  await c.page.getByRole('heading', { name: 'Target reached' }).waitFor();
  await c.page.getByText(/1,005 Salawat on the Prophet ﷺ by 2 people in one day/).waitFor();
  await shot(c.page, 'dhikr-complete-phone.png');
  o = await og(durl);
  assert.match(o.desc, /^Target reached: 1,005 Salawat on the Prophet ﷺ by 2 people\./);

  // ---------- delete ----------
  step('organiser deletes both khatms; readers see "gone"');
  for (const u of [durl, url]) {
    await hp.goto(u);
    await hp.getByRole('button', { name: 'Edit or delete' }).click();
    hp.once('dialog', (d) => d.accept());
    deleted = true;
    await sheet(hp).getByRole('button', { name: 'Delete this khatm' }).click();
    await hp.getByRole('heading', { name: 'This khatm is gone' }).waitFor();
  }
  await bp.reload();
  await bp.getByRole('heading', { name: 'This khatm is gone' }).waitFor();
  const r404 = await fetch(`${BASE}/api/k/${id}`);
  assert.equal(r404.status, 404);

  step('home page at phone width');
  const v = await person('Visitor', PHONE);
  await v.page.goto(BASE + '/');
  await shot(v.page, 'home-phone.png');
  await v.page.goto(BASE + '/privacy');
  await v.page.getByRole('heading', { name: 'Privacy' }).waitFor();

  assert.equal(await hp.locator('main').getByText('null', { exact: true }).count(), 0);
  assert.deepEqual(errors, [], 'no console errors');
  console.log('\nPASS');
} catch (e) {
  console.error('\nFAIL', e);
  if (errors.length) console.error('console errors:', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
