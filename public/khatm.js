// The khatm page: a 30-juz grid (Quran mode) or a shared counter (dhikr mode).
import { h, api, store, toast, copyText, fmtDate, fmt, ago, daysUntil, isoIn } from './common.js';
import { JUZ, PURPOSES, PHRASES, phraseLabel, STALE_DAYS } from './juz.js';

const app = document.getElementById('app');
const id = location.pathname.split('/')[2] || '';
let token = store.get(id);
let S = null; // last state from the API
let version = 0;
let isNew = false;
let busy = false;

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

async function load() {
  try {
    S = await api('GET', `k/${id}`, undefined, token);
    version = S.khatm.updated_at;
    if (token && !S.me) token = null; // stale token (e.g. removed) - act as a visitor
    if (S.me) store.remember(id, S.khatm.title);
    document.title = `${S.khatm.title} · Khatm Circle`;
    render();
  } catch (e) {
    if (e.status === 404) return gone();
    if (!S) app.replaceChildren(h('div', { class: 'card center' }, h('p', {}, e.message), h('button', { class: 'btn btn-primary', onclick: load }, 'Try again')));
    else toast(e.message);
  }
}
function gone() {
  store.drop(id);
  app.replaceChildren(
    h('div', { class: 'card center', style: 'margin-top:30px' }, h('h2', {}, 'This khatm is gone'), h('p', { class: 'muted' }, 'The organiser deleted it, or the link is not complete.'), h('a', { class: 'btn btn-primary', href: '/' }, 'Start a khatm'))
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
  const when = left === 0 ? 'today' : left === 1 ? 'tomorrow' : left < 0 ? `${-left} day${left === -1 ? '' : 's'} ago` : `in ${left} days`;
  return h('span', { class: 'pill' + (left <= 1 ? ' warn' : '') }, `${S.khatm.kind === 'dhikr' ? 'Until' : 'Finish by'} ${fmtDate(d)} · ${when}`);
}
function header() {
  const k = S.khatm;
  let kicker = k.kind === 'dhikr' ? 'Group dhikr' : 'Group khatm';
  if (k.purpose === 'memorial') kicker += ' · in loving memory';
  if (k.purpose === 'shifa') kicker += ' · for shifa';
  if (k.purpose === 'ramadan') kicker += ' · Ramadan';
  if (k.round > 1) kicker += ` · round ${k.round}`;
  return h(
    'section',
    { class: 'head' },
    h('div', { class: 'kicker' }, kicker),
    h('h1', {}, k.title),
    k.note ? h('p', { class: 'note' }, k.note) : null,
    h('div', { class: 'meta' }, deadlinePill(), h('span', { class: 'pill' }, `${S.members} ${S.members === 1 ? 'person' : 'people'} joined`))
  );
}
function shareText() {
  const k = S.khatm;
  if (k.kind === 'dhikr') return `${k.title}\n${fmt(S.total)} of ${fmt(k.target)} ${phraseLabel(k.phrase)} so far. Add your count here (no app needed):`;
  const st = stats();
  if (completed()) return `${k.title}\nAlhamdulillah, all 30 juz are read. Start a khatm for your own family:`;
  return `${k.title}\n${st.free} of 30 juz still free${k.deadline ? `, finish by ${fmtDate(k.deadline)}` : ''}. Tap to take a juz (no app needed):`;
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
  if (await copyText(`${text} ${url}`)) toast('Link copied. Paste it into your group chat.');
}
function whatsappList() {
  const k = S.khatm;
  const by = new Map(S.parts.map((p) => [p.juz, p]));
  const lines = [`*${k.title}*`];
  if (k.deadline) lines.push(`Finish by ${fmtDate(k.deadline, true)}`);
  lines.push(`Take a juz here: ${link()}`, '');
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
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': typeof title === 'string' ? title : 'Details' });
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', esc);
    closeSheet = null;
  };
  const esc = (e) => e.key === 'Escape' && close();
  box.append(h('button', { class: 'x', 'aria-label': 'Close', onclick: close }, '×'), ...content);
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
    err.textContent = 'Please type your name first.';
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
const nameField = () => (S.me ? null : h('input', { type: 'text', id: 'your-name', maxlength: '40', autocomplete: 'given-name', placeholder: 'Your name' }));

function juzHead(j) {
  return [
    h('div', { class: 'juzhead' }, h('h2', { style: 'margin:0' }, `Juz ${j.n}`), h('span', { class: 'ar', lang: 'ar' }, j.ar)),
    h('p', { class: 'muted', style: 'margin:4px 0 0' }, `${j.name} · starts at ${j.start}`),
    h('p', { style: 'margin:6px 0 0' }, h('a', { href: quranUrl(j.n), target: '_blank', rel: 'noopener' }, `Read or listen to Juz ${j.n} on Quran.com ↗`)),
  ];
}

function openJuz(n) {
  const j = JUZ[n - 1];
  const p = S.parts.find((x) => x.juz === n);
  const host = S.me && S.me.is_host;
  const err = h('p', { class: 'err', role: 'alert' });
  if (completed()) return sheet(`Juz ${n}`, ...juzHead(j), h('p', { style: 'margin-top:14px' }, p ? `Read by ${p.reader}.` : ''));
  if (!p) {
    const nm = nameField();
    let forOther = false;
    const other = h('input', { type: 'text', maxlength: '40', placeholder: 'Their name', class: 'hidden', 'aria-label': 'Their name' });
    const already = h('input', { type: 'checkbox', id: 'already' });
    const alreadyRow = h('label', { class: 'hidden', style: 'font-weight:500;display:flex;gap:8px;align-items:center' }, already, 'They have already read it');
    const whoChips = host
      ? h(
          'div',
          {},
          h('label', {}, 'Who will read it?'),
          h(
            'div',
            { class: 'chips', role: 'group' },
            h('button', { type: 'button', class: 'chip', 'aria-pressed': 'true', onclick: (e) => setWho(false, e) }, 'Me'),
            h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', onclick: (e) => setWho(true, e) }, 'Someone not on the link')
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
    const go = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, `Take Juz ${n}`);
    const form = h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          if (forOther && !other.value.trim()) {
            err.textContent = 'Type the name of the person who will read it.';
            return other.focus();
          }
          go.disabled = true;
          if (!(await ensureJoined(nm, err))) return (go.disabled = false);
          const data = { juz: n };
          if (forOther) Object.assign(data, { reader: other.value.trim(), done: already.checked });
          const ok = await act('claim', data, forOther ? `Juz ${n} is down for ${other.value.trim()}.` : `Juz ${n} is yours. May Allah make it easy.`);
          if (!ok) go.disabled = false;
        },
      },
      nm ? [h('label', { for: 'your-name' }, 'Your name'), nm, h('p', { class: 'hint' }, 'So the group can see who is reading it. No sign-up.')] : null,
      whoChips,
      err,
      h('div', { class: 'stack' }, go)
    );
    return sheet(`Juz ${n}`, ...juzHead(j), h('p', { style: 'margin:14px 0 0' }, h('b', {}, 'This juz is free.')), form);
  }
  const btns = [];
  const isStale = !p.done_at && S.now - p.claimed_at > STALE_DAYS * DAY;
  let status;
  if (p.mine && p.reader === S.me.name) {
    status = p.done_at ? `You read this juz ${ago(p.done_at, S.now)}. JazakAllahu khayran.` : `You took this juz ${ago(p.claimed_at, S.now)}.`;
  } else {
    status = p.done_at ? `${p.reader} read this juz ✓` : `${p.reader} is reading this juz (taken ${ago(p.claimed_at, S.now)}).`;
  }
  const can = p.mine || host;
  if (can && !p.done_at) btns.push(h('button', { class: 'btn btn-primary btn-block', onclick: () => act('done', { juz: n, done: true }, `Juz ${n} marked as read.`) }, p.mine && p.reader === S.me.name ? 'I’ve read it ✓' : `Mark as read for ${p.reader}`));
  if (can && p.done_at) btns.push(h('button', { class: 'btn btn-ghost btn-block', onclick: () => act('done', { juz: n, done: false }, 'Marked as not read yet.') }, 'Undo “read”'));
  if (can && !p.done_at)
    btns.push(
      h(
        'button',
        { class: 'btn btn-ghost btn-block', onclick: () => act('release', { juz: n }, `Juz ${n} is free again.`) },
        p.mine && p.reader === S.me.name ? 'I can’t finish it: give it back' : 'Free it up for someone else'
      )
    );
  return sheet(
    `Juz ${n}`,
    ...juzHead(j),
    h('p', { style: 'margin:14px 0 0' }, status),
    isStale && !p.mine ? h('p', { class: 'banner' }, host ? `Taken more than ${STALE_DAYS} days ago and not read yet. You can ask ${p.reader} in the group, or free it up.` : `Taken more than ${STALE_DAYS} days ago and not read yet.`) : null,
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
    'Edit',
    h('h2', {}, 'Edit khatm'),
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
            toast('Saved.');
          } catch (x) {
            err.textContent = x.message;
          }
        },
      },
      h('label', { for: 'e-title' }, 'Title'),
      title,
      h('label', { for: 'e-deadline' }, 'Finish by ', h('span', { class: 'opt' }, '(optional)')),
      dl,
      h('label', { for: 'e-note' }, 'Message for the group ', h('span', { class: 'opt' }, '(optional)')),
      note,
      err,
      h('div', { class: 'stack' }, h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Save'))
    ),
    h('hr', { style: 'border:0;border-top:1px solid var(--line);margin:22px 0 14px' }),
    h(
      'button',
      {
        class: 'btn btn-danger btn-block',
        onclick: async () => {
          if (!confirm('Delete this khatm for everyone? This cannot be undone.')) return;
          try {
            await api('DELETE', `k/${id}`, undefined, token);
            closeSheet();
            gone();
          } catch (x) {
            err.textContent = x.message;
          }
        },
      },
      'Delete this khatm'
    )
  );
}
function personalCard() {
  if (!S.me) return null;
  const host = S.me.is_host;
  return h(
    'section',
    { class: 'card' },
    h('h3', {}, host ? 'You are the organiser' : `You joined as ${S.me.name}`),
    h('p', { class: 'muted small' }, 'To use this khatm on another phone or browser as you, open your personal link there. Keep it to yourself: it lets anyone act as you.'),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn btn-ghost', onclick: async () => (await copyText(personalLink())) && toast('Personal link copied.') }, 'Copy my personal link'),
      host ? h('button', { class: 'btn btn-ghost', onclick: openEdit }, 'Edit or delete') : null
    )
  );
}
function newBanner() {
  if (!isNew || !S.me || !S.me.is_host) return null;
  return h(
    'section',
    { class: 'card', style: 'border-color:#cfe5da;background:#f1f8f4' },
    h('h2', {}, 'Your khatm link is ready'),
    h('p', {}, 'Send it to your family or community group. Each person taps a free juz to take it.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: shareLink }, 'Share the link'), h('button', { class: 'btn btn-ghost', onclick: async () => (await copyText(link())) && toast('Link copied.') }, 'Copy link'))
  );
}
function historyList() {
  const past = S.rounds.filter((r) => r.completed_at && r.round < S.khatm.round);
  if (!past.length) return null;
  return h(
    'section',
    { class: 'card' },
    h('h3', {}, 'Completed rounds'),
    h('ul', { class: 'history' }, past.map((r) => h('li', {}, `Round ${r.round}: completed ${fmtDate(new Date(r.completed_at).toISOString().slice(0, 10))} by ${r.readers} ${r.readers === 1 ? 'person' : 'people'}`)))
  );
}

// ---------- completion ----------
function durationText() {
  const r = roundInfo();
  const days = Math.max(1, Math.ceil((r.completed_at - r.started_at) / DAY));
  return days === 1 ? 'in one day' : `in ${days} days`;
}
function completeCard() {
  if (!completed()) return null;
  const k = S.khatm;
  const r = roundInfo();
  const host = S.me && S.me.is_host;
  const line = k.kind === 'dhikr' ? `${fmt(S.total)} ${phraseLabel(k.phrase)} by ${r.readers} ${r.readers === 1 ? 'person' : 'people'} ${durationText()}.` : `All 30 juz were read by ${r.readers} ${r.readers === 1 ? 'person' : 'people'} ${durationText()}.`;
  return h(
    'section',
    { class: 'card complete' },
    h('div', { class: 'ar', lang: 'ar', style: 'font-size:1.6rem;margin-bottom:6px' }, 'الحمد لله'),
    h('h2', {}, k.kind === 'dhikr' ? 'Target reached' : 'The khatm is complete'),
    h('p', {}, line),
    h('p', {}, 'Now is a good time to make du‘a together.'),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn btn-gold', onclick: shareCard }, 'Share the good news'),
      host ? h('button', { class: 'btn btn-ghost', onclick: openNextRound }, `Start round ${k.round + 1} on this link`) : null,
      h('a', { class: 'btn btn-ghost', href: '/' }, k.kind === 'dhikr' ? 'Start your own' : 'Start a khatm for your family')
    )
  );
}
function openNextRound() {
  const dl = h('input', { type: 'date', id: 'n-deadline', min: isoIn(0) });
  sheet(
    'Next round',
    h('h2', {}, `Start round ${S.khatm.round + 1}`),
    h('p', { class: 'muted' }, S.khatm.kind === 'dhikr' ? 'The counter starts again from zero on the same link. This round stays in the history.' : 'All 30 juz become free again on the same link, so the group can take them for the next khatm. This round stays in the history.'),
    h('label', { for: 'n-deadline' }, 'Finish by ', h('span', { class: 'opt' }, '(optional)')),
    dl,
    h('div', { class: 'stack' }, h('button', { class: 'btn btn-primary btn-block', onclick: () => act('next-round', { deadline: dl.value }, `Round ${S.khatm.round + 1} has started.`) }, 'Start the next round'))
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
  g.fillText(k.kind === 'dhikr' ? phraseLabel(k.phrase) : 'juz read', 540, 715);
  g.fillText(`by ${r.readers} ${r.readers === 1 ? 'person' : 'people'} ${durationText()}`, 540, 790);
  g.font = '500 34px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.8)';
  g.fillText('Start your own khatm: ' + location.host, 540, 990);
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
  const text = `${S.khatm.title}: ${S.khatm.kind === 'dhikr' ? 'target reached' : 'all 30 juz read'}, alhamdulillah. Start a khatm for your own family: ${location.origin}/`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  sheet('Result card', h('h2', {}, 'Share the good news'), h('img', { src: url, alt: 'Result card', style: 'width:100%;border-radius:12px' }), h('p', { class: 'muted small' }, 'Press and hold the image to save or share it.'), h('div', { class: 'stack' }, h('a', { class: 'btn btn-primary btn-block', href: url, download: 'khatm-complete.png' }, 'Download image'), h('button', { class: 'btn btn-ghost btn-block', onclick: async () => (await copyText(text)) && toast('Text copied.') }, 'Copy text')));
}

// ---------- Quran mode ----------
function renderQuran() {
  const st = stats();
  const by = new Map(S.parts.map((p) => [p.juz, p]));
  const mine = S.parts.filter((p) => p.mine);
  const progress = h(
    'section',
    { class: 'progress', 'aria-label': 'Progress' },
    h('div', { class: 'bar', role: 'img', 'aria-label': `${st.done} of 30 read, ${st.taken - st.done} being read, ${st.free} free` }, h('i', { class: 'd', style: `width:${(st.done / 30) * 100}%` }), h('i', { class: 't', style: `width:${((st.taken - st.done) / 30) * 100}%` })),
    h(
      'div',
      { class: 'legend' },
      h('span', {}, h('span', { class: 'dot d' }), h('b', {}, st.done), ' read'),
      h('span', {}, h('span', { class: 'dot t' }), h('b', {}, st.taken - st.done), ' being read'),
      h('span', {}, h('span', { class: 'dot f' }), h('b', {}, st.free), ' free'),
      h('span', {}, h('b', {}, st.readers), st.readers === 1 ? ' reader' : ' readers')
    )
  );
  const actions = h(
    'div',
    { class: 'actions' },
    h('button', { class: 'btn btn-primary', onclick: shareLink }, completed() ? 'Share' : 'Invite the group'),
    h('button', { class: 'btn btn-ghost', onclick: async () => (await copyText(whatsappList())) && toast('List copied. Paste it into WhatsApp.') }, 'Copy as a list')
  );
  let mineCard = null;
  if (mine.length && !completed()) {
    mineCard = h(
      'section',
      { class: 'card mine-list' },
      h('h3', {}, mine.length === 1 ? 'Your juz' : 'Your juz and the ones you added'),
      mine.map((p) => {
        const j = JUZ[p.juz - 1];
        const me = p.reader === S.me.name;
        return h(
          'div',
          { class: 'row' },
          h('span', { class: 'badge' + (p.done_at ? ' done' : '') }, p.juz),
          h('div', { class: 'grow' }, h('b', {}, `${j.name}${me ? '' : ` · for ${p.reader}`}`), h('div', { class: 'muted small' }, p.done_at ? `Read ✓` : `Taken ${ago(p.claimed_at, S.now)} · starts at ${j.start}`)),
          h(
            'div',
            { class: 'btns' },
            p.done_at ? null : h('a', { class: 'btn btn-ghost', href: quranUrl(p.juz), target: '_blank', rel: 'noopener' }, 'Read'),
            p.done_at ? h('button', { class: 'btn-link', onclick: () => openJuz(p.juz) }, 'Details') : h('button', { class: 'btn btn-primary', onclick: () => act('done', { juz: p.juz, done: true }, `Juz ${p.juz} marked as read.`) }, me ? 'I’ve read it' : 'Mark read')
          )
        );
      })
    );
  }
  let hint = null;
  if (!completed()) {
    if (!S.me) hint = h('p', { class: 'muted', style: 'margin:18px 0 0' }, st.free ? 'Tap a free juz to take it. You only need to type your name.' : 'All juz are taken. You can follow along here.');
    else if (!mine.length && st.free) hint = h('p', { class: 'muted', style: 'margin:18px 0 0' }, 'Tap a free juz to take it.');
  }
  const grid = h(
    'div',
    { class: 'grid', role: 'list' },
    JUZ.map((j) => {
      const p = by.get(j.n);
      const cls = ['juz', p ? (p.done_at ? 'done' : 'taken') : 'free', p && p.mine ? 'mine' : ''].join(' ');
      const stale = p && !p.done_at && S.now - p.claimed_at > STALE_DAYS * DAY;
      const label = `Juz ${j.n}: ${p ? (p.done_at ? `read by ${p.reader}` : `${p.reader} is reading${stale ? ', taken more than 3 days ago' : ''}`) : 'free'}`;
      return h(
        'button',
        { class: cls, role: 'listitem', 'aria-label': label, 'data-juz': j.n, onclick: () => openJuz(j.n) },
        stale ? h('span', { class: 'stale', title: 'Taken more than 3 days ago' }) : null,
        h('span', { class: 'n' }, j.n),
        h('span', { class: 'who' }, p ? (p.done_at ? '✓ ' : '') + p.reader : completed() ? '' : 'Free')
      );
    })
  );
  return [header(), newBanner(), completeCard(), progress, actions, mineCard, hint, h('h2', { style: 'margin-top:18px' }, 'The 30 juz'), grid, h('p', { class: 'muted small' }, 'Each juz links to Quran.com for reading or listening. ', h('span', { class: 'dot', style: 'background:var(--amber);border-radius:50%' }), `= taken more than ${STALE_DAYS} days ago and not read yet.`)];
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
  const ok = await act('count', { n }, `Added ${fmt(n)}. JazakAllahu khayran.`);
  return ok;
}
function openAdd(n, onDone) {
  const nm = nameField();
  const err = h('p', { class: 'err', role: 'alert' });
  const num = h('input', { type: 'number', id: 'add-n', min: '1', max: '100000', inputmode: 'numeric', value: n || '' });
  const go = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Add to the total');
  sheet(
    'Add',
    h('h2', {}, 'Add your count'),
    h(
      'form',
      {
        onsubmit: async (e) => {
          e.preventDefault();
          err.textContent = '';
          const v = Number(num.value);
          if (!Number.isInteger(v) || v < 1 || v > 100000) {
            err.textContent = 'Enter a whole number from 1 to 100,000.';
            return;
          }
          go.disabled = true;
          if (await addCount(v, nm, err)) onDone && onDone();
          else go.disabled = false;
        },
      },
      nm ? [h('label', { for: 'your-name' }, 'Your name'), nm] : null,
      h('label', { for: 'add-n' }, `How many ${phraseLabel(S.khatm.phrase)}?`),
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
  const sendTap = h('button', { class: 'btn btn-primary', disabled: !tapN, onclick: () => (S.me ? addCount(tapN, null, { set textContent(v) { toast(v); } }).then((ok) => ok && reset()) : openAdd(tapN, reset)) }, `Add ${fmt(tapN)} to the total`);
  const clear = h('button', { class: 'btn btn-ghost', disabled: !tapN, onclick: () => reset() }, 'Reset');
  function reset() {
    tapN = 0;
    pending.set(0);
    upd();
  }
  function upd() {
    tapLabel.textContent = fmt(tapN);
    sendTap.textContent = `Add ${fmt(tapN)} to the total`;
    sendTap.disabled = clear.disabled = !tapN;
  }
  const counter = h(
    'section',
    { class: 'card counter' },
    ph ? h('div', { class: 'ar', lang: 'ar', style: 'font-size:1.7rem;color:var(--green)' }, ph.ar) : null,
    h('div', { class: 'total', 'data-total': S.total }, fmt(S.total)),
    h('div', { class: 'of' }, `of ${fmt(k.target)} ${phraseLabel(k.phrase)}`),
    h('div', { class: 'bar big', role: 'img', 'aria-label': `${Math.floor(pct)}% of the target` }, h('i', { class: 'd', style: `width:${pct}%` })),
    h('div', { class: 'legend', style: 'justify-content:center' }, h('span', {}, h('b', {}, S.contributors), S.contributors === 1 ? ' person counted' : ' people counted'), S.me ? h('span', {}, 'You added ', h('b', {}, fmt(S.my_total))) : null, h('span', {}, h('b', {}, fmt(Math.max(0, k.target - S.total))), ' to go'))
  );
  const tapper = completed()
    ? null
    : h(
        'section',
        { class: 'card center' },
        h('h3', {}, 'Count as you recite'),
        h('p', { class: 'muted small' }, 'Tap once per recitation. Your taps are kept on this phone until you add them.'),
        h('button', { class: 'tap', 'aria-label': 'Count one', onclick: () => { tapN += 1; pending.set(tapN); upd(); if (navigator.vibrate) navigator.vibrate(8); } }, tapLabel, h('small', {}, 'tap')),
        h('div', { class: 'actions', style: 'justify-content:center' }, sendTap, clear),
        h('p', { class: 'muted small', style: 'margin-top:10px' }, 'Already counted on your own tasbih?'),
        h('div', { class: 'quick' }, [33, 100, 313, 1000].map((n) => h('button', { class: 'chip', onclick: () => openAdd(n) }, `+${fmt(n)}`)), h('button', { class: 'chip', onclick: () => openAdd() }, 'Other number'))
      );
  const feed = S.recent.length
    ? h(
        'section',
        { class: 'card' },
        h('h3', {}, 'Latest'),
        h('ul', { class: 'feed' }, S.recent.map((r) => h('li', {}, h('span', {}, h('b', {}, r.name), ` added ${fmt(r.n)}`), h('span', { class: 'muted small' }, ago(r.at, S.now))))),
        S.me && S.my_total && !completed() ? h('button', { class: 'btn-link', onclick: () => confirm('Remove the last count you added?') && act('undo-count', {}, 'Your last count was removed.') }, 'Undo my last count') : null
      )
    : null;
  const actions = h('div', { class: 'actions' }, h('button', { class: 'btn btn-primary', onclick: shareLink }, 'Invite the group'));
  return [header(), newBanner(), completeCard(), counter, actions, tapper, feed];
}

function render() {
  if (!S) return;
  const parts = S.khatm.kind === 'dhikr' ? renderDhikr() : renderQuran();
  app.replaceChildren(...[...parts, personalCard(), historyList()].filter(Boolean), h('p', { class: 'center', style: 'margin:26px 0 0' }, h('a', { href: '/' }, 'Start a khatm for your own family or group →')));
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
load();
