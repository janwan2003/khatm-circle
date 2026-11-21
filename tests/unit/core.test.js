import test from 'node:test';
import assert from 'node:assert/strict';
import { JUZ, PURPOSES, PHRASES, purposeTitle, juzStart, juzName } from '../../public/juz.js';
import { EN_T, makeT } from '../../public/i18n.js';
import { readFileSync } from 'node:fs';
import EN from '../../public/i18n/en.js';
import { describe } from '../../functions/k/[id].js';
import { SCHEMA } from '../../worker/schema.js';

test('30 juz, numbered, each with a name, Arabic opening words and a start', () => {
  assert.equal(JUZ.length, 30);
  JUZ.forEach((j, i) => {
    assert.equal(j.n, i + 1);
    assert.ok(j.name && j.ar && /\d+$/.test(j.start), `juz ${j.n}`);
  });
  assert.equal(JUZ[0].start, 'Al-Fatihah 1');
  assert.equal(JUZ[29].start, 'An-Naba 1');
});

test('purpose titles', () => {
  assert.equal(purposeTitle(EN_T, 'memorial', 'Grandma Amina'), 'Khatm in memory of Grandma Amina');
  assert.equal(purposeTitle(EN_T, 'memorial', ''), 'Khatm in loving memory');
  for (const p of PURPOSES) assert.ok(EN[`purpose.${p}`] && EN[`title.${p}`] && EN[`title.${p}.none`], p);
  assert.ok(Object.keys(PHRASES).includes('salawat'));
});

test('link preview text', () => {
  const k = { kind: 'quran', deadline: '2026-12-01' };
  assert.equal(describe(k, { taken: 18, done: 9, readers: 7, completed: false }), '18 of 30 juz taken · 9 read · 12 still free. Finish by Tue 1 Dec. Tap to pick a juz, no app or sign-up.');
  assert.equal(describe(k, { taken: 30, done: 4, readers: 20, completed: false }), '30 of 30 juz taken · 4 read. Finish by Tue 1 Dec. Tap to follow along, no app or sign-up.');
  assert.match(describe(k, { taken: 30, done: 30, readers: 27, completed: true }), /^Khatm complete: all 30 juz read by 27 people\./);
  const d = { kind: 'dhikr', phrase: 'salawat', target: 100000, deadline: '' };
  assert.equal(describe(d, { total: 2500, people: 3, completed: false }), '2,500 of 100,000 Salawat on the Prophet ﷺ so far, from 3 people. Tap to add your count, no app or sign-up.');
});

test('schema statements contain no semicolons inside comments (the object splits on ";")', () => {
  for (const line of SCHEMA.split('\n')) if (line.includes('--')) assert.ok(!line.slice(line.indexOf('--')).includes(';'), line);
});

test('every data-i18n key used in the HTML exists in English', () => {
  for (const f of ['index.html', 'k.html']) {
    const html = readFileSync(new URL(`../../public/${f}`, import.meta.url), 'utf8');
    const keys = [...html.matchAll(/data-i18n(?:-[a-z]+)?="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(keys.length >= 4, f);
    for (const k of keys) assert.ok(k in EN, `${f}: ${k}`);
  }
});

test('t(): plurals, number formatting, bold parts, English fallback', () => {
  assert.equal(EN_T('pill.joined', { n: 1 }), '1 person joined');
  assert.equal(EN_T('pill.joined', { n: 1200 }), '1,200 people joined');
  const ar = makeT('ar', { 'pill.joined': { one: 'انضم شخص واحد', two: 'انضم شخصان', few: 'انضم {n} أشخاص', other: 'انضم {n} شخصًا' } });
  assert.equal(ar('pill.joined', { n: 2 }), 'انضم شخصان');
  assert.equal(ar('pill.joined', { n: 5 }), 'انضم 5 أشخاص');
  assert.equal(ar('k.retry'), 'Try again'); // missing key falls back to English
  assert.equal(ar.dir, 'rtl');
  assert.equal(EN_T('grid.reading.stale', { n: 1, name: 'A', d: 3, count: 3 }), 'Juz 1: A is reading, taken more than 3 days ago');
  assert.deepEqual(EN_T.nodes('leg.read', { n: 12 }, ['n'], (v) => `<${v}>`), ['<12>', ' read']);
});

test('juz names and starts in Arabic script for ar and ur', () => {
  assert.equal(juzStart(JUZ[1], 'ar'), 'البقرة 142');
  assert.equal(juzStart(JUZ[1], 'tr'), 'Al-Baqarah 142');
  assert.equal(juzName(JUZ[29], 'ur'), 'عم');
});
