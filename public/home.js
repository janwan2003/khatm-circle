import { h, api, store, isoIn } from './common.js';
import { PURPOSES, PHRASES } from './juz.js';

const $ = (s) => document.querySelector(s);
let kind = 'quran';
let purpose = 'memorial';
let titleEdited = false;

const HONOREE_LABEL = { memorial: 'In memory of', shifa: 'Who is it for?', ramadan: 'Group name', occasion: 'Who or what is it for?', circle: 'Circle name', general: 'Who is it for?' };
const HONOREE_PH = { memorial: 'e.g. Grandma Amina', shifa: 'e.g. Uncle Yusuf', ramadan: 'e.g. The Rahman family', occasion: 'e.g. Sara and Adam’s wedding', circle: 'e.g. Sisters’ Thursday', general: 'e.g. Our family' };

function autoTitle() {
  const hon = $('#honoree').value.trim();
  if (kind === 'dhikr') {
    const p = $('#phrase').value === 'custom' ? $('#phrase-custom').value.trim() || 'Dhikr' : PHRASES[$('#phrase').value].label;
    return hon ? `${p} for ${hon}` : `Our group ${p}`;
  }
  return PURPOSES[purpose].title(hon);
}
function sync() {
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
  for (const b of document.querySelectorAll('#purposes .chip')) b.setAttribute('aria-pressed', String(b.dataset.p === purpose));
  $('#dhikr-fields').classList.toggle('hidden', kind !== 'dhikr');
  $('#phrase-custom').classList.toggle('hidden', $('#phrase').value !== 'custom');
  $('#honoree-label').textContent = HONOREE_LABEL[purpose];
  $('#honoree').placeholder = HONOREE_PH[purpose];
  if (!titleEdited) $('#title').value = autoTitle();
  for (const b of document.querySelectorAll('#targets .chip')) b.setAttribute('aria-pressed', String(Number(b.dataset.n) === Number($('#target').value)));
  for (const b of document.querySelectorAll('#deadlines .chip')) b.setAttribute('aria-pressed', String(b.dataset.d === $('#deadline').value));
}

function init() {
  for (const [k, p] of Object.entries(PURPOSES))
    $('#purposes').append(h('button', { type: 'button', class: 'chip', 'data-p': k, 'aria-pressed': 'false', onclick: () => { purpose = k; sync(); } }, p.label));
  for (const [k, p] of Object.entries(PHRASES)) $('#phrase').append(h('option', { value: k }, p.label));
  $('#phrase').append(h('option', { value: 'custom' }, 'Something else…'));
  for (const n of [1000, 10000, 100000, 1000000])
    $('#targets').append(h('button', { type: 'button', class: 'chip', 'data-n': n, onclick: () => { $('#target').value = n; sync(); } }, n.toLocaleString('en-US')));
  for (const [label, d] of [['3 days', 3], ['1 week', 7], ['2 weeks', 14], ['30 days', 30]])
    $('#deadlines').append(h('button', { type: 'button', class: 'chip', 'data-d': isoIn(d), onclick: (e) => { const v = e.currentTarget.dataset.d; $('#deadline').value = $('#deadline').value === v ? '' : v; sync(); } }, label));
  $('#deadline').min = isoIn(0);
  for (const b of document.querySelectorAll('.seg button')) b.addEventListener('click', () => { kind = b.dataset.kind; sync(); });
  for (const id of ['#honoree', '#phrase', '#phrase-custom', '#target', '#deadline']) $(id).addEventListener('input', sync);
  $('#title').addEventListener('input', () => { titleEdited = $('#title').value.trim() !== ''; });
  $('#create').addEventListener('submit', submit);
  sync();

  const recent = store.recent().filter((r) => store.get(r.id));
  if (recent.length) {
    $('#recent').classList.remove('hidden');
    for (const r of recent) $('#recent-list').append(h('a', { href: `/k/${r.id}` }, r.title));
  }
}

async function submit(e) {
  e.preventDefault();
  $('#err').textContent = '';
  const name = $('#name').value.trim();
  if (!name) {
    $('#err').textContent = 'Please enter your name.';
    $('#name').focus();
    return;
  }
  const data = { kind, purpose, honoree: $('#honoree').value, title: $('#title').value || autoTitle(), deadline: $('#deadline').value, note: $('#note').value, name };
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
