// Live expedition stage: a deterministic, scripted fight that is a pure function of quest progress.
//  - genScript(q) builds the timeline (3 encounters + travel + loot) from the quest seed and its pre-rolled outcome.
//  - Expedition draws the stage and the actors for any moment T (seconds since dispatch), so a quest can be watched,
//    joined late, sped up, or closed and reopened without ever contradicting the result.
import * as THREE from '../vendor/three.module.js';
import { tr } from './i18n.js';
import { sfx } from './audio.js';
import { clipInfo } from './rigchar.js';
import { makeChar, buildChar, buildHero, buildGoblin, buildBuilding, vox, tbox, mat, cyl, cone, sph, rot, PROPS } from './models.js';

export const STAGE_X = 170;                                   // stage sits far off the base map
export const TL = { enc: [[0.03, 0.36], [0.36, 0.62], [0.62, 0.90]], loot: 0.90, cutoff: 0.62 };
const ARENA = [-4, 3.5, 11];                                  // x of each fight
const CHEST_X = 17;
const MAX_IDLE = 2.0;                                        // longest pause before the party sets off for a fight
const ENEMY_RUN = 2.0;                                       // seconds the enemies take to run in (they appear just before the fight)
const RUN_SPEED = 4.4;                                       // units per second when the party runs between fights
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
export function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------ enemies */
const ENEMY = {
  goblin: { name: 'Goblin', make: () => buildGoblin(), h: 1.35 },
  wolf:   { name: 'Dire Wolf', make: () => wolf(), h: 1.3 },
  ogre:   { name: 'Ogre Warchief', make: () => (BIG.ogre ? BIG.ogre() : ogre()), h: 3.4, boss: true },
  bandit: { name: 'Bandit', make: () => bandit(false), h: 1.5 },
  chief:  { name: 'Bandit Chief', make: () => bandit(true), h: 2.3, boss: true },
  wisp:   { name: 'Wisp', make: () => wisp(), h: 1.6 },
  imp:    { name: 'Imp', make: () => imp(), h: 1.3 },
  frostgiant: { name: 'Frost Giant', make: () => (BIG.frostgiant ? BIG.frostgiant() : ogre({ skin: 0xb8d8f0, cloth: 0x4a6a8a, apron: 0x2a3a5a, scale: 2.4 })), h: 3.8, boss: true },
  duneking: { name: 'Dune Warlord', make: () => (BIG.duneking ? BIG.duneking() : ogre({ skin: 0xd8b06a, cloth: 0x7a2a1a, apron: 0x5a3a1a, scale: 2.2 })), h: 3.4, boss: true },
  lich: { name: 'Bone Lich', make: () => (BIG.lich ? BIG.lich() : charEnemy({ skin: 0xe8e4d0, shirt: 0x3a1a5a, sleeve: 0x3a1a5a, skirt: 0x3a1a5a, pants: 0x2a1048, hat: 'wizard', hatColor: 0x2a1048, beard: 0xcfd8c0, beardLen: 0.3, staff: 0x7aff7a }, 2.3)), h: 3.0, boss: true },
  golem:  { name: 'Ancient Golem', make: () => (BIG.golem ? BIG.golem() : golem()), h: 3.4, boss: true },
};
const BIG = {}; export const setBigMakers = m => Object.assign(BIG, m);   // main.js sets the rigged golem / ogre when rigged bodies are on
function charEnemy(look, scale) {
  const g = buildChar(look); g.scale.multiplyScalar(scale); if (g.userData.anim) return g;   // rigged: the clips animate it
  const [L, A] = [g.userData.legs, g.userData.arms];
  g.userData.swing = a => { L[0].rotation.x = a; L[1].rotation.x = -a; A[0].rotation.x = -a * 0.7; };
  g.userData.attack = u => { A[1].rotation.x = -2.4 * Math.sin(u * Math.PI); };
  return g;
}
function wolf() {
  const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
  const fur = 0x80848c, dark = 0x55595f;
  inner.add(vox(0.95, 0.42, 0.42, fur, 0, 0.38, 0), vox(0.45, 0.4, 0.38, fur, 0.62, 0.5, 0), vox(0.26, 0.18, 0.24, dark, 0.92, 0.52, 0), vox(0.07, 0.07, 0.09, 0x111111, 1.05, 0.62, 0));
  inner.add(cone(0.08, 0.2, fur, 0.55, 0.88, 0.12, 4), cone(0.08, 0.2, fur, 0.55, 0.88, -0.12, 4));
  inner.add(vox(0.06, 0.06, 0.04, 0xff3030, 0.84, 0.7, 0.2, 0xff0000, 1), vox(0.06, 0.06, 0.04, 0xff3030, 0.84, 0.7, -0.2, 0xff0000, 1));
  inner.add(rot(vox(0.55, 0.13, 0.13, dark, -0.78, 0.55, 0), 0, 0, 0.55), vox(0.5, 0.08, 0.1, 0xeeeeee, 0.95, 0.46, 0.0));
  const legs = [];
  for (const [x, z] of [[0.32, 0.15], [0.32, -0.15], [-0.32, 0.15], [-0.32, -0.15]]) { const l = new THREE.Group(); l.position.set(x, 0.38, z); l.add(vox(0.12, 0.38, 0.12, dark, 0, -0.38, 0)); inner.add(l); legs.push(l); }
  inner.rotation.y = -Math.PI / 2; g.scale.setScalar(1.15);
  g.userData.swing = a => legs.forEach((l, i) => { l.rotation.z = (i % 3 === 0 ? a : -a) * 1.1; });
  g.userData.attack = () => { };
  return g;
}
function ogre(o = {}) {
  const g = charEnemy({ skin: o.skin ?? 0x8aa84e, shirt: o.cloth ?? 0x7a5a3a, sleeve: o.skin ?? 0x8aa84e, pants: o.cloth ?? 0x5a4636, boots: 0x2a1a0a, hammer: true, belt: 0x3a2a1a, apron: o.apron ?? 0x6b4a2a }, o.scale ?? 2.1);
  g.children[0].add(cone(0.05, 0.16, 0xf4f0e6, -0.1, 0.52, 0.2, 4), cone(0.05, 0.16, 0xf4f0e6, 0.1, 0.52, 0.2, 4));
  return g;
}
function bandit(chief) {
  const g = charEnemy(chief
    ? { skin: 0xe6b88a, shirt: 0x55555d, plate: 0x55555d, sleeve: 0x55555d, pants: 0x2a2a2a, hat: 'helm', metal: 0x55555d, plume: 0x8b1d1d, sword: true, cape: 0x6b1d1d, shield: { body: 0x5a3a1a, trim: 0x8b1d1d } }
    : { skin: 0xf0c8a0, shirt: 0x3a3a46, sleeve: 0x3a3a46, pants: 0x2a2a2a, hat: 'hood', hatColor: 0x2a2a30, cape: 0x2a2a30, sword: true }, chief ? 1.45 : 1);
  if (chief && g.userData.anim) g.userData.clips = { attack: 'slash3', attacks: ['slash3', 'slash1', 'slash5', 'kick', 'slash3', 'attack2'], walk: 'walkCalm', walkSpeed: 1.0, run: 'runCalm', runSpeed: 1.0 };
  return g;
}
function wisp() {
  const g = new THREE.Group(); const col = 0x7affff;
  g.add(sph(0.2, col, 0, 0.65, 0, col, 1.4, 10));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false })); halo.position.y = 0.85; g.add(halo);
  const trail = [0.16, 0.12, 0.08].map((r, i) => { const t = sph(r, col, 0, 0.6 - i * 0.18, -0.2 - i * 0.18, col, 1.2, 6); g.add(t); return t; });
  g.userData.swing = a => { g.children[0].position.y = 0.65 + Math.sin(a * 2) * 0.1; };
  g.userData.attack = u => { halo.scale.setScalar(1 + Math.sin(u * Math.PI) * 0.8); };
  g.userData.float = true; return g;
}
function imp() {
  const g = charEnemy({ skin: 0xd04a3a, shirt: 0x4a1a1a, sleeve: 0xd04a3a, pants: 0x3a1a1a, dwarf: true, belt: 0x1a0a0a }, 0.95);
  const b = g.children[0];
  b.add(cone(0.05, 0.2, 0x2a0a0a, -0.12, 0.85, 0, 4), cone(0.05, 0.2, 0x2a0a0a, 0.12, 0.85, 0, 4));
  b.add(rot(vox(0.5, 0.3, 0.03, 0x7a1a1a, -0.3, 0.4, -0.2), 0, 0.5, 0), rot(vox(0.5, 0.3, 0.03, 0x7a1a1a, 0.3, 0.4, -0.2), 0, -0.5, 0));
  b.add(rot(vox(0.05, 0.4, 0.05, 0xd04a3a, 0, 0.0, -0.22), 0.6, 0, 0));
  return g;
}
function golem() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const legs = [-0.28, 0.28].map(x => { const l = new THREE.Group(); l.position.set(x, 0.6, 0); l.add(tbox(0.4, 0.6, 0.45, 'stone', 0, -0.6, 0)); body.add(l); return l; });
  body.add(tbox(1.0, 0.9, 0.62, 'stone', 0, 0.6, 0), tbox(0.5, 0.45, 0.5, 'stone', 0, 1.5, 0.02), vox(0.12, 0.08, 0.04, 0x55ffee, -0.12, 1.65, 0.27, 0x33ffd0, 1.5), vox(0.12, 0.08, 0.04, 0x55ffee, 0.12, 1.65, 0.27, 0x33ffd0, 1.5));
  body.add(vox(0.5, 0.1, 0.04, 0x55ffee, 0, 1.1, 0.32, 0x33ffd0, 1.2), vox(0.1, 0.3, 0.04, 0x55ffee, 0, 0.85, 0.32, 0x33ffd0, 1.2), vox(0.9, 0.12, 0.55, 0x5d9b45, 0, 1.5, 0));
  const arms = [-0.68, 0.68].map(x => { const a = new THREE.Group(); a.position.set(x, 1.35, 0); a.add(tbox(0.3, 0.8, 0.34, 'stone', 0, -0.8, 0), tbox(0.42, 0.4, 0.44, 'stone', 0, -1.15, 0.05)); body.add(a); return a; });
  g.scale.setScalar(1.5);
  g.userData.swing = a => { legs[0].rotation.x = a * 0.7; legs[1].rotation.x = -a * 0.7; arms[0].rotation.x = -a * 0.4; };
  g.userData.attack = u => { arms[1].rotation.x = -2.6 * Math.sin(u * Math.PI); arms[0].rotation.x = -1.2 * Math.sin(u * Math.PI); };
  return g;
}
const ENCOUNTERS = {
  combat: [(m, p) => ['goblin', Math.min(4, 1 + m)], (m, p) => ['wolf', p > 2 ? 3 : 2], (m) => ['ogre', 1, m >= 2 ? ['goblin'] : []]],
  gather: [(m) => ['bandit', Math.min(4, 1 + m)], (m, p) => ['wolf', p > 2 ? 3 : 2], () => ['chief', 1, ['bandit']]],
  arcane: [(m) => ['wisp', Math.min(4, 1 + m)], (m, p) => ['imp', p > 2 ? 3 : 2], () => ['golem', 1, []]],
};
ENCOUNTERS.defense = ENCOUNTERS.combat;
// regions with a boss of their own: the finale of every quest posted there is that boss; each has a weakness (a class that hurts it)
export const REGION_BOSS = { frostpeak: 'frostgiant', dunes: 'duneking', hollow: 'lich' };
export const BOSS = {
  frostgiant: { weak: ['wizard', 'alchemist'], note: 'fire melts its frozen hide' },
  duneking: { weak: ['rogue', 'ranger'], note: 'sharp, precise strikes find the gaps in its armour' },
  lich: { weak: ['cleric'], note: 'holy light burns the undead' },
};
const ENC_NAMES = { frostgiant: 'Frost Giant', duneking: 'Dune Warlord', lich: 'Bone Lich', goblin: 'Goblin Raiders', wolf: 'Dire Wolves', ogre: 'Ogre Warchief', bandit: 'Bandit Ambush', chief: 'Bandit Chief', wisp: 'Wisp Swarm', imp: 'Imp Pack', golem: 'Ancient Golem' };
export const themeFor = q => ({ frostpeak: 'cave', dunes: 'forest', hollow: 'ruins', stonepeak: 'cave', ruins: 'ruins', ashen: 'forest', greenwood: 'forest' })[q.region] || (q.type === 'arcane' ? 'ruins' : (q.type === 'combat' && q.seed % 2 ? 'cave' : 'forest'));

/* ------------------------------------------------------------ script */
export function genScript(q) {
  const party = q.party, n = party.length, dur = q.dur;
  const r1 = mulberry(q.seed), r2 = mulberry(q.seed * 7 + 13);
  const win = TL.enc.map(([s, e]) => { const len = (e - s) * dur; return { s: s * dur, e: e * dur, a: s * dur + 0.18 * len, b: e * dur - 0.10 * len }; });
  const S = { dur, n, win, theme: themeFor(q), enemies: [], encs: [], heroes: [], events: [] };
  // enemies
  ENCOUNTERS[q.type].forEach((fn, i) => {
    let [kind, count, extra] = fn(q.minH, n); if (i === 2 && REGION_BOSS[q.region]) { kind = REGION_BOSS[q.region]; count = 1; }   // the region's own boss closes the quest
    const kinds = [kind, ...Array(count - 1).fill(kind), ...(extra || [])];
    const w = win[i], m = kinds.length, idxs = [];
    kinds.forEach((k, j) => {
      const info = ENEMY[k], boss = !!info.boss && i === 2 && j === 0, dies = !(boss && !q.ok);
      const D = dies ? w.a + (w.b - w.a) * (0.5 + 0.5 * (j + 1) / m) : Infinity;
      const home = { x: ARENA[i] + 0.8 + (j % 2) * 1.0, z: (j - (m - 1) / 2) * 1.5 };
      S.enemies.push({ enc: i, j, kind: k, name: info.name, boss, s: w.s, a: w.a, b: w.b, D, endFrac: dies ? 1 : 0.62, home, h: info.h });
      idxs.push(S.enemies.length - 1);
    });
    S.encs.push({ name: ENC_NAMES[kind], idxs, s: w.s, e: w.e });
  });
  // hero damage budgets (encounters 1-2 never depend on the outcome; the finale does)
  const wts = [0.22, 0.3, 0.48];
  party.forEach(() => { const tot = 0.3 + r1() * 0.3; S.heroes.push({ dmg: wts.map(x => tot * x), dies: false, D: Infinity }); });
  party.forEach((p, h) => {
    const H = S.heroes[h];
    if (!q.ok) { if (q.deaths.includes(p.id)) { H.dies = true; H.D = win[2].a + (win[2].b - win[2].a) * (0.55 + 0.4 * r2()); } else H.dmg[2] = Math.max(0.1, 0.82 - H.dmg[0] - H.dmg[1]); }
    else H.dmg[2] *= 0.7 + 0.6 * r2();
  });
  // events: hero attacks, enemy attacks, deaths, phases
  const ev = S.events; const aliveH = (h, t) => !(S.heroes[h].dies && t >= S.heroes[h].D);
  ev.push({ t: 0, type: 'phase', log: `Setting out: ${q.name}` });
  S.encs.forEach((enc, i) => {
    const w = win[i]; ev.push({ t: w.s, type: 'phase', log: `Encounter ${i + 1}/3: ${enc.name}!`, enc: i });
    const rr = i === 2 ? r2 : r1;
    party.forEach((p, h) => {
      const P = 0.95 + 0.2 * h + rr() * 0.25; let t = w.a + rr() * P;
      for (; t < w.b; t += P) {
        if (!aliveH(h, t)) break;
        const e = enc.idxs.find(k => S.enemies[k].D > t); if (e === undefined) break;
        const base = p.cls === 'wizard' ? 11 : p.cls === 'knight' ? 9 : 8;
        ev.push({ t, type: 'hit', h, e, dmg: Math.round(base * (0.8 + rr() * 0.8) + p.level), log: `${p.name} hits ${S.enemies[e].name} −` });
      }
    });
    enc.idxs.forEach(k => {
      const E = S.enemies[k], P = 1.25 + rr() * 0.5; let t = w.a + rr() * P;
      for (; t < Math.min(w.b, E.D); t += P) {
        const alive = party.map((_, h) => h).filter(h => aliveH(h, t)); if (!alive.length) break;
        const h = alive[Math.floor(rr() * alive.length)];
        ev.push({ t, type: 'ehit', e: k, h, dmg: Math.round(3 + rr() * 8 + (E.boss ? 6 : 0)), log: `${E.name} hits ${party[h].name} −` });
      }
      if (isFinite(E.D)) ev.push({ t: E.D, type: 'edie', e: k, log: `${E.name} defeated!` });
    });
  });
  party.forEach((p, h) => { if (S.heroes[h].dies) ev.push({ t: S.heroes[h].D, type: 'hdie', h, log: `${p.name} has fallen!` }); });
  ev.push({ t: dur * TL.loot + 0.5, type: 'loot', log: q.ok ? 'Victory! The party opens the loot chest.' : 'The party is defeated and retreats…' });
  ev.sort((a, b) => a.t - b.t); ev.forEach((e, i) => { e.id = i; });
  return S;
}
export function heroHp(q, S, h, T) {
  if (S.dive) return diveHp(q, S, h, T);
  const H = S.heroes[h], w = S.win, base = t => {
    let d = 0; for (let e = 0; e < 3; e++) d += H.dmg[e] * clamp((t - w[e].a) / (w[e].b - w[e].a), 0, 1);
    let heal = 0; for (const x of q.heals || []) if (t >= x.t) heal += x.amt * clamp((t - x.t) / 0.6, 0, 1);
    return clamp(1 - d + heal, 0, 1);
  };
  if (H.dies) { if (T >= H.D) return 0; if (T >= w[2].a) return base(w[2].a) * (1 - (T - w[2].a) / (H.D - w[2].a)); }
  return base(T);
}
export function enemyHp(S, k, T) {
  const E = S.enemies[k]; if (T >= E.D) return 0;
  if (isFinite(E.D)) return 1 - clamp((T - E.a) / (E.D - E.a), 0, 1);
  return 1 - E.endFrac * clamp((T - E.a) / (E.b - E.a), 0, 1);
}
export function phaseText(S, T) {
  if (S.dive) { const f = S.floors.length ? S.floors[diveFloorIndex(S, T)] : null; return f ? `Floor ${f.k + 1}${f.boss ? ' — BOSS' : ''} · ${S.encs[f.k].name}` : 'Entering the dungeon…'; }
  for (let i = 0; i < 3; i++) if (T >= S.win[i].s && T < S.win[i].e) return `Encounter ${i + 1}/3 — ${S.encs[i].name}`;
  return T < S.win[0].s ? 'Travelling to the danger zone' : 'Looting';
}


/* ------------------------------------------------------------ endless dive engine
   Floors are generated on demand from (seed, party, heals, wards), so a dive is still a pure function of its inputs:
   it can be watched live, joined late, saved and replayed. Hero HP is real: it carries from floor to floor. */
const DIVE_POOL = [['goblin', 'goblin', 'wolf', 'bandit'], ['wolf', 'bandit', 'imp', 'wisp'], ['imp', 'wisp', 'wolf', 'bandit', 'goblin']];
const DIVE_BOSS = ['ogre', 'chief', 'golem'];
export const diveCheckpoint = k => (k + 1) % 5 === 0;
export function newDiveScript(q) {
  return { dive: true, dur: Infinity, n: q.party.length, theme: 'cave', win: [], enemies: [], encs: [], heroes: q.party.map(() => ({ dies: false, D: Infinity })), events: [], floors: [], endT: Infinity, wiped: false, rev: 0, evSeq: 0 };
}
export const RELICS = {
  ironskin: { icon: '🛡️', name: 'Iron Skin', desc: 'Take 15% less damage.', dmg: 0.85 },
  vampiric: { icon: '🩸', name: 'Vampiric Blades', desc: 'Heroes recover +8% HP after every floor.', regen: 0.08 },
  magnet: { icon: '🧲', name: 'Gold Magnet', desc: '+50% gold from floors.', gold: 1.5 },
  lucky: { icon: '🍀', name: 'Lucky Charm', desc: '+60% chance of rare drops.', rare: 1.6 },
  berserk: { icon: '🔥', name: 'Berserker Rune', desc: 'Enemies hit 25% harder, but floors pay +40% gold.', dmg: 1.25, gold: 1.4 },
  healer: { icon: '🧪', name: "Healer's Kit", desc: 'Potions heal 25% more.', heal: 1.25 },
  wellspring: { icon: '✨', name: 'Mana Wellspring', desc: '+3 Mana after every floor.', mana: 3 },
  evasion: { icon: '💨', name: 'Wind Cloak', desc: 'Take 20% less damage, but earn 15% less gold.', dmg: 0.8, gold: 0.85 },
};
export function relicMods(q, k) {
  const m = { dmg: 1, gold: 1, rare: 1, regen: 0, heal: 1, mana: 0 };
  for (const r of q.relics || []) { if (r.from > k) continue; const d = RELICS[r.id]; m.dmg *= d.dmg || 1; m.gold *= d.gold || 1; m.rare *= d.rare || 1; m.regen += d.regen || 0; m.heal *= d.heal || 1; m.mana += d.mana || 0; }
  return m;
}
export function relicOffer(q, k) {
  const r = mulberry(q.seed * 91 + k * 311 + 5), own = (q.relics || []).map(x => x.id), pool = Object.keys(RELICS).filter(id => !own.includes(id)), out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}
export function floorReward(q, k) {
  const r = mulberry(q.seed * 57 + k * 977 + 3), boss = k % 5 === 4, rm = relicMods(q, k);
  const rw = { gold: Math.round((14 + 9 * k) * (boss ? 2 : 1) * (0.9 + 0.2 * r()) * rm.gold), ore: Math.floor(1 + r() * 2.5), wood: r() < 0.5 ? 1 : 0, herbs: Math.floor(r() * 2.5), mana: (boss ? 5 : 0) + rm.mana, mythril: 0, scale: 0, feather: 0, renown: boss ? 1 : 0 };
  if (k >= 6 && r() < (boss ? 0.5 : 0.12) * rm.rare) rw.mythril = 1 + (boss && k >= 14 ? 1 : 0);
  if (boss && k >= 9 && r() < 0.55 * rm.rare) rw.scale = 1;
  if (boss && k >= 14 && r() < 0.4 * rm.rare) rw.feather = 1;
  return rw;
}
export function rewardText(rw) {
  const parts = [`+${rw.gold}g`]; if (rw.ore) parts.push(`⛏️${rw.ore}`); if (rw.herbs) parts.push(`🌿${rw.herbs}`); if (rw.wood) parts.push(`🪵${rw.wood}`); if (rw.mana) parts.push(`✨${rw.mana}`);
  if (rw.mythril) parts.push(`💎${rw.mythril}`); if (rw.scale) parts.push(`🐉${rw.scale}`); if (rw.feather) parts.push(`🪶${rw.feather}`); if (rw.renown) parts.push(`⭐${rw.renown}`);
  return parts.join(' ');
}
function floorHpAt(q, f, h, T) {
  const pr = clamp((T - f.a) / (f.b - f.a), 0, 1); let heal = 0;
  for (const x of q.heals || []) if (x.t >= f.s && x.t < f.e) heal += x.amt * clamp((T - x.t) / 0.6, 0, 1);
  return clamp(f.hp0[h] - f.dmg[h] * pr + heal, 0, 1);
}
function floorAt(S, T) { for (let i = S.floors.length - 1; i >= 0; i--) if (S.floors[i].s <= T) return S.floors[i]; return S.floors[0] || null; }
export function diveFloorIndex(S, T) { const f = floorAt(S, T); return f ? f.k : 0; }
function diveHp(q, S, h, T) {
  const H = S.heroes[h]; if (H.dies && T >= H.D) return 0;
  const f = floorAt(S, T); if (!f || T < f.s) return 1;
  return floorHpAt(q, f, h, T);
}
function scanDeaths(q, S, f) {
  q.party.forEach((p, h) => {
    if (S.heroes[h].dies || f.hp0[h] <= 0) return;
    for (let t = f.a; t <= f.b + 1e-6; t += 0.1) if (floorHpAt(q, f, h, t) <= 0.0005) { S.heroes[h] = { dies: true, D: t }; break; }
  });
  f.lost = S.heroes.every(H => H.dies);
  if (f.lost) { S.wiped = true; S.endT = Math.max(...S.heroes.map(H => H.D)) + 3.5; } else { S.wiped = false; S.endT = Infinity; }
}
function setEnemyTimes(S, f) {
  const idxs = S.encs[f.k].idxs, m = idxs.length;
  idxs.forEach((ei, j) => { const E = S.enemies[ei], dies = !(f.lost && j === 0); E.D = dies ? E.a + (E.b - E.a) * (0.5 + 0.5 * (j + 1) / m) : Infinity; E.endFrac = dies ? 1 : 0.62; });
}
function genFloorEvents(q, S, f, fromT) {
  const party = q.party, enc = S.encs[f.k], rr = mulberry(q.seed * 17 + f.k * 104729 + (q.heals || []).length * 13 + (q.enchants || []).length * 7);
  const push = e => { if (e.t > fromT) { e.id = S.evSeq++; S.events.push(e); } };
  const aliveH = (h, t) => f.hp0[h] > 0 && !(S.heroes[h].dies && t >= S.heroes[h].D);
  push({ t: f.s, type: 'phase', log: `Floor ${f.k + 1}${f.boss ? ' — BOSS' : ''}: ${enc.name}` });
  party.forEach((p, h) => {
    const P = 0.95 + 0.2 * h + rr() * 0.25; let t = f.a + rr() * P;
    for (; t < f.b; t += P) {
      if (!aliveH(h, t)) break; const e = enc.idxs.find(k => S.enemies[k].D > t); if (e === undefined) break;
      const base = p.cls === 'wizard' ? 11 : p.cls === 'knight' ? 9 : 8;
      push({ t, type: 'hit', h, e, dmg: Math.round(base * (0.8 + rr() * 0.8) + p.level + f.k * 0.6), log: `${p.name} hits ${S.enemies[e].name} −` });
    }
  });
  enc.idxs.forEach(k => {
    const E = S.enemies[k], P = 1.25 + rr() * 0.5; let t = f.a + rr() * P;
    for (; t < Math.min(f.b, E.D); t += P) {
      const alive = party.map((_, h) => h).filter(h => aliveH(h, t)); if (!alive.length) break;
      const h = alive[Math.floor(rr() * alive.length)];
      push({ t, type: 'ehit', e: k, h, dmg: Math.round(3 + rr() * 8 + (E.boss ? 6 : 0) + f.k * 0.8), log: `${E.name} hits ${party[h].name} −` });
    }
    if (isFinite(E.D)) push({ t: E.D, type: 'edie', e: k, log: `${E.name} defeated!` });
  });
  party.forEach((p, h) => { const H = S.heroes[h]; if (H.dies && H.D >= f.s && H.D <= f.e) push({ t: H.D, type: 'hdie', h, log: `${p.name} has fallen!` }); });
  if (!f.lost) push({ t: f.e - 0.4, type: 'loot', log: `Floor ${f.k + 1} cleared · ${rewardText(f.reward)}${diveCheckpoint(f.k) ? ' · CHECKPOINT: loot banked!' : ''}` });
  else push({ t: Math.max(f.b, S.endT - 1.2), type: 'loot', log: 'The party has been wiped out…' });
  S.events.sort((a, b) => a.t - b.t); S.rev++;
}
function genFloor(q, S) {
  const k = S.floors.length, prev = S.floors[k - 1], party = q.party;
  const r = mulberry(q.seed * 31 + k * 7919 + 11), boss = k % 5 === 4, len = k === 0 ? 17 : (boss ? 18 : 13);
  const s = prev ? prev.e : 0, e = s + len, a = s + (k === 0 ? 6.5 : 0.2 * len), b = e - 0.12 * len;
  const alive = party.map((_, h) => !S.heroes[h].dies);
  const rm = relicMods(q, k);
  const hp0 = party.map((_, h) => !alive[h] ? 0 : (prev ? Math.min(1, floorHpAt(q, prev, h, prev.e) + 0.05 + rm.regen) : 1));
  const P = party.reduce((sum, p, h) => alive[h] ? sum + (p.power || 3) : sum, 0);
  const Dk = 2.5 * Math.pow(1.12, k) * (boss ? 1.5 : 1), ward = (q.enchants || []).some(x => k >= x.floor && k < x.floor + 3);
  const per = 0.07 * Math.pow(Dk / Math.max(1, P), 1.5) * (ward ? 0.6 : 1) * rm.dmg;
  const dmg = party.map((_, h) => alive[h] ? clamp(per * (0.75 + 0.5 * r()), 0, 0.95) : 0);
  const f = { k, s, e, a, b, boss, hp0, dmg, ward, lost: false, reward: floorReward(q, k) };
  S.floors.push(f); S.win.push({ s, e, a, b });
  // enemies
  const bossKind = DIVE_BOSS[((k / 5) | 0) % 3], pool = DIVE_POOL[Math.min(2, (k / 6) | 0)], pickK = () => pool[Math.floor(r() * pool.length)];
  const kinds = boss ? [bossKind, ...Array.from({ length: k >= 14 ? 2 : 1 }, pickK)] : Array.from({ length: clamp(2 + ((k / 4) | 0), 2, 6) }, pickK), m = kinds.length, idxs = [];
  kinds.forEach((kind, j) => {
    const info = ENEMY[kind];
    S.enemies.push({ enc: k, j, kind, name: info.name, boss: boss && j === 0, s, a, b, D: Infinity, endFrac: 1, home: { x: ARENA[0] + 0.8 + (j % 2) * 1.0 + (j > 3 ? 1 : 0), z: (j - (m - 1) / 2) * 1.5 }, h: info.h });
    idxs.push(S.enemies.length - 1);
  });
  S.encs.push({ name: boss ? `${ENEMY[bossKind].name} (Boss)` : [...new Set(kinds.map(x => ENEMY[x].name))].join(', '), idxs, s, e });
  scanDeaths(q, S, f); setEnemyTimes(S, f); genFloorEvents(q, S, f, -Infinity);
}
// When the show is over: a won quest ends once the chest has opened and the coins have flown, a lost one once the party has
// fallen back. The quest completes then, instead of idling until the progress bar fills (the outcome is already decided).
export function questEnd(q) {
  if (q.dive || !q.script || !q.script.win) return q.dur;
  return Math.min(q.dur, q.ok ? q.dur * 0.93 + 3.0 : q.script.win[2].b + 3.5);
}
export function ensureFloors(q, now) {
  const S = q.script; let guard = 0;
  while (!S.wiped && guard++ < 60 && (S.floors.length === 0 || S.floors[S.floors.length - 1].e < now + 20)) genFloor(q, S);
}
// a heal or ward changed the future: drop later floors and re-evaluate the current one from time T
export function rebuildDive(q, T) {
  const S = q.script, idx = diveFloorIndex(S, T), f = S.floors[idx]; if (!f) return;
  S.floors.length = idx + 1; S.win.length = idx + 1; S.encs.length = idx + 1; S.enemies = S.enemies.filter(E => E.enc <= idx);
  S.events = S.events.filter(e => e.t <= T);
  S.heroes.forEach((H, h) => { if (H.dies && H.D >= f.s) S.heroes[h] = { dies: false, D: Infinity }; });
  S.wiped = false; S.endT = Infinity;
  scanDeaths(q, S, f); setEnemyTimes(S, f); genFloorEvents(q, S, f, T);
  ensureFloors(q, T);
}

/* ------------------------------------------------------------ stage scenery */
function buildStage(theme, seed, lowfx) {
  const r = mulberry(seed ^ 0xabc), R = (a, b) => a + r() * (b - a);
  const g = new THREE.Group(), out = { group: g, theme, swirl: null, flicker: [] };
  const col = { forest: 0x4f9a3f, ruins: 0x7f8f62, cave: 0x3b3b46 }[theme];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(180, 130), new THREE.MeshLambertMaterial({ color: col })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
  const pathCol = { forest: 0xb58a56, ruins: 0xa6a496, cave: 0x55535f }[theme], arenaCol = { forest: 0x9c7446, ruins: 0x8a887c, cave: 0x4a4852 }[theme];
  const path = vox(52, 0.05, 3.4, pathCol, 2, 0, 0); path.castShadow = false; g.add(path);
  ARENA.forEach(x => { const d = cyl(3.9, 3.9, 0.06, arenaCol, x + 0.6, 0.01, 0, 22); d.castShadow = false; g.add(d); });
  const place = (o, x, z, ry) => { o.position.set(x, 0, z); o.rotation.y = ry ?? R(0, 6); g.add(o); return o; };
  const side = () => (r() < 0.5 ? -1 : 1) * R(5.5, 24);
  if (theme === 'forest') {
    for (let i = 0; i < (lowfx ? 36 : 70); i++) place(PROPS.tree(R(0.9, 1.7), Math.floor(R(0, 3))), R(-34, 36), side());
    for (let i = 0; i < 10; i++) place(PROPS.rockCluster(R(0.7, 1.4)), R(-24, 30), side());
    for (let i = 0; i < 8; i++) place(PROPS.bigMushroom([0xd6336c, 0x7b3fb5, 0x2aa9a0, 0xe07a1f][i % 4], R(0.6, 1.3)), R(-24, 28), side());
    place(buildBuilding('tent', 1), ARENA[0] + 3, -5.2, 0.4); place(buildBuilding('tent', 0), ARENA[0] + 6.5, 5.2, -0.5);
    const cf = PROPS.campfire(); place(cf, ARENA[0] + 5.5, -4.2, 0); if (!lowfx) out.flicker.push(cf.userData.flicker); else cf.remove(cf.userData.flicker);
    place(PROPS.crateStack(), ARENA[0] + 7.5, -4.8, 0.3); place(PROPS.spikeBarricade(), ARENA[1] + 6, 3.2, 0.2); place(PROPS.logs(0, 0), ARENA[1] - 3.5, -3.6, 0.5);
  } else if (theme === 'ruins') {
    for (let i = 0; i < 26; i++) { const h = R(1.2, 4.2), x = R(-26, 30), z = side(); const p = tbox(0.8, h, 0.8, 'stone', 0, 0, 0); p.position.set(x, h / 2, z); p.rotation.y = R(0, 1); g.add(p); if (r() < 0.5) { const t = vox(0.9, 0.25, 0.9, 0x5d9b45, x, h, z); g.add(t); } }
    for (let i = 0; i < 14; i++) { const b = tbox(R(0.5, 1.2), R(0.3, 0.7), R(0.5, 1.2), 'stone', R(-24, 30), 0, side() * 0.8); b.rotation.y = R(0, 3); g.add(b); }
    place(PROPS.standingStones(), ARENA[1] + 0.5, -6.5, 0.3); place(PROPS.standingStones(), ARENA[0] + 3, 6.8, 2.8);
    const gate = buildBuilding('portal'); gate.scale.setScalar(1.7); place(gate, ARENA[2] + 9, 0, -Math.PI / 2); out.swirl = gate.userData.swirl; gate.children.forEach(c => { if (c.isLight && lowfx) gate.remove(c); });
    ARENA.forEach(x => { const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.3, 40), new THREE.MeshBasicMaterial({ color: 0x55d6c0, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(x + 0.6, 0.08, 0); g.add(ring); });
    for (let i = 0; i < 18; i++) place(PROPS.tree(R(0.9, 1.5), 2), R(-34, 36), side() * 1.2);
  } else {
    // cave: boulder walls and stalagmites; the camera-facing (+z) side stays low so it never blocks the view
    for (let i = 0; i < 26; i++) place(PROPS.rockCluster(R(2.2, 4.0)), R(-34, 36), -R(7.5, 14));
    for (let i = 0; i < 14; i++) place(PROPS.rockCluster(R(0.9, 1.6)), R(-30, 34), R(6.5, 14));
    for (let i = 0; i < 22; i++) { const h = R(1.5, 4), s = cone(R(0.4, 0.8), h, 0x56565f, R(-30, 34), 0, -R(5.5, 12), 6); g.add(s); }
    for (let i = 0; i < 16; i++) { const c = [0xb070ff, 0x55e0ff, 0xff70c0][i % 3], h = R(0.6, 1.8), s = cone(R(0.15, 0.3), h, c, R(-28, 34), 0, (r() < 0.5 ? -1 : 1) * R(4.6, 9), 5, c, 1.2); g.add(s); }
    [-8, 0, 8, 16].forEach((x, i) => { const t = PROPS.lanternSmall(); place(t, x, i % 2 ? 3.6 : -3.6, 0); if (!lowfx) out.flicker.push(t.userData.flicker); else t.remove(t.userData.flicker); });
  }
  // loot chest
  const chest = new THREE.Group(); chest.position.set(CHEST_X, 0, 0);
  chest.add(vox(0.9, 0.5, 0.6, 0x8a5a2b), vox(0.95, 0.1, 0.65, 0xc9962f, 0, 0.2, 0), vox(0.12, 0.2, 0.05, 0xe8c04a, 0, 0.28, 0.33));
  const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.3); lid.add(vox(0.9, 0.22, 0.6, 0x9c6b3c, 0, 0, 0.3), vox(0.95, 0.06, 0.65, 0xc9962f, 0, 0.1, 0.3)); chest.add(lid);
  const glow = sph(0.28, 0xffd24a, 0, 0.45, 0, 0xffd24a, 1.4, 8); chest.add(glow);
  chest.userData = { lid, glow }; g.add(chest); out.chest = chest;
  return out;
}
const THEME = {
  forest: { bg: 0x7ec8e3, sun: 1.05, amb: 0.75, name: 'Goblin Woods' },
  ruins: { bg: 0x9ab8c8, sun: 0.95, amb: 0.7, name: 'Sunken Ruins' },
  cave: { bg: 0x15151d, sun: 0.4, amb: 0.55, name: 'Deep Cave' },
};

/* ------------------------------------------------------------ the live stage */
// Which clips each class fights with (see clips.js): blades for knights, the bow for rangers, bolts and fire for wizards
const ATTACKS = { knight: ['slash1', 'slash3', 'attack1'], ranger: ['shoot'], wizard: ['mgBolt', 'mgFire'], rogue: ['attack1', 'attack2', 'kick', 'slash1'], cleric: ['mgHoly', 'mgBolt'], alchemist: ['mgFire', 'mgBolt'] };
const MELEE = ['knight', 'rogue'];
const healerIdx = q => { for (const c of ['cleric', 'alchemist', 'wizard']) { const i = q.party.findIndex(p => p.cls === c); if (i >= 0) return i; } return 0; };
const firstAfter = (arr, t) => { let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].t < t) lo = mid + 1; else hi = mid; } return lo; };
export class Expedition {
  constructor({ scene, q, lowfx, labelEl, project }) {
    this.scene = scene; this.q = q; this.S = q.script; this.labelEl = labelEl; this.project = project; this.lowfx = lowfx;
    this.theme = THEME[this.S.theme]; this.name = this.S.dive ? 'Endless Dungeon' : this.theme.name;
    this.origin = new THREE.Vector3(STAGE_X, 0, 0);
    this.group = new THREE.Group(); this.group.position.copy(this.origin);
    this.stage = buildStage(this.S.theme, q.seed, lowfx); this.group.add(this.stage.group);
    this.hero = q.party.map(p => { const m = buildHero(p.cls, p.variant); this.group.add(m); return { m, p, bar: this.bar(p.name, 'hero') }; });
    this.foe = [];
    // pooled effects: projectiles and hit sparks
    this.proj = Array.from({ length: 8 }, () => { const m = sph(0.12, 0xffffff, 0, 0, 0, 0xffffff, 1.2, 6); m.visible = false; this.group.add(m); return m; });
    // arrows (a real shaft that flies straight), spell bolts/fireballs with trails, and ground rings for impacts
    this.arrows = Array.from({ length: 8 }, () => { const g = new THREE.Group(); g.add(vox(0.035, 0.035, 0.8, 0x8a5a2b, 0, -0.0175, -0.4), cone(0.06, 0.16, 0xdfe3ea, 0, 0, 0.0, 4), vox(0.1, 0.012, 0.16, 0xc0392b, 0, -0.006, -0.78), vox(0.012, 0.1, 0.16, 0xc0392b, 0, -0.05, -0.78)); g.children[1].rotation.x = Math.PI / 2; g.children[1].position.set(0, 0, 0.08); g.scale.setScalar(0.7); g.visible = false; this.group.add(g); return g; });
    this.bolts = Array.from({ length: 6 }, () => { const g = new THREE.Group(); g.userData.parts = Array.from({ length: 7 }, (_, i) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })); g.add(m); return m; }); g.visible = false; this.group.add(g); return g; });
    this.rings = Array.from({ length: 6 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; this.group.add(m); return m; });
    this.spark = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 })); m.visible = false; this.group.add(m); return m; });
    this.coins = Array.from({ length: 8 }, () => { const m = sph(0.07, 0xffd24a, 0, 0, 0, 0xffd24a, 1.4, 5); m.visible = false; this.group.add(m); return m; });
    this.nums = []; this.fired = new Set(); this.T = 0; scene.add(this.group);
    this.syncFoes(0); this.index();
  }
  bar(name, cls) { const el = document.createElement('div'); el.className = 'hpbar ' + cls; el.innerHTML = (name ? `<span>${tr(name)}</span>` : '') + '<b><i></i></b>'; this.labelEl.appendChild(el); return el; }
  // enemy meshes follow the script: created as floors are generated, dropped when rebuilt or long past
  syncFoes(T) {
    const S = this.S;
    while (this.foe.length > S.enemies.length) { const o = this.foe.pop(); if (!o.gone) { this.group.remove(o.m); o.bar.remove(); } }
    for (let k = this.foe.length; k < S.enemies.length; k++) { const E = S.enemies[k]; const m = ENEMY[E.kind].make(); m.visible = false; this.group.add(m); this.foe.push({ m, bar: this.bar(E.boss ? E.name : '', 'foe'), dead: false, gone: false }); }
    if (S.dive) { const cur = diveFloorIndex(S, T); this.foe.forEach((o, k) => { if (!o.gone && S.enemies[k].enc < cur - 1) { this.group.remove(o.m); o.bar.remove(); o.gone = true; o.m.visible = false; } }); }
  }
  index() {
    const S = this.S; this.rev = S.rev || 0; this.nEv = S.events.length;
    this.hitsBy = this.hero.map(() => []); this.ehitsOnHero = this.hero.map(() => []); this.ehitsBy = S.enemies.map(() => []); this.hitsOnFoe = S.enemies.map(() => []);
    for (const e of S.events) {
      if (e.type === 'hit') { this.hitsBy[e.h]?.push(e); this.hitsOnFoe[e.e]?.push(e); }
      else if (e.type === 'ehit') { this.ehitsBy[e.e]?.push(e); this.ehitsOnHero[e.h]?.push(e); }
    }
  }
  last(arr, T) { if (!arr) return null; for (let i = arr.length - 1; i >= 0; i--) if (arr[i].t <= T) return arr[i]; return null; }
  wpos(v, dy = 0) { return new THREE.Vector3(v.x + this.origin.x, v.y + dy, v.z + this.origin.z); }
  // where the camera should look
  focus() {
    let x = 0, z = 0, n = 0;
    this.hero.forEach(o => { x += o.m.position.x; z += o.m.position.z; n++; });
    this.foe.forEach(o => { if (!o.gone && o.m.visible && !o.dead) { x += o.m.position.x * 0.8; z += o.m.position.z * 0.8; n += 0.8; } });
    return new THREE.Vector3(x / n + this.origin.x, 0, z / n + this.origin.z);
  }
  // is a boss blow about to land on hero h (red circle up)? returns the event so a tap can dodge it
  dodgeable(h, T) {
    const S = this.S; for (let i = firstAfter(S.events, T - 0.4); i < S.events.length; i++) { const e = S.events[i]; if (e.t > T + 0.8) break; if (e.type !== 'ehit' || e.h !== h || this.dodged.has(e.id)) continue; const E = S.enemies[e.e]; if (E && E.boss && T >= e.t - 0.72 && T <= e.t + 0.28) return e; } return null;
  }
  // A rigged hero at moment T: march, run in to melee range, strike with the class's clip, flinch, fall, or cast a heal
  driveHero(o, h, T, hp, dead, moving, retreat, px, n, rdt) {
    const m = o.m, S = this.S, q = this.q, H = S.heroes[h], cls = o.p.cls, melee = MELEE.includes(cls), clips = ATTACKS[cls] || ATTACKS.knight, hits = this.hitsBy[h] || [];
    const fm = q.formation || 'line';      // the formation sets who stands in front
    let x = px - (h % 2) * 0.6 + (fm === 'skirmish' ? 0 : (melee ? 0.8 : -0.4)), z = (h - (n - 1) / 2) * (fm === 'wall' ? 0.95 : 1.25), rotY = Math.PI / 2, name = 'idleEase', t = T + h * 0.9, atk = null, env = 0, fwd = false;
    for (let i = firstAfter(hits, T - 3); i < hits.length; i++) {
      const nm = clips[i % clips.length], ci = clipInfo(nm), s0 = hits[i].t - ci.hit, RUN = 0.5, BACK = 0.55;
      if (s0 - RUN > T) break;
      if (T >= s0 && T < s0 + ci.d) atk = { nm, t: T - s0 };
      if (melee) {
        let v = 0;
        if (T >= s0 - RUN && T < s0) { v = sm((T - (s0 - RUN)) / RUN); fwd = true; } else if (T >= s0 && T < s0 + ci.d) v = 1; else if (T >= s0 + ci.d && T < s0 + ci.d + BACK) v = 1 - sm((T - s0 - ci.d) / BACK);
        if (v > env) env = v;
      }
    }
    const eh = this.last(this.ehitsOnHero[h], T), hi = healerIdx(q);
    let cast = null;
    if (h === hi) { for (const e of q.heals || []) if (T >= e.t && T < e.t + 1.1) cast = ['mgHeal', T - e.t]; for (const e of q.enchants || []) if (T >= e.t && T < e.t + 1.1) cast = ['mgBless', T - e.t]; }
    for (const c of q.casts || []) if (c.h === h) { const nm = { wall: 'block', volley: 'shoot', nova: 'mgNova', dodge: 'block', stab: 'attack2', bless: 'mgBless', elixir: 'mgHeal' }[c.kind], ci = clipInfo(nm); if (T >= c.t && T < c.t + ci.d) cast = [nm, T - c.t]; }
    const DASH = 2.4; x += dead ? 0 : DASH * env;
    if (dead) { name = 'die'; t = T - H.D; }
    else if (atk) { name = atk.nm; t = atk.t; }
    else if (eh && T - eh.t < 0.75 && !this.dodged.has(eh.id)) { name = 'impact'; t = T - eh.t; }
    else if (cast) { name = cast[0]; t = cast[1]; }
    else if (env > 0.02) { name = 'runCalm'; t = T * 1.4; if (!fwd) rotY = -Math.PI / 2; }      // run to the enemy, then back
    else if (moving) { const v = this.vMarch || RUN_SPEED; name = v >= 2.8 ? 'runCalm' : 'walkCalm'; t = T * (v >= 2.8 ? Math.max(0.8, Math.min(1.5, v / 3.2)) : Math.max(0.7, v / 1.35)) + h * 0.3; if (retreat) rotY = -Math.PI / 2; }
    o.m.userData.anim.drive(name, t, rdt);
    m.rotation.set(0, rotY, 0); m.position.set(x, 0, z);
    this.setBar(o.bar, m.position, 2.15, hp, dead);
  }
  // Ranged attack visuals around the hit event e (damage lands at e.t + 0.3): a charge glow before release, then a straight flight.
  castFx(e, ho, fo, from, to, T, n) {
    const cls = ho.p.cls, idx = (this.hitsBy[e.h] || []).indexOf(e), kind = cls === 'ranger' ? 'arrow' : cls === 'cleric' ? 'holy' : cls === 'alchemist' ? 'flask' : (idx % 2 ? 'fire' : 'bolt');
    const eh = ENEMY[this.S.enemies[e.e].kind].h, ty = clamp(eh * 0.4, 0.5, 1.4);
    const hand = cls === 'ranger' ? 0.55 : 1.0, sx = from.x + 0.3, sy = hand, sz = from.z + 0.2;
    const f = (T - e.t) / 0.3;                                  // 0 at release, 1 at the target
    if (kind === 'arrow') {
      if (f < 0 || f > 1) return; const a = this.arrows[(n - 1) % this.arrows.length]; a.visible = true;
      const x = lerp(sx, to.x, f), y = lerp(sy, ty, f), z = lerp(sz, to.z, f);
      a.position.set(x, y, z); a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(to.x - sx, ty - sy, to.z - sz).normalize());
      return;
    }
    const b = this.bolts[(n - 1) % this.bolts.length], parts = b.userData.parts, fire = kind === 'fire' || kind === 'flask', now = performance.now() / 1000;
    const core = kind === 'holy' ? 0xfff2a0 : kind === 'flask' ? 0x9bff9b : fire ? 0xffb030 : 0x9affff, mid = kind === 'holy' ? 0xffd24a : kind === 'flask' ? 0x2faa4a : fire ? 0xff5a20 : 0x4aa8ff;
    b.visible = true;
    if (f < 0) {        // charging: a small orb grows at the staff
      const c = clamp((f + 1.5) / 1.5, 0, 1); parts.forEach((m, i) => { m.visible = i < 2; });
      parts[0].position.set(sx, sy, sz); parts[0].scale.setScalar(0.05 + 0.13 * c); parts[0].material.color.setHex(core);
      parts[1].position.set(sx, sy, sz); parts[1].scale.setScalar(0.1 + 0.2 * c * (0.85 + 0.15 * Math.sin(now * 30))); parts[1].material.color.setHex(mid); parts[1].material.opacity = 0.35;
      return;
    }
    if (f > 1) { b.visible = false; return; }
    const dx = to.x - sx, dy = ty - sy, dz = to.z - sz, L = Math.hypot(dx, dy, dz), ux = dx / L, uy = dy / L, uz = dz / L;
    const x = lerp(sx, to.x, f), y = lerp(sy, ty, f), z = lerp(sz, to.z, f);
    parts.forEach((m, i) => {
      m.visible = true;
      if (i === 0) { m.position.set(x, y, z); m.scale.setScalar(fire ? 0.2 : 0.13); m.material.color.setHex(core); m.material.opacity = 1; }
      else if (i === 1) { m.position.set(x, y, z); m.scale.setScalar((fire ? 0.34 : 0.22) * (0.9 + 0.1 * Math.sin(now * 40))); m.material.color.setHex(mid); m.material.opacity = 0.45; }
      else {            // the trail: embers drifting up (fire) or a crackling zig-zag (arcane bolt), fading behind
        const k = (i - 1) * 0.07 * L / 8, wob = fire ? 0 : Math.sin(now * 55 + i * 2.1) * 0.09, rise = fire ? (i - 1) * 0.03 : 0;
        m.position.set(x - ux * k + wob * uz, y - uy * k + rise + wob * 0.5, z - uz * k - wob * ux);
        m.scale.setScalar((fire ? 0.16 : 0.08) * (1 - (i - 1) / 7) + 0.02); m.material.color.setHex(i % 2 ? core : mid); m.material.opacity = 0.75 * (1 - (i - 1) / 6);
      }
    });
  }
  // A ring expanding on the ground where a spell lands
  impactRing(e, ho, age, n) {
    if (ho.p.cls === 'ranger') return;
    const fo = this.foe[e.e], idx = (this.hitsBy[e.h] || []).indexOf(e), fire = idx % 2 === 1 || ho.p.cls === 'alchemist', r = this.rings[n % this.rings.length], f = age / 0.4;
    r.visible = true; r.position.set(fo.m.position.x, 0.06, fo.m.position.z); r.scale.setScalar(0.4 + f * (fire ? 2.4 : 1.8)); r.material.opacity = 0.8 * (1 - f); r.material.color.setHex(ho.p.cls === 'cleric' ? 0xffe27a : ho.p.cls === 'alchemist' ? 0x7aff7a : fire ? 0xff7a30 : 0x7affff);
  }
  // Heal beams, ward bubbles, boss-slam dust and scorch marks. All pure functions of T, so scrubbing and speed-ups stay correct.
  buildFx() {
    const mk = (geo, color, op, add) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending })); m.visible = false; this.group.add(m); return m; };
    this.hfx = this.hero.map(() => ({ col: mk(new THREE.CylinderGeometry(0.3, 0.3, 1.7, 14, 1, true), 0xffd96a, 0.4, true), orb: mk(new THREE.SphereGeometry(0.14, 8, 6), 0xfff2a0, 0.9, true),
      sparks: Array.from({ length: 6 }, () => mk(new THREE.SphereGeometry(0.05, 6, 4), 0xfff2a0, 0.9, true)), bub: mk(new THREE.SphereGeometry(0.7, 14, 10), 0x9ad8ff, 0.25, true), halo: mk(new THREE.RingGeometry(0.45, 0.6, 20), 0x9ad8ff, 0.6, true) }));
    this.hfx.forEach(f => { f.halo.rotation.x = -Math.PI / 2; });
    this.dodged = new Set(); this.warnActive = false;
    this.warn = Array.from({ length: 4 }, () => { const m = mk(new THREE.RingGeometry(0.35, 0.7, 24), 0xff3a2a, 0.7, true); m.rotation.x = -Math.PI / 2; return m; });
    this.dust = Array.from({ length: 10 }, () => mk(new THREE.SphereGeometry(0.18, 7, 5), 0xb09a78, 0.55, false));
    this.scorch = Array.from({ length: 4 }, () => { const m = mk(new THREE.CircleGeometry(0.9, 16), 0x1a1208, 0.5, false); m.rotation.x = -Math.PI / 2; return m; });
  }
  // some expeditions happen in the rain (decided by the quest seed): drops fall around the camera's focus
  rainUpdate(T) {
    const wet = this.q.seed % 3 === 0 && this.theme !== 'cave' && !this.S.dive;
    if (!this.rain) {
      const n = 380, g = new THREE.BufferGeometry(), a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = (Math.random() - 0.5) * 26; a[i * 3 + 1] = Math.random() * 12; a[i * 3 + 2] = (Math.random() - 0.5) * 22; }
      g.setAttribute('position', new THREE.BufferAttribute(a, 3)); this.rain = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xaecbff, size: 0.09, transparent: true, opacity: 0.7, depthWrite: false })); this.rain.frustumCulled = false; this.group.add(this.rain);
    }
    this.rain.visible = wet; if (!wet) return;
    const f = this.focus(T), pos = this.rain.geometry.attributes.position; this.rain.position.set(f.x - this.origin.x, 0, f.z - this.origin.z);
    for (let i = 0; i < pos.count; i++) { let y = pos.getY(i) - 0.22 - (i % 4) * 0.03; if (y < 0) y += 12; pos.setY(i, y); } pos.needsUpdate = true;
  }
  fxUpdate(T) {
    if (!this.hfx) this.buildFx();
    this.rainUpdate(T);
    const q = this.q, S = this.S; this.shake = 0;
    this.hfx.forEach(f => { f.col.visible = f.orb.visible = f.bub.visible = f.halo.visible = false; f.sparks.forEach(m => { m.visible = false; }); });
    this.warn.forEach(m => { m.visible = false; }); this.dust.forEach(m => { m.visible = false; }); this.scorch.forEach(m => { m.visible = false; });
    const healer = healerIdx(q), src = this.hero[healer] && this.hero[healer].m.position;
    const casts = [...(q.heals || []).map(e => ({ t: e.t, ward: false })), ...(q.enchants || []).map(e => ({ t: e.t, ward: true })), ...(q.casts || []).filter(c => c.kind === 'wall' || c.kind === 'bless').map(c => ({ t: c.t, ward: true }))];
    for (const c of casts) {
      const age = T - c.t; if (age < 0 || age > 1.8) continue;
      this.hero.forEach((o, h) => {
        const f = this.hfx[h], H = S.heroes[h]; if (!o.m.visible || (H.dies && T >= H.D)) return; const pos = o.m.position;
        if (c.ward) {
          const k = Math.sin(clamp(age / 1.8, 0, 1) * Math.PI); f.bub.visible = f.halo.visible = true; f.bub.position.set(pos.x, 0.5, pos.z); f.bub.scale.setScalar(0.85 + 0.12 * Math.sin(age * 9)); f.bub.material.opacity = 0.32 * k;
          f.halo.position.set(pos.x, 0.05, pos.z); f.halo.scale.setScalar(0.8 + age * 0.5); f.halo.material.opacity = 0.7 * k; return;
        }
        if (age < 0.4 && src) { const u = age / 0.4; f.orb.visible = true; f.orb.position.set(lerp(src.x, pos.x, u), 1.0 + Math.sin(u * Math.PI) * 0.5, lerp(src.z, pos.z, u)); return; }
        const a = (age - 0.4) / 1.4, k = Math.sin(clamp(a, 0, 1) * Math.PI);
        f.col.visible = true; f.col.position.set(pos.x, 0.85, pos.z); f.col.scale.set(1 - 0.35 * a, 1, 1 - 0.35 * a); f.col.material.opacity = 0.45 * k;
        f.sparks.forEach((m, i) => { m.visible = true; const ang = a * 5 + i * 1.05, r = 0.32 * (1 - a * 0.4); m.position.set(pos.x + Math.cos(ang) * r, ((a * 1.4 + i * 0.17) % 1.5), pos.z + Math.sin(ang) * r); m.material.opacity = 0.9 * k; });
      });
    }
    this.warnActive = false;   // set below when a red circle is up
    // class skills: a volley of arrows at every enemy, a nova ring that rolls over the field
    const foes = this.foe.filter(o => !o.gone && o.m.visible && !o.dead);
    for (const c of q.casts || []) {
      const age = T - c.t, caster = this.hero[c.h]; if (age < 0 || age > 1.6 || !caster) continue; const cp = caster.m.position;
      if (c.kind === 'volley' && age >= 0.45 && age <= 0.85) foes.slice(0, 5).forEach((o, i) => { const a = this.arrows[7 - i], f = (age - 0.45) / 0.4, tp = o.m.position; a.visible = true; a.position.set(lerp(cp.x + 0.3, tp.x, f), lerp(0.55, 0.7, f) + Math.sin(f * Math.PI) * 0.05 * i, lerp(cp.z, tp.z, f)); a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(tp.x - cp.x, 0.15, tp.z - cp.z).normalize()); });
      if (c.kind === 'dodge' && age < 0.6) { const r = this.rings[1]; r.visible = true; r.position.set(cp.x, 0.08, cp.z); r.scale.setScalar(0.6 + age * 3); r.material.color.setHex(0x9bff9b); r.material.opacity = 0.85 * (1 - age / 0.6); }
      if (c.kind === 'stab' && age > 0.2 && age < 0.8) foes.slice(0, 3).forEach((o, i) => { const f = this.rings[2 + i], k = (age - 0.2) / 0.6; f.visible = true; f.position.set(o.m.position.x, 0.07, o.m.position.z); f.scale.setScalar(0.4 + k * 1.4); f.material.color.setHex(0xff4a4a); f.material.opacity = 0.85 * (1 - k); });
      if (c.kind === 'nova' && age < 0.9) {
        const r = this.rings[5]; r.visible = true; r.position.set(cp.x, 0.07, cp.z); r.scale.setScalar(0.5 + age * 7); r.material.color.setHex(0xffa040); r.material.opacity = 0.75 * (1 - age / 0.9);
        foes.slice(0, 3).forEach((o, i) => { if (age > 0.35) { const f = this.rings[2 + i], k = (age - 0.35) / 0.55; f.visible = true; f.position.set(o.m.position.x, 0.07, o.m.position.z); f.scale.setScalar(0.5 + k * 2.2); f.material.color.setHex(0xff7a30); f.material.opacity = 0.8 * (1 - k); } });
      }
    }
    // boss blows: the camera shakes, dust bursts and a scorch mark stays on the ground where the hero stood
    let di = 0, sc = 0, wi = 0;
    for (let i = firstAfter(S.events, T - 3.2); i < S.events.length; i++) {
      const e = S.events[i]; if (e.t > T + 1.2) break; if (e.type !== 'ehit') continue;
      const E = S.enemies[e.e]; if (!E || !E.boss) continue; const ho = this.hero[e.h]; if (!ho) continue;
      const age = T - (e.t + 0.28), p = ho.m.position;
      if (this.dodged.has(e.id)) continue;
      if (age < 0 && age > -1.0 && wi < this.warn.length) { const w = this.warn[wi++], k = 1 + age; w.visible = true; w.position.set(p.x, 0.06, p.z); w.scale.setScalar(2.2 - 1.2 * k + 0.1 * Math.sin(T * 24)); w.material.opacity = 0.25 + 0.5 * k; }   // red circle: a heavy blow is coming
      if (age >= 0 && age < 0.4) this.shake = Math.max(this.shake, 0.16 * (1 - age / 0.4));
      if (age >= 0 && age < 0.8) for (let j = 0; j < 4 && di < this.dust.length; j++, di++) { const m = this.dust[di], ang = (e.id || i) * 0.7 + j * 1.6, r = 0.3 + age * 1.6; m.visible = true; m.position.set(p.x + Math.cos(ang) * r, 0.15 + age * 0.9, p.z + Math.sin(ang) * r); m.scale.setScalar(0.7 + age * 1.8); m.material.opacity = 0.5 * (1 - age / 0.8); }
      if (age >= 0 && age < 3.0 && sc < this.scorch.length) { const m = this.scorch[sc++]; m.visible = true; m.position.set(p.x, 0.04, p.z); m.scale.setScalar(0.8 + (E.kind === 'golem' ? 0.4 : 0.2)); m.material.opacity = 0.45 * (1 - age / 3.0); }
    }
    this.warnActive = wi > 0;
  }
  update(T, rdt) {
    const q = this.q, S = q.script; T = clamp(T, 0, S.dur); this.T = T;
    if (S !== this.S) { this.S = S; this.fired.clear(); this.syncFoes(T); this.index(); }
    else if ((S.rev || 0) !== this.rev || S.events.length !== this.nEv) { this.syncFoes(T); this.index(); }
    else if (S.dive) this.syncFoes(T);
    const w = S.win, n = this.hero.length, stand = ARENA.map(a => a - 2.6), dive = !!S.dive;
    // party march: walking segments between fights (a dive keeps the party in place after the walk-in)
    let px = -19, moving = false, retreat = false;
    // The party runs to each fight so that it arrives just as the enemy does (the enemy runs in too, see below), never
    // waiting around: it leaves late and runs fast, or - if the gap is long - sets off after a short pause at a jog.
    this.vMarch = RUN_SPEED;
    const leg = (t0, t1, x0, x1, fight) => {
      const dist = Math.abs(x1 - x0), by = fight ? t1 - 0.25 : t1, avail = Math.max(0.5, by - t0);
      let rd = fight ? Math.max(Math.min(avail, dist / RUN_SPEED), avail - MAX_IDLE) : Math.min(avail, dist / RUN_SPEED);
      rd = Math.max(0.5, rd); const start = fight ? by - rd : t0;
      if (T >= by) { px = x1; return true; }
      if (T >= start) { const u = clamp((T - start) / rd, 0, 1); px = lerp(x0, x1, u); moving = u < 1; this.vMarch = dist / rd; } else px = x0;
      return false;
    };
    if (dive) leg(0, w[0].a, -19, stand[0], true);
    else {
      const segs = [[0, w[0].a, -19, stand[0], true], [w[0].b, w[1].a, stand[0], stand[1], true], [w[1].b, w[2].a, stand[1], stand[2], true]];
      segs.push(q.ok ? [w[2].b, S.dur * 0.93, stand[2], CHEST_X - 2.6, false] : [w[2].b, S.dur, stand[2], stand[2] - 6, false]);
      for (const sg of segs) if (!leg(...sg)) break;
      retreat = !q.ok && T > w[2].b;
    }
    // heroes
    this.hero.forEach((o, h) => {
      const m = o.m, H = S.heroes[h], hp = heroHp(q, S, h, T), dead = H.dies && T >= H.D;
      if (m.userData.anim) { this.driveHero(o, h, T, hp, dead, moving, retreat, px, n, rdt); return; }
      const L = m.userData.legs, A = m.userData.arms; A[0].rotation.x = A[1].rotation.x = 0; L[0].rotation.x = L[1].rotation.x = 0;
      let x = px - (h % 2) * 0.6, z = (h - (n - 1) / 2) * 1.25, y = 0, lunge = 0;
      const a = this.last(this.hitsBy[h], T), u = a ? (T - a.t) / 0.45 : 2;
      if (!dead) {
        if (moving) { const sw = Math.sin(T * 9 + h) * 0.6; L[0].rotation.x = sw; L[1].rotation.x = -sw; A[0].rotation.x = -sw * 0.6; A[1].rotation.x = sw * 0.6; y = Math.abs(Math.sin(T * 9 + h)) * 0.05; }
        else y = Math.abs(Math.sin(T * 3 + h)) * 0.02;
        if (u < 1) {
          const k = Math.sin(clamp(u, 0, 1) * Math.PI), cls = o.p.cls;
          if (cls === 'knight') { lunge = 0.9 * k; A[1].rotation.x = -2.4 * k; }
          else if (cls === 'ranger') { A[0].rotation.x = -1.5; A[1].rotation.x = -1.5; }
          else { A[1].rotation.x = -2.9 * k; A[0].rotation.x = -0.6 * k; }
        }
        const eh = this.last(this.ehitsOnHero[h], T); if (eh && T - eh.t > 0.28 && T - eh.t < 0.5) lunge -= 0.18 * Math.sin((T - eh.t - 0.28) / 0.22 * Math.PI);
        m.rotation.set(0, retreat ? -Math.PI / 2 : Math.PI / 2, 0);
      } else { const f = sm((T - H.D) / 0.45); m.rotation.set(0, Math.PI / 2, f * Math.PI / 2); y = f * 0.12; }
      m.position.set(x + lunge, y, z);
      this.setBar(o.bar, m.position, 2.15, hp, dead);
    });
    // enemies
    this.foe.forEach((o, k) => {
      if (o.gone) return;
      const E = S.enemies[k], m = o.m, hp = enemyHp(S, k, T), dying = T >= E.D;
      const appear = Math.max(E.s, E.a - ENEMY_RUN), encEnd = S.encs[E.enc].e, show = T >= appear && (T <= encEnd + 1.2 || (!isFinite(E.D) && T <= S.dur));
      m.visible = show; o.dead = dying; if (!show) { o.bar.style.display = 'none'; return; }
      const info = m.userData; const approach = clamp((T - appear) / Math.max(0.3, E.a - appear), 0, 1), walking = approach < 1 && !dying;
      if (info.anim) {      // rigged raider: walk in, swing, flinch, fall — all from clips
        const approach2 = approach, hitsE = this.ehitsBy[k] || [], cl = info.clips || {}, list = cl.attacks || [cl.attack || 'attack1']; let name = 'idleEase', t = T + k * 0.6, atk = null, lunge2 = 0, atkName = null, ci = null;
        for (let i = firstAfter(hitsE, T - 2.6); i < hitsE.length; i++) {      // each blow uses the next clip of the list, so big enemies vary their attacks
          const nm = list[(i + k) % list.length], c = clipInfo(nm), s0 = hitsE[i].t - c.hit; if (s0 > T) break;
          if (T < s0 + c.d) { atk = T - s0; atkName = nm; ci = c; }
        }
        const hh = this.last(this.hitsOnFoe[k], T);
        if (dying) { name = 'die'; t = T - E.D; }
        else if (atk !== null) { name = atkName; t = atk; lunge2 = -(atkName === 'attackJump' ? 1.4 : atkName === 'kick' ? 0.6 : 0.9) * Math.sin(clamp(atk / ci.d, 0, 1) * Math.PI); }
        else if (hh && T - hh.t < 0.7) { name = 'impact'; t = T - hh.t; }
        else if (approach2 < 1) { name = cl.run || 'runCalm'; t = T * (cl.runSpeed || 1.35) + k * 0.4; }
        info.anim.drive(name, t, rdt); m.rotation.set(0, -Math.PI / 2, 0); m.scale.setScalar(m.userData.s0 ??= m.scale.x);
        m.position.set(E.home.x + 9 * (1 - approach2) + lunge2, 0, E.home.z); this.setBar(o.bar, m.position, ENEMY[E.kind].h, hp, dying); return;
      }
      let x = E.home.x + 9 * (1 - approach), y = 0, lunge = 0; const z = E.home.z;
      const a = this.last(this.ehitsBy[k], T), u = a ? (T - a.t) / 0.45 : 2;
      m.rotation.set(0, -Math.PI / 2, 0);
      if (info.swing) info.swing(0);
      if (!dying) {
        if (walking && info.swing) info.swing(Math.sin(T * 8 + k) * 0.6);
        y = info.float ? 0.25 + Math.sin(T * 3 + k) * 0.12 : (walking ? Math.abs(Math.sin(T * 8 + k)) * 0.05 : 0);
        if (u < 1 && info.attack) { info.attack(clamp(u, 0, 1)); if (!info.float) lunge = -0.9 * Math.sin(clamp(u, 0, 1) * Math.PI); } else if (info.attack) info.attack(0);
        const hh = this.last(this.hitsOnFoe[k], T); if (hh && T - hh.t > 0.28 && T - hh.t < 0.5) lunge += 0.2 * Math.sin((T - hh.t - 0.28) / 0.22 * Math.PI);
        m.scale.setScalar(m.userData.s0 ??= m.scale.x);
      } else {
        const f = sm((T - E.D) / 0.5), s0 = m.userData.s0 ??= m.scale.x;
        if (info.float) m.scale.setScalar(s0 * (1 - f)); else { m.rotation.z = -f * Math.PI / 2; y = f * 0.1; }
      }
      m.position.set(x + lunge, y, z);
      this.setBar(o.bar, m.position, ENEMY[E.kind].h, hp, dying);
    });
    this.fxUpdate(T);
    // chest, coins, swirl, flicker
    const ch = this.stage.chest, lidT = dive ? -1 : T - S.dur * 0.93;
    if (!dive && q.ok && lidT > 0 && !this.chestHeard) { this.chestHeard = true; sfx('chest'); }
    ch.visible = !dive && q.ok; ch.userData.lid.rotation.x = -1.15 * sm(lidT / 0.4); ch.userData.glow.visible = !dive && q.ok && lidT > 0.2;
    this.coins.forEach((c, i) => { const t = dive ? -1 : (T - (S.dur * 0.94 + i * 0.08)); c.visible = !dive && q.ok && t > 0 && t < 1.4; if (c.visible) c.position.set(CHEST_X + Math.sin(i * 2.4) * 0.5 * t, 0.5 + t * 1.6 - t * t * 0.9, Math.cos(i * 2.4) * 0.4 * t); });
    if (this.stage.swirl) this.stage.swirl.children.forEach(c => { if (c.userData.arm !== undefined) c.rotation.z = performance.now() / 1000 * (1 + c.userData.arm * 0.4) + c.userData.arm * 1.3; });
    this.stage.flicker.forEach((f, i) => { if (f) f.intensity = 1.0 + Math.sin(performance.now() / 90 + i) * 0.25 + Math.random() * 0.15; });
    // projectiles, sparks, floating numbers (only events near "now")
    this.proj.forEach(p => { p.visible = false; }); this.spark.forEach(p => { p.visible = false; });
    this.arrows.forEach(a => { a.visible = false; }); this.bolts.forEach(b => { b.visible = false; }); this.rings.forEach(r => { r.visible = false; });
    let nfx = 0, si = 0, lo = 0, hi = S.events.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (S.events[mid].t < T - 1.0) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.t > T + 0.5) break;
      if (e.type !== 'hit' && e.type !== 'ehit') continue;
      const ho = this.hero[e.h], fo = this.foe[e.e]; if (!ho || !fo || fo.gone) continue;
      const ranged = e.type === 'hit' && !MELEE.includes(ho.p.cls);
      const from = e.type === 'hit' ? ho.m.position : fo.m.position, to = e.type === 'hit' ? fo.m.position : ho.m.position;
      if (ranged && T >= e.t - 0.45 && T <= e.t + 0.3) this.castFx(e, ho, fo, from, to, T, ++nfx);
      const hit = e.t + (ranged ? 0.3 : 0.28);
      if (T >= hit && T <= hit + 0.25 && si < this.spark.length && (e.type === 'ehit' || fo.m.visible)) {
        const s = this.spark[si++], f = (T - hit) / 0.25; s.visible = true; s.position.set(to.x, 1.0, to.z + 0.1); s.scale.setScalar(0.6 + f); s.material.opacity = 0.9 * (1 - f); s.material.color.setHex(e.type === 'hit' ? 0xffe08a : 0xff6a5a);
      }
      if (ranged && T >= hit && T <= hit + 0.4 && nfx < 6) this.impactRing(e, ho, T - hit, nfx++);
      if (T >= hit && T - hit < 0.6 && !this.fired.has(e.id)) {
        this.fired.add(e.id); sfx(e.type === 'hit' ? 'hit' : 'ehit'); const el = document.createElement('div'); el.className = 'fl dnum ' + (e.type === 'hit' ? 'dh' : 'de'); el.textContent = '−' + e.dmg; this.labelEl.appendChild(el);
        this.nums.push({ el, pos: this.wpos(to, 1.6), age: 0 });
      }
    }
    if (this.fired.size > 400) this.fired.clear();
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const nmb = this.nums[i]; nmb.age += rdt; const [sx, sy] = this.project(nmb.pos);
      nmb.el.style.transform = `translate(${sx}px,${sy - nmb.age * 36}px) translate(-50%,-50%)`; nmb.el.style.opacity = Math.max(0, 1 - nmb.age / 0.9);
      if (nmb.age > 0.9) { nmb.el.remove(); this.nums.splice(i, 1); }
    }
  }
  setBar(el, pos, h, frac, dead) {
    if (dead) { el.style.display = 'none'; return; }
    const [sx, sy, sz] = this.project(this.wpos(pos, h));
    if (sz > 1) { el.style.display = 'none'; return; }
    el.style.display = ''; el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-100%)`;
    const i = el.querySelector('i'); i.style.width = Math.round(frac * 100) + '%';
    if (el.classList.contains('hero')) i.style.background = frac > 0.5 ? '#5be35b' : frac > 0.25 ? '#f0c040' : '#e0503a';
  }
  dispose() {
    this.scene.remove(this.group); this.hero.forEach(o => o.bar.remove()); this.foe.forEach(o => o.bar.remove()); this.nums.forEach(n => n.el.remove()); this.nums = [];
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
