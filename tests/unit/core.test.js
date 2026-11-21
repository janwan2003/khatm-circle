import test from 'node:test';
import assert from 'node:assert/strict';
import { JUZ, PURPOSES, PHRASES } from '../../public/juz.js';
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
  assert.equal(PURPOSES.memorial.title('Grandma Amina'), 'Khatm in memory of Grandma Amina');
  assert.equal(PURPOSES.memorial.title(''), 'Khatm in loving memory');
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
