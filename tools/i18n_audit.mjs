// Lists the fixed English strings in the source that still come out (partly) English in Korean. Used by tests/i18n.test.mjs.
import fs from 'node:fs';
globalThis.document = { documentElement: {}, createTreeWalker: () => ({ nextNode: () => null }), body: null, querySelectorAll: () => [] };
globalThis.localStorage = { getItem: () => 'ko', setItem() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'ko' }, configurable: true });
const { initLang, tr } = await import('../src/i18n.js'); initLang();
export function audit(files = ['src/main.js']) {
  const out = [];
  for (const f of files) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    // plain 'single quoted' or "double quoted" text passed to toast(...) / showBanner(...)
    for (const m of src.matchAll(/toast\(\s*(['"`])((?:\\.|(?!\1).)+)\1\s*\)/g)) {
      const en = m[2].replace(/\\'/g, "'"); if (/\$\{/.test(en)) continue;
      const ko = tr(en); if (/[A-Za-z]{3,}(?:\s+[A-Za-z]{3,}){2,}/.test(ko.replace(/[A-Z]{2,}/g, ''))) out.push(en);
    }
  }
  return [...new Set(out)];
}
if (process.argv[1] && process.argv[1].endsWith('i18n_audit.mjs')) { const r = audit(); console.log(r.length + ' strings still English:'); r.forEach(x => console.log(' - ' + x)); }
