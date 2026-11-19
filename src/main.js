import * as THREE from '../vendor/three.module.js';
import { factionDecor, BUILDINGS, buildBuilding, buildHero, buildStaff, buildGoblin, buildMerchantCart, vox, mat, PROPS, setCharMaker } from './models.js';
import { makeRigChar, makeRigGolem, makeRigOgre, autoAnim } from './rigchar.js';
import { createTutorial } from './tutorial.js';
import { sfx, unlock, setPref, getPrefs, setMusicMood, audioState } from './audio.js';
import { tr, trHtml, initLang, setLang, getLang, onLangChange, translateStatic, LANGS } from './i18n.js';
import { Expedition, questEnd, setBigMakers, genScript, STAGE_X, heroHp, phaseText, newDiveScript, ensureFloors, rebuildDive, diveFloorIndex, diveCheckpoint, rewardText, RELICS, relicMods, relicOffer } from './expedition.js';

/* ------------------------------------------------------------------ *
 *  Setup: renderer, isometric ortho camera, lights, terrain
 * ------------------------------------------------------------------ */
const N = 28;                       // grid size (cells)
const canvas = document.getElementById('gl');
const $ = id => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const LOWFX = matchMedia('(pointer: coarse)').matches;   // phones/tablets: lighter rendering so the game runs at full speed
renderer.setPixelRatio(LOWFX ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2));
const stripLights = o => { if (!LOWFX) return; const ls = []; o.traverse(c => { if (c.isPointLight) ls.push(c); }); ls.forEach(l => l.parent.remove(l)); };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2f7a32);

// Character style: 'classic' (old box figures), 'voxel' or 'round' (rigged bodies that play motion clips). Changing it reloads the page.
const STYLE_KEY = 'fantasy-guild-master-charstyle', CHAR_STYLES = { voxel: 'Rigged · blocky', round: 'Rigged · rounded', classic: 'Classic' };
let charStyle = 'voxel'; try { const v = localStorage.getItem(STYLE_KEY); if (CHAR_STYLES[v]) charStyle = v; } catch (e) { /* default */ }
if (charStyle !== 'classic') { setCharMaker(look => makeRigChar(look, charStyle)); setBigMakers({ golem: () => makeRigGolem(), ogre: () => makeRigOgre() }); }

// Free 3D perspective camera: orbit (yaw/pitch), pan, zoom.
const VIEW0 = { yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2), zoom: 10 };   // true isometric angles
let watching = null, viewFly = null;   // expedition watch mode state
let yaw = VIEW0.yaw, pitch = VIEW0.pitch, viewS = VIEW0.zoom;
const FOV = 38;
const perspCam = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
const camera = perspCam;
const camTarget = new THREE.Vector3(N / 2 + 1, 0, N / 2 + 1);
const clampView = () => {
  pitch = Math.max(0.28, Math.min(1.42, pitch)); viewS = Math.max(3.5, Math.min(24, viewS));
  if (!watching) { const B = landBounds(); camTarget.x = Math.max(B.x0, Math.min(B.x1, camTarget.x)); camTarget.z = Math.max(B.z0, Math.min(B.z1, camTarget.z)); }
};
let camShake = 0;   // boss blows shake the camera a little (set from the stage)
function updateCamera() {
  clampView();
  const a = innerWidth / innerHeight;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const dist = viewS / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  perspCam.aspect = a; perspCam.position.copy(camTarget).addScaledVector(dir, dist);
  if (camShake > 0) perspCam.position.add(new THREE.Vector3((Math.random() - 0.5) * camShake, (Math.random() - 0.5) * camShake, (Math.random() - 0.5) * camShake));
  camera.lookAt(camTarget); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
// ground-plane pan along the current view axes (px -> world)
function panBy(dx, dy) {
  if (watching) watching.follow = false;
  const u = 2 * viewS / innerHeight, rx = Math.cos(yaw), rz = -Math.sin(yaw), ux = -Math.sin(yaw), uz = -Math.cos(yaw), k = u / Math.sin(pitch);
  camTarget.x += -dx * u * rx + dy * k * ux; camTarget.z += -dx * u * rz + dy * k * uz; updateCamera();
}
function rotateBy(dyaw, dpitch) { yaw += dyaw; pitch += dpitch; updateCamera(); }
function zoomBy(f) { viewS *= f; updateCamera(); }
function resetView() { yaw = VIEW0.yaw; pitch = VIEW0.pitch; viewS = VIEW0.zoom; camTarget.set(N / 2 + 1, 0, N / 2 + 1); updateCamera(); }
function resize() { renderer.setSize(innerWidth, innerHeight, false); updateCamera(); }
addEventListener('resize', resize);

const ambient = new THREE.AmbientLight(0xcfe3ff, 0.75); scene.add(ambient);
scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x4a7a3a, 0.35));
const sun = new THREE.DirectionalLight(0xfff1d0, 1.05);
sun.position.set(N / 2 + 18, 30, N / 2 + 8);
sun.target.position.set(N / 2, 0, N / 2);
sun.castShadow = true;
sun.shadow.mapSize.set(LOWFX ? 1024 : 2048, LOWFX ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);

// Terrain with subtle checker texture
{
  const c = document.createElement('canvas'); c.width = c.height = 2;
  const x = c.getContext('2d');
  x.fillStyle = '#4fa63f'; x.fillRect(0, 0, 2, 2);
  x.fillStyle = '#58b046'; x.fillRect(0, 0, 1, 1); x.fillRect(1, 1, 1, 1);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(N + 160, N + 160);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(N + 160, N + 160), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(N / 2, 0, N / 2); ground.receiveShadow = true;
  scene.add(ground);
}
// Dirt paths + stone plaza around the hall
const HALL = { cx: 12, cz: 11 };
{
  const dirt = 0xb58a56, stone = 0x9c9ca2;
  const strip = (x, z, w, d, m, y = 0.02) => { const s = vox(w, 0.04, d, m, x, y - 0.0, z); s.castShadow = false; scene.add(s); };
  strip(HALL.cx + 2.5, HALL.cz + 2, 7, 7, stone, 0.01);
  strip(HALL.cx + 2.5, N - 3, 2.2, N - 2 * 2 - (HALL.cz + 5.5) + 4, dirt, 0.02);
  strip(N - 3 + 0.5, HALL.cz + 2, N - HALL.cx - 5 + 2, 2.2, dirt, 0.02);
  strip(HALL.cx + 2.5, HALL.cz + 2, 2.2, 2.2, stone, 0.03);
  // Stone fringe cobbles
  for (let i = 0; i < 40; i++) {
    const s = vox(0.35, 0.05, 0.35, 0x8d8d92, HALL.cx + 2.5 + (Math.random() - .5) * 9, 0.02, HALL.cz + 2 + (Math.random() - .5) * 9); s.castShadow = false; scene.add(s);
  }
}

/* ------------------------------------------------------------------ *
 *  Game state
 * ------------------------------------------------------------------ */
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const G = {
  gold: 600, renown: 0, mana: 0, ore: 10, wood: 10, herbs: 6,
  time: 0, speed: 1,
  staff: { smith: 0, alch: 0, cook: 0, bard: 0, guard: 0, porter: 0 },
  research: {}, outpost: 0, boardLvl: 0, walls: 0,
  buildings: [], heroes: [], quests: [], goblins: [],
  orders: [], rare: { mythril: 0, scale: 0, feather: 0 }, diveBest: 0, rank: 0, ingots: 0, land: 0, region: 'greenwood', regions: {},
  market: { ore: 1, herbs: 1, wood: 1, news: '' }, goalsDone: {}, stats: { orders: 0, raidsWon: 0, promoted: 0 }, fallen: [], flags: {}, merchant: null, alarm: false, questsDone: 0, nextId: 1,
  tm: { goals: 1, market: 80, spawn: 4, quest: 1, wage: 30, trickle: 0, merchant: 100, royal: 160, caravan: 260, raid: 150, tavern: 0, mana: 0 },
};
window.__G = G;

const occ = new Set(); let occVersion = 0;   // occVersion bumps whenever the walkable grid changes (heroes repath)
const key = (x, z) => x + ',' + z;

// ---- adjacency: where you build matters
function adjFor(type, cx, cz, w, d) {
  const mx = cx + w / 2, mz = cz + d / 2, near = (t, r = 7) => G.buildings.some(o => o.type === t && !(o.cx === cx && o.cz === cz) && Math.hypot(o.cx + o.w / 2 - mx, o.cz + o.d / 2 - mz) <= r);
  const r = { speed: 1, meal: 1, gold: 1, notes: [] };
  if (type === 'forge') { if (near('smelter')) { r.speed *= 1.25; r.notes.push('Smeltery nearby: +25% speed'); } if (near('warehouse', 8)) { r.speed *= 1.1; r.notes.push('Warehouse nearby: +10% speed'); } }
  if (type === 'alchemy') { if (near('garden')) { r.speed *= 1.25; r.notes.push('Herb Garden nearby: +25% speed'); } if (near('warehouse', 8)) { r.speed *= 1.1; r.notes.push('Warehouse nearby: +10% speed'); } }
  if (type === 'smelter' && near('forge')) { r.speed *= 1.25; r.notes.push('Forge nearby: +25% speed'); }
  if (type === 'tavern') { if (near('market')) { r.meal *= 1.15; r.notes.push('Market nearby: +15% meal income'); } if (near('campfire', 6)) { r.meal *= 1.1; r.notes.push('Campfire nearby: +10% meal income'); } }
  if (type === 'market' && near('tavern')) { r.gold *= 1.5; r.notes.push('Busy street (Tavern nearby): +50% passive gold'); }
  return r;
}
const adj = b => adjFor(b.type, b.cx, b.cz, b.w, b.d);
function previewBonus(type, cx, cz, rot) {   // what building here would do, for the placement hint
  const [w, d] = footprint(type, rot), out = [], before = G.buildings.map(o => adj(o).notes.join('|'));
  const mine = adjFor(type, cx, cz, w, d).notes; mine.forEach(n => out.push(`${BUILDINGS[type].name}: ${n}`));
  const fake = { type, cx, cz, w, d, level: 1 }; G.buildings.push(fake);
  G.buildings.forEach((o, i) => { if (o === fake) return; const after = adj(o).notes; const bf = (before[i] || '').split('|'); after.filter(n => !bf.includes(n)).forEach(n => out.push(`${BUILDINGS[o.type].name}: ${n}`)); });
  G.buildings.pop(); return out;
}
// ---- crafting grades (Iron/Steel/Mythril weapons, Minor/Greater/Superior potions)
const GRADE_TIME = [1, 1, 1.3, 1.7];
const gradeCost = (type, g) => type === 'forge' ? [null, { ore: 1 }, { ingots: 1 }, { ingots: 2, mythril: 1 }][g] : [null, { herbs: 1 }, { herbs: 2 }, { herbs: 3, mana: 1 }][g];
const canPay = c => Object.entries(c).every(([k, v]) => (k === 'mythril' ? G.rare.mythril : G[k]) >= v);
const payCost = c => { for (const [k, v] of Object.entries(c)) { if (k === 'mythril') G.rare.mythril -= v; else G[k] -= v; } };
const costText = c => Object.entries(c).map(([k, v]) => `${v}${{ ore: '⛏️', ingots: '🔩', mythril: '💎', herbs: '🌿', mana: '✨' }[k]}`).join(' ');
const gradeUnlocked = (b, g) => g === 1 || (g === 2 && b.level >= 3 && G.rank >= 1) || (g === 3 && b.level >= 5 && G.rank >= 2);
// ---- territory: the buildable area can grow by 4 tiles on every side (up to 3 times)
function landBounds() { const E = G.land * 4; return { x0: 2 - E, z0: 2 - E, x1: N - 2 + E, z1: N - 2 + E, E }; }
const forest = { trees: [], meshes: [] };
// Decorative forest (instanced) around and inside the grid
{
  const TREES = 260;
  const trunkG = new THREE.BoxGeometry(0.25, 0.7, 0.25), coneG = new THREE.ConeGeometry(0.7, 1.1, 6), cone2G = new THREE.ConeGeometry(0.5, 0.9, 6);
  const trunk = new THREE.InstancedMesh(trunkG, mat(0x6b4a2a), TREES);
  const c1 = new THREE.InstancedMesh(coneG, new THREE.MeshLambertMaterial({ flatShading: true }), TREES);
  const c2 = new THREE.InstancedMesh(cone2G, new THREE.MeshLambertMaterial({ flatShading: true }), TREES);
  [trunk, c1, c2].forEach(m => { m.castShadow = true; m.receiveShadow = true; scene.add(m); });
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  const half = (N + 20) / 2;
  for (let tries = 0; tries < 2000 && n < TREES; tries++) {
    const x = rnd(N / 2 - half, N / 2 + half), z = rnd(N / 2 - half, N / 2 + half);
    const inside = x > 1 && x < N - 1 && z > 1 && z < N - 1;
    const border = x < 3 || z < 3 || x > N - 3 || z > N - 3;
    if (inside && !border) {
      // sparse interior trees: block cells, keep centre clear
      if (Math.random() > 0.08) continue;
      const cx = Math.floor(x), cz = Math.floor(z);
      if (Math.abs(cx - HALL.cx - 2) < 9 && Math.abs(cz - HALL.cz - 2) < 9) continue;
      if (occ.has(key(cx, cz))) continue;
      occ.add(key(cx, cz));
    } else if (!border && !inside && Math.random() > 0.6) continue;
    if ((x > N - 3 || z > N - 3) && Math.random() < 0.65) continue;   // keep the camera-facing edges open
    // keep the entry roads clear
    if (Math.abs(x - HALL.cx - 2) < 1.8 && z > HALL.cz) continue;
    if (Math.abs(z - HALL.cz - 2) < 1.8 && x > HALL.cx) continue;
    const s = rnd(0.9, 1.5);
    dummy.position.set(x, 0.35 * s, z); dummy.scale.setScalar(s); dummy.rotation.y = rnd(0, 6); dummy.updateMatrix(); trunk.setMatrixAt(n, dummy.matrix);
    dummy.position.set(x, 0.7 * s + 0.55 * s, z); dummy.updateMatrix(); c1.setMatrixAt(n, dummy.matrix);
    dummy.position.set(x, 0.7 * s + 1.2 * s, z); dummy.updateMatrix(); c2.setMatrixAt(n, dummy.matrix);
    col.setHSL(rnd(0.3, 0.37), rnd(0.5, 0.65), rnd(0.2, 0.3));
    c1.setColorAt(n, col); c2.setColorAt(n, col);
    forest.trees.push({ x, z, n }); n++;
  }
  forest.meshes = [trunk, c1, c2];
  [trunk, c1, c2].forEach(m => { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
  // decorative scenery from the model library: mushrooms, rocks, stones, crates, carts, lanterns
  const g = new THREE.Group();
  const place = (obj, x, z, ry = rnd(0, 6)) => { obj.position.set(x, 0, z); obj.rotation.y = ry; g.add(obj); };
  const free = (x, z) => !(Math.abs(x - HALL.cx - 2.5) < 9 && Math.abs(z - HALL.cz - 2) < 9);
  const rim = () => { const e = Math.floor(rnd(0, 4)), t = rnd(2.5, N - 2.5); return e === 0 ? [rnd(2.5, 5), t] : e === 1 ? [N - rnd(2.5, 5), t] : e === 2 ? [t, rnd(2.5, 5)] : [t, N - rnd(2.5, 5)]; };
  for (let i = 0; i < 16; i++) { const [x, z] = rim(); if (!free(x, z)) continue; place(PROPS.bigMushroom(pick([0xd6336c, 0x7b3fb5, 0x2aa9a0, 0xe07a1f]), rnd(0.6, 1.5)), x, z); }
  for (let i = 0; i < 12; i++) { const [x, z] = rim(); if (!free(x, z)) continue; place(PROPS.rockCluster(rnd(0.7, 1.5)), x, z); }
  place(PROPS.standingStones(), 4.5, 6, 0.6); place(PROPS.standingStones(), N - 5, N - 6, 3.6);
  place(PROPS.crateStack(), HALL.cx + 8, HALL.cz - 1.2, 0.3); place(PROPS.cartProp(0), HALL.cx - 3.5, HALL.cz + 6.5, 1.0); place(PROPS.cartProp(1), HALL.cx + 11, HALL.cz + 8.5, -0.5);
  place(PROPS.barricade(), HALL.cx + 11.5, HALL.cz + 5, 0.4); place(PROPS.barricade(), HALL.cx + 5.5, HALL.cz + 12, -1.1); place(PROPS.spikeBarricade(), HALL.cx + 13.3, HALL.cz + 2.5, 0.2);
  [[HALL.cx + 0.5, HALL.cz + 5.3], [HALL.cx + 4.5, HALL.cz + 5.3], [HALL.cx + 7, HALL.cz + 5.3], [HALL.cx + 6.2, HALL.cz + 7.8]].forEach(([x, z]) => place(PROPS.lantern(), x, z, 0));
  place(PROPS.campfire(), HALL.cx + 7.2, HALL.cz + 9.5, 0);
  stripLights(g); scene.add(g); window.__decor = g;
}

function applyLand() {   // clear the trees from newly unlocked land and redraw the boundary
  const B = landBounds(), dummy = new THREE.Object3D(); dummy.scale.setScalar(0); dummy.updateMatrix();
  for (const t of forest.trees) if (!t.hidden && t.x > B.x0 - 0.6 && t.x < B.x1 + 0.6 && t.z > B.z0 - 0.6 && t.z < B.z1 + 0.6) { t.hidden = true; forest.meshes.forEach(m => m.setMatrixAt(t.n, dummy.matrix)); }
  forest.meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  if (typeof buildGrid === 'function' && typeof scene !== 'undefined' && grid !== undefined) buildGrid();
}
/* ------------------------------------------------------------------ *
 *  Buildings
 * ------------------------------------------------------------------ */
const bGroup = new THREE.Group(); scene.add(bGroup);
const worldEl = document.getElementById('world');

const footprint = (type, rot) => { const t = BUILDINGS[type]; return rot % 2 ? [t.d, t.w] : [t.w, t.d]; };
function canPlace(type, cx, cz, rot = 0) {
  const [w, d] = footprint(type, rot);
  const B = landBounds(); if (cx < B.x0 || cz < B.z0 || cx + w > B.x1 || cz + d > B.z1) return false;
  for (let x = cx; x < cx + w; x++) for (let z = cz; z < cz + d; z++) if (occ.has(key(x, z))) return false;
  return true;
}
function addBuilding(type, cx, cz, rot = 0) {
  const t = BUILDINGS[type], [w, d] = footprint(type, rot), th = rot * Math.PI / 2;
  const variant = type === 'tent' ? (ofType('tent').length % 2 ? 0 : 1) : 0;
  const group = buildBuilding(type, variant);
  group.position.set(cx + w / 2, 0, cz + d / 2);
  group.rotation.y = th;
  stripLights(group);
  bGroup.add(group);
  const b = {
    id: G.nextId++, type, cx, cz, w, d, rot, level: 1, stock: 0, progress: 0, group,
    door: new THREE.Vector3(cx + w / 2 + Math.sin(th) * (t.d / 2 + 0.7), 0, cz + d / 2 + Math.cos(th) * (t.d / 2 + 0.7)),
  };
  group.userData.bid = b.id;
  for (let x = cx; x < cx + w; x++) for (let z = cz; z < cz + d; z++) occ.add(key(x, z));
  if (type === 'forge' || type === 'alchemy') {
    b.bar = document.createElement('div'); b.bar.className = 'pbar'; b.bar.innerHTML = '<i></i>'; worldEl.appendChild(b.bar);
    b.tag = document.createElement('div'); b.tag.className = 'btag'; worldEl.appendChild(b.tag);
  }
  // pop-in animation
  group.scale.setScalar(0.01); b.pop = 0;
  G.buildings.push(b); occVersion++;
  return b;
}
const ofType = t => G.buildings.filter(b => b.type === t);
const first = t => G.buildings.find(b => b.type === t);

addBuilding('hall', HALL.cx, HALL.cz);
G.buildings[0].pop = 1; G.buildings[0].group.scale.setScalar(1);

/* ------------------------------------------------------------------ *
 *  Derived stats
 * ------------------------------------------------------------------ */
const popCap = () => 4 + ofType('tent').length * 3 + ofType('tavern').length * 4 + G.outpost * 3 + G.rank * 4 + 2 * regionPerk('greenwood');
const maxLevel = () => [3, 5, 7, 9][G.rank];
const boardSlots = () => 3 + G.boardLvl + (G.rank >= 2 ? 1 : 0) + (G.rank >= 3 ? 1 : 0);
const craftSpeed = () => (1 + 0.25 * G.staff.smith) * (G.research.forging ? 1.3 : 1) * (G.research.mythril ? 1.4 : 1) * (1 + 0.1 * regionPerk('stonepeak')) * (G.flags.faction === 'vanguard' ? 1.15 : 1) * (G.flags.smithTaught ? 1.1 : 1);
const alchSpeed = () => (1 + 0.25 * G.staff.alch) * (G.research.forging ? 1.15 : 1) * (1 + 0.1 * regionPerk('ashen')) * (G.flags.faction === 'arcane' ? 1.15 : 1);
const mealGold = tav => { tav = tav || first('tavern'); return 9 * (1 + 0.15 * G.staff.cook) * (1 + 0.3 * ((tav?.level || 1) - 1)) * (tav ? adj(tav).meal : 1); };
const questGoldMul = () => (G.research.charter ? 1.25 : 1);
const trickleMul = () => (1 + 0.5 * G.staff.porter);
const warehouseBonus = () => ofType('warehouse').reduce((s, w) => s + 6 + 4 * (w.level - 1), 0);
const stockCap = b => 4 + 2 * b.level + warehouseBonus();
const wage = () => Object.values(G.staff).reduce((a, b) => a + b, 0) * 4;
const maxStaff = 3;

/* ------------------------------------------------------------------ *
 *  UI helpers: floating text, toasts, bubbles
 * ------------------------------------------------------------------ */
const _v = new THREE.Vector3();
function toScreen(pos, dy = 0) {
  _v.copy(pos); _v.y += dy; _v.project(camera);
  return [(_v.x * 0.5 + 0.5) * innerWidth, (-_v.y * 0.5 + 0.5) * innerHeight, _v.z];
}
const floaters = [];
function floatText(pos, text, color) {
  const el = document.createElement('div'); el.className = 'fl'; el.textContent = tr(text); if (color) el.style.color = color;
  worldEl.appendChild(el);
  floaters.push({ el, pos: pos.clone(), t: 0 });
}
function toast(msg) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = tr(msg); if (/^(Not enough|Cannot|No |You cannot|Use up|Too late|This party is already|Nothing in stock|A party is already|The dive needs|Build a Waystone|Requirements for)/.test(msg)) sfx('deny');
  $('toasts').appendChild(el); setTimeout(() => el.remove(), 4000);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
const gain = (pos, g) => { if (g >= 15) sfx('coin'); G.gold += g; floatText(pos, (g >= 0 ? '+' : '') + Math.round(g) + ' Gold'); };

/* ------------------------------------------------------------------ *
 *  Heroes (state machine)
 * ------------------------------------------------------------------ */
const CLASSES = {
  knight: { label: 'Knight', icon: '🗡️', base: 3.0, price: 20, survive: 0.92, quest: 'combat' },
  ranger: { label: 'Ranger', icon: '🏹', base: 2.5, price: 15, survive: 0.88, quest: 'gather' },
  wizard: { label: 'Wizard', icon: '🪄', base: 3.5, price: 18, survive: 0.75, quest: 'arcane' },
};
const NAMES = ['Aldric', 'Brienne', 'Cael', 'Dara', 'Eldon', 'Fenna', 'Garrick', 'Hilda', 'Ivar', 'Jora', 'Kellan', 'Lyra', 'Mordo', 'Nessa', 'Orin', 'Piper', 'Quill', 'Rurik', 'Sera', 'Thane'];
const TRAITS = {
  clumsy: { label: 'Clumsy', icon: '🤕', epithet: 'the Clumsy', desc: '−10% quest success chance, but +20% loot from every quest.' },
  lucky: { label: 'Lucky', icon: '🍀', epithet: 'the Lucky', desc: '+8% quest success chance.' },
  glutton: { label: 'Glutton', icon: '🍖', epithet: 'the Hungry', desc: 'Eats double: tavern meals pay twice as much, but stamina drains 40% faster.' },
  brave: { label: 'Brave', icon: '🦁', epithet: 'the Bold', desc: 'Far less likely to fall in battle.' },
  scholar: { label: 'Scholar', icon: '📖', epithet: 'the Wise', desc: 'Gains experience twice as fast.' },
};
const VIP_POOL = [['Sir Galahad', 'knight'], ['Dame Rowena', 'knight'], ['Lord Percival', 'knight'], ['Lady Isolde', 'ranger'], ['Ranger Thistle', 'ranger'], ['Archmage Orwyn', 'wizard'], ['Mage Lysandra', 'wizard']];
const traitOf = h => (h.vip ? h.vip.trait : null);
function addStar(h) {   // a spinning golden star marks VIP heroes
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
  star.position.y = h.cls === 'wizard' ? 1.95 : 1.4; h.mesh.add(star); h.mesh.userData.star = star;
}
const PROMO = {
  knight: { name: 'Paladin', icon: '⚜️', pw: 1.3, survive: 0.1, desc: '+30% power, far fewer casualties.' },
  ranger: { name: 'Warden', icon: '🦅', pw: 1.3, loot: 0.25, desc: '+30% power, +25% loot.' },
  wizard: { name: 'Archmage', icon: '🔮', pw: 1.35, mana: 3, desc: '+35% power, +3 Mana after each success.' },
};
const TALENTS = {
  knight: [[['shield', 'Shield Wall', 'Far fewer casualties.', { survive: 0.15 }], ['cleave', 'Cleave', '+15% power on combat quests.', { pwType: { combat: 1.15 } }]], [['ironwill', 'Iron Will', 'Stamina drains 30% slower.', { decay: 0.3 }], ['warlord', 'Warlord', '+15% power everywhere.', { pw: 1.15 }]]],
  ranger: [[['forager', 'Forager', '+25% loot from quests.', { loot: 0.25 }], ['sharp', 'Sharpshooter', '+20% power on gather quests.', { pwType: { gather: 1.2 } }]], [['swift', 'Swift Feet', 'Stamina drains 30% slower.', { decay: 0.3 }], ['eagle', 'Eagle Eye', '+4% party success chance.', { succ: 0.04 }]]],
  wizard: [[['focus', 'Arcane Focus', '+20% power on arcane quests.', { pwType: { arcane: 1.2 } }], ['siphon', 'Mana Siphon', '+2 Mana after each successful quest.', { mana: 2 }]], [['friend', "Alchemist's Friend", '+4% party success chance.', { succ: 0.04 }], ['glass', 'Glass Cannon', '+25% power, but more casualties.', { pw: 1.25, survive: -0.1 }]]],
};
const talentSlots = h => (h.level >= 3 ? 1 : 0) + (h.level >= 6 ? 1 : 0);
const talentDef = (cls, id) => TALENTS[cls].flat().find(t => t[0] === id);
function heroMods(h) {
  const m = { pw: 1, pwType: {}, survive: 0, loot: 0, mana: 0, decay: 0, succ: 0 };
  if (h.promo) { const P = PROMO[h.cls]; m.pw *= P.pw; m.survive += P.survive || 0; m.loot += P.loot || 0; m.mana += P.mana || 0; }
  for (const id of h.talents || []) { const t = talentDef(h.cls, id); if (!t) continue; const f = t[3]; if (f.pw) m.pw *= f.pw; if (f.pwType) for (const k of Object.keys(f.pwType)) m.pwType[k] = (m.pwType[k] || 1) * f.pwType[k]; m.survive += f.survive || 0; m.loot += f.loot || 0; m.mana += f.mana || 0; m.decay += f.decay || 0; m.succ += f.succ || 0; }
  return m;
}
const survBonus = h => (traitOf(h) === 'brave' ? 0.35 : 0) + heroMods(h).survive;
const heroLabel = h => h.promo ? PROMO[h.cls].name : CLASSES[h.cls].label;
function gainXp(h, n) {
  h.xp += n;
  while (h.xp >= h.level + 1) { h.xp -= h.level + 1; h.level++; sfx('level'); floatText(h.pos, `⬆ ${h.name} Lv${h.level}`, '#9bff9b'); if (h.level === 3 || h.level === 6) toast(`✨ ${h.name} can choose a new talent! (tap the hero)`); }
}
function addPromoGear(h) { h.mesh.add(vox(0.46, 0.5, 0.05, 0xe8c04a, 0, 0.3, -0.2), vox(0.1, 0.1, 0.06, 0xc0392b, 0, 0.62, -0.23)); }
function assignBonds(h) {   // friendships and rivalries make party choice matter
  h.bonds = h.bonds || {}; const others = G.heroes.filter(x => x !== h).sort(() => Math.random() - 0.5).slice(0, 2);
  for (const o of others) { const r = Math.random(), kind = r < 0.28 ? 'friend' : r < 0.42 ? 'rival' : null; if (kind) { h.bonds[o.id] = kind; o.bonds = o.bonds || {}; o.bonds[h.id] = kind; } }
}
function bondInfo(party) {
  let d = 0; const notes = [];
  for (let i = 0; i < party.length; i++) for (let j = i + 1; j < party.length; j++) { const k = (party[i].bonds || {})[party[j].id]; if (k === 'friend') { d += 0.04; notes.push(`🤝 ${party[i].name} & ${party[j].name} (+4%)`); } else if (k === 'rival') { d -= 0.05; notes.push(`⚡ ${party[i].name} & ${party[j].name} (−5%)`); } }
  return { d, notes };
}
function memorialize(h, deed) { sfx('die'); G.fallen.push({ name: h.name, cls: heroLabel(h), level: h.level, quests: h.quests || 0, vip: !!h.vip, deed, day: Math.floor(G.time / 60) }); if (G.fallen.length > 40) G.fallen.shift(); }
// ---- guild specialization (light faction): perks plus a different-looking Guild Hall
const FACTIONS = {
  vanguard: { name: 'Iron Vanguard', icon: '⚔️', type: 'combat', cls: 'knight', desc: 'Masters of the front line. Iron spikes and shields adorn the hall.', perk: '+10% success on combat quests · Knights +10% power · Forge +15% speed' },
  arcane: { name: 'Arcane Circle', icon: '🔮', type: 'arcane', cls: 'wizard', desc: 'Scholars of the unseen. Floating crystals and glowing runes surround the hall.', perk: '+10% success on arcane quests · Wizards +10% power · Lab +15% speed · +1 Mana regen' },
  rangers: { name: "Ranger's Path", icon: '🏹', type: 'gather', cls: 'ranger', desc: 'Wardens of the wild. Living vines and leaf banners cover the hall.', perk: '+10% success on gather quests · Rangers +10% power · +10% loot · stamina lasts 10% longer' },
};
function factionOf() { return FACTIONS[G.flags.faction]; }
let hallDecor = null;
function applyFactionLook() {
  const hall = G.buildings[0]; if (!hall) return; if (hallDecor) { hall.group.remove(hallDecor); hallDecor = null; }
  if (factionOf()) { hallDecor = factionDecor(G.flags.faction); stripLights(hallDecor); hall.group.add(hallDecor); }
}
const heroPower = (h, type) => { const m = heroMods(h); return CLASSES[h.cls].base * (1 + 0.2 * (h.level - 1)) * (h.gear ? 1 + 0.25 * ((h.gearTier || 1) - 1) : 0.5) * (CLASSES[h.cls].quest === type ? 1.3 : 1) * m.pw * (m.pwType[type] || 1) * (factionOf() && factionOf().cls === h.cls ? 1.1 : 1); };
const heroGroup = new THREE.Group(); scene.add(heroGroup);

function spawnPoint() {
  const E = G.land * 4; return Math.random() < 0.5 ? new THREE.Vector3(N - 1.5 + E, 0, HALL.cz + 2) : new THREE.Vector3(HALL.cx + 2.5, 0, N - 1.5 + E);
}
function createHero(d) {
  const mesh = buildHero(d.cls, d.variant), p = new THREE.Vector3(d.x, 0, d.z);
  mesh.position.copy(p); heroGroup.add(mesh);
  const bub = document.createElement('div'); bub.className = 'bub hidden'; worldEl.appendChild(bub);
  const h = {
    id: d.id ?? G.nextId++, cls: d.cls, variant: d.variant, name: d.name, level: d.level ?? 1, xp: d.xp ?? 0, stamina: d.stamina ?? rnd(60, 100), happy: d.happy ?? 100, gear: !!d.gear,
    quests: d.quests || 0, vip: d.vip || null, gearTier: d.gearTier || 1, promo: !!d.promo, talents: d.talents || [], bonds: d.bonds || {},
    mesh, pos: mesh.position, bub, state: 'idle', target: null, onArrive: null, timer: 0, onDone: null, cool: 0, phase: Math.random() * 6, vis: true,
  };
  mesh.userData.hid = h.id; G.heroes.push(h); if (h.vip) addStar(h); if (h.promo) addPromoGear(h); if (d.bonds === undefined) assignBonds(h);
  return h;
}
function spawnHero(cls, atHall = false) {
  if (G.heroes.length >= popCap()) return null;
  if (!cls) {
    const opts = ['knight', 'ranger'];
    if (first('alchemy')) opts.push('wizard', 'wizard');
    cls = pick(opts);
  }
  const p = atHall ? new THREE.Vector3(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1.2)) : spawnPoint();
  if (!atHall && Math.random() < (first('portal') ? 0.2 : 0.05) && G.heroes.filter(x => x.vip).length < 3) {   // a rare named VIP arrives
    const pool = VIP_POOL.filter(v => v[1] !== 'wizard' || first('alchemy')), [base, vcls] = pick(pool), trait = pick(Object.keys(TRAITS));
    const h = createHero({ cls: vcls, variant: Math.floor(Math.random() * 3), name: `${base} ${TRAITS[trait].epithet}`, x: p.x, z: p.z, level: 2 + Math.floor(Math.random() * 2), vip: { trait } });
    toast(`⭐ ${h.name} has arrived at your guild! (${TRAITS[trait].label})`); return h;
  }
  return createHero({ cls, variant: Math.floor(Math.random() * 3), name: pick(NAMES), x: p.x, z: p.z });
}
function removeHero(h, why) {
  heroGroup.remove(h.mesh); h.bub.remove();
  G.heroes.splice(G.heroes.indexOf(h), 1);
  if (why) toast(why);
}
/* ---- A* pathfinding over the base grid (buildings, props and interior trees are blocked cells) ---- */
const OFF = 14, MG = N + 2 * OFF;   // pathfinding grid covers the base and every possible expansion
const blocked = (x, z) => x < -OFF || z < -OFF || x >= N + OFF || z >= N + OFF || occ.has(key(x, z));
function nearestFree(cx, cz) {
  for (let r = 0; r <= 6; r++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; if (!blocked(cx + dx, cz + dz)) return [cx + dx, cz + dz];
  }
  return null;
}
function lineClear(a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  for (let i = 1; i < n; i++) if (blocked(Math.floor(a.x + dx * i / n), Math.floor(a.z + dz * i / n))) return false;
  return true;
}
function findPath(from, to) {
  const ci = v => Math.max(-OFF, Math.min(N + OFF - 1, Math.floor(v)));
  const sx = ci(from.x), sz = ci(from.z); let gx = ci(to.x), gz = ci(to.z);
  const exactOk = !blocked(gx, gz);
  if (!exactOk) { const f = nearestFree(gx, gz); if (!f) return [to.clone()]; [gx, gz] = f; }
  if (lineClear(from, exactOk ? to : new THREE.Vector3(gx + 0.5, 0, gz + 0.5))) return [exactOk ? to.clone() : new THREE.Vector3(gx + 0.5, 0, gz + 0.5)];
  const idx = (x, z) => (z + OFF) * MG + (x + OFF), cxOf = k => (k % MG) - OFF, czOf = k => ((k / MG) | 0) - OFF;
  const g = new Float32Array(MG * MG).fill(Infinity), par = new Int32Array(MG * MG).fill(-1), done = new Uint8Array(MG * MG);
  const hf = (x, z) => { const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const open = [idx(sx, sz)]; g[open[0]] = 0; let found = false;
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (open.length) {
    let bi = 0, bf = Infinity;
    for (let i = 0; i < open.length; i++) { const k = open[i], f = g[k] + hf(cxOf(k), czOf(k)); if (f < bf) { bf = f; bi = i; } }
    const cur = open.splice(bi, 1)[0]; if (done[cur]) continue; done[cur] = 1;
    const cx = cxOf(cur), cz = czOf(cur); if (cx === gx && cz === gz) { found = true; break; }
    for (const [dx, dz, c] of D) {
      const nx = cx + dx, nz = cz + dz; if (blocked(nx, nz)) continue;
      if (dx && dz && (blocked(cx + dx, cz) || blocked(cx, cz + dz))) continue;   // no corner cutting
      const k = idx(nx, nz), ng = g[cur] + c; if (ng < g[k]) { g[k] = ng; par[k] = cur; open.push(k); }
    }
  }
  if (!found) return [to.clone()];
  const cells = []; for (let k = idx(gx, gz); k !== -1 && k !== idx(sx, sz); k = par[k]) cells.push(new THREE.Vector3(cxOf(k) + 0.5, 0, czOf(k) + 0.5));
  cells.reverse(); const pts = [from, ...cells], out = []; let i = 0, cur = from;   // string-pull: skip nodes that are in line of sight
  while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !lineClear(cur, pts[j])) j--; out.push(pts[j].clone()); cur = pts[j]; i = j; }
  if (exactOk && out.length) out[out.length - 1].copy(to);
  return out;
}
function setPath(h) { h.path = findPath(h.pos, h.target); h.pi = 0; h.pv = occVersion; }
function stepPath(h, dt, speed) {
  if (!h.path || h.pi >= h.path.length) return true;
  if (h.pv !== occVersion) setPath(h);
  if (stepToward(h, dt, speed, h.path[h.pi])) h.pi++;
  return h.pi >= h.path.length;
}
function setLeave(h) { h.state = 'leaving'; h.target = spawnPoint(); setPath(h); }
function goTo(h, p, onArrive) { h.target = p.clone(); h.target.x += rnd(-0.5, 0.5); h.onArrive = onArrive; h.state = 'walking'; setPath(h); }
function wanderNearHall(h) { goTo(h, new THREE.Vector3(HALL.cx + 2.5 + rnd(-3, 3), 0, HALL.cz + 5.5 + rnd(0, 2)), () => { h.timer = rnd(1.5, 3); h.state = 'waiting'; h.onDone = null; }); }
function visit(h, b, dur, fn) {
  goTo(h, b.door, () => { h.state = 'busy'; h.timer = dur; h.onDone = fn; h.mesh.visible = true; });
}
function setMood(h, icon) {
  if (!icon) { h.bub.classList.add('hidden'); return; }
  h.bub.classList.remove('hidden'); if (h.bub.textContent !== icon) h.bub.textContent = icon;
}

function decide(h) {
  h.cool = 1.5;
  const tavern = first('tavern');
  const shop = h.cls === 'wizard' ? first('alchemy') : first('forge');
  if (h.stamina < 45) {
    setMood(h, '🍺');
    if (tavern) {
      return visit(h, tavern, 2.5, () => {
        const g = mealGold(tavern) * (traitOf(h) === 'glutton' ? 2 : 1);
        gain(tavern.door, g);
        h.stamina = 100; h.happy = Math.min(100, h.happy + 30);
      });
    }
    return wanderNearHall(h);
  }
  if (!h.gear) {
    const item = h.cls === 'wizard' ? '🧪' : CLASSES[h.cls].icon;
    setMood(h, item);
    if (shop && shop.stock > 0) {
      return visit(h, shop, 1.8, () => {
        if (shop.stock > 0) {
          shop.stock--; h.gear = true; h.gearTier = shop.grade || 1;
          gain(shop.door, CLASSES[h.cls].price * (1 + 0.15 * (shop.level - 1)) * (1 + 0.6 * (h.gearTier - 1)) * (G.research.mythril && h.cls !== 'wizard' ? 1.25 : 1));
        }
      });
    }
    return wanderNearHall(h);
  }
  setMood(h, '✅');
  if (h.state !== 'ready') {
    h.state = 'ready';
    wanderNearHall(h);
  } else wanderNearHall(h);
}

const GRADE = { forge: ['', 'Iron', 'Steel', 'Mythril'], alchemy: ['', 'Minor', 'Greater', 'Superior'] };
const gearName = h => GRADE[h.cls === 'wizard' ? 'alchemy' : 'forge'][h.gearTier || 1];
const nearCampfire = h => ofType('campfire').some(b => Math.hypot(b.cx + b.w / 2 - h.pos.x, b.cz + b.d / 2 - h.pos.z) < 6);
function updateHero(h, dt) {
  h.phase += dt * 8;
  if (h.state === 'quest') return;
  const decay = Math.pow(0.7, G.staff.bard);
  h.stamina = Math.max(0, h.stamina - 0.7 * (traitOf(h) === 'glutton' ? 1.4 : 1) * (1 - Math.min(0.6, heroMods(h).decay + (G.flags.faction === 'rangers' ? 0.1 : 0))) * dt);
  if (h.mesh.userData.star) h.mesh.userData.star.rotation.y += dt * 2.5;
  const needy = h.stamina < 45 || !h.gear;
  h.happy = Math.max(0, Math.min(100, h.happy + (needy ? -0.35 * decay : 0.15) * dt));
  if (nearCampfire(h)) h.happy = Math.min(100, h.happy + 0.3 * dt);   // cosy fire
  if (h.state === 'leaving') {
    if (stepPath(h, dt, 3)) removeHero(h);
    return;
  }
  if (h.happy <= 0 && h.state !== 'busy') {
    setLeave(h); setMood(h, '💢'); toast(`${h.name} the ${CLASSES[h.cls].label} got fed up and left.`); return;
  }
  if (h.state === 'walking') {
    if (stepPath(h, dt, 2.4)) { h.target = null; const f = h.onArrive; h.onArrive = null; if (f) f(); }
  } else if (h.state === 'busy' || h.state === 'waiting') {
    h.timer -= dt;
    if (h.timer <= 0) { const f = h.onDone; h.onDone = null; h.state = 'idle'; if (f) f(); }
  } else {
    h.cool -= dt; if (h.cool <= 0) decide(h);
  }
  // when re-evaluating after a wait, keep state sensible
  if (h.state === 'idle' || h.state === 'waiting') {
    if (h.state === 'waiting' && h.timer <= 0) h.state = 'idle';
  }
}
function stepToward(h, dt, speed, tgt, stopDist = 0.05) {
  const t = tgt || h.target; if (!t) return true;
  const dx = t.x - h.pos.x, dz = t.z - h.pos.z, d = Math.hypot(dx, dz);
  if (d <= stopDist) return true;
  const s = Math.min(d - stopDist, speed * dt);
  h.pos.x += dx / d * s; h.pos.z += dz / d * s;
  h.mesh.rotation.y = Math.atan2(dx, dz);
  if (!h.mesh.userData.anim) {
    h.mesh.position.y = Math.abs(Math.sin(h.phase)) * 0.06;
    const sw = Math.sin(h.phase) * 0.6; const L = h.mesh.userData.legs; L[0].rotation.x = sw; L[1].rotation.x = -sw;
    const A = h.mesh.userData.arms; if (A) { A[0].rotation.x = -sw * 0.7; A[1].rotation.x = sw * 0.7; }
  }
  return d - s <= stopDist + 1e-3;
}

/* ------------------------------------------------------------------ *
 *  Quests
 * ------------------------------------------------------------------ */
const QNAMES = {
  combat: ['Clear the Goblin Camp', 'Escort the Caravan', 'Slay the Dire Wolf', 'Hold the Bridge', 'Hunt the Ogre'],
  gather: ['Scout the Whispering Woods', 'Gather Moonpetal Herbs', 'Map the Old Mine', 'Track the Lost Merchant'],
  arcane: ['Seal the Rift', 'Recover the Rune Tome', 'Banish the Wisp Swarm', 'Study the Ancient Obelisk'],
};
// ---- world map: regions bias the quest board; mastery grows with quests done and gives permanent bonuses
const REGIONS = {
  greenwood: { name: 'Greenwood', icon: '🌲', unlock: () => true, need: '', theme: 'forest', types: { combat: 1, gather: 1, arcane: 1 }, loot: {}, goldMul: 1, diffMul: 1, mods: null, names: null,
    desc: 'The quiet home forest. Balanced quests, gentle danger.', summary: 'Balanced quests · ×1.0 gold · ×1.0 danger', perk: '+2 population capacity (mastery 3), +4 (mastery 5)' },
  stonepeak: { name: 'Stonepeak Mines', icon: '⛰️', unlock: () => G.renown >= 10, need: 'Renown 10', theme: 'cave', types: { combat: 2, gather: 1.2, arcane: 0.3 }, loot: { ore: 1.6 }, goldMul: 1.1, diffMul: 1.15, mods: ['armored', 'elite'],
    names: ['Collapse in the Deep Shaft', 'Clear the Troll Tunnel', 'Escort the Ore Cart', 'Seal the Rockfall'], desc: 'Dark tunnels full of trolls and ore.', summary: 'Mostly combat · +60% ore loot · ×1.1 gold · ×1.15 danger', perk: 'Forge speed +10% (mastery 3), +20% (mastery 5)' },
  ashen: { name: 'Ashen Marsh', icon: '🌫️', unlock: () => G.renown >= 20, need: 'Renown 20', theme: 'forest', types: { combat: 0.8, gather: 2, arcane: 1 }, loot: { herbs: 1.8 }, goldMul: 1.15, diffMul: 1.25, mods: ['poison', 'cursed'],
    names: ['Gather Bog Lotus', 'Hunt the Marsh Hag', 'Cleanse the Poisoned Spring', 'Find the Lost Peddler'], desc: 'Foul mists, rare herbs and curses.', summary: 'Mostly gathering · +80% herb loot · ×1.15 gold · ×1.25 danger', perk: 'Lab speed +10% (mastery 3), +20% (mastery 5)' },
  ruins: { name: 'Sunken Ruins', icon: '🏛️', unlock: () => G.rank >= 2, need: 'Guild Rank Keep', theme: 'ruins', types: { combat: 0.7, gather: 0.5, arcane: 2.5 }, loot: { arcane: 1.8 }, goldMul: 1.3, diffMul: 1.4, mods: ['cursed', 'storm', 'elite'],
    names: ['Decipher the Sunken Glyphs', 'Banish the Drowned Wraith', 'Recover the Tidal Relic', 'Calm the Restless Statues'], desc: 'Drowned halls humming with old magic.', summary: 'Mostly arcane · +80% mana loot · ×1.3 gold · ×1.4 danger', perk: 'Mana regeneration +1 (mastery 3), +2 (mastery 5)' },
};
const regionLevel = id => Math.min(5, Math.floor(((G.regions[id] || {}).done || 0) / 8));
const regionPerk = id => { const l = regionLevel(id); return l >= 5 ? 2 : l >= 3 ? 1 : 0; };
const wpick = w => { const e = Object.entries(w), t = e.reduce((n, [, v]) => n + v, 0); let r = Math.random() * t; for (const [k, v] of e) { r -= v; if (r <= 0) return k; } return e[0][0]; };
// quest modifiers: each one asks for something specific (a class, gear grade, a potion) or trades risk for reward
const MODS = {
  elite: { icon: '💀', label: 'Elite', desc: '+40% danger, +50% gold, may drop rare Mythril.' },
  cursed: { icon: '☠️', label: 'Cursed', desc: '−15% success unless the party has a Wizard.' },
  storm: { icon: '⛈️', label: 'Storm', desc: '−12% success unless the party has a Ranger.' },
  armored: { icon: '🛡️', label: 'Armored foes', desc: '−15% success unless the party averages Steel gear or better.' },
  poison: { icon: '🧪', label: 'Poisoned', desc: '−12% success unless you bring a potion (uses 1 from the Lab).' },
  rush: { icon: '⏱️', label: 'Rush job', desc: 'Takes 40% less time, +20% gold.' },
  bounty: { icon: '💰', label: 'Bounty', desc: '+60% gold but −10% success.' },
  hoard: { icon: '🎁', label: 'Hoard', desc: 'Double material loot.' },
};
const APPROACH = {
  cautious: { label: 'Cautious', icon: '🛡️', chance: 0.08, gold: 0.85, dur: 1.2, survive: 0.1, desc: '+8% success, −15% gold, 20% slower, fewer casualties' },
  standard: { label: 'Standard', icon: '⚔️', chance: 0, gold: 1, dur: 1, survive: 0, desc: 'Balanced' },
  bold: { label: 'Bold', icon: '🔥', chance: -0.08, gold: 1.3, dur: 0.85, survive: -0.1, desc: '−8% success, +30% gold, 15% faster, more casualties' },
};
// Battle formations: where the party stands in the fight, and what that does to the odds
const FORMATION = {
  line: { label: 'Battle line', icon: '📐', chance: 0, survive: 0, desc: 'Knights lead, others behind. +4% with a knight and a ranged hero' },
  wall: { label: 'Shield wall', icon: '🛡️', chance: -0.03, survive: 0.1, desc: 'Tight ranks: fewer casualties, −3% success' },
  skirmish: { label: 'Skirmish', icon: '🌀', chance: 0.05, survive: -0.08, desc: 'Spread out: +5% success, more casualties' },
};
const fmBonus = (party, f) => { const F = FORMATION[f || 'line']; return F.chance + ((f || 'line') === 'line' && party.some(h => h.cls === 'knight') && party.some(h => h.cls !== 'knight') ? 0.04 : 0); };
function makeQuest(o = {}) {
  const reg = REGIONS[G.region] || REGIONS.greenwood, type = o.type || wpick(reg.types);
  const minH = o.minH || (Math.random() < 0.5 ? 1 : (Math.random() < 0.7 ? 2 : 3));
  let diff = (2.6 + rnd(0, 1.2) + (minH - 1) * 2.4) * (1 + 0.5 * Math.sqrt(G.renown / 10)) * (1 + 0.08 * G.rank) * (o.type ? 1 : reg.diffMul);   // difficulty grows gently with renown
  const loot = {};
  if (type === 'combat') loot.ore = Math.round(rnd(2, 5) * minH);
  if (type === 'gather') { loot.herbs = Math.round(rnd(2, 5) * minH); loot.wood = Math.round(rnd(2, 4)); }
  if (type === 'arcane') loot.arcane = Math.round(rnd(1, 3) * minH);
  let mods = o.mods;
  if (!mods) {
    mods = []; const chance = G.renown < 3 ? 0.25 : G.renown < 10 ? 0.55 : 0.8, keys = Object.keys(MODS);
    if (reg.mods && Math.random() < 0.5) mods.push(pick(reg.mods)); else if (Math.random() < chance) mods.push(pick(keys)); if (G.renown >= 10 && Math.random() < 0.3) { const k2 = pick(keys); if (!mods.includes(k2)) mods.push(k2); }
  }
  let gold = (30 + diff * 14) * rnd(0.9, 1.15), dur = rnd(30, 50) + minH * 10;
  if (mods.includes('elite')) { diff *= 1.4; gold *= 1.5; } if (mods.includes('rush')) { dur *= 0.6; gold *= 1.2; } if (mods.includes('bounty')) gold *= 1.6;
  if (mods.includes('hoard')) for (const k of Object.keys(loot)) loot[k] *= 2;
  if (!o.type) { gold *= reg.goldMul * (1 + 0.04 * regionLevel(G.region)); for (const k of Object.keys(loot)) loot[k] = Math.round(loot[k] * (reg.loot[k] || 1)); }
  gold *= (o.goldMul || 1);
  const q = {
    id: G.nextId++, name: o.name || (!o.type && reg.names && Math.random() < 0.6 ? pick(reg.names) : pick(QNAMES[type])), region: o.type ? null : G.region, type, diff, minH, maxH: Math.min(4, minH + 1), dur, gold: Math.round(gold), renown: (() => { const x = diff / 6 * 40 / (40 + G.renown); return Math.floor(x) + (Math.random() < x - Math.floor(x) ? 1 : 0); })() + (o.renownBonus || 0),   // fractional, with diminishing returns: no runaway renown
    loot, mods, special: !!o.special, state: 'open', heroes: [], t: 0, enchant: false, chance: 0,
  };
  G.quests.push(q); return q;
}
const genQuest = () => makeQuest();
const modTags = q => (q.region && q.region !== 'greenwood' && REGIONS[q.region] ? `<span class="tag">${REGIONS[q.region].icon} ${REGIONS[q.region].name}</span>` : '') + (q.mods || []).map(k => `<span class="tag" title="${MODS[k].desc}">${MODS[k].icon} ${MODS[k].label}</span>`).join('');
const questPay = q => Math.round(q.gold * questGoldMul() * (q.approachGold || 1));
const readyHeroes = () => G.heroes.filter(h => h.gear && h.stamina >= 45 && h.state !== 'quest' && h.state !== 'leaving');
function bestParty(q) {
  const r = readyHeroes().sort((a, b) => heroPower(b, q.type) - heroPower(a, q.type));
  return r.slice(0, q.maxH);
}
function modPenalty(q, party, opts = {}) {   // returns [delta, [unmet requirement notes]]
  let d = 0; const notes = [], has = c => party.some(h => h.cls === c), avgTier = party.length ? party.reduce((n, h) => n + (h.gearTier || 1), 0) / party.length : 1;
  for (const k of q.mods || []) {
    if (k === 'cursed' && !has('wizard')) { d -= 0.15; notes.push('needs a Wizard'); }
    if (k === 'storm' && !has('ranger')) { d -= 0.12; notes.push('needs a Ranger'); }
    if (k === 'armored' && avgTier < 2) { d -= 0.15; notes.push('needs Steel gear'); }
    if (k === 'poison' && !opts.potion) { d -= 0.12; notes.push('bring a potion'); }
    if (k === 'bounty') d -= 0.10;
  }
  return [d, notes];
}
function chanceFor(q, party, o = false) {
  if (typeof o === 'boolean') o = { enchant: o };
  const P = party.reduce((s, h) => s + heroPower(h, q.type), 0);
  let c = P / (q.diff * 1.25);
  if (G.research.valor) c += 0.1;
  for (const h of party) { const t = traitOf(h); if (t === 'lucky') c += 0.08; if (t === 'clumsy') c -= 0.10; }
  if (factionOf() && factionOf().type === q.type) c += 0.10;
  c += modPenalty(q, party, o)[0] + (APPROACH[o.approach || 'standard'].chance) + bondInfo(party).d + party.reduce((n, h) => n + heroMods(h).succ, 0);
  if (o.enchant) c += G.research.arcane ? 0.3 : 0.2;
  c += fmBonus(party, o.formation);
  return Math.max(0.03, Math.min(0.97, c));
}
function dispatch(qid, enchant, partyOverride, extra = {}) {
  const q = G.quests.find(x => x.id === qid); if (!q || q.state !== 'open') return;
  const party = partyOverride || bestParty(q), ap = APPROACH[extra.approach || 'standard'];
  if (party.length < q.minH || party.length > q.maxH) return toast(`This quest needs ${q.minH}–${q.maxH} ready heroes with gear and stamina.`);
  if (enchant && G.mana < 5) return toast('Not enough Mana.');
  let lab = null; if (extra.potion) { lab = ofType('alchemy').find(b => b.stock > 0); if (!lab) return toast('No potions in stock.'); }
  if (enchant) G.mana -= 5; if (lab) lab.stock--;
  const o = { enchant, approach: extra.approach || 'standard', potion: !!lab, formation: extra.formation || 'line' };
  q.formation = o.formation; q.enchant = enchant; q.approach = o.approach; q.chance = chanceFor(q, party, o); q.heroes = party; q.state = 'active';
  q.dur = Math.round(q.dur * ap.dur); q.t = q.dur; q.approachGold = ap.gold;
  // the outcome is rolled now so the expedition can be watched live without ever contradicting the result
  q.party = party.map(h => heroSnap(h));
  q.seed = (Math.random() * 1e9) | 0; q.ok = Math.random() < q.chance; q.heals = [];
  q.deaths = party.filter(h => Math.random() > CLASSES[h.cls].survive + 0.15 + ap.survive + FORMATION[q.formation || 'line'].survive + survBonus(h)).map(h => h.id);
  q.script = genScript(q);
  party.forEach(h => { h.state = 'quest'; h.mesh.visible = false; setMood(h, null); h.onDone = null; });
  sfx('horn'); toast(`Party of ${party.length} dispatched: ${q.name}`);
  renderModal(true);
}
// ---- sending parties in bulk: "Send all possible" and the optional auto-queue (min success chance in G.flags.autoMin)
function sendAll(minChance = 0, quiet = false) {
  let sent = 0;
  for (let guard = 0; guard < 12; guard++) {
    const opts = G.quests.filter(q => q.state === 'open' && !q.special).map(q => { const party = bestParty(q); return { q, party, c: party.length >= q.minH ? chanceFor(q, party, { potion: false }) : -1 }; }).filter(o => o.c >= minChance / 100 && o.c >= 0).sort((a, b) => b.c - a.c);
    if (!opts.length) break; dispatch(opts[0].q.id, false, opts[0].party); sent++;
  }
  if (sent && !quiet) toast(`📜 Sent ${sent} part${sent > 1 ? 'ies' : 'y'} out.`); else if (!sent && !quiet) toast('No quest has enough ready heroes right now.');
  return sent;
}
let autoT = 0;
function tickAuto(dt) { if (!G.flags.autoQ) return; autoT -= dt; if (autoT > 0) return; autoT = 3; if (sendAll(G.flags.autoMin || 60, true)) renderModal(true); }
// ---- notifications (only while the page is hidden; needs the browser's permission)
function notify(title, body) {
  try { if (G.flags.notif && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification(tr(title), { body: tr(body || '') }); } catch (e) { /* unsupported */ }
}
function resolveQuest(q) {
  const ok = q.ok; sfx(ok ? 'win' : 'lose'); notify(ok ? '🏆 Quest complete' : '☠ Quest failed', q.name);
  onQuestEnd(q, ok);
  const hp = new THREE.Vector3(HALL.cx + 2.5, 0, HALL.cz + 5);
  q.state = 'done'; G.quests.splice(G.quests.indexOf(q), 1);
  const alive = [];
  q.heroes.forEach(h => {
    if (!G.heroes.includes(h)) return;
    h.state = 'idle'; h.cool = 0; h.stamina = Math.max(20, h.stamina - 25);
    h.pos.set(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1)); h.mesh.visible = true; h.target = null;
    if (!ok && q.deaths.includes(h.id)) { memorialize(h, `fell on "${q.name}"`); if (h.vip) G.renown = Math.max(0, G.renown - 1); removeHero(h, h.vip ? `☠ ${h.name} — a legend of the guild — has fallen!` : `${h.name} the ${CLASSES[h.cls].label} fell in battle...`); return; }
    h.quests = (h.quests || 0) + 1;
    if (ok) gainXp(h, traitOf(h) === 'scholar' ? 2 : 1);
    if (Math.random() < (ok ? 0.5 : 1)) h.gear = false;
    h.happy = Math.min(100, h.happy + (ok ? 20 : -10));
    alive.push(h);
  });
  if (ok) {
    const g = questPay(q);
    if (q.mods && q.mods.includes('elite') && Math.random() < 0.35) { G.rare.mythril++; toast('💀 The elite foe dropped a Mythril shard!'); }
    gain(hp, g); G.renown += q.renown;
    floatText(hp.clone().add(new THREE.Vector3(0, 0.6, 0)), `+${q.renown} ⭐`, '#ffd24a');
    const lootBonus = q.heroes.reduce((n, h) => n + heroMods(h).loot, 0), oreMul = (G.research.prospect ? 1.5 : 1) * (1 + 0.2 * q.party.filter(x => x.trait === 'clumsy').length) * (1 + lootBonus + (G.flags.faction === 'rangers' ? 0.1 : 0));
    G.mana += q.heroes.reduce((n, h) => n + heroMods(h).mana, 0);
    if (q.loot.ore) G.ore += Math.round(q.loot.ore * oreMul);
    if (q.loot.herbs) G.herbs += Math.round(q.loot.herbs * oreMul / (G.research.prospect ? 1.5 : 1));
    if (q.loot.wood) G.wood += Math.round(q.loot.wood * oreMul / (G.research.prospect ? 1.5 : 1));
    if (q.loot.arcane) G.mana += Math.round(q.loot.arcane * 5 * oreMul / (G.research.prospect ? 1.5 : 1));
    G.questsDone++;
    if (q.region && REGIONS[q.region]) { const rec = (G.regions[q.region] = G.regions[q.region] || { done: 0 }), before = regionLevel(q.region); rec.done++; if (regionLevel(q.region) > before) toast(`🗺 ${REGIONS[q.region].name} mastery level ${regionLevel(q.region)}! ${REGIONS[q.region].perk}`); }
    toast(`✔ ${q.name} complete! +${g}g, +${q.renown}⭐, loot collected.`);
  } else {
    G.renown = Math.max(0, G.renown - 1);
    toast(`✘ ${q.name} failed. The party limps home.`);
  }
  renderModal(true);
}

/* ------------------------------------------------------------------ *
 *  Stories: events with choices and lasting consequences
 * ------------------------------------------------------------------ */
function giveVip(cls, trait, name) {
  const p = new THREE.Vector3(HALL.cx + 2.5, 0, HALL.cz + 5.5);
  const h = createHero({ cls, variant: Math.floor(Math.random() * 3), name: `${name} ${TRAITS[trait].epithet}`, x: p.x, z: p.z, level: 3, vip: { trait } });
  toast(`⭐ ${h.name} joins your guild! (${TRAITS[trait].label})`); return h;
}
const STORIES = [
  { id: 'ransom', when: () => G.questsDone >= 3, title: "The Merchant's Ransom", text: "A frightened merchant begs at your gate: bandits hold his brother and demand 150 gold. He swears he will remember your kindness… or you could storm the bandit camp yourselves.", choices: [
    { label: 'Pay the ransom (−150g)', hint: '+3 renown. The merchant pays 10% more when you sell materials.', ok: () => G.gold >= 150, fx: () => { G.gold -= 150; G.renown += 3; G.flags.merchantFriend = 1; } },
    { label: 'Storm the camp', hint: 'Posts a special Elite quest with a big reward.', fx: () => { makeQuest({ type: 'combat', mods: ['elite', 'bounty'], minH: 2, name: "Free the Merchant's Brother", special: true, renownBonus: 2 }); toast('📖 A special quest was posted on the board!'); } },
    { label: 'Turn him away', hint: '−1 renown.', fx: () => { G.renown = Math.max(0, G.renown - 1); } }] },
  { id: 'knight', when: () => G.questsDone >= 6, title: 'A Wounded Stranger', text: 'A knight in battered armour collapses at the gate. He says he fought a whole warband alone. He will need a bed, a healer, and trust.', choices: [
    { label: 'Shelter him (−80g)', hint: 'A Brave VIP knight joins the guild.', ok: () => G.gold >= 80, fx: () => { G.gold -= 80; giveVip('knight', 'brave', 'Sir Aldous'); } },
    { label: 'Send him on his way (+40g)', hint: 'He leaves a few coins for the favour.', fx: () => { G.gold += 40; } }] },
  { id: 'festival', when: () => G.renown >= 8, title: 'The Harvest Festival', text: 'The villagers propose a festival in your courtyard. It will cost coin, but heroes love a feast — and word travels.', choices: [
    { label: 'Host it (−300g)', hint: 'All heroes become happy, +2 renown, one hero becomes Lucky.', ok: () => G.gold >= 300, fx: () => { G.gold -= 300; G.renown += 2; G.heroes.forEach(h => { h.happy = 100; h.stamina = 100; }); const h = pick(G.heroes.filter(x => !x.vip)); if (h) { h.vip = { trait: 'lucky' }; h.name += ' the Lucky'; addStar(h); toast(`🍀 ${h.name} caught the bouquet — Lucky!`); } } },
    { label: 'Decline', fx: () => { } }] },
  { id: 'tome', when: () => G.renown >= 12 && !!first('alchemy'), title: "The Wizard's Bargain", text: 'A hooded wizard offers a tome of forbidden lore. His price is 20 mana — a steep one — but the book could make your Lab far more potent.', choices: [
    { label: 'Trade 20 mana for the tome', hint: 'Unlocks Arcane Studies research for free.', ok: () => G.mana >= 20 && !G.research.arcane, fx: () => { G.mana -= 20; G.research.arcane = true; } },
    { label: 'Refuse politely (+1 renown)', fx: () => { G.renown++; } }] },
  { id: 'rival', when: () => G.renown >= 20, title: 'The Iron Wolves', text: 'The rival Iron Wolves guild rides to your gate. Their captain offers a pact: 800 gold now, but your caravans will pay less. Or you can send them packing, and risk their anger.', choices: [
    { label: 'Accept the pact (+800g)', hint: 'Trade caravans pay 20% less from now on.', fx: () => { G.gold += 800; G.flags.pact = 1; } },
    { label: 'Reject them (+3 renown)', hint: 'The Wolves will raid you more often.', fx: () => { G.renown += 3; G.flags.hostile = 1; } }] },
  { id: 'dragon', when: () => G.renown >= 40 && G.rank >= 2, title: "The Dragon's Shadow", text: 'A shadow crosses the sun. Scouts report a young dragon nesting in the northern peaks. Heroes whisper of glory — and of ash.', choices: [
    { label: 'Hunt the dragon', hint: 'Posts a legendary Elite quest with a huge reward.', fx: () => { makeQuest({ type: 'combat', mods: ['elite', 'hoard', 'bounty'], minH: 3, name: 'Slay the Young Dragon', special: true, goldMul: 2, renownBonus: 6 }); toast('📖 A legendary quest was posted!'); } },
    { label: 'Pay tribute (−2000g)', hint: 'Receive a Dragon Scale and keep the peace.', ok: () => G.gold >= 2000, fx: () => { G.gold -= 2000; G.rare.scale++; } }] },
  { id: 'smith', when: () => (first('forge')?.level || 0) >= 3 && G.questsDone >= 12, title: 'The Master Smith', text: 'A famed smith from the southern cities arrives, offering to teach your forge crew her secret quenching methods. She wants payment, of course.', choices: [
    { label: 'Pay 600g for lessons', hint: 'Forge crafting speed +10% permanently.', ok: () => G.gold >= 600, fx: () => { G.gold -= 600; G.flags.smithTaught = 1; } },
    { label: 'Politely decline', fx: () => { } }] },
  { id: 'plague', when: () => G.heroes.length >= 8 && G.questsDone >= 15, title: 'Fever in the Barracks', text: 'A fever spreads through the heroes\' quarters. Several look pale and exhausted. A healer says remedies could stop it — if you have potions to spare.', choices: [
    { label: 'Brew remedies (3 potions)', hint: 'Needs 3 potions in stock. Heroes recover, +1 renown.', ok: () => ofType('alchemy').reduce((n, b) => n + b.stock, 0) >= 3, fx: () => { let need = 3; for (const b of ofType('alchemy')) { const t = Math.min(b.stock, need); b.stock -= t; need -= t; } G.heroes.forEach(h => { h.happy = Math.min(100, h.happy + 20); h.stamina = 100; }); G.renown++; } },
    { label: 'Let it run its course', hint: 'Heroes lose happiness, −1 renown.', fx: () => { G.heroes.forEach(h => { h.happy = Math.max(10, h.happy - 40); }); G.renown = Math.max(0, G.renown - 1); } }] },
  { id: 'bard', when: () => G.renown >= 6 && !!first('tavern'), title: 'A Travelling Bard', text: 'A cheerful bard strolls into the tavern with a lute and a dozen new songs. The heroes are already crowding around.', choices: [
    { label: 'Let him play tonight (−60g)', hint: 'All heroes gain happiness.', ok: () => G.gold >= 60, fx: () => { G.gold -= 60; G.heroes.forEach(h => { h.happy = Math.min(100, h.happy + 25); }); } },
    { label: 'Hire him for good (−200g)', hint: 'Adds a Bard to your staff (heroes lose happiness slower).', ok: () => G.gold >= 200 && G.staff.bard < 3, fx: () => { G.gold -= 200; G.staff.bard++; } }] },
  { id: 'treasuremap', when: () => G.questsDone >= 20, title: 'A Tattered Treasure Map', text: 'A drunk sailor trades you a tattered map for a pint. It marks a cove full of buried loot — or perhaps a trap.', choices: [
    { label: 'Follow the map', hint: 'Posts a special quest with rich loot.', fx: () => { makeQuest({ type: 'gather', mods: ['hoard', 'bounty'], minH: 2, name: 'The Buried Cove', special: true }); toast('📖 A special quest was posted on the board!'); } },
    { label: 'Sell it to a collector (+250g)', fx: () => { G.gold += 250; } }] },
  { id: 'tax', when: () => G.renown >= 25, title: 'The Royal Tax Collector', text: 'A stern collector arrives with a ledger. The crown is raising funds, and your guild has grown rich in the eyes of the court.', choices: [
    { label: 'Pay the tax (−500g)', hint: '+2 renown for loyalty.', ok: () => G.gold >= 500, fx: () => { G.gold -= 500; G.renown += 2; } },
    { label: 'Slip him a bribe (−150g)', hint: 'He looks the other way.', ok: () => G.gold >= 150, fx: () => { G.gold -= 150; } },
    { label: 'Refuse to pay', hint: '−3 renown.', fx: () => { G.renown = Math.max(0, G.renown - 3); } }] },
  { id: 'ghost', when: () => G.renown >= 30 && G.rank >= 2, title: 'The Haunted Watchtower', text: 'Guards report a pale figure pacing the old watchtower at night. Your heroes refuse to patrol there. A priest offers to put the spirit to rest.', choices: [
    { label: 'Hire the priest (−300g, 5 mana)', hint: 'The grateful spirit leaves a Mythril shard.', ok: () => G.gold >= 300 && G.mana >= 5, fx: () => { G.gold -= 300; G.mana -= 5; G.rare.mythril++; } },
    { label: 'Ignore the rumours', hint: 'Heroes lose some happiness.', fx: () => { G.heroes.forEach(h => { h.happy = Math.max(10, h.happy - 10); }); } }] },
];
function checkStories() {
  if (G.flags.pending) return;
  const st = STORIES.find(x => !G.flags['story_' + x.id] && x.when()); if (!st) return;
  G.flags['story_' + st.id] = 1; G.flags.pending = st.id; showStoryBanner();
}
function showStoryBanner() { sfx('chime'); const st = STORIES.find(x => x.id === G.flags.pending); if (st) showBanner('story', `📖 ${st.title} — a decision awaits`, [['Read', 'openStory', '']]); }
function chooseStory(i) {
  const st = STORIES.find(x => x.id === G.flags.pending); if (!st) return; const c = st.choices[i]; if (!c || (c.ok && !c.ok())) return;
  c.fx(); G.flags.pending = null; hideBanner('story'); closeModal(); toast(`📖 ${st.title}: ${c.label}`);
}

/* ------------------------------------------------------------------ *
 *  Endless Dive (Waystone Portal): floors forever, real HP, bank or die
 * ------------------------------------------------------------------ */
const newPending = () => ({ gold: 0, ore: 0, wood: 0, herbs: 0, mana: 0, mythril: 0, scale: 0, feather: 0, renown: 0 });
const heroSnap = h => ({ id: h.id, name: h.name, cls: h.cls, level: h.level, variant: h.variant || 0, trait: traitOf(h), vip: !!h.vip, power: heroPower(h, 'combat') });
const diveFloor = q => q.script.floors[diveFloorIndex(q.script, q.elapsed)];
const diveProg = q => { const f = diveFloor(q); return f ? Math.min(100, Math.max(0, (q.elapsed - f.s) / (f.e - f.s) * 100)) : 0; };
function dispatchDive() {
  if (!first('portal')) return toast('Build a Waystone Portal first.');
  if (G.quests.some(q => q.dive)) return toast('A party is already inside the dungeon.');
  const r = readyHeroes().sort((a, b) => heroPower(b, 'combat') - heroPower(a, 'combat')).slice(0, 4);
  if (r.length < 2) return toast('The dive needs at least 2 geared, rested heroes.');
  const q = { id: G.nextId++, name: 'Endless Dive', type: 'dive', dive: true, state: 'active', heroes: r, party: r.map(heroSnap), seed: (Math.random() * 1e9) | 0, heals: [], enchants: [], relics: [], offer: null, elapsed: 0, cleared: 0, pending: newPending(), dur: 1e9, t: 1e9, chance: 0.5, minH: 2, maxH: 4, diff: 0, loot: {}, enchant: false, gold: 0, renown: 0 };
  q.script = newDiveScript(q); ensureFloors(q, 0); G.quests.push(q);
  r.forEach(h => { h.state = 'quest'; h.mesh.visible = false; setMood(h, null); h.onDone = null; });
  sfx('horn'); toast(`🌀 ${r.length} heroes step through the portal… Recall to bank your loot!`); renderModal(true);
}
function pickRelic(q, i, auto) {
  const id = q.offer && q.offer[i]; if (!id) return;
  const T = q.elapsed, next = diveFloorIndex(q.script, T) + 1; q.relics = q.relics || []; q.relics.push({ id, from: next }); q.offer = null;
  rebuildDive(q, T); toast(`${auto ? 'Relic claimed automatically' : 'Relic chosen'}: ${RELICS[id].icon} ${RELICS[id].name} — ${RELICS[id].desc}`);
}
function bankPending(q) {
  const p = q.pending, pm = G.research.prospect ? 1.5 : 1, txt = rewardText(p);
  G.gold += Math.round(p.gold * questGoldMul()); G.ore += Math.round(p.ore * pm); G.wood += p.wood; G.herbs += p.herbs; G.mana += p.mana;
  G.rare.mythril += p.mythril; G.rare.scale += p.scale; G.rare.feather += p.feather; G.renown += p.renown; q.pending = newPending();
  return txt;
}
function diveTick(q, dt) {
  q.elapsed += dt; q.t = q.dur - q.elapsed; const S = q.script; ensureFloors(q, q.elapsed);
  while (q.cleared < S.floors.length && S.floors[q.cleared].e <= q.elapsed && !S.floors[q.cleared].lost) {
    const f = S.floors[q.cleared]; for (const k of Object.keys(q.pending)) q.pending[k] += f.reward[k] || 0;
    q.cleared++; G.diveBest = Math.max(G.diveBest, q.cleared);
    if (diveCheckpoint(f.k)) {
      toast(`🏁 Checkpoint — floor ${f.k + 1}! Banked: ${bankPending(q)}`);
      if (q.offer) pickRelic(q, 0, true);   // an unchosen offer is taken automatically
      q.offer = relicOffer(q, f.k);
      if (q.offer.length) { sfx('chime'); toast('🎁 A relic awaits — choose one!'); if (!modalKind) openModal('relic'); }
    }
  }
  if (S.wiped && q.elapsed >= S.endT) resolveDive(q, 'wiped');
}
function resolveDive(q, mode) {
  const S = q.script, T = q.elapsed; let text;
  if (mode === 'recalled') text = `🏁 Banked & left after floor ${q.cleared} · ${bankPending(q)}`;
  else text = `☠ Wiped out on floor ${S.floors.length}. Lost unbanked loot: ${rewardText(q.pending)}`;
  q.endText = text; G.diveBest = Math.max(G.diveBest, q.cleared);
  onQuestEnd(q, mode === 'recalled');
  q.state = 'done'; G.quests.splice(G.quests.indexOf(q), 1);
  q.heroes.forEach(h => {
    if (!G.heroes.includes(h)) return;
    const i = q.party.findIndex(pp => pp.id === h.id), H = S.heroes[i];
    h.state = 'idle'; h.cool = 0; h.target = null; h.mesh.visible = true; h.pos.set(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1));
    if (H.dies && H.D <= T) { memorialize(h, `fell on floor ${diveFloorIndex(S, H.D) + 1} of the Endless Dive`); if (h.vip) G.renown = Math.max(0, G.renown - 1); removeHero(h, h.vip ? `☠ ${h.name} — a legend of the guild — fell on floor ${diveFloorIndex(S, H.D) + 1}!` : `${h.name} fell on floor ${diveFloorIndex(S, H.D) + 1} of the dive.`); return; }
    h.quests = (h.quests || 0) + 1; gainXp(h, Math.floor(q.cleared / 3) * (traitOf(h) === 'scholar' ? 2 : 1));
    h.stamina = Math.max(15, h.stamina - 25 - q.cleared); h.happy = Math.min(100, h.happy + 10); if (Math.random() < 0.7) h.gear = false;
  });
  toast(text); renderModal(true);
}

/* ------------------------------------------------------------------ *
 *  Events: monster incursion, wandering merchant, royal demand
 * ------------------------------------------------------------------ */
const DEFENDER_NAMES = ['Guard', 'Sentry', 'Warden', 'Lookout'];
function raidThreat(q) { return q.raidCount * 3.5 * (1 + 0.1 * G.rank) * (q.bossRaid ? 1.8 : 1); }
function defenderParty(muster) {
  const p = [], guards = G.staff.guard, towers = ofType('tower').length;
  for (let i = 0; i < Math.min(2, guards); i++) p.push({ id: -(i + 1), name: `${DEFENDER_NAMES[i]}`, cls: 'knight', level: 1 + G.walls, variant: 0, power: 3 * (G.research.scales ? 2 : 1), trait: null, vip: false });
  for (let i = 0; i < Math.min(2, towers); i++) p.push({ id: -(10 + i), name: 'Tower Archer', cls: 'ranger', level: 2, variant: 1, power: 4, trait: null, vip: false });
  if (!p.length) p.push({ id: -99, name: 'Militia', cls: 'knight', level: 1, variant: 2, power: 1.5, trait: null, vip: false });
  const heroes = muster ? G.heroes.filter(h => h.state !== 'quest' && h.state !== 'leaving').sort((a, b) => heroPower(b, 'combat') - heroPower(a, 'combat')).slice(0, 3) : [];
  return { party: [...p, ...heroes.map(heroSnap)], heroes };
}
function raidQuest() { return G.quests.find(q => q.defense); }
function startRaid() {
  if (raidQuest()) return;
  G.flags.raidN = (G.flags.raidN || 0) + 1;
  const bossRaid = G.flags.raidN % 4 === 0, count = 2 + Math.floor(G.renown / 6) + G.rank * 2, side = Math.random() < 0.5;
  for (let i = 0; i < Math.min(count, 8); i++) {
    const m = buildGoblin();
    m.position.set(side ? 1.5 + rnd(0, 1.5) : 1.5 + rnd(0, 3), 0, side ? 4 + rnd(0, 3) + i : 1.5 + rnd(0, 1.5));
    scene.add(m); G.goblins.push({ mesh: m, phase: rnd(0, 6) });
  }
  const { party } = defenderParty(false);
  const q = { id: G.nextId++, name: bossRaid ? 'Warchief Raid at the Gates' : 'Raid at the Gates', type: 'defense', defense: true, state: 'active', heroes: [], party, raidCount: count, bossRaid, minH: Math.max(1, Math.min(3, count - 1)), maxH: 4, dur: 28, t: 28, gold: 0, renown: 0, loot: {}, mods: [], heals: [], deaths: [], enchant: false, seed: (Math.random() * 1e9) | 0, special: true };
  q.chance = Math.max(0.05, Math.min(0.97, defense(false) / raidThreat(q))); q.ok = Math.random() < q.chance; q.script = genScript(q); G.quests.push(q); G.alarm = false;
  sfx('raid'); notify('👹 Raid!', 'Raiders are at the gates of your guild.'); showBanner('raid', `👹 ${bossRaid ? 'WARCHIEF RAID' : 'Raid'}! ${count} raiders at the gates — odds ${Math.round(q.chance * 100)}%`, [['Muster heroes', 'alarm', 'red'], ['Watch', 'watchRaid', '']]);
  toast(bossRaid ? '🐗 A warchief leads the raiders!' : 'Raiders at the perimeter!');
}
function defense(muster) {
  let d = G.staff.guard * (G.research.scales ? 8 : 4) + G.walls * 3 + (G.research.scales ? 6 : 0) + ofType('tower').length * 6;
  if (muster) d += G.heroes.filter(h => h.state !== 'quest' && h.state !== 'leaving').sort((a, b) => heroPower(b, 'combat') - heroPower(a, 'combat')).slice(0, 3).reduce((s, h) => s + CLASSES[h.cls].base * (h.gear ? 1 : 0.6) * 1.1, 0);
  return d;
}
function musterHeroes() {
  const q = raidQuest(); if (!q || q.mustered) return toast(q ? 'The heroes are already fighting!' : 'No raid right now.');
  const { party, heroes } = defenderParty(true); if (!heroes.length) return toast('No free heroes to muster.');
  q.mustered = true; q.party = party; q.heroes = heroes; heroes.forEach(h => { h.state = 'quest'; h.mesh.visible = false; setMood(h, null); h.onDone = null; });
  const nc = Math.max(0.05, Math.min(0.97, defense(true) / raidThreat(q))); const gain = nc - q.chance; q.chance = nc;
  if (!q.ok && gain > 0 && Math.random() < gain / (1 - (nc - gain))) q.ok = true;
  q.script = genScript(q); hideBanner('raid'); showBanner('raid', `🔔 Heroes mustered — odds ${Math.round(nc * 100)}%`, [['Watch', 'watchRaid', '']]);
  toast(`🔔 ${heroes.length} heroes join the defence! Odds ${Math.round(nc * 100)}%`);
}
function resolveDefense(q) {
  sfx(q.ok ? 'win' : 'lose');
  const ok = q.ok, cp = G.goblins.length ? G.goblins[0].mesh.position.clone() : new THREE.Vector3(HALL.cx + 2.5, 0, HALL.cz + 3);
  const loot = Math.round(35 * q.raidCount * (q.bossRaid ? 3 : 1) * (1 + 0.1 * G.rank)), ren = 1 + (q.bossRaid ? 3 : 0);
  if (ok) { gain(cp, loot); G.renown += ren; G.stats.raidsWon++; if (q.bossRaid) { G.rare.mythril += 1; q.endText = `🛡️ The warchief falls! +${loot}g, +${ren}⭐, 1 💎`; } else q.endText = `🛡️ The raid is repelled! +${loot}g, +${ren}⭐`; }
  else {
    const lost = Math.min(Math.round(G.gold * (q.bossRaid ? 0.3 : 0.2) + 20), 300 + 500 * (G.rank + 1) + 15 * G.renown); G.gold = Math.max(0, G.gold - lost); G.renown = Math.max(0, G.renown - 2);
    ofType('forge').concat(ofType('alchemy')).forEach(b => { b.stock = Math.floor(b.stock * 0.75); });
    floatText(cp, `-${lost} Gold`, '#ff7a7a'); q.endText = `👹 The raiders broke through! Lost ${lost}g, some stock, and 2 ⭐. Build towers and hire guards!`;
  }
  onQuestEnd(q, ok); q.state = 'done'; G.quests.splice(G.quests.indexOf(q), 1);
  q.heroes.forEach(h => { if (!G.heroes.includes(h)) return; h.state = 'idle'; h.cool = 0; h.target = null; h.mesh.visible = true; h.pos.set(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1)); h.stamina = Math.max(20, h.stamina - 12); });
  G.goblins.forEach(g => scene.remove(g.mesh)); G.goblins = []; G.alarm = false; hideBanner('raid'); toast(q.endText); renderModal(true);
}
function updateGoblins(dt) {
  if (!G.goblins.length) return;
  const target = new THREE.Vector3(HALL.cx + 2.5, 0, HALL.cz + 2);
  for (const g of G.goblins) {
    const p = g.mesh.position, dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    g.phase += dt * 9;
    if (d > 6.5) { p.x += dx / d * 1.2 * dt; p.z += dz / d * 1.2 * dt; g.mesh.rotation.y = Math.atan2(dx, dz); p.y = Math.abs(Math.sin(g.phase)) * 0.05; }
  }
}
let cart = null;
function startMerchant() {
  G.merchant = { t: 70 };
  cart = buildMerchantCart(); cart.position.set(HALL.cx + 7.5, 0, HALL.cz + 5.5); scene.add(cart);
  showBanner('merchant', '🛒 A wandering merchant arrived with rare wares!', [['Trade', 'openMerchant', '']]);
}
function endMerchant() { G.merchant = null; if (cart) { scene.remove(cart); cart = null; } hideBanner('merchant'); if (modalKind === 'merchant') closeModal(); }
const tutorial = createTutorial({ G, first: t => first(t), toast: m => toast(m) });
onLangChange(() => { tutorial.render(); lastHtml = ''; hudCache = ''; $('royal')._h = null; $('expeds')._h = null; renderModal(true); renderBanner(); updateHUD(); if (watching) updateWatchHUD(); });
// ---- orders: Royal Demand and visible bulk Trade Caravans (deliver swords/potions from Forge and Lab stock)
const ORDER_SRC = { sword: { src: 'forge', icon: '🗡️', label: 'swords' }, potion: { src: 'alchemy', icon: '🧪', label: 'potions' } };
const stockOf = kind => ofType(ORDER_SRC[kind].src).reduce((n, b) => n + b.stock, 0);
let caravan = null;
function spawnCaravan() {
  if (caravan) return; caravan = new THREE.Group();
  const c1 = PROPS.cartProp(0), c2 = PROPS.cartProp(1), c3 = PROPS.cartProp(1);
  c1.position.set(-1.8, 0, 0); c2.position.set(0.4, 0, 0.3); c3.position.set(2.6, 0, -0.2); [c1, c2, c3].forEach(c => { c.rotation.y = -0.15; caravan.add(c); });
  [-2.6, 1.4, 3.6].forEach((x, i) => { const p = buildStaff(i % 2 ? 'porter' : 'guard'); p.position.set(x, 0, 1.2); p.rotation.y = 3.14; caravan.add(p); });
  caravan.position.set(N - 5, 0, HALL.cz + 2.2); scene.add(caravan);
}
function endCaravanIfDone() { if (caravan && !G.orders.some(o => o.kind === 'caravan')) { scene.remove(caravan); caravan = null; } }
function addOrder(kind) {
  const o = { id: G.nextId++, kind, need: {} };
  if (kind === 'royal') { const n = Math.min(24, 5 + Math.floor(G.renown / 8)); Object.assign(o, { need: { sword: n }, t: 150, tMax: 150, reward: 120 + n * 30, ren: 3, pen: 3, title: 'Royal Demand', icon: '👑' }); toast(`👑 Royal Demand: ${n} iron swords!`); }
  else {
    const sw = Math.min(30, 5 + Math.floor(G.renown / 4)), po = first('alchemy') ? Math.min(20, 3 + Math.floor(G.renown / 6)) : 0; o.need.sword = sw; if (po) o.need.potion = po;
    Object.assign(o, { t: 260, tMax: 260, reward: Math.round((60 + sw * 28 + po * 24) * (G.flags.pact ? 0.8 : 1)), ren: 2 + Math.floor((sw + po) / 12), pen: 2, title: 'Trade Caravan', icon: '🐪' });
    spawnCaravan(); toast(`🐪 A trade caravan arrived! Bulk order: ${sw} swords${po ? ` + ${po} potions` : ''}.`);
  }
  G.orders.push(o);
}
function deliverOrder(id) {
  const o = G.orders.find(x => x.id === id); if (!o) return; let moved = 0;
  for (const kind of Object.keys(o.need)) for (const b of ofType(ORDER_SRC[kind].src)) while (o.need[kind] > 0 && b.stock > 0) { b.stock--; o.need[kind]--; moved++; }
  if (Object.values(o.need).every(v => v <= 0)) {
    G.orders.splice(G.orders.indexOf(o), 1); gain(G.buildings[0].door, o.reward); G.renown += o.ren; G.stats.orders++; endCaravanIfDone();
    toast(`${o.icon} ${o.title} fulfilled! +${o.reward}g, +${o.ren}⭐`);
  } else if (moved) toast(`Delivered ${moved}. Still needed: ${Object.entries(o.need).filter(([, v]) => v > 0).map(([k, v]) => v + ' ' + ORDER_SRC[k].label).join(', ')}.`);
  else toast('Nothing in stock to deliver yet.');
}

/* ------------------------------------------------------------------ *
 *  Banner
 * ------------------------------------------------------------------ */
const banners = {};
function showBanner(id, text, buttons) { banners[id] = { text, buttons }; renderBanner(); }
function hideBanner(id) { delete banners[id]; renderBanner(); }
function renderBanner() {
  const el = $('banner'); const ids = Object.keys(banners);
  if (!ids.length) return el.classList.add('hidden');
  const id = ids[ids.length - 1], b = banners[id];
  el.className = id === 'merchant' ? 'merchant' : '';
  el.innerHTML = trHtml(`<span>${b.text}</span>` + b.buttons.map(([l, a, c]) => `<button class="act ${c}" data-act="${a}">${l}</button>`).join(''));
}

/* ------------------------------------------------------------------ *
 *  Production & economy tick
 * ------------------------------------------------------------------ */
function updateEconomy(dt) {
  G.time += dt;
  const t = G.tm;
  // production
  for (const b of G.buildings) {
    if (b.type === 'forge' || b.type === 'alchemy') {
      const isF = b.type === 'forge', g = b.grade || 1, c = gradeCost(b.type, g); b.crafting = false;
      if (b.stock < stockCap(b) && canPay(c)) {
        b.crafting = true;
        b.progress += dt * (isF ? craftSpeed() : alchSpeed()) * (1 + 0.3 * (b.level - 1)) * adj(b).speed / (8 * GRADE_TIME[g]);
        if (b.progress >= 1) { b.progress = 0; payCost(c); b.stock++; floatText(b.door, (isF ? '🗡️ +1 ' : '🧪 +1 ') + GRADE[b.type][g], '#fff'); }
      }
    } else if (b.type === 'smelter') {
      b.crafting = false; const cap = 20 + 10 * b.level + warehouseBonus();
      if (G.ingots < cap && G.ore >= 2) { b.crafting = true; b.progress += dt * (1 + 0.3 * (b.level - 1)) * adj(b).speed / 10; if (b.progress >= 1) { b.progress = 0; G.ore -= 2; G.ingots++; floatText(b.door, '🔩 +1', '#fff'); } }
    }
  }
  if (first('alchemy')) { t.mana += dt; if (t.mana >= 5) { t.mana = 0; G.mana += 1 + (G.research.arcane ? 1 : 0) + regionPerk('ruins') + (G.flags.faction === 'arcane' ? 1 : 0); } }
  t.market -= dt; if (t.market <= 0) { t.market = rnd(70, 100); tickMarket(); }
  t.goals -= dt; if (t.goals <= 0) { t.goals = 1; checkGoals(); checkStories(); tutorial.tick(); }
  // minor facilities
  t.minor = (t.minor || 0) + dt;
  if (t.minor >= 6) {
    t.minor = 0;
    G.herbs += ofType('garden').length;
    G.mana += ofType('stones').length;
    if (ofType('training').length) { const idle = G.heroes.filter(h => h.state !== 'quest' && h.state !== 'leaving'); if (idle.length) { const h = pick(idle); gainXp(h, 0.5 * ofType('training').length); } }
  }
  // passive trickle: workers gather basic materials
  t.trickle += dt;
  if (t.trickle >= 12) { t.trickle = 0; G.ore += Math.random() < 0.7 ? Math.round(1 * (G.research.prospect ? 1.5 : 1)) : 0; G.herbs += Math.random() < 0.6 ? 1 : 0; G.wood += Math.random() < 0.5 ? 1 : 0; if (G.staff.porter) { G.ore += G.staff.porter; G.herbs += G.staff.porter; } }
  // tavern + market passive gold
  t.tavern += dt;
  if (t.tavern >= 4) { t.tavern = 0; let g = 0; ofType('tavern').forEach(b => g += b.level); ofType('market').forEach(b => { g += 0.5 * adj(b).gold; }); if (g > 0) { G.gold += g; } }
  // wages
  t.wage -= dt;
  if (t.wage <= 0) { t.wage = 30; const w = wage(); if (w > 0) { const paid = Math.min(w, G.gold); G.gold -= paid; floatText(G.buildings[0].door, `-${paid} wages`, '#ffa'); } }
  // spawning heroes
  t.spawn -= dt;
  if (t.spawn <= 0) {
    t.spawn = Math.max(18, 45 - G.renown * 0.3) / (first('portal') ? 2 : 1);
    if (ofType('tavern').length && G.heroes.length < popCap()) spawnHero();
  }
  tickAuto(dt);
  // quests
  t.quest -= dt;
  if (t.quest <= 0) { t.quest = 14; if (G.quests.filter(q => q.state === 'open').length < boardSlots()) genQuest(); }
  for (const q of [...G.quests]) if (q.state === 'active') { if (q.dive) diveTick(q, dt); else { q.t -= dt; if (q.t <= 0 || q.dur - q.t >= questEnd(q)) (q.defense ? resolveDefense(q) : resolveQuest(q)); } }
  // events
  t.merchant -= dt; if (t.merchant <= 0) { t.merchant = rnd(150, 220); if (G.renown >= 2 && !G.merchant) startMerchant(); }
  if (G.merchant) { G.merchant.t -= dt; if (G.merchant.t <= 0) endMerchant(); }
  t.raid -= dt; if (t.raid <= 0) { t.raid = rnd(100, 160) * (1 - 0.08 * G.rank) * (G.flags.hostile ? 0.7 : 1); if (G.renown >= 3 && !raidQuest()) startRaid(); }
  t.royal -= dt; if (t.royal <= 0) { t.royal = rnd(200, 280); if (G.renown >= 4 && first('forge') && !G.orders.some(o => o.kind === 'royal')) addOrder('royal'); }
  t.caravan = (t.caravan ?? 260) - dt; if (t.caravan <= 0) { t.caravan = rnd(300, 420); if (G.renown >= 5 && first('forge') && !G.orders.some(o => o.kind === 'caravan')) addOrder('caravan'); }
  for (const o of [...G.orders]) {
    o.t -= dt;
    if (o.t <= 0) { G.orders.splice(G.orders.indexOf(o), 1); G.renown = Math.max(0, G.renown - o.pen); toast(`${o.icon} ${o.title} expired — reputation damaged! (−${o.pen} ⭐)`); endCaravanIfDone(); }
  }
}

/* ------------------------------------------------------------------ *
 *  HUD, objectives, Royal panel
 * ------------------------------------------------------------------ */
// ---- long-term goal ladder: every goal pays out (gold, renown or rare materials)
const GOALS = [
  ['Build a Tavern', () => !!first('tavern'), { gold: 100 }], ['Build the Forge', () => !!first('forge'), { gold: 150 }],
  ['Send your first party', () => G.questsDone > 0, { gold: 200 }], ['Reach 3 renown', () => G.renown >= 3, { gold: 150 }],
  ["Build the Alchemist's Lab", () => !!first('alchemy'), { gold: 200 }], ['Recruit a Blacksmith', () => G.staff.smith > 0, { gold: 100 }],
  ['Complete 10 quests', () => G.questsDone >= 10, { gold: 400 }], ['Reach 10 renown', () => G.renown >= 10, { gold: 300 }],
  ['Raise the guild to a Hold (Upgrades)', () => G.rank >= 1, { renown: 3 }], ['Build a Smeltery', () => !!first('smelter'), { gold: 300 }],
  ['Equip a hero with Steel gear', () => G.heroes.some(h => h.gear && (h.gearTier || 1) >= 2), { gold: 400 }], ['Own 8 heroes', () => G.heroes.length >= 8, { gold: 300 }],
  ['Fulfil a trade order', () => G.stats.orders >= 1, { gold: 300 }], ['Reach 30 renown', () => G.renown >= 30, { gold: 600 }],
  ['Dive to floor 5', () => G.diveBest >= 5, { gold: 500 }], ['Train a hero to level 5', () => G.heroes.some(h => h.level >= 5), { rare: { mythril: 1 } }],
  ['Build a Guard Tower', () => !!first('tower'), { gold: 400 }], ['Dive to floor 10', () => G.diveBest >= 10, { rare: { mythril: 2 } }],
  ['Raise the guild to a Keep', () => G.rank >= 2, { renown: 5 }], ['Fulfil 5 trade orders', () => G.stats.orders >= 5, { gold: 1500 }],
  ['Win 5 defences', () => G.stats.raidsWon >= 5, { gold: 1500 }], ['Dive to floor 20', () => G.diveBest >= 20, { rare: { scale: 1, feather: 1 } }],
  ['Complete 50 quests', () => G.questsDone >= 50, { gold: 1500 }], ['Raise the guild to a Fortress', () => G.rank >= 3, { renown: 10 }],
  ['Choose a guild specialization', () => !!G.flags.faction, { gold: 500 }], ['Expand your territory', () => G.land >= 1, { gold: 600 }], ['Reach mastery 3 in a region', () => Object.keys(REGIONS).some(r => regionLevel(r) >= 3), { rare: { mythril: 2 } }],
  ['Promote a hero', () => G.stats.promoted >= 1, { gold: 500 }], ['Give a hero a talent', () => G.heroes.some(h => (h.talents || []).length), { gold: 300 }],
  ['Reach 100 renown', () => G.renown >= 100, { gold: 4000 }],
];
const rewardTags = r => Object.entries(r).map(([k, v]) => k === 'gold' ? `💰${v}` : k === 'renown' ? `⭐${v}` : Object.entries(v).map(([rk, rv]) => `${RARE[rk].icon}${rv}`).join('')).join(' ');
function checkGoals() {
  GOALS.forEach((g, i) => {
    if (G.goalsDone[i] || !g[1]()) return; G.goalsDone[i] = 1; const r = g[2];
    if (r.gold) G.gold += r.gold; if (r.renown) G.renown += r.renown; if (r.rare) for (const [k, v] of Object.entries(r.rare)) G.rare[k] += v;
    sfx('goal'); toast(`🎯 Goal complete: ${g[0]} — ${rewardTags(r)}`);
  });
}
const RANKS = [
  { name: 'Outpost', icon: '🏕️', perks: 'Building level cap 3.' },
  { name: 'Hold', icon: '🏰', perks: 'Level cap 5 · +4 beds · Steel gear · Smeltery & Guard Tower · hero promotions', req: { renown: 10, gold: 1200, wood: 40, ore: 30, build: ['tavern', 'forge', 'market'] } },
  { name: 'Keep', icon: '🏯', perks: 'Level cap 7 · +4 beds · Mythril gear · +1 quest slot', req: { renown: 40, gold: 8000, wood: 150, rare: { mythril: 6 }, dive: 12 } },
  { name: 'Fortress', icon: '🛡️', perks: 'Level cap 9 · +4 beds · +1 quest slot · tougher raids, richer rewards', req: { renown: 120, gold: 40000, rare: { mythril: 25, scale: 8, feather: 5 }, dive: 25 } },
];
function rankReqs(r) {
  const q = RANKS[r].req, out = []; if (!q) return out;
  out.push([G.renown >= q.renown, `⭐ ${q.renown} renown (have ${G.renown})`], [G.gold >= q.gold, `💰 ${q.gold} gold`]);
  if (q.wood) out.push([G.wood >= q.wood, `🪵 ${q.wood} wood (have ${G.wood})`]); if (q.ore) out.push([G.ore >= q.ore, `⛏️ ${q.ore} ore (have ${G.ore})`]);
  if (q.rare) for (const [k, v] of Object.entries(q.rare)) out.push([G.rare[k] >= v, `${RARE[k].icon} ${v} ${RARE[k].label} (have ${G.rare[k]})`]);
  if (q.build) out.push([q.build.every(t => first(t)), `Buildings: ${q.build.map(t => BUILDINGS[t].name).join(', ')}`]);
  if (q.dive) out.push([G.diveBest >= q.dive, `🌀 Endless Dive floor ${q.dive} (best ${G.diveBest})`]);
  return out;
}
function rankUp() {
  if (G.rank >= 3) return; const r = G.rank + 1, reqs = rankReqs(r);
  if (!reqs.every(x => x[0])) return toast('Requirements for the next rank are not met yet.');
  const q = RANKS[r].req; G.gold -= q.gold; if (q.wood) G.wood -= q.wood; if (q.ore) G.ore -= q.ore; if (q.rare) spendRare(q.rare);
  G.rank = r; floatText(G.buildings[0].door, `${RANKS[r].icon} ${RANKS[r].name}!`, '#ffd24a'); toast(`${RANKS[r].icon} The guild is now a ${RANKS[r].name}! ${RANKS[r].perks}`);
}
// ---- market prices drift and spike; you can buy low and sell high
const BASE_PRICE = { ore: 8, herbs: 6, wood: 6 };
function tickMarket() {
  const m = G.market;
  for (const k of Object.keys(BASE_PRICE)) m[k] = Math.max(0.5, Math.min(2.2, 1 + (m[k] - 1) * 0.55 + (Math.random() - 0.5) * 0.5));
  const k = pick(Object.keys(BASE_PRICE)), up = Math.random() < 0.5; m[k] = up ? rnd(1.6, 2.1) : rnd(0.5, 0.65);
  m.news = `${{ ore: 'Iron Ore', herbs: 'Herbs', wood: 'Pine Wood' }[k]} ${up ? 'is scarce — prices surge!' : 'is plentiful — prices crash!'}`; toast(`🛒 Market: ${m.news}`);
}
const buyPrice = k => Math.ceil(BASE_PRICE[k] * G.market[k] * 5), sellPrice = k => Math.floor(BASE_PRICE[k] * 0.55 * G.market[k] * 5 * (G.flags.merchantFriend ? 1.1 : 1));
const trend = k => G.market[k] > 1.15 ? '<span style="color:#ff9a9a">▲</span>' : G.market[k] < 0.87 ? '<span style="color:#9bff9b">▼</span>' : '▬';
let hudCache = '';
function updateHUD() {
  $('hGold').textContent = Math.floor(G.gold).toLocaleString();
  $('hRenown').textContent = G.renown;
  $('hMana').textContent = G.mana;
  $('hPop').textContent = `${G.heroes.length}/${popCap()}`;
  $('hReady').textContent = readyHeroes().length; $('hOpen').textContent = G.quests.filter(q => q.state === 'open').length;
  { const r = G.rare; $('hRare').classList.toggle('hidden', !(r.mythril || r.scale || r.feather)); $('hMyth').textContent = r.mythril; $('hScale').textContent = r.scale; $('hFeather').textContent = r.feather; }
  $('hIngot').classList.toggle('hidden', !first('smelter') && G.ingots === 0); $('hIng').textContent = G.ingots;
  $('hOre').textContent = G.ore; $('hWood').textContent = G.wood; $('hHerbs').textContent = G.herbs;
  const ex = G.quests.filter(q => q.state === 'active').map(q => { const dv = q.dive, lab = dv ? `Floor ${diveFloorIndex(q.script, q.elapsed) + 1}` : `${Math.ceil(q.t)}s`, pr = dv ? diveProg(q) : 100 - q.t / q.dur * 100; return `<div class="exp" data-act="watch" data-q="${q.id}" title="Watch this expedition live"><span>${dv ? '🌀' : '👁'} ${q.name}</span><span>${lab}</span><div class="bar"><i style="width:${pr}%"></i></div></div>`; }).join('');
  if (ex !== $('expeds')._h) { $('expeds')._h = ex; $('expeds').innerHTML = ex ? trHtml('<h4>Expeditions:</h4>' + ex) : ''; }
  const open = GOALS.map((g, i) => [g, i]).filter(([, i]) => !G.goalsDone[i]).slice(0, 3), nDone = Object.keys(G.goalsDone).length;
  const html = `<li class="s">${RANKS[G.rank].icon} <b>${RANKS[G.rank].name}</b> · goals ${nDone}/${GOALS.length}</li>` + open.map(([g]) => `<li>☐ ${g[0]} <span class="s">${rewardTags(g[2])}</span></li>`).join('');
  if (html !== hudCache) { hudCache = html; $('objList').innerHTML = trHtml(html); }
  const rh = G.orders.map(o => {
    const needs = Object.entries(o.need).filter(([, v]) => v > 0).map(([k, v]) => `${ORDER_SRC[k].icon} ${v}`).join(' + '), avail = Object.keys(o.need).reduce((n, k) => n + (o.need[k] > 0 ? stockOf(k) : 0), 0);
    return `<div class="ord"><b>${o.icon} ${o.title}</b> · ${Math.ceil(o.t)}s<br>Need ${needs}<br>Reward ${o.reward}g +${o.ren}⭐<br><button class="act" data-act="deliver" data-id="${o.id}" ${avail < 1 ? 'disabled' : ''}>Deliver (${avail} in stock)</button></div>`;
  }).join('');
  if (rh !== $('royal')._h) { $('royal')._h = rh; $('royal').innerHTML = trHtml(rh); }
}

/* ------------------------------------------------------------------ *
 *  Modals
 * ------------------------------------------------------------------ */
let modalKind = null, modalArg = null, lastHtml = '';
const modal = $('modal');
function openModal(kind, arg) { if (kind === 'upgrades') G.flags.tutRank = 1; modalKind = kind; modalArg = arg; modal.classList.remove('hidden'); renderModal(true); }
function closeModal() { modalKind = null; modal.classList.add('hidden'); lastHtml = ''; }
$('modalClose').onclick = closeModal;
modal.addEventListener('pointerdown', e => { if (e.target === modal) closeModal(); });
const cost = n => `<span class="tag">💰 ${n}</span>`;
const RARE = { mythril: { icon: '💎', label: 'Mythril' }, scale: { icon: '🐉', label: 'Dragon Scale' }, feather: { icon: '🪶', label: 'Phoenix Feather' } };
const hasRare = req => !req || Object.entries(req).every(([k, v]) => G.rare[k] >= v);
const rareTags = req => req ? Object.entries(req).map(([k, v]) => `<span class="tag" title="${RARE[k].label}">${RARE[k].icon} ${v}${G.rare[k] < v ? ' (have ' + G.rare[k] + ')' : ''}</span>`).join('') : '';
const spendRare = req => { if (req) for (const [k, v] of Object.entries(req)) G.rare[k] -= v; };
const upReq = b => (['forge', 'alchemy'].includes(b.type) && b.level >= 4) ? { mythril: b.level >= 6 ? 5 : 3 } : null;

const TECHS = {
  prospect: ['Prospecting', 'Ore yields from quests and workers +50%.', 200],
  forging: ['Efficient Forging', 'Forge +30% and Lab +15% crafting speed.', 250],
  charter: ['Guild Charter', 'Quest gold rewards +25%.', 300],
  arcane: ['Arcane Studies', 'Mana regen doubled; Enchant bonus +30%.', 350],
  valor: ['Banner of Valor', 'All parties +10% success chance.', 400],
  mythril: ['Mythril Forging', 'Forge crafting +40% and weapons sell for 25% more. (Rare: from the Endless Dive)', 300, { mythril: 5 }],
  scales: ['Dragonhide Walls', 'Raid defense +6 and guards twice as effective. (Rare: from the Endless Dive)', 300, { scale: 3 }],
  feather: ['Phoenix Elixir', 'Potions heal 50% instead of 35%. (Rare: from the Endless Dive)', 400, { feather: 2 }],
};
const STAFF = {
  smith: ['Blacksmith', '⚒️', 'Forge crafting speed +25%'], alch: ['Alchemist', '🧪', 'Lab brewing speed +25%'],
  cook: ['Cook', '🍖', 'Meal income +15%'], bard: ['Bard', '🎻', 'Heroes lose happiness 30% slower'],
  guard: ['Guard', '🛡️', 'Defends against monster raids (+4)'], porter: ['Porter', '📦', 'Workers haul +50% more materials'],
};
const staffCost = k => 80 + 50 * G.staff[k];

function modalContent() {
  switch (modalKind) {
    case 'build': {
      const row = ([k, t]) => {
        const locked = G.renown < t.renown || G.rank < (t.rank || 0), poor = G.gold < t.cost;
        return `<div class="row"><div style="font-size:30px">${t.icon}</div><div class="grow"><div class="t">${t.name} <span class="tag">${t.w}×${t.d}</span></div><div class="s">${t.desc}</div>${cost(t.cost)}${t.renown ? `<span class="tag">⭐ ${t.renown} req.</span>` : ''}${t.rank ? `<span class="tag">${RANKS[t.rank].icon} ${RANKS[t.rank].name}</span>` : ''}</div>
        <button class="act" data-act="place" data-k="${k}" ${locked || poor ? 'disabled' : ''}>${locked ? '🔒 Locked' : 'Place'}</button></div>`;
      };
      const all = Object.entries(BUILDINGS).filter(([k]) => k !== 'hall');
      return ['🔨 Build Menu', '<div class="sec">Facilities</div>' + all.filter(([, t]) => !t.decor).map(row).join('') + '<div class="sec">Outpost Props & Minor Facilities</div>' + all.filter(([, t]) => t.decor).map(row).join('')];
    }
    case 'quests': {
      const rd = readyHeroes();
      const open = G.quests.filter(q => q.state === 'open'), act = G.quests.filter(q => q.state === 'active');
      let h = `<div class="s">Ready heroes (geared & rested): <b>${rd.length}</b> / ${G.heroes.length}</div>`;
      h += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0"><button class="act" data-act="sendall">▶ Send all possible</button><button class="act ${G.flags.autoQ ? '' : 'red'}" data-act="autoq">${G.flags.autoQ ? '⏱ Auto-send: ON' : '⏱ Auto-send: OFF'}</button>${G.flags.autoQ ? `<button class="act red" data-act="automin">min ${G.flags.autoMin || 60}%</button>` : ''}</div>`;
      if (first('portal')) {
        const dq = G.quests.find(q => q.dive);
        h += `<div class="sec">Waystone Portal</div><div class="row" style="border-color:#b070ff"><div style="font-size:30px">🌀</div><div class="grow"><div class="t">Endless Dive</div><div class="s">Send 2–4 geared heroes through the portal. Floors get harder forever: <b>recall to bank your loot</b> or fight on for rare materials (💎 🐉 🪶). Loot is banked automatically every 5 floors; a wipe-out loses what is unbanked. Best: floor ${G.diveBest}.</div></div><button class="act" data-act="dive" ${dq || rd.length < 2 ? 'disabled' : ''}>${dq ? 'In progress' : (rd.length < 2 ? 'Need 2 ready' : 'Dive!')}</button></div>`;
      }
      h += '<div class="sec">Active Expeditions</div>' + (act.map(q => q.dive
        ? `<div class="row"><div class="grow"><div class="t">🌀 Endless Dive — floor ${diveFloorIndex(q.script, q.elapsed) + 1}</div><div class="s">${q.heroes.map(x => x.name).join(', ')} · at risk: ${rewardText(q.pending)}</div><div class="bar"><i style="width:${diveProg(q)}%"></i></div></div><div style="text-align:center"><button class="act" data-act="watch" data-q="${q.id}">👁 Watch</button></div></div>`
        : `<div class="row"><div class="grow"><div class="t">${q.name}</div><div class="s">${(q.party || q.heroes).map(x => x.name).join(', ')} · success ${Math.round(q.chance * 100)}%</div><div class="bar"><i style="width:${100 - q.t / q.dur * 100}%"></i></div></div><div style="text-align:center">${Math.ceil(q.t)}s<br><button class="act" data-act="watch" data-q="${q.id}">👁 Watch</button></div></div>`).join('') || '<div class="s">None.</div>');
      h += '<div class="sec">Quest Board</div>' + (open.map(q => {
        const party = bestParty(q), ok = party.length >= q.minH, c = Math.round(chanceFor(q, party, { potion: false }) * 100), notes = ok ? modPenalty(q, party)[1] : [];
        const loot = Object.entries(q.loot).map(([k, v]) => ({ ore: '⛏️', herbs: '🌿', wood: '🪵', arcane: '✨' }[k]) + v).join(' ');
        return `<div class="row" ${q.special ? 'style="border-color:#ff9a4a"' : ''}><div class="grow"><div class="t">${q.special ? '📖 ' : ''}${q.name} <span class="tag">${q.type}</span> ${modTags(q)}</div>
          <div class="s">Party ${q.minH}–${q.maxH} · Danger ${q.diff.toFixed(1)} · ${Math.round(q.dur)}s</div>
          ${cost(q.gold)}<span class="tag">⭐ ${q.renown}</span><span class="tag">${loot}</span>
          <div class="s">${ok ? `Auto party: ${party.map(x => x.name).join(', ')} → <b>${c}%</b>${notes.length ? ` <span style="color:#ffb86a">(${notes.join(', ')})</span>` : ''}` : '<span style="color:#ff9a9a">Not enough ready heroes</span>'}</div></div>
          <div style="display:flex;flex-direction:column;gap:4px"><button class="act" data-act="dispatch" data-q="${q.id}" ${ok ? '' : 'disabled'}>Auto-send</button>
          <button class="act" data-act="pick" data-q="${q.id}" ${readyHeroes().length ? '' : 'disabled'}>Choose party…</button></div></div>`;
      }).join('') || '<div class="s">No quests posted right now — new ones appear regularly.</div>');
      h += '<div class="sec">Roster <span class="s">(tap a hero for details)</span></div>' + (G.heroes.map(x => `<div class="s" data-act="hero" data-id="${x.id}" style="cursor:pointer">${x.vip ? '⭐ ' : ''}${x.promo ? PROMO[x.cls].icon : CLASSES[x.cls].icon} ${x.name}${(x.talents || []).length < talentSlots(x) ? ' ✨' : ''} · Lv${x.level} ${heroLabel(x)} · 🔋${Math.round(x.stamina)} · 😊${Math.round(x.happy)} · ${x.gear ? 'geared' : 'needs gear'}${x.state === 'quest' ? ' · on quest' : ''}</div>`).join('') || '<div class="s">No heroes yet. Build a Tavern to attract them!</div>');
      return ['📜 Quest Board & Guild Hall', h];
    }
    case 'recruit': {
      let h = `<div class="row"><div style="font-size:28px">📣</div><div class="grow"><div class="t">Post Recruitment Flyer</div><div class="s">Attract a hero right now (needs free beds).</div>${cost(60)}</div><button class="act" data-act="flyer" ${G.gold < 60 || G.heroes.length >= popCap() ? 'disabled' : ''}>Recruit</button></div>`;
      h += `<div class="sec">Guild Staff <span class="s">· wages: ${wage()}g / 30s</span></div>`;
      h += Object.entries(STAFF).map(([k, [n, i, d]]) => `<div class="row"><div style="font-size:28px">${i}</div><div class="grow"><div class="t">${n} <span class="tag">${G.staff[k]}/${maxStaff}</span></div><div class="s">${d} · wage 4g/30s</div>${cost(staffCost(k))}</div>
        <div style="display:flex;gap:4px"><button class="act" data-act="hire" data-k="${k}" ${G.gold < staffCost(k) || G.staff[k] >= maxStaff ? 'disabled' : ''}>Hire</button>${G.staff[k] ? `<button class="act red" data-act="fire" data-k="${k}">Fire</button>` : ''}</div></div>`).join('');
      return ['🛡️ Recruit & Staff', h];
    }
    case 'research': return ['⚗️ Research', Object.entries(TECHS).map(([k, [n, d, c, req]]) => `<div class="row"><div class="grow"><div class="t">${n}</div><div class="s">${d}</div>${cost(c)}${rareTags(req)}</div>
        ${G.research[k] ? '<span class="tag">✔ Researched</span>' : `<button class="act" data-act="research" data-k="${k}" ${G.gold < c || !hasRare(req) ? 'disabled' : ''}>Research</button>`}</div>`).join('')];
    case 'settings': return ['⚙ Settings & Save', `
      <div class="row"><div class="grow"><div class="t">🔊 Sound</div><div class="s">Procedural sound effects and music (no downloads).</div></div><button class="act ${getPrefs().sfx ? '' : 'red'}" data-act="sfxtoggle">Effects: ${getPrefs().sfx ? 'On' : 'Off'}</button><button class="act ${getPrefs().music ? '' : 'red'}" data-act="musictoggle">Music: ${getPrefs().music ? 'On' : 'Off'}</button></div>
      <div class="row"><div class="grow"><div class="t">🌐 Language</div><div class="s">English / 한국어</div></div>${Object.entries(LANGS).map(([k, n]) => `<button class="act ${getLang() === k ? '' : 'red'}" style="${getLang() === k ? 'outline:2px solid #fff8' : ''}" data-act="lang" data-l="${k}">${n}</button>`).join('')}</div>
      <div class="row"><div class="grow"><div class="t">🔔 Notifications</div><div class="s">Alert when a quest ends or a raid arrives while the game is in the background (browser only; needs permission).</div></div><button class="act ${G.flags.notif ? '' : 'red'}" data-act="notiftoggle">${G.flags.notif ? 'On' : 'Off'}</button></div>
      <div class="row"><div class="grow"><div class="t">🧍 Characters</div><div class="s">Body style. Rigged bodies use motion-capture clips (walk, run, sword, bow, magic, heal). Changing it reloads the game (progress is saved).</div></div>${Object.entries(CHAR_STYLES).map(([k, n]) => `<button class="act ${charStyle === k ? '' : 'red'}" style="${charStyle === k ? 'outline:2px solid #fff8' : ''}" data-act="cstyle" data-s="${k}">${n}</button>`).join('')}</div>
      <div class="row"><div class="grow"><div class="t">💾 Save</div><div class="s">The game autosaves every 15 seconds and when you leave. Last save: ${lastSaved ? Math.round((Date.now() - lastSaved) / 1000) + 's ago' : 'not yet'}.</div></div><button class="act" data-act="save">Save now</button></div>
      <div class="row"><div class="grow"><div class="t">🎓 Tutorial</div><div class="s">Show the first-run guide again.</div></div><button class="act" data-act="tutorial">Replay</button></div>
      <div class="row"><div class="grow"><div class="t">🗑 New game</div><div class="s">${modalArg === 'confirm' ? '<b style="color:#ff9a9a">This erases your saved guild. Tap again to confirm.</b>' : 'Delete the save and start a fresh guild.'}</div></div><button class="act red" data-act="newgame">${modalArg === 'confirm' ? 'Really erase' : 'New game'}</button></div>
      <div class="s" style="margin-top:8px">Quests keep running for up to 10 minutes while you are away.</div>
      <div class="sec">✝ Hall of the Fallen</div>${G.fallen.length ? [...G.fallen].reverse().slice(0, 12).map(f => `<div class="s">${f.vip ? '⭐ ' : ''}<b>${f.name}</b> — level ${f.level} ${f.cls}, ${f.quests} expeditions; ${f.deed} (day ${f.day})</div>`).join('') : '<div class="s">No heroes have fallen. Yet.</div>'}`];
    case 'relic': {
      const q = G.quests.find(x => x.dive && x.offer); if (!q) return ['🎁 Relics', '<div class="s">No relic is waiting.</div>'];
      return ['🎁 Choose a relic (floor ' + q.cleared + ' reached)', '<div class="s">Relics last for the rest of this dive. Pick one before the next checkpoint (or it is chosen for you).</div>' + q.offer.map((id, i) => `<div class="row" style="border-color:#b070ff"><div style="font-size:30px">${RELICS[id].icon}</div><div class="grow"><div class="t">${RELICS[id].name}</div><div class="s">${RELICS[id].desc}</div></div><button class="act" data-act="relicpick" data-i="${i}">Take</button></div>`).join('') + ((q.relics || []).length ? `<div class="s" style="margin-top:8px">Owned: ${q.relics.map(r => RELICS[r.id].icon + ' ' + RELICS[r.id].name).join(', ')}</div>` : '')];
    }
    case 'party': {
      const st = modalArg, q = G.quests.find(x => x.id === st.qid); if (!q || q.state !== 'open') return ['Party', '<div class="s">This quest is no longer available.</div>'];
      const rd = readyHeroes().sort((a, b) => heroPower(b, q.type) - heroPower(a, q.type)), party = st.sel.map(id => G.heroes.find(x => x.id === id)).filter(Boolean), ap = APPROACH[st.approach];
      const lab = ofType('alchemy').reduce((n, b) => n + b.stock, 0), hasPoison = q.mods.includes('poison');
      const o = { enchant: st.enchant, approach: st.approach, potion: st.potion, formation: st.formation || 'line' }, c = party.length ? Math.round(chanceFor(q, party, o) * 100) : 0, [, notes] = modPenalty(q, party, o);
      let h = `<div class="s">${modTags(q)}</div><div class="s" style="margin:4px 0">${q.mods.map(k => MODS[k].icon + ' ' + MODS[k].desc).join('<br>') || 'No special conditions.'}</div>`;
      h += `<div class="sec">Approach</div><div style="display:flex;gap:5px">` + Object.entries(APPROACH).map(([k, a]) => `<button class="act ${st.approach === k ? '' : 'red'}" style="flex:1;${st.approach === k ? 'outline:2px solid #fff8' : ''}" data-act="papp" data-a="${k}">${a.icon} ${a.label}<br><span style="font-weight:400;font-size:10px">${a.desc}</span></button>`).join('') + '</div>';
      h += `<div class="sec">Formation</div><div style="display:flex;gap:5px">` + Object.entries(FORMATION).map(([k, a]) => `<button class="act ${(st.formation || 'line') === k ? '' : 'red'}" style="flex:1;${(st.formation || 'line') === k ? 'outline:2px solid #fff8' : ''}" data-act="pform" data-a="${k}">${a.icon} ${a.label}<br><span style="font-weight:400;font-size:10px">${a.desc}</span></button>`).join('') + '</div>';
      h += `<div style="display:flex;gap:6px;margin-top:6px"><button class="act ${st.enchant ? '' : 'red'}" data-act="pench" ${G.mana < 5 && !st.enchant ? 'disabled' : ''}>✨ Enchant (5 mana) ${st.enchant ? '✔' : ''}</button><button class="act ${st.potion ? '' : 'red'}" data-act="ppot" ${lab < 1 && !st.potion ? 'disabled' : ''}>🧪 Bring a potion (${lab}) ${st.potion ? '✔' : ''}</button></div>`;
      h += `<div class="sec">Ready heroes <span class="s">(pick ${q.minH}–${q.maxH})</span></div>` + (rd.map(x => `<div class="row" data-act="psel" data-id="${x.id}" style="cursor:pointer;${st.sel.includes(x.id) ? 'border-color:#ffd24a;background:#ffd24a22' : ''}"><div style="font-size:24px">${st.sel.includes(x.id) ? '☑' : '☐'} ${CLASSES[x.cls].icon}</div><div class="grow"><div class="t">${x.vip ? '⭐ ' : ''}${x.name} <span class="tag">Lv${x.level}</span>${x.vip ? `<span class="tag">${TRAITS[x.vip.trait].icon} ${TRAITS[x.vip.trait].label}</span>` : ''}<span class="tag">${gearName(x)} gear</span></div><div class="s">Power ${heroPower(x, q.type).toFixed(1)} on ${q.type} · 🔋${Math.round(x.stamina)}</div></div></div>`).join('') || '<div class="s">No geared, rested heroes available.</div>');
      h += `<div class="row" style="margin-top:10px;border-color:#ffd24a"><div class="grow"><div class="t">Success chance: <b style="font-size:18px">${c}%</b></div><div class="s">${party.length ? `${party.length} hero(es) · reward ~${Math.round(q.gold * questGoldMul() * ap.gold)}g · ${Math.round(q.dur * ap.dur)}s` : 'Select heroes above'}${notes.length ? `<br><span style="color:#ffb86a">Missing: ${notes.join(', ')}</span>` : ''}${bondInfo(party).notes.length ? `<br>${bondInfo(party).notes.join(' · ')}` : ''}</div></div><button class="act" data-act="pgo" ${party.length >= q.minH && party.length <= q.maxH ? '' : 'disabled'}>Send party</button></div>`;
      return ['🧭 Choose a party — ' + q.name, h];
    }
    case 'story': {
      const st = STORIES.find(x => x.id === G.flags.pending); if (!st) return ['Story', '<div class="s">Nothing to decide right now.</div>'];
      return ['📖 ' + st.title, `<div style="line-height:1.5;margin-bottom:8px">${st.text}</div>` + st.choices.map((c, i) => `<div class="row"><div class="grow"><div class="t">${c.label}</div>${c.hint ? `<div class="s">${c.hint}</div>` : ''}</div><button class="act" data-act="storychoice" data-i="${i}" ${c.ok && !c.ok() ? 'disabled' : ''}>Choose</button></div>`).join('')];
    }
    case 'map': {
      let h = '<div class="s">Choose where your quests are posted. Region mastery grows as you complete quests there and unlocks permanent bonuses.</div>';
      for (const [id, R] of Object.entries(REGIONS)) {
        const open = R.unlock(), act = G.region === id, rec = G.regions[id] || { done: 0 }, lvl = regionLevel(id);
        h += `<div class="row" style="${act ? 'border-color:#ffd24a;background:#ffd24a18' : ''}"><div style="font-size:32px">${R.icon}</div><div class="grow"><div class="t">${R.name} ${act ? '<span class="tag">✔ Active</span>' : ''}<span class="tag">Mastery ${lvl}/5</span></div><div class="s">${R.desc}</div><div class="s">${R.summary}</div><div class="bar"><i style="width:${lvl >= 5 ? 100 : (rec.done % 8) / 8 * 100}%"></i></div><div class="s">Quests done here: ${rec.done}${lvl < 5 ? ` · next level at ${(lvl + 1) * 8}` : ''}<br>Mastery bonus: ${R.perk}</div></div><button class="act" data-act="region" data-r="${id}" ${open && !act ? '' : 'disabled'}>${open ? (act ? 'Active' : 'Travel here') : '🔒 ' + R.need}</button></div>`;
      }
      return ['🗺 World Map', h];
    }
    case 'hero': {
      const h = G.heroes.find(x => x.id === modalArg); if (!h) return ['Hero', '<div class="s">This hero is no longer in the guild.</div>'];
      const c = CLASSES[h.cls], tr = h.vip ? TRAITS[h.vip.trait] : null, aq = G.quests.find(q => q.state === 'active' && q.heroes.includes(h));
      const bar = (v, col) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;${col ? 'background:' + col : ''}"></i></div>`;
      const stateTxt = { idle: 'Idle', walking: 'Walking', busy: 'Busy', waiting: 'Waiting around', quest: 'On an expedition', leaving: 'Leaving the guild' }[h.state] || h.state;
      let body = `<div class="row"><div style="font-size:34px">${c.icon}</div><div class="grow"><div class="t">${h.vip ? '⭐ ' : ''}${h.name}</div><div class="s">Level ${h.level} ${heroLabel(h)} · ${stateTxt}${h.quests ? ' · ' + h.quests + ' expeditions' : ''}</div></div>${aq ? `<button class="act" data-act="watch" data-q="${aq.id}">👁 Watch</button>` : ''}</div>`;
      const P = PROMO[h.cls], hm = heroMods(h), pend = (h.talents || []).length < talentSlots(h);
      if (h.promo) body += `<div class="row" style="border-color:#e8c04a"><div style="font-size:30px">${P.icon}</div><div class="grow"><div class="t">${P.name}</div><div class="s">${P.desc}</div></div></div>`;
      else body += `<div class="row"><div style="font-size:30px">${P.icon}</div><div class="grow"><div class="t">Promotion: ${P.name}</div><div class="s">${P.desc} Needs level 5 and Guild Rank Hold.</div>${cost(500)}</div><button class="act" data-act="promote" data-id="${h.id}" ${G.rank >= 1 && h.level >= 5 && G.gold >= 500 ? '' : 'disabled'}>Promote</button></div>`;
      if ((h.talents || []).length) body += `<div class="s">Talents: ${(h.talents || []).map(id => { const t = talentDef(h.cls, id); return t ? `<span class="tag" title="${t[2]}">${t[1]}</span>` : ''; }).join('')}</div>`;
      if (pend) { const tier = TALENTS[h.cls][(h.talents || []).length]; body += `<div class="sec">✨ Choose a talent</div>` + tier.map(t => `<div class="row" style="border-color:#8fd4ff"><div class="grow"><div class="t">${t[1]}</div><div class="s">${t[2]}</div></div><button class="act" data-act="talent" data-id="${h.id}" data-t="${t[0]}">Learn</button></div>`).join(''); }
      const bondNames = Object.entries(h.bonds || {}).map(([id, k]) => [G.heroes.find(x => x.id === +id), k]).filter(([x]) => x);
      if (bondNames.length) body += `<div class="s" style="margin-top:6px">${bondNames.map(([x, k]) => (k === 'friend' ? '🤝 Friends with ' : '⚡ Rival of ') + x.name).join(' · ')} <span style="opacity:.7">(same party: +4% / −5%)</span></div>`;
      if (tr) body += `<div class="row" style="border-color:#ffd24a"><div style="font-size:30px">${tr.icon}</div><div class="grow"><div class="t">VIP trait: ${tr.label}</div><div class="s">${tr.desc}</div></div></div>`;
      body += `<div class="s" style="margin-top:6px">Experience ${h.xp}/${h.level + 1}</div>${bar(h.xp / (h.level + 1) * 100, '#8fd4ff')}
        <div class="s" style="margin-top:6px">Stamina ${Math.round(h.stamina)}</div>${bar(h.stamina, h.stamina < 45 ? '#e0503a' : '#5be35b')}
        <div class="s" style="margin-top:6px">Happiness ${Math.round(h.happy)}</div>${bar(h.happy, h.happy < 30 ? '#e0503a' : '#f0c040')}
        <div class="row"><div class="grow"><div class="t">Gear</div><div class="s">${h.gear ? '✔ ' + gearName(h) + ' gear equipped' : '✘ Needs ' + (h.cls === 'wizard' ? 'potions from the Alchemical Lab' : 'a weapon from the Forge')}</div></div>
        <div class="grow"><div class="t">Power</div><div class="s">${heroPower(h, c.quest).toFixed(1)} on ${c.quest} quests</div></div></div>`;
      return [(h.vip ? '⭐ ' : '') + h.name, body];
    }
    case 'upgrades': {
      const c1 = 300 * (G.outpost + 1), c2 = 250 * (G.boardLvl + 1), c3 = 200 * (G.walls + 1);
      const nr = G.rank < 3 ? RANKS[G.rank + 1] : null, reqs = nr ? rankReqs(G.rank + 1) : [];
      const rankHtml = `<div class="row" style="border-color:#ffd24a"><div style="font-size:34px">${RANKS[G.rank].icon}</div><div class="grow"><div class="t">Guild Rank: ${RANKS[G.rank].name}</div><div class="s">${RANKS[G.rank].perks}</div>${nr ? `<div class="s" style="margin-top:6px"><b>Next: ${nr.icon} ${nr.name}</b> — ${nr.perks}</div>` + reqs.map(([ok, t]) => `<div class="s" style="color:${ok ? '#9bff9b' : '#ff9a9a'}">${ok ? '✔' : '✘'} ${t}</div>`).join('') : '<div class="s">The guild has reached its highest rank!</div>'}</div>${nr ? `<button class="act" data-act="rankup" ${reqs.every(x => x[0]) ? '' : 'disabled'}>Promote</button>` : ''}</div>`;
      const lc = [1500, 4000, 10000][G.land], lw = [60, 120, 200][G.land], lok = G.land < 3 && G.rank >= G.land + 1 && G.gold >= lc && G.wood >= lw;
      const landHtml = `<div class="row"><div style="font-size:30px">🌾</div><div class="grow"><div class="t">Expand Territory <span class="tag">Lv ${G.land}/3</span></div><div class="s">Clears forest and opens +4 tiles of buildable land on every side.${G.land < 3 ? ` Needs Guild Rank ${RANKS[G.land + 1].name}.` : ''}</div>${G.land < 3 ? cost(lc) + `<span class="tag">🪵 ${lw}</span>` : ''}</div><button class="act" data-act="land" ${lok ? '' : 'disabled'}>${G.land >= 3 ? 'Max' : 'Expand'}</button></div>`;
      let facHtml;
      if (factionOf()) { const F = factionOf(); facHtml = `<div class="row" style="border-color:#b070ff"><div style="font-size:30px">${F.icon}</div><div class="grow"><div class="t">Specialization: ${F.name}</div><div class="s">${F.perk}</div></div></div>`; }
      else facHtml = `<div class="sec">Guild Specialization <span class="s">(permanent · needs Guild Rank Hold)</span></div>` + Object.entries(FACTIONS).map(([k, F]) => `<div class="row"><div style="font-size:30px">${F.icon}</div><div class="grow"><div class="t">${F.name}</div><div class="s">${F.desc}</div><div class="s" style="color:#9bff9b">${F.perk}</div>${cost(2000)}</div><button class="act" data-act="faction" data-f="${k}" ${G.rank >= 1 && G.gold >= 2000 ? '' : 'disabled'}>Declare</button></div>`).join('');
      return ['⬆️ Guild & Outpost', rankHtml + facHtml + landHtml + `
        <div class="row"><div class="grow"><div class="t">Expand Outpost <span class="tag">Lv ${G.outpost}/5</span></div><div class="s">+3 population capacity.</div>${cost(c1)}</div><button class="act" data-act="up" data-k="outpost" ${G.gold < c1 || G.outpost >= 5 ? 'disabled' : ''}>Upgrade</button></div>
        <div class="row"><div class="grow"><div class="t">Quest Board Expansion <span class="tag">Lv ${G.boardLvl}/3</span></div><div class="s">+1 quest slot on the board.</div>${cost(c2)}</div><button class="act" data-act="up" data-k="boardLvl" ${G.gold < c2 || G.boardLvl >= 3 ? 'disabled' : ''}>Upgrade</button></div>
        <div class="row"><div class="grow"><div class="t">Fortify Walls <span class="tag">Lv ${G.walls}/4</span></div><div class="s">+3 defense against monster raids.</div>${cost(c3)}</div><button class="act" data-act="up" data-k="walls" ${G.gold < c3 || G.walls >= 4 ? 'disabled' : ''}>Upgrade</button></div>`];
    }
    case 'building': {
      const b = G.buildings.find(x => x.id === modalArg); if (!b) return ['', ''];
      const t = BUILDINGS[b.type]; let h = `<div class="s">${t.desc}</div><div class="row"><div class="grow"><div class="t">Level ${b.level}</div>`;
      if (b.type === 'forge') h += `<div class="s">Weapons in stock: <b>${b.stock}/${stockCap(b)}</b> · Iron Ore: ${G.ore}</div><div class="bar"><i style="width:${b.progress * 100}%"></i></div>`;
      if (b.type === 'alchemy') h += `<div class="s">Potions in stock: <b>${b.stock}/${stockCap(b)}</b> · Herbs: ${G.herbs}</div><div class="bar"><i style="width:${b.progress * 100}%"></i></div>`;
      if (b.type === 'forge' || b.type === 'alchemy') { const g = b.grade || 1; h += `<div class="s" style="margin-top:6px">Crafting grade (switch when stock is empty):</div><div style="display:flex;gap:5px;margin:3px 0">` + [1, 2, 3].map(x => `<button class="act ${g === x ? '' : 'red'}" style="${g === x ? 'outline:2px solid #fff8' : ''}" data-act="grade" data-id="${b.id}" data-g="${x}" ${gradeUnlocked(b, x) ? '' : 'disabled'}>${GRADE[b.type][x]}<br><span style="font-weight:400;font-size:11px">${costText(gradeCost(b.type, x))}</span></button>`).join('') + '</div>'; }
      if (b.type === 'smelter') h += `<div class="s">Ingots: <b>${G.ingots}</b>/${20 + 10 * b.level + warehouseBonus()} · uses 2 ore each · ore: ${G.ore}</div><div class="bar"><i style="width:${b.progress * 100}%"></i></div>`;
      { const notes = adj(b).notes; if (notes.length) h += `<div class="s" style="color:#9bff9b;margin-top:4px">${notes.map(n => '✦ ' + n).join('<br>')}</div>`; }
      if (b.type === 'warehouse') h += `<div class="s">This warehouse adds <b>+${6 + 4 * (b.level - 1)}</b> stock to every Forge and Lab · total bonus +${warehouseBonus()}</div>`;
      if (b.type === 'tavern') h += `<div class="s">Meal price: ${mealGold(b).toFixed(1)}g · Passive: ${b.level * 0.25}g/s</div>`;
      const uc = 150 * b.level + 100;
      if (['forge', 'alchemy', 'tavern', 'warehouse', 'smelter'].includes(b.type)) h += `</div><button class="act" data-act="upBuilding" data-id="${b.id}" ${G.gold < uc || G.wood < 5 * b.level || b.level >= maxLevel() || !hasRare(upReq(b)) ? 'disabled' : ''}>${b.level >= maxLevel() ? (G.rank < 3 ? 'Raise guild rank' : 'Max level') : `Upgrade<br>${uc}g + ${5 * b.level}🪵 ${rareTags(upReq(b))}`}</button></div>`; else h += '</div></div>';
      if (b.type !== 'hall') h += `<button class="act red" data-act="moveB" data-id="${b.id}" style="margin:6px 0">🧭 Move building (free)</button>`;
      if (b.type === 'portal') h += `<div class="s">Deepest dive so far: floor <b>${G.diveBest}</b></div><button class="act" data-act="open" data-k="quests" style="margin:6px 0">Open the Endless Dive</button>`;
      if (b.type === 'hall') h += `<button class="act" data-act="open" data-k="quests" style="margin:6px 0">Open Quest Board</button>`;
      if (b.type === 'market') {
        h += `<div class="s" style="margin-top:6px">${G.market.news ? '📰 ' + G.market.news : 'Prices drift over time — buy low, sell high.'}</div><div class="sec">Trade (lots of 5)</div>`;
        h += Object.keys(BASE_PRICE).map(k => { const n = { ore: '⛏️ Iron Ore', herbs: '🌿 Herbs', wood: '🪵 Pine Wood' }[k]; return `<div class="row"><div class="grow"><div class="t">${n} ${trend(k)} <span class="tag">×${G.market[k].toFixed(2)}</span></div><div class="s">have ${G[k]} · buy ${buyPrice(k)}g · sell ${sellPrice(k)}g</div></div><button class="act" data-act="buy" data-k="${k}" ${G.gold < buyPrice(k) ? 'disabled' : ''}>Buy</button><button class="act red" data-act="sell" data-k="${k}" ${G[k] < 5 ? 'disabled' : ''}>Sell</button></div>`; }).join('');
        if (first('smelter') || G.ingots) h += `<div class="row"><div class="grow"><div class="t">🔩 Ingots</div><div class="s">have ${G.ingots} · sell 70g per 5</div></div><button class="act red" data-act="sell" data-k="ingots" ${G.ingots < 5 ? 'disabled' : ''}>Sell</button></div>`;
      }
      return [t.icon + ' ' + t.name, h];
    }
    case 'merchant': {
      if (!G.merchant) return ['', ''];
      return ['🛒 Wandering Merchant', `<div class="s">Rare wares, heavily discounted! Leaves in ${Math.ceil(G.merchant.t)}s.</div>` +
        [['ore', 20, 70, '⛏️ 20 Iron Ore'], ['herbs', 15, 45, '🌿 15 Herbs'], ['mana', 10, 60, '✨ 10 Mana'], ['arcane', 1, 90, '🐉 Dragon Scale (rare material)']].map(([k, n, p, l]) => `<div class="row"><div class="grow"><div class="t">${l}</div>${cost(p)}</div><button class="act" data-act="mbuy" data-k="${k}" data-n="${n}" data-p="${p}" ${G.gold < p ? 'disabled' : ''}>Buy</button></div>`).join('')];
    }
  }
  return ['', ''];
}
let modalPressing = false;   // never swap the window's contents while a press is in progress (it would swallow the tap)
modal.addEventListener('pointerdown', () => { modalPressing = true; }, true);
addEventListener('pointerup', () => { modalPressing = false; }, true); addEventListener('pointercancel', () => { modalPressing = false; }, true);
function renderModal(force) {
  if (!modalKind) return;
  if (modalPressing && !force) return;
  const [title, body] = modalContent();
  const html = title + '||' + body;
  if (!force && html === lastHtml) return;
  lastHtml = html; $('modalTitle').textContent = tr(title); $('modalBody').innerHTML = trHtml(body);
}

const ACT = {
  faction(d) { const F = FACTIONS[d.f]; if (!F || factionOf() || G.rank < 1 || G.gold < 2000) return toast('Not enough gold, wood, or guild rank.'); G.gold -= 2000; G.flags.faction = d.f; applyFactionLook(); sfx('goal'); toast(`${F.icon} The guild declares itself the ${F.name}! ${F.perk}`); },
  land() { const lc = [1500, 4000, 10000][G.land], lw = [60, 120, 200][G.land]; if (G.land >= 3 || G.rank < G.land + 1 || G.gold < lc || G.wood < lw) return toast('Not enough gold, wood, or guild rank.'); G.gold -= lc; G.wood -= lw; G.land++; applyLand(); occVersion++; sfx('build'); toast(`🌾 Territory expanded! Buildable land is now ${24 + 8 * G.land}×${24 + 8 * G.land}.`); },
  region(d) { const R = REGIONS[d.r]; if (R && R.unlock()) { G.region = d.r; toast(`🗺 Quests will now come from ${R.name}.`); } },
  cstyle(d) { if (!CHAR_STYLES[d.s] || d.s === charStyle) return; try { saveGame(); localStorage.setItem(STYLE_KEY, d.s); } catch (e) { /* ignore */ } location.reload(); },
  sfxtoggle() { setPref('sfx', !getPrefs().sfx); unlock(); sfx('chime'); },
  musictoggle() { setPref('music', !getPrefs().music); unlock(); },
  lang(d) { setLang(d.l); },
  relicpick(d) { const q = G.quests.find(x => x.dive && x.offer); if (q) { pickRelic(q, +d.i, false); closeModal(); } },
  relic() { openModal('relic'); },
  pick(d) { openModal('party', { qid: +d.q, sel: [], approach: 'standard', enchant: false, potion: false }); },
  psel(d) { const st = modalArg, q = G.quests.find(x => x.id === st.qid), id = +d.id; if (!q) return; if (st.sel.includes(id)) st.sel = st.sel.filter(x => x !== id); else if (st.sel.length >= q.maxH) toast(`At most ${q.maxH} heroes on this quest.`); else st.sel.push(id); },
  papp(d) { modalArg.approach = d.a; },
  pform(d) { modalArg.formation = d.a; },
  pench() { modalArg.enchant = !modalArg.enchant; },
  ppot() { modalArg.potion = !modalArg.potion; },
  pgo() { const st = modalArg, party = st.sel.map(id => G.heroes.find(x => x.id === id)).filter(Boolean); dispatch(st.qid, st.enchant, party, { approach: st.approach, potion: st.potion, formation: st.formation || 'line' }); if (!G.quests.find(x => x.id === st.qid && x.state === 'open')) openModal('quests'); },
  openStory() { openModal('story'); },
  storychoice(d) { chooseStory(+d.i); },
  dive() { dispatchDive(); },
  hero(d) { openModal('hero', +d.id); },
  save() { saveGame(false); renderModal(true); },
  tutorial() { tutorial.restart(); closeModal(); },
  newgame() { if (modalArg !== 'confirm') { modalArg = 'confirm'; return; } try { localStorage.removeItem(SAVE_KEY); } catch (e) { } window.__noSave = true; location.reload(); },
  watch(d) { startWatch(+d.q); },
  alarm() { musterHeroes(); },
  watchRaid() { const q = raidQuest(); if (q) startWatch(q.id); },
  openMerchant() { openModal('merchant'); },
  deliver(d) { deliverOrder(+d.id); },
  place(d) { startPlacement(d.k); closeModal(); },
  moveB(d) { const b = G.buildings.find(x => x.id === +d.id); if (b && b.type !== 'hall') { startPlacement(b.type, b); closeModal(); } },
  dispatch(d) { dispatch(+d.q, false); },
  sendall() { sendAll(0); },
  autoq() { G.flags.autoQ = G.flags.autoQ ? 0 : 1; toast(G.flags.autoQ ? '⏱ Auto-send on: parties leave when the odds are good.' : 'Auto-send off.'); },
  automin() { const o = [40, 50, 60, 70, 80, 90], i = o.indexOf(G.flags.autoMin || 60); G.flags.autoMin = o[(i + 1) % o.length]; },
  notiftoggle() { G.flags.notif = G.flags.notif ? 0 : 1; if (G.flags.notif && typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission(); if (G.flags.notif && typeof Notification === 'undefined') toast('This device does not support notifications.'); },
  dispatchE(d) { dispatch(+d.q, true); },
  flyer() { if (G.gold >= 60 && spawnHero()) { G.gold -= 60; toast('A new hero answers your flyer!'); } },
  hire(d) { const c = staffCost(d.k); if (G.gold >= c && G.staff[d.k] < maxStaff) { G.gold -= c; G.staff[d.k]++; } },
  fire(d) { if (G.staff[d.k] > 0) G.staff[d.k]--; },
  research(d) { const c = TECHS[d.k][2], req = TECHS[d.k][3]; if (G.gold >= c && !G.research[d.k] && hasRare(req)) { G.gold -= c; spendRare(req); G.research[d.k] = true; toast(`Researched ${TECHS[d.k][0]}!`); } },
  up(d) {
    const k = d.k, c = { outpost: 300 * (G.outpost + 1), boardLvl: 250 * (G.boardLvl + 1), walls: 200 * (G.walls + 1) }[k];
    if (G.gold >= c) { G.gold -= c; G[k]++; }
  },
  rankup() { rankUp(); },
  grade(d) { const b = G.buildings.find(x => x.id === +d.id), g = +d.g; if (!b || !gradeUnlocked(b, g)) return toast('Not unlocked yet.'); if (b.stock > 0 && (b.grade || 1) !== g) return toast('Use up the current stock before switching grade.'); b.grade = g; b.progress = 0; toast(`${BUILDINGS[b.type].name} now makes ${GRADE[b.type][g]} ${b.type === 'forge' ? 'weapons' : 'potions'}.`); },
  sell(d) { const k = d.k; if (k === 'ingots') { if (G.ingots >= 5) { G.ingots -= 5; G.gold += 5 * 14; } return; } if (G[k] >= 5) { G.gold += sellPrice(k); G[k] -= 5; } },
  promote(d) { const h = G.heroes.find(x => x.id === +d.id); if (!h || h.promo || G.rank < 1 || h.level < 5 || G.gold < 500) return; G.gold -= 500; h.promo = true; G.stats.promoted++; addPromoGear(h); floatText(h.pos, `${PROMO[h.cls].icon} ${PROMO[h.cls].name}!`, '#ffd24a'); toast(`${PROMO[h.cls].icon} ${h.name} is promoted to ${PROMO[h.cls].name}!`); },
  talent(d) { const h = G.heroes.find(x => x.id === +d.id); if (!h || (h.talents || []).length >= talentSlots(h)) return; const tier = TALENTS[h.cls][(h.talents || []).length]; if (!tier.some(t => t[0] === d.t)) return; (h.talents = h.talents || []).push(d.t); toast(`✨ ${h.name} learns ${talentDef(h.cls, d.t)[1]}!`); },
  upBuilding(d) { const b = G.buildings.find(x => x.id === +d.id), c = 150 * b.level + 100; if (b && b.level < maxLevel() && G.gold >= c && G.wood >= 5 * b.level && hasRare(upReq(b))) { G.gold -= c; G.wood -= 5 * b.level; spendRare(upReq(b)); b.level++; b.pop = 0.6; toast(`${BUILDINGS[b.type].name} upgraded to level ${b.level}!`); } },
  open(d) { openModal(d.k); },
  buy(d) { const p = buyPrice(d.k); if (G.gold >= p) { G.gold -= p; G[d.k] += 5; } },
  mbuy(d) {
    const p = +d.p, n = +d.n; if (G.gold < p) return; G.gold -= p;
    if (d.k === 'arcane') { G.rare.scale++; toast('🐉 You acquired a Dragon Scale!'); } else G[d.k] += n;
  },
};
addEventListener('pointerdown', unlock, true);
document.addEventListener('click', e => { if (e.target.closest('button, [data-act], [data-open]')) sfx('click');
  const t = e.target.closest('[data-act]'); if (t && ACT[t.dataset.act]) { ACT[t.dataset.act](t.dataset); renderModal(true); updateHUD(); return; }
  const o = e.target.closest('[data-open]'); if (o) { cancelPlacement(); openModal(o.dataset.open); }
});
$('settingsBtn').onclick = () => openModal('settings');
$('speedBtn').onclick = () => { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 4 : 1; $('speedBtn').textContent = '⏵ x' + G.speed; };

/* ------------------------------------------------------------------ *
 *  Placement & input (raycaster, grid snapping, pan/zoom)
 * ------------------------------------------------------------------ */
let grid = null, boundsLine = null;
function buildGrid() {
  const vis = grid ? grid.visible : false; if (grid) scene.remove(grid); if (boundsLine) scene.remove(boundsLine);
  const B = landBounds(), S = B.x1 - B.x0;
  grid = new THREE.GridHelper(S, S, 0xffffff, 0xffffff); grid.position.set((B.x0 + B.x1) / 2, 0.05, (B.z0 + B.z1) / 2); grid.material.transparent = true; grid.material.opacity = 0.18; grid.visible = vis; scene.add(grid);
  boundsLine = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]].map(([x, z]) => new THREE.Vector3(x, 0.08, z))), new THREE.LineBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.45 })); scene.add(boundsLine);
}
buildGrid();
let placing = null, ghost = null, ghostCell = [0, 0], ghostRot = 0, moving = null, moveVer = 0;   // moving: the building being relocated (free), hidden while its ghost is placed
function startPlacement(type, mv = null) {
  cancelPlacement(); placing = type; ghostRot = mv ? mv.rot : 0;
  if (mv) { moving = mv; for (let x = mv.cx; x < mv.cx + mv.w; x++) for (let z = mv.cz; z < mv.cz + mv.d; z++) occ.delete(key(x, z)); mv.group.visible = false; }
  const t = BUILDINGS[type];
  ghost = new THREE.Group(); const pivot = new THREE.Group(); ghost.add(pivot); ghost.userData.pivot = pivot;
  // translucent golden preview of the real model on a glowing tiled plot
  const preview = buildBuilding(type, 0); const lights = [];
  const gm = new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.42, depthWrite: false });
  preview.traverse(o => { if (o.isMesh) { o.material = gm; o.castShadow = false; o.receiveShadow = false; } if (o.isLight) lights.push(o); });
  lights.forEach(l => l.parent.remove(l));
  const tc = document.createElement('canvas'); tc.width = tc.height = 64; const cx2 = tc.getContext('2d');
  cx2.fillStyle = 'rgba(255,215,80,0.55)'; cx2.fillRect(0, 0, 64, 64); cx2.strokeStyle = 'rgba(255,250,200,0.95)'; cx2.lineWidth = 4; cx2.strokeRect(2, 2, 60, 60);
  const tex = new THREE.CanvasTexture(tc); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(t.w, t.d);
  const pm = new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff, transparent: true, depthWrite: false });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.d), pm);
  plane.rotation.x = -Math.PI / 2; plane.position.y = 0.08;
  // front marker (little arrow) so the facing direction is obvious while rotating
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 3), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }));
  arrow.rotation.x = Math.PI / 2; arrow.position.set(0, 0.12, t.d / 2 + 0.35);
  pivot.add(preview, plane, arrow); ghost.userData.mats = [gm, pm];
  scene.add(ghost); grid.visible = true;
  $('placeHint').classList.remove('hidden'); $('placeBar').classList.remove('hidden'); $('toolbar').classList.add('hidden'); document.body.classList.add('placing');
  $('placeCost').textContent = mv ? 0 : t.cost; $('placeName').textContent = (mv ? tr('Move') + ': ' + tr(t.name) : tr(t.name));
  const [w, d] = footprint(type, ghostRot);
  if (mv) moveGhost(mv.cx, mv.cz); else moveGhost(Math.floor(camTarget.x - w / 2 + 0.5), Math.floor(camTarget.z - d / 2 + 0.5));
}
function cancelPlacement() {
  if (moving) { const b = moving; moving = null; b.group.visible = true; for (let x = b.cx; x < b.cx + b.w; x++) for (let z = b.cz; z < b.cz + b.d; z++) occ.add(key(x, z)); }
  placing = null; if (ghost) { scene.remove(ghost); ghost = null; } grid.visible = false;
  $('placeHint').classList.add('hidden'); $('placeBar').classList.add('hidden'); $('toolbar').classList.remove('hidden'); document.body.classList.remove('placing');
}
function moveGhost(cx, cz) {
  const [w, d] = footprint(placing, ghostRot), t = BUILDINGS[placing];
  const B = landBounds(); cx = Math.max(B.x0, Math.min(B.x1 - w, cx)); cz = Math.max(B.z0, Math.min(B.z1 - d, cz));
  ghostCell = [cx, cz];
  ghost.position.set(cx + w / 2, 0, cz + d / 2);
  ghost.userData.pivot.rotation.y = ghostRot * Math.PI / 2;
  const ok = canPlace(placing, cx, cz, ghostRot) && (moving || G.gold >= t.cost);
  ghost.userData.mats.forEach((m, i) => m.color.setHex(i === 1 ? (ok ? 0xffffff : 0xff6060) : (ok ? 0xffd24a : 0xff4040)));
  ghost.userData.ok = ok; $('placeOk').disabled = !ok;
  const bonus = previewBonus(placing, cx, cz, ghostRot); $('placeHint').innerHTML = trHtml(bonus.length ? '✦ Here: ' + bonus.join(' · ') : 'Drag the golden plot (or tap the ground) to move it · rotate with ⟲ ⟳ · place buildings near partners for bonuses');
}
function rotateGhost(dir) {
  if (!placing) return;
  const [w0, d0] = footprint(placing, ghostRot), ccx = ghostCell[0] + w0 / 2, ccz = ghostCell[1] + d0 / 2;   // rotate about the footprint centre
  ghostRot = (ghostRot + dir + 4) % 4;
  const [w, d] = footprint(placing, ghostRot);
  moveGhost(Math.floor(ccx - w / 2 + 0.5), Math.floor(ccz - d / 2 + 0.5));
}
function confirmPlacement() {
  if (!placing) return;
  const t = BUILDINGS[placing];
  if (!ghost.userData.ok) return toast(G.gold < t.cost && !moving ? 'Not enough gold.' : 'Cannot build there.');
  if (moving) {       // relocate: same building, new spot and facing
    const b = moving, [w, d] = footprint(b.type, ghostRot), th = ghostRot * Math.PI / 2, [cx, cz] = ghostCell; moving = null;
    b.cx = cx; b.cz = cz; b.w = w; b.d = d; b.rot = ghostRot;
    b.group.position.set(cx + w / 2, 0, cz + d / 2); b.group.rotation.y = th; b.group.visible = true;
    b.door.set(cx + w / 2 + Math.sin(th) * (t.d / 2 + 0.7), 0, cz + d / 2 + Math.cos(th) * (t.d / 2 + 0.7));
    for (let x = cx; x < cx + w; x++) for (let z = cz; z < cz + d; z++) occ.add(key(x, z));
    occVersion++; moveVer++; sfx('build'); toast(`${t.name} moved.`); cancelPlacement(); saveGame(); return;
  }
  sfx('build'); G.gold -= t.cost; const b = addBuilding(placing, ghostCell[0], ghostCell[1], ghostRot);
  floatText(new THREE.Vector3(b.cx + b.w / 2, 1, b.cz + b.d / 2), `-${t.cost} Gold`, '#ff9a9a');
  toast(`${t.name} constructed!`); cancelPlacement();
}
$('placeL').onclick = () => rotateGhost(-1); $('placeR').onclick = () => rotateGhost(1);
$('placeOk').onclick = confirmPlacement; $('placeNo').onclick = cancelPlacement;
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(), plane0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(cx, cy) {
  ptr.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
  const p = new THREE.Vector3(); return ray.ray.intersectPlane(plane0, p) ? p : null;
}
// Touch/mouse scheme: ONE finger (or left mouse) = rotate (sideways) and tilt (up/down); TWO fingers (or right mouse / Shift) = pan, pinch = zoom.
// While placing a building, dragging the golden plot moves it; tapping the ground moves it there.
let drag = null;
const pts = new Map(); let two = null;
const cellFor = (x, z) => { const [w, d] = footprint(placing, ghostRot); return [Math.floor(x - w / 2 + 0.5), Math.floor(z - d / 2 + 0.5)]; };
canvas.addEventListener('pointerdown', e => {
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 1) {
    drag = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, btn: e.button, mode: (e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey) ? 'pan' : 'orbit' };
    if (placing && drag.mode === 'orbit') {
      const p = groundAt(e.clientX, e.clientY), [w, d] = footprint(placing, ghostRot);
      if (p && Math.abs(p.x - ghost.position.x) < w / 2 + 0.8 && Math.abs(p.z - ghost.position.z) < d / 2 + 0.8) { drag.mode = 'ghost'; drag.off = [p.x - ghost.position.x, p.z - ghost.position.z]; }
    }
  } else if (pts.size === 2) {
    const [a, b] = [...pts.values()]; two = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
    if (drag) { drag.moved = true; drag.mode = 'none'; }
  }
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
  if (pts.has(e.pointerId)) pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2 && two) {   // two fingers: pan with the midpoint, zoom with the pinch
    const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    viewS *= two.d / d; panBy(mx - two.mx, my - two.my); two = { d, mx, my }; return;
  }
  if (!drag || drag.mode === 'none') return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
  if (drag.moved) {
    const dx = e.clientX - drag.lx, dy = e.clientY - drag.ly;
    if (drag.mode === 'orbit') rotateBy(-dx * 0.008, dy * 0.005);
    else if (drag.mode === 'pan') panBy(dx, dy);
    else if (drag.mode === 'ghost') { const p = groundAt(e.clientX, e.clientY); if (p) { const [cx, cz] = cellFor(p.x - drag.off[0], p.z - drag.off[1]); moveGhost(cx, cz); } }
  }
  drag.lx = e.clientX; drag.ly = e.clientY;
});
const endPtr = e => { pts.delete(e.pointerId); if (pts.size < 2) two = null; };
canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('pointerup', e => {
  endPtr(e);
  const d = drag; if (pts.size === 0) drag = null; if (!d || d.moved || pts.size > 0) return;
  if (d.btn === 2) return cancelPlacement();
  if (d.btn === 1 || d.mode === 'pan') return;
  if (placing) { const p = groundAt(e.clientX, e.clientY); if (p) { const [cx, cz] = cellFor(p.x, p.z); moveGhost(cx, cz); } return; }
  if (watching) return;
  ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(bGroup.children, true)[0], hh = ray.intersectObjects(heroGroup.children.filter(m => m.visible), true)[0];
  if (hh && (!hit || hh.distance < hit.distance + 1.5)) { let o = hh.object; while (o && o.userData.hid === undefined) o = o.parent; if (o) return openModal('hero', o.userData.hid); }
  if (hit) { let o = hit.object; while (o && o.userData.bid === undefined) o = o.parent; if (o) openModal('building', o.userData.bid); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); if (e.shiftKey || e.ctrlKey) rotateBy(-e.deltaX * 0.004 - e.deltaY * 0.004, 0); else zoomBy(1 + Math.sign(e.deltaY) * 0.1); }, { passive: false });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (watching && !modalKind) return endWatch(); cancelPlacement(); closeModal(); return; }
  if (modalKind) return;
  if (placing) { const k = e.key.toLowerCase(); if (k === 'r') return rotateGhost(e.shiftKey ? -1 : 1); if (e.key === 'Enter') return confirmPlacement(); }
  const step = e.shiftKey ? 0.25 : 0.12;
  if (e.key === 'ArrowLeft') return rotateBy(step, 0);
  if (e.key === 'ArrowRight') return rotateBy(-step, 0);
  if (e.key === 'ArrowUp') return rotateBy(0, step * 0.6), e.preventDefault();
  if (e.key === 'ArrowDown') return rotateBy(0, -step * 0.6), e.preventDefault();
  if (e.key === '+' || e.key === '=') return zoomBy(0.88);
  if (e.key === '-' || e.key === '_') return zoomBy(1.14);
  if (e.key === 'Home' || e.key === '0') return resetView();
  const k = watching ? null : { b: 'build', q: 'quests', m: 'map', r: 'recruit', t: 'research', u: 'upgrades' }[e.key.toLowerCase()]; if (k) openModal(k);
});
// on-screen camera controls
{
  const hold = (id, fn) => {   // press-and-hold repeat
    const el = $(id); let t = null;
    const stop = () => { clearInterval(t); t = null; };
    el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); stop(); t = setInterval(fn, 60); el.setPointerCapture(e.pointerId); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, stop));
  };
  hold('camLeft', () => rotateBy(0.06, 0)); hold('camRight', () => rotateBy(-0.06, 0));
  hold('camUp', () => rotateBy(0, 0.04)); hold('camDown', () => rotateBy(0, -0.04));
  hold('camIn', () => zoomBy(0.96)); hold('camOut', () => zoomBy(1.05));
  $('camReset').onclick = resetView;
}

/* ------------------------------------------------------------------ *
 *  Staff characters (visible employees: dwarf smith, wizard alchemist, cook, bard, guards, porters)
 * ------------------------------------------------------------------ */
const staffMeshes = []; let staffSig = '';
function syncStaff() {
  const sig = JSON.stringify(G.staff) + G.buildings.length + ':' + moveVer;
  if (sig === staffSig) return; staffSig = sig;
  staffMeshes.forEach(s => scene.remove(s.mesh)); staffMeshes.length = 0;
  const spot = (type, dx, dz, fallback) => { const b = first(type) || fallback || G.buildings[0]; return [b.cx + b.w / 2 + dx, b.cz + b.d + dz]; };
  for (const [kind, n] of Object.entries(G.staff)) for (let i = 0; i < n; i++) {
    const mesh = buildStaff(kind); let x, z, patrol = false, work = false, rotY = 0;
    if (kind === 'smith') { const b = first('forge') || G.buildings[0]; [x, z] = [b.cx + b.w / 2 + 0.2 + i * 0.7, b.cz + b.d / 2 + 0.55 + (i % 2) * 0.1]; work = !!first('forge'); rotY = -0.4; }
    else if (kind === 'alch') { const b = first('alchemy') || G.buildings[0]; [x, z] = [b.cx + b.w / 2 - 0.1 + i * 0.7, b.cz + b.d / 2 + 0.2]; work = !!first('alchemy'); }
    else if (kind === 'cook') [x, z] = spot('tavern', -1.9 + i * 0.7, 0.2, null);
    else if (kind === 'bard') [x, z] = spot('tavern', 1.4 + i * 0.7, 0.8, null);
    else if (kind === 'porter') [x, z] = spot('market', -1.6 + i * 0.7, 1.0, null);
    else { patrol = true; x = HALL.cx + 2.5; z = HALL.cz + 2; }
    mesh.position.set(x, 0, z); mesh.rotation.y = rotY; scene.add(mesh);
    staffMeshes.push({ mesh, patrol, work, t: Math.random() * 6, a: i * 2.1 + Math.random(), cx: HALL.cx + 2.5, cz: HALL.cz + 2.5 });
  }
}

/* ------------------------------------------------------------------ *
 *  Save / load (localStorage autosave)
 * ------------------------------------------------------------------ */
const SAVE_KEY = 'fantasy-guild-master-save-v1';
const SCALARS = ['gold', 'renown', 'mana', 'ore', 'wood', 'herbs', 'time', 'speed', 'outpost', 'boardLvl', 'walls', 'questsDone', 'nextId', 'diveBest', 'rank', 'ingots', 'land'];
let lastSaved = 0;
function serialize() {
  const g = {}; SCALARS.forEach(k => { g[k] = G[k]; });
  Object.assign(g, { staff: G.staff, research: G.research, tm: G.tm, orders: G.orders, rare: G.rare, market: G.market, goalsDone: G.goalsDone, stats: G.stats, fallen: G.fallen, flags: G.flags, region: G.region, regions: G.regions });
  return {
    v: 1, savedAt: Date.now(), g,
    buildings: G.buildings.map(b => ({ type: b.type, cx: b.cx, cz: b.cz, rot: b.rot || 0, level: b.level, stock: b.stock, progress: b.progress })),
    heroes: G.heroes.map(h => ({ id: h.id, cls: h.cls, variant: h.variant, name: h.name, level: h.level, xp: h.xp, stamina: h.stamina, happy: h.happy, gear: h.gear, gearTier: h.gearTier || 1, promo: h.promo, talents: h.talents, bonds: h.bonds, quests: h.quests, vip: h.vip, x: h.pos.x, z: h.pos.z, onQuest: h.state === 'quest' })),
    quests: G.quests.map(q => { const o = {}; for (const [k, v] of Object.entries(q)) if (k !== 'heroes' && k !== 'script') o[k] = v; o.heroIds = (q.heroes || []).map(h => h.id); return o; }),
    extra: serializeExtra(),
  };
}
function serializeExtra() { return {}; }
function applyExtra(x) { }
function saveGame(quiet = true) {
  if (window.__noSave) return false;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(serialize())); lastSaved = Date.now(); if (!quiet) toast('💾 Game saved.'); return true; }
  catch (e) { if (!quiet) toast('Could not save (storage unavailable).'); return false; }
}
function loadGame() {
  let d; try { d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { d = null; }
  if (!d || d.v !== 1) return false;
  try {
    SCALARS.forEach(k => { if (d.g[k] !== undefined) G[k] = d.g[k]; });
    Object.assign(G.rare, d.g.rare || {}); Object.assign(G.market, d.g.market || {}); G.goalsDone = d.g.goalsDone || {}; Object.assign(G.stats, d.g.stats || {}); G.fallen = d.g.fallen || []; G.flags = d.g.flags || {}; G.region = d.g.region || 'greenwood'; G.regions = d.g.regions || {}; applyLand(); applyFactionLook(); Object.assign(G.staff, d.g.staff); G.research = d.g.research || {}; Object.assign(G.tm, d.g.tm);
    G.orders = d.g.orders || (d.g.royal ? [{ id: G.nextId++, kind: 'royal', need: { sword: d.g.royal.need }, t: d.g.royal.t, tMax: 150, reward: d.g.royal.reward, ren: d.g.royal.ren, pen: 3, title: 'Royal Demand', icon: '👑' }] : []);
    if (G.orders.some(o => o.kind === 'caravan')) spawnCaravan();
    const nextId = G.nextId;
    d.buildings.forEach(sb => {
      if (sb.type === 'hall') { G.buildings[0].level = sb.level; return; }
      const b = addBuilding(sb.type, sb.cx, sb.cz, sb.rot || 0); b.level = sb.level; b.stock = sb.stock; b.progress = sb.progress; b.pop = 1; b.group.scale.setScalar(1);
    });
    G.nextId = Math.max(G.nextId, nextId);
    d.heroes.forEach(sh => { const h = createHero(sh); if (sh.onQuest) { h.state = 'quest'; h.mesh.visible = false; } });
    const away = Math.max(0, Math.min(600, (Date.now() - d.savedAt) / 1000));
    d.quests.forEach(sq => {
      const q = { ...sq }; q.heroes = (sq.heroIds || []).map(id => G.heroes.find(h => h.id === id)).filter(Boolean); delete q.heroIds;
      if (q.state === 'active') {
        if (!q.heroes.length) return;
        q.heroes.forEach(h => { h.state = 'quest'; h.mesh.visible = false; });
        if (q.dive) { q.script = newDiveScript(q); ensureFloors(q, q.elapsed || 0); q.t = q.dur - (q.elapsed || 0); }   // dives only advance while the game is open
        else { q.t = Math.max(0.3, q.t - away); q.script = genScript(q); }
      }
      G.quests.push(q);
    });
    applyExtra(d.extra || {});
    if (G.flags.pending) showStoryBanner();
    G.alarm = false; $('speedBtn').textContent = '⏵ x' + G.speed;
    toast(away > 20 ? `💾 Welcome back! Away for ${Math.round(away / 60)} min — quests kept going.` : '💾 Save loaded.');
    return true;
  } catch (e) { console.error('load failed', e); return false; }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
addEventListener('pagehide', () => saveGame());

/* ------------------------------------------------------------------ *
 *  Expedition watch mode: fly to the stage, follow the party, intervene
 * ------------------------------------------------------------------ */
const sm = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const stageEl = $('stageEl'), pipCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 500);
let watchSaved = null;
function flyTo(to, dur = 1.1) { viewFly = { t: 0, dur, from: { yaw, pitch, viewS, x: camTarget.x, z: camTarget.z }, to }; }
const canIntervene = q => q.state === 'active' && (q.dive ? !q.script.wiped : (q.dur - q.t) < q.script.win[2].s) && !(watching && watching.finish);
const nowT = w => w.finish ? w.finish.T : Math.max(0, w.q.dur - w.q.t);
function logReset(w, T) { const ev = w.q.script.events; w.logIdx = ev.findIndex(e => e.t > T - 2.5); if (w.logIdx < 0) w.logIdx = ev.length; w.lastScript = w.q.script; }
function addLog(e) {
  const el = document.createElement('div'); el.className = 'lg l-' + e.type; el.textContent = tr(e.log + (e.dmg ? e.dmg : ''));
  const box = $('watchLog'); box.appendChild(el); while (box.children.length > 7) box.firstChild.remove();
}
function startWatch(qid) {
  G.flags.tutWatched = 1; setMusicMood('battle');
  const q = G.quests.find(x => x.id === qid && x.state === 'active'); if (!q || !q.script) return;
  closeModal(); cancelPlacement();
  if (watching) { watching.exp.dispose(); } else watchSaved = { yaw, pitch, viewS, x: camTarget.x, z: camTarget.z };
  const exp = new Expedition({ scene, q, lowfx: LOWFX, labelEl: stageEl, project: v => toScreen(v) });
  const th = exp.theme, T = Math.max(0, q.dur - q.t);
  scene.background.setHex(th.bg); sun.position.set(STAGE_X + 18, 30, 8); sun.target.position.set(STAGE_X, 0, 0); sun.intensity = th.sun; ambient.intensity = th.amb;
  exp.update(T, 0);
  const f = exp.focus(T);
  watching = { q, exp, follow: true, finish: null, exiting: false, pip: watching ? watching.pip : !LOWFX, recallArm: 0, hudT: 0, logIdx: 0 };
  logReset(watching, T); $('watchLog').innerHTML = '';
  worldEl.style.display = 'none'; stageEl.style.display = 'block'; document.body.classList.add('watching');
  flyTo({ yaw: 0.28, pitch: 0.62, viewS: 6.8, x: f.x, z: f.z }, 1.2);
  updateWatchHUD();
}
function endWatch() {
  const w = watching; if (!w || w.exiting) return;
  setMusicMood('base'); w.exiting = true; stageEl.style.display = 'none'; worldEl.style.display = ''; document.body.classList.remove('watching');
  flyTo({ yaw: watchSaved.yaw, pitch: watchSaved.pitch, viewS: watchSaved.viewS, x: watchSaved.x, z: watchSaved.z }, 1.0);
}
function cleanupWatch() {
  if (!watching) return; watching.exp.dispose(); watching = null; camShake = 0;
  scene.background.setHex(0x2f7a32); sun.position.set(N / 2 + 18, 30, N / 2 + 8); sun.target.position.set(N / 2, 0, N / 2); sun.intensity = 1.05; ambient.intensity = 0.75;
  updateCamera();
}
function onQuestEnd(q, ok) {
  if (!watching || watching.q !== q || watching.exiting) return;
  watching.finish = { ok, t: 4.5, T: q.dive ? q.elapsed : q.dur, text: q.endText || (ok ? `🏆 Victory! +${questPay(q)}g · +${q.renown}⭐` : '☠ Defeat — the party limps home') };
  updateWatchHUD();
}
// --- in-fight actions (only before the finale begins)
function boostQuest(q, amt) {
  const c0 = q.chance; q.chance = Math.min(0.97, c0 + amt);
  if (!q.ok && Math.random() < (q.chance - c0) / (1 - c0)) { q.ok = true; q.deaths = []; q.script = genScript(q); }
}
// Hero skills during a watched fight: one per class, once per expedition (a dive: once per 5 floors). They give a small boost to the odds
// (a dive: a ward or a heal) and play a showy effect on the stage.
const SKILLS = { knight: { icon: '🛡', name: 'Shield Wall', kind: 'wall', boost: 0.06 }, ranger: { icon: '🏹', name: 'Volley', kind: 'volley', boost: 0.05 }, wizard: { icon: '🔥', name: 'Nova', kind: 'nova', boost: 0.05 } };
function skillReady(q, cls) {
  const sk = SKILLS[cls], used = (q.skillsUsed || {})[cls], T = nowT(watching), S = q.script; if (!sk || !canIntervene(q)) return false;
  const h = q.party.findIndex((p, i) => p.cls === cls && !(S.heroes[i].dies && T >= S.heroes[i].D)); if (h < 0) return false;
  return q.dive ? (used === undefined || diveFloorIndex(S, T) >= used + 5) : used === undefined;
}
function watchSkill(cls) {
  const w = watching, q = w?.q, sk = SKILLS[cls]; if (!q || !sk) return;
  if (!skillReady(q, cls)) return toast('That skill is not ready.');
  const T = nowT(w), S = q.script, h = q.party.findIndex((p, i) => p.cls === cls && !(S.heroes[i].dies && T >= S.heroes[i].D));
  (q.casts ||= []).push({ t: T, kind: sk.kind, h });
  (q.skillsUsed ||= {})[cls] = q.dive ? diveFloorIndex(S, T) : 1;
  if (q.dive) {
    const next = diveFloorIndex(S, T) + 1;
    if (sk.kind === 'wall' && !(q.enchants || []).some(x => x.floor + 3 > next)) q.enchants.push({ floor: next, t: T }); else q.heals.push({ t: T, amt: 0.15 });
    rebuildDive(q, T); toast(`${sk.icon} ${sk.name}!`);
  } else { boostQuest(q, sk.boost); toast(`${sk.icon} ${sk.name}! Success chance now ${Math.round(q.chance * 100)}%`); }
  sfx('chime'); updateWatchHUD();
}
function watchEnchant() {
  const q = watching?.q; if (!q) return;
  if (!canIntervene(q)) return toast(q.dive ? 'The party has already fallen.' : 'Too late — the finale has begun!');
  if (G.mana < 5) return toast('Not enough Mana.');
  if (q.dive) {
    const T = q.elapsed, next = diveFloorIndex(q.script, T) + 1;
    if ((q.enchants || []).some(x => x.floor + 3 > next)) return toast('A ward is already protecting the party.');
    G.mana -= 5; q.enchants.push({ floor: next, t: T }); rebuildDive(q, T);
    return toast('✨ Ward cast: damage −40% for the next 3 floors.'), updateWatchHUD();
  }
  if (q.enchant || q.enchantedMid) return toast('This party is already enchanted.');
  G.mana -= 5; q.enchantedMid = true; boostQuest(q, G.research.arcane ? 0.3 : 0.2);
  toast(`✨ Enchanted! Success chance now ${Math.round(q.chance * 100)}%`); updateWatchHUD();
}
function watchPotion() {
  const q = watching?.q; if (!q) return; const lab = ofType('alchemy').find(b => b.stock > 0);
  if (!canIntervene(q)) return toast(q.dive ? 'The party has already fallen.' : 'Too late — the finale has begun!');
  if (!lab) return toast('No potions in stock. Brew more at the Alchemical Lab.');
  lab.stock--;
  if (q.dive) { q.heals.push({ t: q.elapsed, amt: (G.research.feather ? 0.5 : 0.35) * relicMods(q, diveFloorIndex(q.script, q.elapsed)).heal }); rebuildDive(q, q.elapsed); toast('🧪 Healing potions delivered to the party!'); }
  else { q.heals.push({ t: q.dur - q.t, amt: G.research.feather ? 0.5 : 0.35 }); boostQuest(q, 0.08); toast(`🧪 Healing potions delivered! Success chance now ${Math.round(q.chance * 100)}%`); }
  updateWatchHUD();
}
function watchRecall() {
  const w = watching, q = w?.q; if (!q || w.finish) return;
  if (w.recallArm <= 0) { w.recallArm = 3; return updateWatchHUD(); }
  if (q.defense) { w.recallArm = 0; return toast('You cannot flee — defend the guild!'); }
  if (q.dive) return resolveDive(q, 'recalled');
  const i = G.quests.indexOf(q); if (i >= 0) G.quests.splice(i, 1); q.state = 'done';
  q.heroes.forEach(h => { if (!G.heroes.includes(h)) return; h.state = 'idle'; h.cool = 0; h.target = null; h.stamina = Math.max(20, h.stamina - 10); h.happy = Math.max(0, h.happy - 8); h.pos.set(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1)); h.mesh.visible = true; });
  toast('🏳 Party recalled — no rewards.'); endWatch();
}
function updateWatchHUD() {
  const w = watching; if (!w) return; const q = w.q, S = q.script, T = nowT(w), dv = !!q.dive;
  $('wRelic').classList.toggle('hidden', !(dv && q.offer)); $('wName').textContent = tr(dv ? `Endless Dungeon — floor ${diveFloorIndex(S, T) + 1} · best ${G.diveBest} ${(q.relics || []).map(r => RELICS[r.id].icon).join('')}` : `${w.exp.name} — ${q.name}`);
  $('wPhase').textContent = tr(w.finish ? w.finish.text : phaseText(S, T));
  $('wProg').style.width = (dv ? (diveFloor({ script: S, elapsed: T }) ? Math.min(100, (T - diveFloor({ script: S, elapsed: T }).s) / (diveFloor({ script: S, elapsed: T }).e - diveFloor({ script: S, elapsed: T }).s) * 100) : 0) : T / q.dur * 100) + '%';
  $('watchBar').classList.toggle('dive', dv);
  $('wParty').innerHTML = trHtml(q.party.map((p, h) => { const hp = heroHp(q, S, h, T), dead = S.heroes[h].dies && T >= S.heroes[h].D; return `<div class="chip ${dead ? 'dead' : ''}"><span>${dead ? '☠' : CLASSES[p.cls].icon} ${p.name}</span><b><i style="width:${hp * 100}%;background:${hp > 0.5 ? '#5be35b' : hp > 0.25 ? '#f0c040' : '#e0503a'}"></i></b></div>`; }).join(''));
  const ci = canIntervene(q), lab = first('alchemy');
  $('wSkills').innerHTML = trHtml(q.party.map(p => p.cls).filter((c, i, a) => a.indexOf(c) === i && SKILLS[c]).map(c => `<button class="act ${skillReady(q, c) ? '' : 'off'}" data-skill="${c}" ${skillReady(q, c) ? '' : 'disabled'}>${SKILLS[c].icon} ${SKILLS[c].name}</button>`).join(''));
  $('wRecall').classList.toggle('hidden', !!q.defense);
  const potions = ofType('alchemy').reduce((n, b) => n + b.stock, 0), nextF = dv ? diveFloorIndex(S, T) + 1 : 0, warded = dv && (q.enchants || []).some(x => x.floor + 3 > nextF);
  $('wEnchant').disabled = !ci || G.mana < 5 || (dv ? warded : !!(q.enchant || q.enchantedMid)); $('wEnchant').textContent = tr(dv ? (warded ? '✨ Ward active' : '✨ Ward (5)') : `✨ Enchant (5) · ${Math.round(q.chance * 100)}%`);
  $('wPotion').disabled = !ci || potions < 1; $('wPotion').textContent = tr(`🧪 Potion (${potions})`);
  $('wRecall').disabled = !!w.finish; $('wRecall').textContent = tr(w.recallArm > 0 ? (dv ? '🏁 Confirm: bank & leave?' : '🏳 Confirm recall?') : (dv ? '🏁 Bank & leave' : '🏳 Recall'));
  $('wFollow').classList.toggle('on', w.follow); $('wFollow').textContent = tr(w.follow ? '🎯 Following' : '🎯 Follow');
  $('wPipBtn').classList.toggle('on', w.pip); $('pipFrame').classList.toggle('off', !w.pip);
  $('wSpeed').textContent = '⏵ x' + G.speed;
  $('wSwitch').innerHTML = trHtml(G.quests.filter(x => x.state === 'active' && x !== q).map(x => `<button class="act" data-act="watch" data-q="${x.id}">👁 ${x.name}</button>`).join(''));
  $('wHint').textContent = tr(dv ? (w.finish ? '' : (S.wiped ? 'The party has fallen…' : `At risk: ${rewardText(q.pending)} · next checkpoint: floor ${Math.ceil((q.cleared + 1) / 5) * 5}`)) : (ci ? 'Intervene before the finale!' : (w.finish ? '' : 'The finale has begun — no more help possible')));
}
$('wBack').onclick = endWatch; $('pipFrame').onclick = endWatch;
$('wFollow').onclick = () => { if (watching) { watching.follow = !watching.follow; updateWatchHUD(); } };
$('wPipBtn').onclick = () => { if (watching) { watching.pip = !watching.pip; updateWatchHUD(); } };
$('wSpeed').onclick = () => $('speedBtn').click();
$('wRelic').onclick = () => openModal('relic'); $('wEnchant').onclick = watchEnchant; $('wPotion').onclick = watchPotion; $('wRecall').onclick = watchRecall; $('wSkills').onclick = e => { const b = e.target.closest('[data-skill]'); if (b && !b.disabled) watchSkill(b.dataset.skill); }; $('readyPill').onclick = () => openModal('quests');
function renderPip() {
  const w = watching; if (!w || w.exiting || !w.pip || !watchSaved) return;
  const r = $('pipFrame').getBoundingClientRect(); if (r.width < 10) return;
  const a = r.width / r.height, h = 9, dir = new THREE.Vector3(Math.sin(watchSaved.yaw) * Math.cos(watchSaved.pitch), Math.sin(watchSaved.pitch), Math.cos(watchSaved.yaw) * Math.cos(watchSaved.pitch));
  pipCam.left = -h * a; pipCam.right = h * a; pipCam.top = h; pipCam.bottom = -h; pipCam.position.set(watchSaved.x, 0, watchSaved.z).addScaledVector(dir, 80); pipCam.lookAt(watchSaved.x, 0, watchSaved.z); pipCam.updateProjectionMatrix();
  const vy = innerHeight - r.bottom;
  renderer.setScissorTest(true); renderer.setViewport(r.left, vy, r.width, r.height); renderer.setScissor(r.left, vy, r.width, r.height);
  renderer.render(scene, pipCam); renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
}

/* ------------------------------------------------------------------ *
 *  Main loop
 * ------------------------------------------------------------------ */
const clock = new THREE.Clock(); let modalTick = 0, hudTick = 0, saveTick = 15;
function frame() {
  requestAnimationFrame(frame);
  const rdt = Math.min(clock.getDelta(), 0.5), dt = rdt * G.speed;   // wall-clock timing: slow frames no longer slow the game
  updateEconomy(dt);
  G.heroes.slice().forEach(h => updateHero(h, dt));
  updateGoblins(dt);
  if (charStyle !== 'classic') { heroGroup.children.forEach(m => autoAnim(m, rdt)); staffMeshes.forEach(x => autoAnim(x.mesh, rdt)); G.goblins.forEach(x => autoAnim(x.mesh, rdt)); }
  // animation: building pop-in, light flicker
  for (const b of G.buildings) {
    if (b.pop < 1) { b.pop = Math.min(1, b.pop + rdt * 3); const s = b.pop; b.group.scale.setScalar(Math.max(0.01, 1 - Math.pow(1 - s, 2) + Math.sin(s * Math.PI) * 0.1)); }
    const f = b.group.userData.flicker; if (f) f.intensity = 1.4 + Math.sin(performance.now() / 90) * 0.25 + Math.random() * 0.2;
  }
  if (hallDecor && hallDecor.userData.spin) hallDecor.userData.spin.forEach((c, i) => { c.rotation.y += rdt * 1.5; c.position.y += Math.sin(performance.now() / 500 + i) * 0.004; });
  if (cart) cart.position.y = Math.sin(performance.now() / 300) * 0.02;
  const now = performance.now() / 1000;
  for (const b of G.buildings) {
    const sw = b.group.userData.swirl;
    if (sw) sw.children.forEach(c => { if (c.userData.arm !== undefined) c.rotation.z = now * (1 + c.userData.arm * 0.4) + c.userData.arm * 1.3; });
    const fl = b.group.userData.flames; if (fl) fl.forEach((f, i) => f.scale.set(1, 0.85 + Math.sin(now * 12 + i) * 0.2, 1));
  }
  if (window.__decor) window.__decor.traverse(o => { const f = o.userData?.flicker; if (f) f.intensity = 1.0 + Math.sin(now * 10 + o.id) * 0.2 + Math.random() * 0.15; const fl = o.userData?.flames; if (fl) fl.forEach((m, i) => m.scale.set(1, 0.85 + Math.sin(now * 12 + i) * 0.2, 1)); });
  // staff characters idle near their workplace
  syncStaff();
  for (const s of staffMeshes) {
    s.t += rdt * 3; const L = s.mesh.userData.legs, A = s.mesh.userData.arms;
    if (s.patrol) { s.a += rdt * 0.25; s.mesh.position.set(s.cx + Math.cos(s.a) * 4.6, 0, s.cz + Math.sin(s.a) * 3.4); s.mesh.rotation.y = Math.atan2(-Math.sin(s.a), Math.cos(s.a)) + Math.PI / 2 + Math.PI; const sw = Math.sin(s.t * 3) * 0.5; L[0].rotation.x = sw; L[1].rotation.x = -sw; }
    else { s.mesh.position.y = Math.abs(Math.sin(s.t)) * 0.01; if (s.work) { A[1].rotation.x = -0.9 + Math.sin(s.t * 2.2) * 0.7; } }
  }
  // overlay: floating text, mood bubbles, progress bars
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += rdt; const [x, y] = toScreen(f.pos, 1.6);
    f.el.style.transform = `translate(${x}px,${y - f.t * 34}px) translate(-50%,-50%)`; f.el.style.opacity = Math.max(0, 1 - f.t / 1.8);
    if (f.t > 1.8) { f.el.remove(); floaters.splice(i, 1); }
  }
  for (const h of G.heroes) {
    if (h.bub.classList.contains('hidden') || h.state === 'quest') { if (h.state === 'quest') h.bub.classList.add('hidden'); continue; }
    const [x, y] = toScreen(h.pos, 1.55); h.bub.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
  }
  for (const b of G.buildings) {
    if (!b.bar) continue;
    const [x, y] = toScreen(b.group.position, b.type === 'forge' ? 3.2 : 2.6);
    b.bar.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; b.bar.firstChild.style.width = (b.crafting ? b.progress * 100 : 0) + '%';
    b.tag.style.transform = `translate(${x}px,${y + 14}px) translate(-50%,-50%)`; b.tag.textContent = (b.type === 'forge' ? '🗡️ ' : '🧪 ') + b.stock + '/' + stockCap(b);
  }
  // expedition watch mode: fly camera, live stage, log, HUD
  if (viewFly) {
    viewFly.t += rdt; const f = sm(viewFly.t / viewFly.dur), a = viewFly.from, b = viewFly.to;
    yaw = a.yaw + (b.yaw - a.yaw) * f; pitch = a.pitch + (b.pitch - a.pitch) * f; viewS = Math.exp(Math.log(a.viewS) + (Math.log(b.viewS) - Math.log(a.viewS)) * f);
    camTarget.x = a.x + (b.x - a.x) * f; camTarget.z = a.z + (b.z - a.z) * f; updateCamera();
    if (viewFly.t >= viewFly.dur) viewFly = null;
  }
  if (watching) {
    const w = watching, q = w.q;
    if (w.exiting) { if (!viewFly) cleanupWatch(); }
    else {
      if (w.finish) w.finish.t -= rdt;
      if (w.recallArm > 0) { w.recallArm -= rdt; if (w.recallArm <= 0) updateWatchHUD(); }
      const T = nowT(w);
      w.exp.update(T, rdt);
      { const sh = w.exp.shake || 0; if (sh > 0 || camShake > 0) { camShake = sh; updateCamera(); } }
      if (w.lastScript !== q.script) logReset(w, T);
      const ev = q.script.events; while (ev[w.logIdx] && ev[w.logIdx].t <= T) addLog(ev[w.logIdx++]);
      if (w.follow && !viewFly) { const f = w.exp.focus(T), k = 1 - Math.exp(-4 * rdt); camTarget.x += (f.x - camTarget.x) * k; camTarget.z += (f.z - camTarget.z) * k; updateCamera(); }
      w.hudT -= rdt; if (w.hudT <= 0) { w.hudT = 0.1; updateWatchHUD(); }
      if (w.finish && w.finish.t <= 0) endWatch();
    }
  }
  saveTick -= rdt; if (saveTick <= 0) { saveTick = 15; saveGame(); }
  hudTick -= rdt; if (hudTick <= 0) { hudTick = 0.15; updateHUD(); }
  modalTick -= rdt; if (modalTick <= 0) { modalTick = 0.4; renderModal(false); }
  renderer.render(scene, camera);
  renderPip();
}

/* ------------------------------------------------------------------ *
 *  Boot: starter heroes + quests
 * ------------------------------------------------------------------ */
initLang();
resize();
const loaded = loadGame();
if (!loaded) {
  spawnHero('knight', true); spawnHero('ranger', true);
  genQuest(); genQuest();
  toast('Welcome, Guild Master! Build a Tavern and a Forge to attract & equip heroes.');
}
tutorial.init();
frame();
window.__heroHp = heroHp; window.__rebuild = rebuildDive;
window.__sim = { updateEconomy, updateHero, updateGoblins, resolveDive, rankUp, staffCost, STAFF, TECHS, hasRare, spendRare, upReq, readyHeroes, bestParty, deliverOrder, musterHeroes, chooseStory, STORIES };
window.__api = { openModal, startPlacement, confirmPlacement, moveGhost, FACTIONS, applyFactionLook, REGIONS, regionLevel, landBounds, applyLand, audioState, tutorial, gainXp, talentSlots, heroLabel, raidQuest, genScript, relicMods, makeQuest, STORIES, chooseStory, checkStories, modPenalty, chanceFor, maxLevel, previewBonus, adj, gradeUnlocked, heroPower, tickMarket, checkGoals, closeModal, dispatchDive, diveTick, resolveDive, toScreen, findPath, blocked, saveGame, loadGame, serialize, startWatch, endWatch, watchEnchant, watchPotion, watchRecall, addBuilding, canPlace, spawnHero, openModal, ACT, startRaid, startMerchant, addOrder, deliverOrder, genQuest, dispatch, readyHeroes };
