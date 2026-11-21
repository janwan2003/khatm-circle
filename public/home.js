import { h, api, store, isoIn } from './common.js';
import { PURPOSES, PHRASES, purposeTitle, phraseLabel } from './juz.js';
import { t, useLang, savedLang, browserLang, langPicker } from './lang.js';
import { isLang } from './i18n.js';

const $ = (s) => document.querySelector(s);
let kind = 'quran';
let purpose = 'memorial';
let titleEdited = false;

// The page language comes from the URL (/ar, /tr, ...; the server already translated the static text).
// On the English root, a saved choice or the phone's language sends the visitor to their language's page.
const urlLang = location.pathname.split('/')[1];
const pageLang = isLang(urlLang) ? urlLang : 'en';
const homeOf = (l) => (l === 'en' ? '/' : `/${l}`);
if (pageLang === 'en') {
  const want = savedLang() || browserLang();
  if (want !== 'en') location.replace(homeOf(want) + location.hash);
}

function autoTitle() {
  const hon = $('#honoree').value.trim();
  if (kind === 'dhikr') {
    const p = $('#phrase').value === 'custom' ? $('#phrase-custom').value.trim() || t('title.dhikr.plain') : phraseLabel(t, $('#phrase').value);
    return hon ? t('title.dhikr', { p, h: hon }) : t('title.dhikr.none', { p });
  }
  return purposeTitle(t, purpose, hon);
}
function sync() {
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
  for (const b of document.querySelectorAll('#purposes .chip')) b.setAttribute('aria-pressed', String(b.dataset.p === purpose));
  $('#dhikr-fields').classList.toggle('hidden', kind !== 'dhikr');
  $('#phrase-custom').classList.toggle('hidden', $('#phrase').value !== 'custom');
  $('#honoree-label').textContent = t(`honoree.${purpose}`);
  $('#honoree').placeholder = t(`honoree.ph.${purpose}`);
  if (!titleEdited) $('#title').value = autoTitle();
  for (const b of document.querySelectorAll('#targets .chip')) b.setAttribute('aria-pressed', String(Number(b.dataset.n) === Number($('#target').value)));
  for (const b of document.querySelectorAll('#deadlines .chip')) b.setAttribute('aria-pressed', String(b.dataset.d === $('#deadline').value));
}

async function init() {
  await useLang(pageLang);
  langPicker((l) => location.assign(homeOf(l)));
  for (const k of PURPOSES)
    $('#purposes').append(h('button', { type: 'button', class: 'chip', 'data-p': k, 'aria-pressed': 'false', onclick: () => { purpose = k; sync(); } }, t(`purpose.${k}`)));
  for (const k of Object.keys(PHRASES)) $('#phrase').append(h('option', { value: k }, phraseLabel(t, k)));
  $('#phrase').append(h('option', { value: 'custom' }, t('f.phrase.custom')));
  for (const n of [1000, 10000, 100000, 1000000])
    $('#targets').append(h('button', { type: 'button', class: 'chip', 'data-n': n, onclick: () => { $('#target').value = n; sync(); } }, t.fmt(n)));
  for (const [key, d] of [['chip.3d', 3], ['chip.1w', 7], ['chip.2w', 14], ['chip.30d', 30]])
    $('#deadlines').append(h('button', { type: 'button', class: 'chip', 'data-d': isoIn(d), onclick: (e) => { const v = e.currentTarget.dataset.d; $('#deadline').value = $('#deadline').value === v ? '' : v; sync(); } }, t(key)));
  $('#deadline').min = isoIn(0);
  for (const b of document.querySelectorAll('.seg button')) b.addEventListener('click', () => { kind = b.dataset.kind; sync(); });
  for (const id of ['#honoree', '#phrase', '#phrase-custom', '#target', '#deadline']) $(id).addEventListener('input', sync);
  $('#title').addEventListener('input', () => { titleEdited = $('#title').value.trim() !== ''; });
  $('#create').addEventListener('submit', submit);
  sync();

  const recent = store.recent().filter((r) => store.get(r.id));
  if (recent.length) {
    $('#recent').classList.remove('hidden');
    for (const r of recent) $('#recent-list').append(h('a', { href: `/k/${r.id}`, dir: 'auto' }, r.title));
  }
}

async function submit(e) {
  e.preventDefault();
  $('#err').textContent = '';
  const name = $('#name').value.trim();
  if (!name) {
    $('#err').textContent = t('f.err.name');
    $('#name').focus();
    return;
  }
  const data = { kind, purpose, lang: t.lang, honoree: $('#honoree').value, title: $('#title').value || autoTitle(), deadline: $('#deadline').value, note: $('#note').value, name };
  if (kind === 'dhikr') {
    data.phrase = $('#phrase').value === 'custom' ? $('#phrase-custom').value : $('#phrase').value;
    data.target = Number($('#target').value);
  }
  $('#go').disabled = true;
  try {
    const r = await api('POST', 'k', data);
    store.set(r.id, r.token);
    store.remember(r.id, data.title);
    location.href = `/k/${r.id}#new`;
  } catch (err) {
    $('#err').textContent = err.message;
    $('#go').disabled = false;
  }
}
init();
