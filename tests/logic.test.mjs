// Pure-logic tests (no browser): run with `node --test tests/`
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document = globalThis.document || { createElement: () => ({ getContext: () => new Proxy({}, { get: () => () => ({}) , set: () => true }), style: {} }), documentElement: {} };
globalThis.window = globalThis.window || {};
const E = await import('../src/expedition.js');
const { tr, setLang, getLang } = await import('../src/i18n.js').catch(() => ({}));

const quest = (over = {}) => ({ type: 'combat', seed: 1234, dur: 60, minH: 3, ok: true, deaths: [], region: 'greenwood', party: [{ id: 1, hp: 100 }, { id: 2, hp: 100 }, { id: 3, hp: 100 }], ...over });

test('mulberry is deterministic', () => {
  const a = E.mulberry(42), b = E.mulberry(42);
  for (let i = 0; i < 10; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

test('relic offers are stable, unique and exclude owned relics', () => {
  const q = { seed: 99, relics: [{ id: 'ironskin', from: 0 }] };
  const o1 = E.relicOffer(q, 4), o2 = E.relicOffer(q, 4);
  assert.deepEqual(o1, o2); assert.equal(o1.length, 3); assert.equal(new Set(o1).size, 3);
  assert.ok(!o1.includes('ironskin')); o1.forEach(id => assert.ok(E.RELICS[id]));
});

test('relic modifiers stack and respect the floor they were taken on', () => {
  const q = { relics: [{ id: 'ironskin', from: 0 }, { id: 'berserk', from: 5 }] };
  assert.equal(E.relicMods(q, 2).dmg, 0.85);
  assert.ok(Math.abs(E.relicMods(q, 6).dmg - 0.85 * 1.25) < 1e-9);
  assert.equal(E.relicMods(q, 6).gold, 1.4);
});

test('floor rewards grow with depth and bosses pay more', () => {
  const q = { seed: 7, relics: [] };
  assert.ok(E.floorReward(q, 9).gold > E.floorReward(q, 1).gold);
  assert.ok(E.floorReward(q, 4).gold > E.floorReward(q, 3).gold * 1.3);
  assert.equal(E.floorReward(q, 4).renown, 1);
  assert.deepEqual(E.floorReward(q, 6), E.floorReward(q, 6));
});

test('checkpoints fall every fifth floor', () => {
  assert.deepEqual([...Array(10).keys()].filter(E.diveCheckpoint), [4, 9]);
});

test('theme follows region first, then quest type', () => {
  assert.equal(E.themeFor({ region: 'stonepeak' }), 'cave');
  assert.equal(E.themeFor({ region: 'ruins' }), 'ruins');
  assert.equal(E.themeFor({ type: 'arcane', seed: 1 }), 'ruins');
});

test('endless dive generates floors on demand and survives a rebuild', () => {
  const q = quest({ dive: true, relics: [] }); q.script = E.newDiveScript(q);
  E.ensureFloors(q, 0);
  assert.ok(q.script.floors.length >= 1);
  const before = q.script.floors.length;
  E.ensureFloors(q, 400);
  assert.ok(q.script.floors.length > before || q.script.wiped);
  const T = q.script.floors[0].s + 1; E.rebuildDive(q, T);
  assert.ok(q.script.floors.length >= 1);
  q.script.floors.forEach((f, i) => { assert.ok(f.e > f.s); if (i) assert.ok(f.s >= q.script.floors[i - 1].s); });
});

test('expedition scripts are a pure function of the quest', () => {
  const a = E.genScript(quest()), b = E.genScript(quest());
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.equal(a.win.length, 3);
  const lost = E.genScript(quest({ ok: false, deaths: [2] })); assert.ok(lost.heroes[1].dies && !lost.heroes[0].dies);
  a.win.forEach(w => assert.ok(w.e > w.s));
});

test('Korean translation: exact, sentence rule and untranslated fallthrough', { skip: !tr }, () => {
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en' }, configurable: true });
  assert.equal(tr('Build'), 'Build');
  setLang('ko');
  assert.notEqual(tr('Build'), 'Build');
  assert.equal(tr('12345'), '12345');
  assert.equal(tr('50g'), '50골드');
  setLang('en'); assert.equal(getLang(), 'en');
});
