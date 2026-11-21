// The khatm page: a 30-juz grid (Quran mode) or a shared counter (dhikr mode).
import { h, api, store, toast, copyText, fmtDate, fmt, ago, daysUntil, isoIn } from './common.js';
import { JUZ, PHRASES, phraseLabel, juzName, juzStart, STALE_DAYS } from './juz.js';
import { t, useLang, savedLang, browserLang, langPicker } from './lang.js';

const app = document.getElementById('app');
const id = location.pathname.split('/')[2] || '';
let token = store.get(id);
let S = null; // last state from the API
let version = 0;
let isNew = false;
let busy = false;
let langReady = false; // the server rendered the static text in the khatm's language; apply the viewer's once

// Personal link (#k=token) restores identity on a new device; #new marks a freshly created khatm.
(function readHash() {
  const m = location.hash.match(/k=([A-Za-z0-9_-]{20,})/);
  if (m) {
    token = m[1];
    store.set(id, token);
  }
  if (/new/.test(location.hash)) isNew = true;
  if (location.hash) history.replaceState(null, '', location.pathname);
})();

const link = () => `${location.origin}/k/${id}`;
const personalLink = () => `${location.origin}/k/${id}#k=${token}`;
const quranUrl = (n) => `https://quran.com/juz/${n}`;
const DAY = 86400000;
// "Start your own" goes to the home page in the language this page is shown in.
const homeLink = () => (t.lang === 'en' ? '/' : `/${t.lang}`);
// A translated line where the count {n} is bold, e.g. "<b>12</b> read".
const bold = (key, n) => t.nodes(key, { n }, ['n'], (v) => h('b', {}, v));

async function load() {
  try {
    S = await api('GET', `k/${id}`, undefined, token);
    version = S.khatm.updated_at;
    // Language: the viewer's saved choice, else their phone's language unless it is English (many people keep
    // phones in English), else the language the organiser created the khatm in.
    const phone = browserLang();
    const want = savedLang() || (phone !== 'en' ? phone : S.khatm.lang || 'en');
    if (want !== t.lang || !langReady) await useLang(want);
    langReady = true;
    if (token && !S.me) token = null; // stale token (e.g. removed) - act as a visitor
    if (S.me) store.remember(id, S.khatm.title);
    document.title = `${S.khatm.title} · Khatm Circle`;
    for (const a of document.querySelectorAll('a.brand, #own')) a.href = homeLink();
    render();
  } catch (e) {
    if (e.status === 404) return gone();
    if (!S) app.replaceChildren(h('div', { class: 'card center' }, h('p', {}, e.message), h('button', { class: 'btn btn-primary', onclick: load }, t('k.retry'))));
    else toast(e.message);
  }
}
function gone() {
  store.drop(id);
  app.replaceChildren(
    h('div', { class: 'card center', style: 'margin-top:30px' }, h('h2', {}, t('k.gone.h')), h('p', { class: 'muted' }, t('k.gone.p')), h('a', { class: 'btn btn-primary', href: '/' }, t('k.gone.cta')))
  );
}

// ---------- shared pieces ----------
const roundInfo = () => S.rounds.find((r) => r.round === S.khatm.round) || { started_at: S.khatm.created_at };
const completed = () => !!roundInfo().completed_at;
function stats() {
  const done = S.parts.filter((p) => p.done_at).length;
  const taken = S.parts.length;
  const readers = new Set(S.parts.map((p) => p.reader)).size;
  return { done, taken, free: 30 - taken, readers };
}
function deadlinePill() {
  const d = S.khatm.deadline;
  if (!d || completed()) return null;
  const left = daysUntil(d);
  const when = left === 0 ? t('when.today') : left === 1 ? t('when.tomorrow') : left < 0 ? t('when.ago', { n: -left }) : t('when.in', { n: left });
  return h('span', { class: 'pill' + (left <= 1 ? ' warn' : '') }, t(S.khatm.kind === 'dhikr' ? 'pill.until' : 'pill.finishBy', { date: fmtDate(d), when }));
}
function header() {
  const k = S.khatm;
  const bits = [t(k.kind === 'dhikr' ? 'kicker.dhikr' : 'kicker.quran')];
  if (['memorial', 'shifa', 'ramadan'].includes(k.purpose)) bits.push(t(`kicker.${k.purpose}`));
  if (k.round > 1) bits.push(t('kicker.round', { n: k.round }));
  const kicker = bits.join(' · ');
  return h(
    'section',
    { class: 'head' },
    h('div', { class: 'kicker' }, kicker),
    h('h1', { dir: 'auto' }, k.title),
    k.note ? h('p', { class: 'note', dir: 'auto' }, k.note) : null,
    h('div', { class: 'meta' }, deadlinePill(), h('span', { class: 'pill' }, t('pill.joined', { n: S.members })))
  );
}
function shareText() {
  const k = S.khatm;
  if (k.kind === 'dhikr') return `${k.title}\n${t('share.dhikr', { total: S.total, target: k.target, phrase: phraseLabel(t, k.phrase) })}`;
  const st = stats();
  if (completed()) return `${k.title}\n${t('share.complete')}`;
  return `${k.title}\n${k.deadline ? t('share.quran.dl', { n: st.free, date: fmtDate(k.deadline) }) : t('share.quran', { n: st.free })}`;
}
async function shareLink() {
  const text = shareText();
  const url = completed() ? `${location.origin}/` : link();
  if (navigator.share) {
    try {
      await navigator.share({ title: S.khatm.title, text, url });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  if (await copyText(`${text} ${url}`)) toast(t('toast.linkGroup'));
}
function whatsappList() {
  const k = S.khatm;
  const by = new Map(S.parts.map((p) => [p.juz, p]));
  const lines = [`*${k.title}*`];
  if (k.deadline) lines.push(t('list.finishBy', { date: fmtDate(k.deadline, true) }));
  lines.push(t('list.take', { url: link() }), '');
  for (const j of JUZ) {
    const p = by.get(j.n);
    lines.push(`${j.n}. ${p ? p.reader + (p.done_at ? ' ✅' : '') : ''}`);
  }
  return lines.join('\n');
}

// ---------- sheet ----------
let closeSheet = null;
function sheet(title, ...content) {
  if (closeSheet) closeSheet();
  const back = h('div', { class: 'backdrop' });
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : t('k.details') });
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', esc);
    closeSheet = null;
  };
  const esc = (e) => e.key === 'Escape' && close();
  box.append(h('button', { class: 'x', 'aria-label': t('k.close'), onclick: close }, '×'), ...content);
  back.append(box);
  back.addEventListener('click', (e) => e.target === back && close());
  document.addEventListener('keydown', esc);
  document.body.append(back);
  closeSheet = close;
  const f = box.querySelector('input[type=text]:not([disabled])');
  if (f && !f.value) setTimeout(() => f.focus(), 50);
  return { box, close };
}
async function act(path, data, okMsg) {
  if (busy) return false;
  busy = true;
  try {
    S = await api('POST', `k/${id}/${path}`, data, token);
    version = S.khatm.updated_at;
    if (closeSheet) closeSheet();
    render();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    if (e.status === 409) {
      if (closeSheet) closeSheet();
      toast(e.message);
      await load();
    } else if (e.status === 404) gone();
    else toast(e.message);
    return false;
  } finally {
    busy = false;
  }
}
async function ensureJoined(nameInput, err) {
  if (token && S.me) return true;
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    err.textContent = t('juz.err.name');
    if (nameInput) nameInput.focus();
    return false;
  }
  try {
    const r = await api('POST', `k/${id}/join`, { name });
    token = r.token;
    store.set(id, token);
    store.remember(id, S.khatm.title);
    return true;
  } catch (e) {
    err.textContent = e.message;
    return false;
  }
}
const nameField = () => (S.me ? null : h('input', { type: 'text', id: 'your-name', maxlength: '40', autocomplete: 'given-name', placeholder: t('juz.yourName') }));

function juzHead(j) {
  return [
    h('div', { class: 'juzhead' }, h('h2', { style: 'margin:0' }, t('juz.n', { n: j.n })), h('span', { class: 'ar', lang: 'ar' }, j.ar)),
    h('p', { class: 'muted', style: 'margin:4px 0 0' }, t('juz.starts', { name: juzName(j, t.lang), start: juzStart(j, t.lang) })),
    h('p', { style: 'margin:6px 0 0' }, h('a', { href: quranUrl(j.n), target: '_blank', rel: 'noopener' }, t('juz.quran', { n: j.n }))),
  ];
}

function openJuz(n) {
  const j = JUZ[n - 1];
  const p = S.parts.find((x) => x.juz === n);
  const host = S.me && S.me.is_host;
  const err = h('p', { class: 'err', role: 'alert' });
  if (completed()) return sheet(t('juz.n', { n }), ...juzHead(j), h('p', { style: 'margin-top:14px' }, p ? t('juz.readBy', { name: p.reader }) : ''));
  if (!p) {
    const nm = nameField();
    let forOther = false;
    const other = h('input', { type: 'text', maxlength: '40', placeholder: t('juz.their'), class: 'hidden', 'aria-label': t('juz.their') });
    const already = h('input', { type: 'checkbox', id: 'already' });
    const alreadyRow = h('label', { class: 'hidden', style: 'font-weight:500;display:flex;gap:8px;align-items:center' }, already, t('juz.already'));
    const whoChips = host
      ? h(
          'div',
          {},
          h('label', {}, t('juz.who')),
          h(
            'div',
            { class: 'chips', role: 'group' },
            h('button', { type: 'button', class: 'chip', 'aria-pressed': 'true', onclick: (e) => setWho(false, e) }, t('juz.who.me')),
            h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: (e) => setWho(true, e) }, t('juz.who.other'))
          ),
          other,
          alreadyRow
        )
      : null;
    function setWho(v, e) {
      forOther = v;
      for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      other.classList.toggle('hidden', !v);
      alreadyRow.classList.toggle('hidden', !v);
      if (v) other.focus();
    }
    const go = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, t('juz.take', { n }));
    const form = h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          if (forOther && !other.value.trim()) {
            err.textContent = t('juz.err.their');
            return other.focus();
          }
          go.disabled = true;
          if (!(await ensureJoined(nm, err))) return (go.disabled = false);
          const data = { juz: n };
          if (forOther) Object.assign(data, { reader: other.value.trim(), done: already.checked });
          const ok = await act('claim', data, forOther ? t('juz.ok.other', { n, name: other.value.trim() }) : t('juz.ok.mine', { n }));
          if (!ok) go.disabled = false;
        },
      },
      nm ? [h('label', { for: 'your-name' }, t('juz.yourName')), nm, h('p', { class: 'hint' }, t('juz.yourName.hint'))] : null,
      whoChips,
      err,
      h('div', { class: 'stack' }, go)
    );
    return sheet(t('juz.n', { n }), ...juzHead(j), h('p', { style: 'margin:14px 0 0' }, h('b', {}, t('juz.free'))), form);
  }
  const btns = [];
  const isStale = !p.done_at && S.now - p.claimed_at > STALE_DAYS * DAY;
  let status;
  if (p.mine && p.reader === S.me.name) {
    status = p.done_at ? t('juz.st.youRead', { ago: ago(p.done_at, S.now) }) : t('juz.st.youTook', { ago: ago(p.claimed_at, S.now) });
  } else {
    status = p.done_at ? t('juz.st.read', { name: p.reader }) : t('juz.st.reading', { name: p.reader, ago: ago(p.claimed_at, S.now) });
  }
  const can = p.mine || host;
  if (can && !p.done_at) btns.push(h('button', { class: 'btn btn-primary btn-block', onclick: () => act('done', { juz: n, done: true }, t('juz.ok.read', { n })) }, p.mine && p.reader === S.me.name ? t('juz.markRead') : t('juz.markReadFor', { name: p.reader })));
  if (can && p.done_at) btns.push(h('button', { class: 'btn btn-ghost btn-block', onclick: () => act('done', { juz: n, done: false }, t('juz.ok.undo')) }, t('juz.undo')));
  if (can && !p.done_at)
    btns.push(
      h(
        'button',
        { class: 'btn btn-ghost btn-block', onclick: () => act('release', { juz: n }, t('juz.ok.free', { n })) },
        p.mine && p.reader === S.me.name ? t('juz.giveBack') : t('juz.free.up')
      )
    );
  return sheet(
    t('juz.n', { n }),
    ...juzHead(j),
    h('p', { style: 'margin:14px 0 0' }, status),
    isStale && !p.mine ? h('p', { class: 'banner' }, host ? t('juz.stale.host', { n: STALE_DAYS, name: p.reader }) : t('juz.stale', { n: STALE_DAYS })) : null,
    btns.length ? h('div', { class: 'stack' }, btns) : null
  );
}

// ---------- organiser tools + personal link ----------
function openEdit() {
  const k = S.khatm;
  const title = h('input', { type: 'text', id: 'e-title', maxlength: '80', value: k.title });
  const dl = h('input', { type: 'date', id: 'e-deadline', value: k.deadline || '' });
  const note = h('textarea', { id: 'e-note', maxlength: '500' });
  note.value = k.note;
  const err = h('p', { class: 'err', role: 'alert' });
  sheet(
    t('edit.aria'),
    h('h2', {}, t('edit.h')),
    h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          try {
            S = await api('PATCH', `k/${id}`, { title: title.value, deadline: dl.value, note: note.value }, token);
            version = S.khatm.updated_at;
            closeSheet();
            render();
            toast(t('edit.saved'));
          } catch (x) {
            err.textContent = x.message;
          }
        },
      },
      h('label', { for: 'e-title' }, t('f.title')),
      title,
      h('label', { for: 'e-deadline' }, t('f.deadline'), ' ', h('span', { class: 'opt' }, t('f.optional'))),
      dl,
      h('label', { for: 'e-note' }, t('f.note'), ' ', h('span', { class: 'opt' }, t('f.optional'))),
      note,
      err,
      h('div', { class: 'stack' }, h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, t('edit.save')))
    ),
    h('hr', { style: 'border:0;border-top:1px solid var(--line);margin:22px 0 14px' }),
    h(
      'button',
      {
        class: 'btn btn-danger btn-block',
        onclick: async () => {
          if (!confirm(t('edit.confirmDelete'))) return;
          try {
            await api('DELETE', `k/${id}`, undefined, token);
            closeSheet();
            gone();
          } catch (x) {
            err.textContent = x.message;
          }
        },
      },
      t('edit.delete')
    )
  );
}
function personalCard() {
  if (!S.me) return null;
  const host = S.me.is_host;
  return h(
    'section',
    { class: 'card' },
    h('h3', {}, host ? t('me.host') : t('me.joined', { name: S.me.name })),
    h('p', { class: 'muted small' }, t('me.hint')),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn btn-ghost', onclick: async () => (await copyText(personalLink())) && toast(t('me.copied')) }, t('me.copy')),
      host ? h('button', { class: 'btn btn-ghost', onclick: openEdit }, t('me.edit')) : null
    )
  );
}
function newBanner() {
  if (!isNew || !S.me || !S.me.is_host) return null;
  return h(
    'section',
    { class: 'card', style: 'border-color:#cfe5da;background:#f1f8f4' },
    h('h2', {}, t(S.khatm.kind === 'dhikr' ? 'new.h.dhikr' : 'new.h')),
    h('p', {}, t(S.khatm.kind === 'dhikr' ? 'new.p.dhikr' : 'new.p')),
    h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: shareLink }, t('new.share')), h('button', { class: 'btn btn-ghost', onclick: async () => (await copyText(link())) && toast(t('toast.link')) }, t('new.copy')))
  );
}
function historyList() {
  const past = S.rounds.filter((r) => r.completed_at && r.round < S.khatm.round);
  if (!past.length) return null;
  return h(
    'section',
    { class: 'card' },
    h('h3', {}, t('hist.h')),
    h('ul', { class: 'history' }, past.map((r) => h('li', {}, t('hist.row', { n: r.readers, r: r.round, date: fmtDate(new Date(r.completed_at).toISOString().slice(0, 10)) }))))
  );
}

// ---------- completion ----------
function durationText() {
  const r = roundInfo();
  const days = Math.max(1, Math.ceil((r.completed_at - r.started_at) / DAY));
  return t('dur', { n: days });
}
function completeCard() {
  if (!completed()) return null;
  const k = S.khatm;
  const r = roundInfo();
  const host = S.me && S.me.is_host;
  const line = k.kind === 'dhikr' ? t('done.dhikr', { n: r.readers, total: S.total, phrase: phraseLabel(t, k.phrase), dur: durationText() }) : t('done.quran', { n: r.readers, dur: durationText() });
  return h(
    'section',
    { class: 'card complete' },
    h('div', { class: 'ar', lang: 'ar', style: 'font-size:1.6rem;margin-bottom:6px' }, 'الحمد لله'),
    h('h2', {}, t(k.kind === 'dhikr' ? 'done.h.dhikr' : 'done.h.quran')),
    h('p', {}, line),
    h('p', {}, t('done.dua')),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn btn-gold', onclick: shareCard }, t('done.share')),
      host ? h('button', { class: 'btn btn-ghost', onclick: openNextRound }, t('done.next', { n: k.round + 1 })) : null,
      h('a', { class: 'btn btn-ghost', href: '/' }, t(k.kind === 'dhikr' ? 'done.own.dhikr' : 'done.own.quran'))
    )
  );
}
function openNextRound() {
  const dl = h('input', { type: 'date', id: 'n-deadline', min: isoIn(0) });
  sheet(
    t('next.aria'),
    h('h2', {}, t('next.h', { n: S.khatm.round + 1 })),
    h('p', { class: 'muted' }, t(S.khatm.kind === 'dhikr' ? 'next.p.dhikr' : 'next.p.quran')),
    h('label', { for: 'n-deadline' }, t('f.deadline'), ' ', h('span', { class: 'opt' }, t('f.optional'))),
    dl,
    h('div', { class: 'stack' }, h('button', { class: 'btn btn-primary btn-block', onclick: () => act('next-round', { deadline: dl.value }, t('next.ok', { n: S.khatm.round + 1 })) }, t('next.go')))
  );
}
// Draws a square result card for sharing to other groups or a status.
function drawCard() {
  const k = S.khatm;
  const r = roundInfo();
  const c = document.createElement('canvas');
  c.width = 1080;
  c.height = 1080;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, '#0f5b4a');
  grad.addColorStop(1, '#137a62');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1080, 1080);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 2;
  for (let x = 0; x < 1080; x += 120)
    for (let y = 0; y < 1080; y += 120) {
      g.save();
      g.translate(x + 60, y + 60);
      g.strokeRect(-26, -26, 52, 52);
      g.rotate(Math.PI / 4);
      g.strokeRect(-26, -26, 52, 52);
      g.restore();
    }
  g.textAlign = 'center';
  g.direction = t.dir;
  g.fillStyle = '#e8c877';
  g.font = '600 76px "Noto Naskh Arabic", "Geeza Pro", serif';
  g.fillText('الحمد لله', 540, 250);
  g.fillStyle = '#fff';
  g.font = '700 64px Georgia, serif';
  wrap(g, k.title, 540, 380, 900, 76);
  g.font = '600 150px Georgia, serif';
  g.fillText(k.kind === 'dhikr' ? fmt(S.total) : '30 / 30', 540, 640);
  g.font = '500 46px system-ui, sans-serif';
  g.fillStyle = '#d8ece4';
  g.fillText(k.kind === 'dhikr' ? phraseLabel(t, k.phrase) : t('card.juzRead'), 540, 715);
  g.fillText(t('card.by', { n: r.readers, dur: durationText() }), 540, 790);
  g.font = '500 34px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText(t('card.cta', { host: location.host }), 540, 990);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
function wrap(g, text, x, y, max, lh) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > max && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  lines.push(line);
  lines.slice(0, 2).forEach((l, i) => g.fillText(l, x, y + i * lh));
}
async function shareCard() {
  const blob = await drawCard();
  const file = new File([blob], 'khatm-complete.png', { type: 'image/png' });
  const text = t(S.khatm.kind === 'dhikr' ? 'card.text.dhikr' : 'card.text.quran', { title: S.khatm.title, url: `${location.origin}${t.lang === 'en' ? '/' : '/' + t.lang}` });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  sheet(t('card.aria'), h('h2', {}, t('done.share')), h('img', { src: url, alt: t('card.aria'), style: 'width:100%;border-radius:12px' }), h('p', { class: 'muted small' }, t('card.hold')), h('div', { class: 'stack' }, h('a', { class: 'btn btn-primary btn-block', href: url, download: 'khatm-complete.png' }, t('card.download')), h('button', { class: 'btn btn-ghost btn-block', onclick: async () => (await copyText(text)) && toast(t('card.copied')) }, t('card.copyText'))));
}

// ---------- Quran mode ----------
function renderQuran() {
  const st = stats();
  const by = new Map(S.parts.map((p) => [p.juz, p]));
  const mine = S.parts.filter((p) => p.mine);
  const progress = h(
    'section',
    { class: 'progress', 'aria-label': t('prog.aria') },
    h('div', { class: 'bar', role: 'img', 'aria-label': t('prog.bar', { done: st.done, taking: st.taken - st.done, free: st.free }) }, h('i', { class: 'd', style: `width:${(st.done / 30) * 100}%` }), h('i', { class: 't', style: `width:${((st.taken - st.done) / 30) * 100}%` })),
    h(
      'div',
      { class: 'legend' },
      h('span', {}, h('span', { class: 'dot d' }), bold('leg.read', st.done)),
      h('span', {}, h('span', { class: 'dot t' }), bold('leg.taking', st.taken - st.done)),
      h('span', {}, h('span', { class: 'dot f' }), bold('leg.free', st.free)),
      h('span', {}, bold('leg.readers', st.readers))
    )
  );
  const actions = h(
    'div',
    { class: 'actions' },
    h('button', { class: 'btn btn-primary', onclick: shareLink }, t(completed() ? 'act.share' : 'act.invite')),
    h('button', { class: 'btn btn-ghost', onclick: async () => (await copyText(whatsappList())) && toast(t('act.list.ok')) }, t('act.list'))
  );
  let mineCard = null;
  if (mine.length && !completed()) {
    mineCard = h(
      'section',
      { class: 'card mine-list' },
      h('h3', {}, t(mine.some((p) => p.reader !== S.me.name) ? 'mine.h' : 'mine.h1')),
      mine.map((p) => {
        const j = JUZ[p.juz - 1];
        const me = p.reader === S.me.name;
        return h(
          'div',
          { class: 'row' },
          h('span', { class: 'badge' + (p.done_at ? ' done' : '') }, p.juz),
          h('div', { class: 'grow' }, h('b', { dir: 'auto' }, me ? juzName(j, t.lang) : t('mine.for', { juzname: juzName(j, t.lang), name: p.reader })), h('div', { class: 'muted small' }, p.done_at ? t('mine.read') : t('mine.taken', { ago: ago(p.claimed_at, S.now), start: juzStart(j, t.lang) }))),
          h(
            'div',
            { class: 'btns' },
            p.done_at ? null : h('a', { class: 'btn btn-ghost', href: quranUrl(p.juz), target: '_blank', rel: 'noopener' }, t('mine.open')),
            p.done_at ? h('button', { class: 'btn-link', onclick: () => openJuz(p.juz) }, t('k.details')) : h('button', { class: 'btn btn-primary', onclick: () => act('done', { juz: p.juz, done: true }, t('juz.ok.read', { n: p.juz })) }, t(me ? 'mine.done.me' : 'mine.done.other'))
          )
        );
      })
    );
  }
  let hint = null;
  if (!completed()) {
    if (!S.me) hint = h('p', { class: 'muted', style: 'margin:18px 0 0' }, t(st.free ? 'hint.visitor' : 'hint.full'));
    else if (!mine.length && st.free) hint = h('p', { class: 'muted', style: 'margin:18px 0 0' }, t('hint.member'));
  }
  const grid = h(
    'div',
    { class: 'grid', role: 'list' },
    JUZ.map((j) => {
      const p = by.get(j.n);
      const cls = ['juz', p ? (p.done_at ? 'done' : 'taken') : 'free', p && p.mine ? 'mine' : ''].join(' ');
      const stale = p && !p.done_at && S.now - p.claimed_at > STALE_DAYS * DAY;
      const label = p ? (p.done_at ? t('grid.read', { n: j.n, name: p.reader }) : stale ? t('grid.reading.stale', { n: j.n, name: p.reader, d: STALE_DAYS, count: STALE_DAYS }) : t('grid.reading', { n: j.n, name: p.reader })) : t('grid.free.aria', { n: j.n });
      return h(
        'button',
        { class: cls, role: 'listitem', 'aria-label': label, 'data-juz': j.n, onclick: () => openJuz(j.n) },
        stale ? h('span', { class: 'stale', title: t('grid.stale', { n: STALE_DAYS }) }) : null,
        h('span', { class: 'n' }, j.n),
        h('span', { class: 'who', dir: p ? 'auto' : null }, p ? (p.done_at ? '✓ ' : '') + p.reader : completed() ? '' : t('grid.free'))
      );
    })
  );
  return [header(), newBanner(), completeCard(), progress, actions, mineCard, hint, h('h2', { style: 'margin-top:18px' }, t('grid.h')), grid, h('p', { class: 'muted small' }, t('grid.foot'), ' ', h('span', { class: 'dot', style: 'background:var(--amber);border-radius:50%' }), t('grid.foot.dot', { n: STALE_DAYS }))];
}

// ---------- dhikr mode ----------
const PKEY = `khatm:tap:${id}`;
const pending = {
  get: () => {
    try { return Number(localStorage.getItem(PKEY) || 0); } catch { return 0; }
  },
  set: (n) => {
    try { localStorage.setItem(PKEY, String(n)); } catch {}
  },
};
async function addCount(n, nm, err) {
  if (!(await ensureJoined(nm, err))) return false;
  const ok = await act('count', { n }, t('dh.added', { n }));
  return ok;
}
function openAdd(n, onDone) {
  const nm = nameField();
  const err = h('p', { class: 'err', role: 'alert' });
  const num = h('input', { type: 'number', id: 'add-n', min: '1', max: '100000', inputmode: 'numeric', value: n || '' });
  const go = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, t('dh.addGo'));
  sheet(
    t('dh.addH'),
    h('h2', {}, t('dh.addH')),
    h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          const v = Number(num.value);
          if (!Number.isInteger(v) || v < 1 || v > 100000) {
            err.textContent = t('dh.err.num');
            return;
          }
          go.disabled = true;
          if (await addCount(v, nm, err)) onDone && onDone();
          else go.disabled = false;
        },
      },
      nm ? [h('label', { for: 'your-name' }, t('juz.yourName')), nm] : null,
      h('label', { for: 'add-n' }, t('dh.howMany', { phrase: phraseLabel(t, S.khatm.phrase) })),
      num,
      err,
      h('div', { class: 'stack' }, go)
    )
  );
}
function renderDhikr() {
  const k = S.khatm;
  const pct = Math.min(100, (S.total / k.target) * 100);
  const ph = PHRASES[k.phrase];
  let tapN = pending.get();
  const tapLabel = h('span', {}, fmt(tapN));
  const sendTap = h('button', { class: 'btn btn-primary', disabled: !tapN, onclick: () => (S.me ? addCount(tapN, null, { set textContent(v) { toast(v); } }).then((ok) => ok && reset()) : openAdd(tapN, reset)) }, t('dh.addN', { n: tapN }));
  const clear = h('button', { class: 'btn btn-ghost', disabled: !tapN, onclick: () => reset() }, t('dh.reset'));
  function reset() {
    tapN = 0;
    pending.set(0);
    upd();
  }
  function upd() {
    tapLabel.textContent = fmt(tapN);
    sendTap.textContent = t('dh.addN', { n: tapN });
    sendTap.disabled = clear.disabled = !tapN;
  }
  const counter = h(
    'section',
    { class: 'card counter' },
    ph ? h('div', { class: 'ar', lang: 'ar', style: 'font-size:1.7rem;color:var(--green)' }, ph.ar) : null,
    h('div', { class: 'total', 'data-total': S.total }, fmt(S.total)),
    h('div', { class: 'of' }, t('dh.of', { target: k.target, phrase: phraseLabel(t, k.phrase) })),
    h('div', { class: 'bar big', role: 'img', 'aria-label': t('dh.pct', { pct: Math.floor(pct) }) }, h('i', { class: 'd', style: `width:${pct}%` })),
    h('div', { class: 'legend', style: 'justify-content:center' }, h('span', {}, bold('dh.counted', S.contributors)), S.me ? h('span', {}, bold('dh.you', S.my_total)) : null, h('span', {}, bold('dh.toGo', Math.max(0, k.target - S.total))))
  );
  const tapper = completed()
    ? null
    : h(
        'section',
        { class: 'card center' },
        h('h3', {}, t('dh.tapH')),
        h('p', { class: 'muted small' }, t('dh.tapP')),
        h('button', { class: 'tap', 'aria-label': t('dh.tapAria'), onclick: () => { tapN += 1; pending.set(tapN); upd(); if (navigator.vibrate) navigator.vibrate(8); } }, tapLabel, h('small', {}, t('dh.tap'))),
        h('div', { class: 'actions', style: 'justify-content:center' }, sendTap, clear),
        h('p', { class: 'muted small', style: 'margin-top:10px' }, t('dh.own')),
        h('div', { class: 'quick' }, [33, 100, 313, 1000].map((n) => h('button', { class: 'chip', onclick: () => openAdd(n) }, `+${fmt(n)}`)), h('button', { class: 'chip', onclick: () => openAdd() }, t('dh.other')))
      );
  const feed = S.recent.length
    ? h(
        'section',
        { class: 'card' },
        h('h3', {}, t('dh.latest')),
        h('ul', { class: 'feed' }, S.recent.map((r) => h('li', {}, h('span', {}, t.nodes('dh.feed', { name: r.name, n: r.n }, ['name'], (v) => h('b', { dir: 'auto' }, v))), h('span', { class: 'muted small' }, ago(r.at, S.now))))),
        S.me && S.my_total && !completed() ? h('button', { class: 'btn-link', onclick: () => confirm(t('dh.undo.confirm')) && act('undo-count', {}, t('dh.undo.ok')) }, t('dh.undo')) : null
      )
    : null;
  const actions = h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: shareLink }, t('act.invite')));
  return [header(), newBanner(), completeCard(), counter, actions, tapper, feed];
}

function render() {
  if (!S) return;
  const parts = S.khatm.kind === 'dhikr' ? renderDhikr() : renderQuran();
  app.replaceChildren(...[...parts, personalCard(), historyList()].filter(Boolean), h('p', { class: 'center', style: 'margin:26px 0 0' }, h('a', { href: homeLink() }, t('foot.startOwn'))));
}

// Cheap live updates: poll the version every 10 s while the page is visible.
setInterval(async () => {
  if (document.hidden || closeSheet || busy || !S) return;
  try {
    const r = await api('GET', `k/${id}/v`);
    if (r.v !== version) load();
  } catch {}
}, 10000);
document.addEventListener('visibilitychange', () => !document.hidden && S && load());
langPicker(async (l) => {
  await useLang(l);
  for (const a of document.querySelectorAll('a.brand, #own')) a.href = homeLink();
  render();
});
load();
