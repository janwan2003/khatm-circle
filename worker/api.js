// Khatm Circle: JSON API. Runs inside the KhatmDB Durable Object (worker/index.js); env.DB is a D1-style
// shim over the object's SQLite storage, so the SQL below is plain SQLite.
// A khatm is one shared link. Quran mode: 30 juz per round; members claim a juz, then mark it read.
// Dhikr mode: members add counts towards a shared target. People join with a name only; each member
// gets a random token, stored hashed. The creator is the organiser (host).
import { isPurpose, purposeTitle, PHRASES, phraseLabel } from '../public/juz.js';
import { EN_T, isLang } from '../public/i18n.js';
import { tFor } from '../lib/ssr.js';

const DAY = 86400000;
const TTL_DAYS = 400; // a khatm with no activity for this long is deleted
const LIM = { members: 300, perMemberJuz: 30, countAdd: 100000, target: 100000000 };

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
// Errors carry a code (public/i18n/en.js: err.<code>) and vars, so the browser shows them in the viewer's language.
// `error` stays as English text for old clients and logs.
class HttpError extends Error {
  constructor(status, code, vars = {}) {
    super(EN_T(`err.${code}`, { ...vars, field: vars.field ? EN_T(vars.field) : undefined }));
    this.status = status;
    this.code = code;
    this.vars = vars;
  }
}
const bad = (code, vars) => new HttpError(400, code, vars);

function rid(n = 10) {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const x of b) s += abc[x % abc.length];
  return s;
}
function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function clean(v, max, { required = false, field = 'field.name' } = {}) {
  let s = typeof v === 'string' ? v : v == null ? '' : String(v);
  s = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !s) throw bad('required', { field });
  if ([...s].length > max) throw bad('tooLong', { max });
  return s;
}
function cleanNote(v, max) {
  let s = typeof v === 'string' ? v : '';
  s = s.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if ([...s].length > max) throw bad('tooLong', { max });
  return s;
}
export function cleanDate(v) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(new Date(s + 'T12:00:00Z'))) throw bad('date');
  return s;
}
function int(v, min, max) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad('number', { min, max });
  return n;
}

async function body(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 16000) throw bad('request');
  try {
    const t = await request.text();
    if (t.length > 16000) throw bad('request');
    return t ? JSON.parse(t) : {};
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw bad('request');
  }
}

// Fixed-window rate limit per IP hash, kept in D1 so it holds across isolates.
async function limit(env, request, bucket, max, windowMs = 3600000) {
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  const k = `${bucket}:${await sha(ip)}`;
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO rate (k, n, reset_at) VALUES (?1, 1, ?2)
     ON CONFLICT(k) DO UPDATE SET
       n = CASE WHEN rate.reset_at < ?3 THEN 1 ELSE rate.n + 1 END,
       reset_at = CASE WHEN rate.reset_at < ?3 THEN ?2 ELSE rate.reset_at END
     RETURNING n`
  )
    .bind(k, now + windowMs, now)
    .first();
  if (row && row.n > max) throw new HttpError(429, 'rate');
}

async function getKhatm(env, id) {
  if (!/^[A-Za-z0-9]{6,16}$/.test(id || '')) throw new HttpError(404, 'gone');
  const k = await env.DB.prepare('SELECT * FROM khatms WHERE id = ?1').bind(id).first();
  if (!k) throw new HttpError(404, 'gone');
  return k;
}
async function whoAmI(env, request, kid) {
  const tok = request.headers.get('x-token');
  if (!tok || tok.length > 100) return null;
  return (await env.DB.prepare('SELECT * FROM members WHERE token_hash = ?1 AND khatm_id = ?2').bind(await sha(tok), kid).first()) || null;
}
async function needMember(env, request, kid) {
  const m = await whoAmI(env, request, kid);
  if (!m) throw new HttpError(401, 'join');
  return m;
}
async function needHost(env, request, kid) {
  const m = await needMember(env, request, kid);
  if (!m.is_host) throw new HttpError(403, 'host');
  return m;
}
const touch = (env, id) => env.DB.prepare('UPDATE khatms SET updated_at = ?2 WHERE id = ?1').bind(id, Date.now());

async function addMember(env, kid, name, isHost) {
  const n = await env.DB.prepare('SELECT COUNT(*) AS c FROM members WHERE khatm_id = ?1').bind(kid).first();
  if (n.c >= LIM.members) throw bad('full', { n: LIM.members });
  const token = newToken();
  const id = rid(8);
  await env.DB.prepare('INSERT INTO members (id, khatm_id, name, token_hash, is_host, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(id, kid, name, await sha(token), isHost ? 1 : 0, Date.now())
    .run();
  return { id, token };
}

async function purgeOld(env) {
  const old = Date.now() - TTL_DAYS * DAY;
  const ids = (await env.DB.prepare('SELECT id FROM khatms WHERE updated_at < ?1 LIMIT 20').bind(old).all()).results.map((r) => r.id);
  if (!ids.length) return;
  const stmts = [];
  for (const id of ids) for (const t of ['parts', 'rounds', 'counts', 'members']) stmts.push(env.DB.prepare(`DELETE FROM ${t} WHERE khatm_id = ?1`).bind(id));
  for (const id of ids) stmts.push(env.DB.prepare('DELETE FROM khatms WHERE id = ?1').bind(id));
  await env.DB.batch(stmts);
}

async function create(request, env) {
  await limit(env, request, 'create', 20);
  const b = await body(request);
  const kind = b.kind === 'dhikr' ? 'dhikr' : 'quran';
  const purpose = isPurpose(b.purpose) ? b.purpose : 'general';
  const lang = isLang(b.lang) ? b.lang : 'en';
  const honoree = clean(b.honoree, 60);
  let title = clean(b.title, 80);
  const name = clean(b.name, 40, { required: true, field: 'field.name' });
  const note = cleanNote(b.note, 500);
  const deadline = cleanDate(b.deadline);
  let target = 0;
  let phrase = '';
  if (kind === 'dhikr') {
    target = int(b.target, 1, LIM.target);
    phrase = PHRASES[b.phrase] ? b.phrase : clean(b.phrase, 60, { required: true, field: 'field.phrase' });
  }
  if (!title) {
    const t = tFor(lang);
    title = kind === 'dhikr' ? (honoree ? t('title.dhikr', { p: phraseLabel(t, phrase), h: honoree }) : t('title.dhikr.none', { p: phraseLabel(t, phrase) })) : purposeTitle(t, purpose, honoree);
  }
  const id = rid(10);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO khatms (id, kind, purpose, title, honoree, note, deadline, round, target, phrase, lang, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?9, ?11, ?10, ?10)'
    ).bind(id, kind, purpose, title, honoree, note, deadline, target, phrase, now, lang),
    env.DB.prepare('INSERT INTO rounds (khatm_id, round, started_at) VALUES (?1, 1, ?2)').bind(id, now),
  ]);
  const m = await addMember(env, id, name, true);
  try {
    await purgeOld(env);
  } catch (e) {
    console.error(e);
  }
  return json({ id, token: m.token }, 201);
}

async function state(env, request, k) {
  const me = await whoAmI(env, request, k.id);
  const [parts, members, rounds, sums, recent, mine] = await env.DB.batch([
    env.DB.prepare('SELECT juz, member_id, reader, claimed_at, done_at FROM parts WHERE khatm_id = ?1 AND round = ?2 ORDER BY juz').bind(k.id, k.round),
    env.DB.prepare('SELECT COUNT(*) AS c FROM members WHERE khatm_id = ?1').bind(k.id),
    env.DB.prepare('SELECT round, started_at, completed_at, readers FROM rounds WHERE khatm_id = ?1 ORDER BY round').bind(k.id),
    env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS total, COUNT(DISTINCT member_id) AS people FROM counts WHERE khatm_id = ?1 AND round = ?2').bind(k.id, k.round),
    env.DB.prepare(
      'SELECT m.name AS name, c.n AS n, c.created_at AS at FROM counts c JOIN members m ON m.id = c.member_id WHERE c.khatm_id = ?1 AND c.round = ?2 ORDER BY c.id DESC LIMIT 12'
    ).bind(k.id, k.round),
    env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS total FROM counts WHERE khatm_id = ?1 AND round = ?2 AND member_id = ?3').bind(k.id, k.round, me ? me.id : ''),
  ]);
  const { id, kind, purpose, title, honoree, note, deadline, round, target, phrase, created_at, updated_at } = k;
  const lang = k.lang || 'en';
  return {
    khatm: { id, kind, purpose, title, honoree, note, deadline, round, target, phrase, lang, created_at, updated_at },
    me: me ? { id: me.id, name: me.name, is_host: !!me.is_host } : null,
    parts: parts.results.map((p) => ({ juz: p.juz, reader: p.reader, mine: !!me && p.member_id === me.id, claimed_at: p.claimed_at, done_at: p.done_at })),
    members: members.results[0].c,
    rounds: rounds.results,
    total: sums.results[0].total,
    contributors: sums.results[0].people,
    my_total: mine.results[0].total,
    recent: recent.results,
    now: Date.now(),
  };
}

async function maybeComplete(env, k) {
  if (k.kind === 'quran') {
    const r = await env.DB.prepare('SELECT COUNT(*) AS done, COUNT(DISTINCT reader) AS readers FROM parts WHERE khatm_id = ?1 AND round = ?2 AND done_at IS NOT NULL')
      .bind(k.id, k.round)
      .first();
    if (r.done >= 30)
      await env.DB.prepare('UPDATE rounds SET completed_at = ?3, readers = ?4 WHERE khatm_id = ?1 AND round = ?2 AND completed_at IS NULL').bind(k.id, k.round, Date.now(), r.readers).run();
  } else {
    const r = await env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS total, COUNT(DISTINCT member_id) AS people FROM counts WHERE khatm_id = ?1 AND round = ?2').bind(k.id, k.round).first();
    if (r.total >= k.target)
      await env.DB.prepare('UPDATE rounds SET completed_at = ?3, readers = ?4 WHERE khatm_id = ?1 AND round = ?2 AND completed_at IS NULL').bind(k.id, k.round, Date.now(), r.people).run();
  }
}
// A finished round is locked; undoing a "read" is the only change that can reopen it.
async function reopen(env, k) {
  await env.DB.prepare('UPDATE rounds SET completed_at = NULL, readers = 0 WHERE khatm_id = ?1 AND round = ?2').bind(k.id, k.round).run();
}

async function getPart(env, k, juz) {
  return env.DB.prepare('SELECT * FROM parts WHERE khatm_id = ?1 AND round = ?2 AND juz = ?3').bind(k.id, k.round, juz).first();
}

async function route(request, env, seg) {
  const m = request.method;
  if (seg[0] !== 'k') throw new HttpError(404, 'notFound');
  if (seg.length === 1 && m === 'POST') return create(request, env);
  const k = await getKhatm(env, seg[1]);
  const action = seg[2] || '';
  if (!action && m === 'GET') return json(await state(env, request, k));
  if (action === 'v' && m === 'GET') return json({ v: k.updated_at });
  if (m === 'DELETE' && !action) {
    await needHost(env, request, k.id);
    await env.DB.batch(['parts', 'rounds', 'counts', 'members'].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE khatm_id = ?1`).bind(k.id)).concat(env.DB.prepare('DELETE FROM khatms WHERE id = ?1').bind(k.id)));
    return json({ ok: true });
  }
  if (m === 'PATCH' && !action) {
    await needHost(env, request, k.id);
    await limit(env, request, 'write', 600);
    const b = await body(request);
    const title = b.title === undefined ? k.title : clean(b.title, 80, { required: true, field: 'field.title' });
    const note = b.note === undefined ? k.note : cleanNote(b.note, 500);
    const deadline = b.deadline === undefined ? k.deadline : cleanDate(b.deadline);
    await env.DB.prepare('UPDATE khatms SET title = ?2, note = ?3, deadline = ?4, updated_at = ?5 WHERE id = ?1').bind(k.id, title, note, deadline, Date.now()).run();
    return json(await state(env, request, { ...k, title, note, deadline }));
  }
  if (m !== 'POST') throw new HttpError(405, 'request');

  if (action === 'join') {
    await limit(env, request, 'join', 60);
    const b = await body(request);
    const name = clean(b.name, 40, { required: true, field: 'field.name' });
    const mm = await addMember(env, k.id, name, false);
    await touch(env, k.id).run();
    return json({ token: mm.token, id: mm.id }, 201);
  }

  await limit(env, request, 'write', 600);
  const me = await needMember(env, request, k.id);
  const b = await body(request);
  const done = async () => {
    await touch(env, k.id).run();
    const fresh = await getKhatm(env, k.id);
    return json(await state(env, request, fresh));
  };

  if (action === 'next-round') {
    if (!me.is_host) throw new HttpError(403, 'host');
    const r = await env.DB.prepare('SELECT completed_at FROM rounds WHERE khatm_id = ?1 AND round = ?2').bind(k.id, k.round).first();
    if (!r || !r.completed_at) throw bad('round');
    const now = Date.now();
    const deadline = cleanDate(b.deadline);
    await env.DB.batch([
      env.DB.prepare('UPDATE khatms SET round = round + 1, deadline = ?2 WHERE id = ?1 AND round = ?3').bind(k.id, deadline, k.round),
      env.DB.prepare('INSERT OR IGNORE INTO rounds (khatm_id, round, started_at) VALUES (?1, ?2, ?3)').bind(k.id, k.round + 1, now),
    ]);
    return done();
  }

  if (k.kind === 'dhikr') {
    if (action === 'count') {
      const n = int(b.n, 1, LIM.countAdd);
      const r = await env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS total FROM counts WHERE khatm_id = ?1 AND round = ?2').bind(k.id, k.round).first();
      if (r.total + n > LIM.target * 2) throw bad('counterFull');
      await env.DB.prepare('INSERT INTO counts (khatm_id, round, member_id, n, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(k.id, k.round, me.id, n, Date.now()).run();
      await maybeComplete(env, k);
      return done();
    }
    if (action === 'undo-count') {
      const last = await env.DB.prepare('SELECT id FROM counts WHERE khatm_id = ?1 AND round = ?2 AND member_id = ?3 ORDER BY id DESC LIMIT 1').bind(k.id, k.round, me.id).first();
      if (!last) throw bad('nothing');
      await env.DB.prepare('DELETE FROM counts WHERE id = ?1').bind(last.id).run();
      const r = await env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS total FROM counts WHERE khatm_id = ?1 AND round = ?2').bind(k.id, k.round).first();
      if (r.total < k.target) await reopen(env, k);
      return done();
    }
    throw new HttpError(404, 'notFound');
  }

  const juz = int(b.juz, 1, 30);
  if (action === 'claim') {
    let reader = me.name;
    if (b.reader !== undefined && b.reader !== '' && b.reader !== me.name) {
      if (!me.is_host) throw new HttpError(403, 'host');
      reader = clean(b.reader, 40, { required: true, field: 'field.their' });
    }
    const r = await env.DB.prepare('INSERT INTO parts (khatm_id, round, juz, member_id, reader, claimed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT DO NOTHING')
      .bind(k.id, k.round, juz, me.id, reader, Date.now())
      .run();
    if (!r.meta.changes) {
      const p = await getPart(env, k, juz);
      throw p ? new HttpError(409, 'taken', { name: p.reader, n: juz }) : new HttpError(409, 'takenAnon', { n: juz });
    }
    if (b.done) {
      await env.DB.prepare('UPDATE parts SET done_at = ?4 WHERE khatm_id = ?1 AND round = ?2 AND juz = ?3').bind(k.id, k.round, juz, Date.now()).run();
      await maybeComplete(env, k);
    }
    return done();
  }
  const p = await getPart(env, k, juz);
  if (!p) throw new HttpError(409, 'notTaken', { n: juz });
  if (p.member_id !== me.id && !me.is_host) throw new HttpError(403, 'belongs', { n: juz, name: p.reader });
  if (action === 'done') {
    const flag = b.done !== false;
    await env.DB.prepare('UPDATE parts SET done_at = ?4 WHERE khatm_id = ?1 AND round = ?2 AND juz = ?3').bind(k.id, k.round, juz, flag ? p.done_at || Date.now() : null).run();
    if (flag) await maybeComplete(env, k);
    else await reopen(env, k);
    return done();
  }
  if (action === 'release') {
    if (p.done_at) await reopen(env, k);
    await env.DB.prepare('DELETE FROM parts WHERE khatm_id = ?1 AND round = ?2 AND juz = ?3').bind(k.id, k.round, juz).run();
    return done();
  }
  throw new HttpError(404, 'notFound');
}

export async function handle(request, env) {
  try {
    const url = new URL(request.url);
    const seg = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean);
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin');
      if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'blocked');
    }
    return await route(request, env, seg);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message, code: e.code, vars: e.vars }, e.status);
    console.error(e);
    return json({ error: EN_T('err.server'), code: 'server' }, 500);
  }
}

// Raw numbers for the link preview of one khatm (formatted by functions/k/[id].js).
export async function preview(env, id) {
  if (!/^[A-Za-z0-9]{6,16}$/.test(id || '')) return null;
  const k = await env.DB.prepare('SELECT * FROM khatms WHERE id = ?1').bind(id).first();
  if (!k) return null;
  const [parts, counts, round] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) AS taken, COUNT(done_at) AS done, COUNT(DISTINCT reader) AS readers FROM parts WHERE khatm_id = ?1 AND round = ?2').bind(id, k.round),
    env.DB.prepare('SELECT COALESCE(SUM(n), 0) AS total, COUNT(DISTINCT member_id) AS people FROM counts WHERE khatm_id = ?1 AND round = ?2').bind(id, k.round),
    env.DB.prepare('SELECT completed_at FROM rounds WHERE khatm_id = ?1 AND round = ?2').bind(id, k.round),
  ]);
  return {
    k: { kind: k.kind, title: k.title, round: k.round, target: k.target, phrase: k.phrase, deadline: k.deadline, lang: k.lang || 'en' },
    s: { ...parts.results[0], ...counts.results[0], completed: !!(round.results[0] && round.results[0].completed_at) },
  };
}
