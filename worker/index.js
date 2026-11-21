// pb-khatm-circle-db: one SQLite-backed Durable Object that stores every khatm.
// The Pages Functions (functions/) forward /api/* and preview lookups here through a Durable Object binding.
// It has no public route of its own (workers_dev = false; the default fetch handler returns 404).
import { DurableObject } from 'cloudflare:workers';
import { handle, preview } from './api.js';
import { SCHEMA } from './schema.js';

// D1-style shim over ctx.storage.sql, so worker/api.js reads like ordinary D1 code.
// Numbered parameters (?1, ?2) are rewritten to positional ones.
class Stmt {
  constructor(db, q, args = []) {
    this.db = db;
    this.q = q;
    this.args = args;
  }
  bind(...args) {
    return new Stmt(this.db, this.q, args);
  }
  exec() {
    const vals = [];
    const q = this.q.replace(/\?(\d+)/g, (_, n) => {
      const v = this.args[Number(n) - 1];
      vals.push(v === undefined ? null : v);
      return '?';
    });
    const cur = this.db.sql.exec(q, ...vals);
    const results = cur.toArray();
    return { results, meta: { changes: cur.rowsWritten } };
  }
  async first() {
    return this.exec().results[0] ?? null;
  }
  async all() {
    return this.exec();
  }
  async run() {
    return this.exec();
  }
}
export class ShimDB {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
  }
  prepare(q) {
    return new Stmt(this, q);
  }
  async batch(stmts) {
    return this.storage.transactionSync(() => stmts.map((s) => s.exec()));
  }
}

export class KhatmDB extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      for (const stmt of SCHEMA.split(';').map((s) => s.replace(/--.*$/gm, '').trim()).filter(Boolean)) ctx.storage.sql.exec(stmt);
    });
    this.db = { DB: new ShimDB(ctx.storage) };
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/__preview/')) {
      const out = await preview(this.db, url.pathname.slice('/__preview/'.length));
      return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
    }
    return handle(request, this.db);
  }
}

export default {
  fetch() {
    return new Response('Not found', { status: 404 });
  },
};
