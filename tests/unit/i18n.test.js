// Every language file has exactly the English keys, the same {placeholders}, and valid plural forms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';

const dir = new URL('../../public/i18n/', import.meta.url);
const en = (await import(new URL('en.js', dir))).default;
const vars = (v) => [...new Set((typeof v === 'string' ? [v] : Object.values(v)).join(' ').match(/\{\w+\}/g) || [])].sort().join(',');
const files = readdirSync(dir).filter((f) => /^[a-z]{2}\.js$/.test(f) && f !== 'en.js');

for (const f of files) {
  const lang = f.slice(0, 2);
  test(`${lang}: same keys, placeholders and plural forms as English`, async () => {
    const d = (await import(new URL(f, dir))).default;
    const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
    assert.deepEqual(Object.keys(d).filter((k) => !(k in en)), [], 'extra keys');
    assert.deepEqual(Object.keys(en).filter((k) => !(k in d)), [], 'missing keys');
    for (const [k, v] of Object.entries(d)) {
      assert.ok(typeof v === 'string' || (v && typeof v === 'object'), k);
      if (typeof v === 'object') {
        assert.ok(typeof v.other === 'string', `${k}: plural needs "other"`);
        for (const c of Object.keys(v)) assert.ok(cats.includes(c), `${k}: "${c}" is not a plural category of ${lang} (${cats})`);
      }
      // Plural values may drop {n} in some forms (e.g. Arabic "one"/"two"), so compare the union of placeholders.
      const want = vars(en[k]);
      const got = vars(v);
      assert.equal(got, want, `${k}: placeholders`);
      assert.ok(!/TODO|\?\?\?/.test(JSON.stringify(v)), `${k}: unfinished`);
    }
  });
}
test('there are translations', () => assert.ok(files.length >= 1));
