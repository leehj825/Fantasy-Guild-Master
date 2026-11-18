// Live expedition stage: a deterministic, scripted fight that is a pure function of quest progress.
//  - genScript(q) builds the timeline (3 encounters + travel + loot) from the quest seed and its pre-rolled outcome.
//  - Expedition draws the stage and the actors for any moment T (seconds since dispatch), so a quest can be watched,
//    joined late, sped up, or closed and reopened without ever contradicting the result.
import * as THREE from '../vendor/three.module.js';
import { tr } from './i18n.js';
import { sfx } from './audio.js';
import { makeChar, buildHero, buildGoblin, buildBuilding, vox, tbox, mat, cyl, cone, sph, rot, PROPS } from './models.js';

export const STAGE_X = 170;                                   // stage sits far off the base map
export const TL = { enc: [[0.10, 0.36], [0.36, 0.62], [0.62, 0.90]], loot: 0.90, cutoff: 0.62 };
const ARENA = [-4, 3.5, 11];                                  // x of each fight
const CHEST_X = 17;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sm = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
export function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------ enemies */
const ENEMY = {
  goblin: { name: 'Goblin', make: () => buildGoblin(), h: 1.35 },
  wolf:   { name: 'Dire Wolf', make: () => wolf(), h: 1.3 },
  ogre:   { name: 'Ogre Warchief', make: () => ogre(), h: 3.4, boss: true },
  bandit: { name: 'Bandit', make: () => bandit(false), h: 1.5 },
  chief:  { name: 'Bandit Chief', make: () => bandit(true), h: 2.3, boss: true },
  wisp:   { name: 'Wisp', make: () => wisp(), h: 1.6 },
  imp:    { name: 'Imp', make: () => imp(), h: 1.3 },
  golem:  { name: 'Ancient Golem', make: () => golem(), h: 3.4, boss: true },
};
function charEnemy(look, scale) {
  const g = makeChar(look); g.scale.multiplyScalar(scale);
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
function ogre() {
  const g = charEnemy({ skin: 0x8aa84e, shirt: 0x7a5a3a, sleeve: 0x8aa84e, pants: 0x5a4636, boots: 0x2a1a0a, hammer: true, belt: 0x3a2a1a, apron: 0x6b4a2a }, 2.1);
  g.children[0].add(cone(0.05, 0.16, 0xf4f0e6, -0.1, 0.52, 0.2, 4), cone(0.05, 0.16, 0xf4f0e6, 0.1, 0.52, 0.2, 4));
  return g;
}
function bandit(chief) {
  return charEnemy(chief
    ? { skin: 0xe6b88a, shirt: 0x55555d, plate: 0x55555d, sleeve: 0x55555d, pants: 0x2a2a2a, hat: 'helm', metal: 0x55555d, plume: 0x8b1d1d, sword: true, cape: 0x6b1d1d, shield: { body: 0x5a3a1a, trim: 0x8b1d1d } }
    : { skin: 0xf0c8a0, shirt: 0x3a3a46, sleeve: 0x3a3a46, pants: 0x2a2a2a, hat: 'hood', hatColor: 0x2a2a30, cape: 0x2a2a30, sword: true }, chief ? 1.45 : 1);
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
const ENC_NAMES = { goblin: 'Goblin Raiders', wolf: 'Dire Wolves', ogre: 'Ogre Warchief', bandit: 'Bandit Ambush', chief: 'Bandit Chief', wisp: 'Wisp Swarm', imp: 'Imp Pack', golem: 'Ancient Golem' };
export const themeFor = q => q.type === 'arcane' ? 'ruins' : (q.type === 'combat' && q.seed % 2 ? 'cave' : 'forest');

/* ------------------------------------------------------------ script */
export function genScript(q) {
  const party = q.party, n = party.length, dur = q.dur;
  const r1 = mulberry(q.seed), r2 = mulberry(q.seed * 7 + 13);
  const win = TL.enc.map(([s, e]) => { const len = (e - s) * dur; return { s: s * dur, e: e * dur, a: s * dur + 0.18 * len, b: e * dur - 0.10 * len }; });
  const S = { dur, n, win, theme: themeFor(q), enemies: [], encs: [], heroes: [], events: [] };
  // enemies
  ENCOUNTERS[q.type].forEach((fn, i) => {
    const [kind, count, extra] = fn(q.minH, n); const kinds = [kind, ...Array(count - 1).fill(kind), ...(extra || [])];
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
  update(T, rdt) {
    const q = this.q, S = q.script; T = clamp(T, 0, S.dur); this.T = T;
    if (S !== this.S) { this.S = S; this.fired.clear(); this.syncFoes(T); this.index(); }
    else if ((S.rev || 0) !== this.rev || S.events.length !== this.nEv) { this.syncFoes(T); this.index(); }
    else if (S.dive) this.syncFoes(T);
    const w = S.win, n = this.hero.length, stand = ARENA.map(a => a - 2.6), dive = !!S.dive;
    // party march: walking segments between fights (a dive keeps the party in place after the walk-in)
    let px = -19, moving = false, retreat = false;
    if (dive) { if (T < w[0].a) { px = lerp(-19, stand[0], T / w[0].a); moving = true; } else px = stand[0]; }
    else {
      const segs = [[0, w[0].a, -19, stand[0]], [w[0].b, w[1].a, stand[0], stand[1]], [w[1].b, w[2].a, stand[1], stand[2]]];
      segs.push(q.ok ? [w[2].b, S.dur * 0.93, stand[2], CHEST_X - 2.6] : [w[2].b, S.dur, stand[2], stand[2] - 6]);
      for (const [t0, t1, x0, x1] of segs) { if (T >= t1) px = x1; else { if (T >= t0) { px = lerp(x0, x1, (T - t0) / (t1 - t0)); moving = true; } else px = x0; break; } }
      retreat = !q.ok && T > w[2].b;
    }
    // heroes
    this.hero.forEach((o, h) => {
      const m = o.m, H = S.heroes[h], hp = heroHp(q, S, h, T), dead = H.dies && T >= H.D;
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
      const encEnd = S.encs[E.enc].e, show = T >= E.s && (T <= encEnd + 1.2 || (!isFinite(E.D) && T <= S.dur));
      m.visible = show; o.dead = dying; if (!show) { o.bar.style.display = 'none'; return; }
      const info = m.userData; const approach = clamp((T - E.s) / (E.a - E.s), 0, 1), walking = approach < 1 && !dying;
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
    // chest, coins, swirl, flicker
    const ch = this.stage.chest, lidT = dive ? -1 : T - S.dur * 0.93;
    if (!dive && q.ok && lidT > 0 && !this.chestHeard) { this.chestHeard = true; sfx('chest'); }
    ch.visible = !dive && q.ok; ch.userData.lid.rotation.x = -1.15 * sm(lidT / 0.4); ch.userData.glow.visible = !dive && q.ok && lidT > 0.2;
    this.coins.forEach((c, i) => { const t = dive ? -1 : (T - (S.dur * 0.94 + i * 0.08)); c.visible = !dive && q.ok && t > 0 && t < 1.4; if (c.visible) c.position.set(CHEST_X + Math.sin(i * 2.4) * 0.5 * t, 0.5 + t * 1.6 - t * t * 0.9, Math.cos(i * 2.4) * 0.4 * t); });
    if (this.stage.swirl) this.stage.swirl.children.forEach(c => { if (c.userData.arm !== undefined) c.rotation.z = performance.now() / 1000 * (1 + c.userData.arm * 0.4) + c.userData.arm * 1.3; });
    this.stage.flicker.forEach((f, i) => { if (f) f.intensity = 1.0 + Math.sin(performance.now() / 90 + i) * 0.25 + Math.random() * 0.15; });
    // projectiles, sparks, floating numbers (only events near "now")
    this.proj.forEach(p => { p.visible = false; }); this.spark.forEach(p => { p.visible = false; });
    let pi = 0, si = 0, lo = 0, hi = S.events.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (S.events[mid].t < T - 1.0) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < S.events.length; i++) {
      const e = S.events[i];
      if (e.t > T + 0.1) break;
      if (e.type !== 'hit' && e.type !== 'ehit') continue;
      const ho = this.hero[e.h], fo = this.foe[e.e]; if (!ho || !fo || fo.gone) continue;
      const ranged = e.type === 'hit' && ho.p.cls !== 'knight';
      const from = e.type === 'hit' ? ho.m.position : fo.m.position, to = e.type === 'hit' ? fo.m.position : ho.m.position;
      if (ranged && T >= e.t + 0.1 && T <= e.t + 0.3 && pi < this.proj.length) {
        const p = this.proj[pi++], f = (T - e.t - 0.1) / 0.2; p.visible = true; p.position.set(lerp(from.x + 0.3, to.x, f), 1.0 + Math.sin(f * Math.PI) * 0.25, lerp(from.z, to.z, f));
        p.material.color.setHex(ho.p.cls === 'wizard' ? 0x7affff : 0xe8d9a8); p.scale.setScalar(ho.p.cls === 'wizard' ? 1.4 : 0.7);
      }
      const hit = e.t + (ranged ? 0.3 : 0.28);
      if (T >= hit && T <= hit + 0.25 && si < this.spark.length && (e.type === 'ehit' || fo.m.visible)) {
        const s = this.spark[si++], f = (T - hit) / 0.25; s.visible = true; s.position.set(to.x, 1.0, to.z + 0.1); s.scale.setScalar(0.6 + f); s.material.opacity = 0.9 * (1 - f); s.material.color.setHex(e.type === 'hit' ? 0xffe08a : 0xff6a5a);
      }
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
