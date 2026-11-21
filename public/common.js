// Shared browser helpers: safe DOM builder, API client, per-khatm token storage, toasts, dates.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

const KEY = (id) => `khatm:${id}`;
const RECENT = 'khatm:recent';
export const store = {
  get: (id) => {
    try { return localStorage.getItem(KEY(id)); } catch { return null; }
  },
  set: (id, tok) => {
    try { localStorage.setItem(KEY(id), tok); } catch {}
  },
  remember: (id, title) => {
    try {
      const all = JSON.parse(localStorage.getItem(RECENT) || '[]').filter((x) => x.id !== id);
      all.unshift({ id, title, t: Date.now() });
      localStorage.setItem(RECENT, JSON.stringify(all.slice(0, 20)));
    } catch {}
  },
  drop: (id) => {
    try { localStorage.removeItem(KEY(id)); } catch {}
    try {
      localStorage.setItem(RECENT, JSON.stringify(JSON.parse(localStorage.getItem(RECENT) || '[]').filter((x) => x.id !== id)));
    } catch {}
  },
  recent: () => {
    try { return JSON.parse(localStorage.getItem(RECENT) || '[]'); } catch { return []; }
  },
};

export async function api(method, path, data, token) {
  const headers = {};
  if (data !== undefined) headers['content-type'] = 'application/json';
  if (token) headers['x-token'] = token;
  let res;
  try {
    res = await fetch('/api/' + path, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
  } catch {
    throw Object.assign(new Error('No connection. Check your internet and try again.'), { status: 0 });
  }
  let out = {};
  try { out = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(out.error || `Error ${res.status}`), { status: res.status });
  return out;
}

let toastTimer;
export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
}

export function fmtDate(d, long) {
  if (!d) return '';
  const dt = new Date(d + 'T12:00:00Z');
  if (isNaN(dt)) return '';
  return dt.toLocaleDateString('en-GB', { weekday: long ? 'long' : 'short', month: long ? 'long' : 'short', day: 'numeric', timeZone: 'UTC' });
}
export const fmt = (n) => Number(n || 0).toLocaleString('en-US');
export function ago(ts, now = Date.now()) {
  const m = Math.max(0, Math.round((now - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const hrs = Math.round(m / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const d = Math.round(hrs / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
// Whole days from today (local) until a YYYY-MM-DD date: 0 = today, negative = past.
export function daysUntil(d, now = Date.now()) {
  if (!d) return null;
  const [y, mo, da] = d.split('-').map(Number);
  const t = new Date(now);
  const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((Date.UTC(y, mo - 1, da) - today) / 86400000);
}
export function isoIn(days) {
  const t = new Date(Date.now() + days * 86400000);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
