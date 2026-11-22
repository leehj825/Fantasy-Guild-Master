import * as THREE from '../vendor/three.module.js';
import { mergeStatic, buildChar, factionDecor, BUILDINGS, buildBuilding, buildHero, buildStaff, buildGoblin, buildMerchantCart, vox, mat, PROPS, setCharMaker } from './models.js';
import { makeRigChar, makeRigGolem, makeRigOgre, autoAnim } from './rigchar.js';
import { createTutorial } from './tutorial.js';
import { Ads } from './ads.js';
import { IAP, PRODUCTS } from './iap.js';
import { TAGS, makeProfile, tagMods, SEASON_NAMES, RESIDENTS, residentHome, ARCS, pickArc } from './people.js';
import { sfx, unlock, setPref, getPrefs, setMusicMood, audioState } from './audio.js';
import { tr, trHtml, initLang, setLang, getLang, onLangChange, translateStatic, LANGS } from './i18n.js';
import { Expedition, REGION_BOSS, BOSS, questEnd, setBigMakers, genScript, STAGE_X, heroHp, phaseText, newDiveScript, ensureFloors, rebuildDive, diveFloorIndex, diveCheckpoint, rewardText, RELICS, relicMods, relicOffer } from './expedition.js';

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
const frustum = new THREE.Frustum(), frustumM = new THREE.Matrix4();
const PIXEL_MAX = LOWFX ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2), GFX_KEY = 'fantasy-guild-master-gfx';
let gfx = 'auto'; try { const v = localStorage.getItem(GFX_KEY); if (['auto', 'high', 'low'].includes(v)) gfx = v; } catch (e) { /* default */ }
let quality = gfx === 'low' ? 0.6 : 1, perfEma = 0.0167, adaptT = 0, frameN = 0;
renderer.setPixelRatio(PIXEL_MAX * quality);
renderer.shadowMap.autoUpdate = false;   // the shadow map is redrawn every other frame (see frame())
// Point lights are expensive for every lit pixel: phones get none, desktops at most LIGHT_BUDGET in the whole town (the first buildings keep theirs).
const LIGHT_BUDGET = 8; let lightsKept = 0;
const stripLights = o => { const ls = []; o.traverse(c => { if (c.isPointLight) ls.push(c); }); for (const l of ls) { if (LOWFX || lightsKept >= LIGHT_BUDGET) l.parent.remove(l); else lightsKept++; } };

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2f7a32);

// Character style: 'classic' (old box figures), 'voxel' or 'round' (rigged bodies that play motion clips). Changing it reloads the page.
const STYLE_KEY = 'fantasy-guild-master-charstyle', CHAR_STYLES = { voxel: 'Rigged · blocky', round: 'Rigged · rounded', classic: 'Classic' };
let charStyle = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3 ? 'classic' : 'voxel';   // weak devices start on the lightest bodies
try { const v = localStorage.getItem(STYLE_KEY); if (CHAR_STYLES[v]) charStyle = v; } catch (e) { /* default */ }
if (charStyle !== 'classic') { setCharMaker(look => makeRigChar(look, charStyle)); setBigMakers({ golem: () => makeRigGolem(), ogre: () => makeRigOgre(),
    frostgiant: () => makeRigOgre({ skin: 0xb8d8f0, dark: 0x8fb4d6, cloth: 0x4a6a8a, belt: 0x2a3a5a, clubHead: 0xcfe8ff, spike: 0xeaf6ff, eye: 0x7affff, tusk: 0xffffff, scale: 1.85 }),
    duneking: () => makeRigOgre({ skin: 0xd8b06a, dark: 0xb58a42, cloth: 0x7a2a1a, belt: 0x5a3a1a, clubHead: 0xe8c04a, spike: 0xffe27a, eye: 0xff6a3a, scale: 1.7 }),
    lich: () => { const g = makeRigChar({ skin: 0xe8e4d0, shirt: 0x3a1a5a, sleeve: 0x3a1a5a, skirt: 0x3a1a5a, pants: 0x2a1048, hat: 'wizard', hatColor: 0x2a1048, hatBand: 0x7aff7a, beard: 0xcfd8c0, beardLen: 0.3, staff: 0x7aff7a, belt: 0x7aff7a }, charStyle === 'round' ? 'round' : 'voxel'); g.scale.multiplyScalar(2.1); g.userData.clips = { attack: 'mgBolt', attacks: ['mgBolt', 'mgFire', 'mgNova', 'mgHoly'], walk: 'walkCalm', walkSpeed: 0.8, run: 'runCalm', runSpeed: 0.9 }; return g; } }); }

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
function resize() { renderer.setPixelRatio(PIXEL_MAX * quality); renderer.setSize(innerWidth, innerHeight, false); updateCamera(); }
addEventListener('resize', resize);

let groundMesh = null;
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
  scene.add(ground); groundMesh = ground;
}
// Dirt paths + stone plaza around the hall
const HALL = { cx: 12, cz: 11 };
{
  const dirt = 0xb58a56, stone = 0x9c9ca2;
  const strip = (x, z, w, d, m, y = 0.02) => { const s = vox(w, 0.04, d, m, x, y - 0.0, z); s.castShadow = false; scene.add(s); };
  strip(HALL.cx + 2.5, HALL.cz + 2, 7, 7, stone, 0.01);
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

// Each expansion reveals landmarks in the new ring of land (always the same ones: they come from a seeded layout). Cells they use are blocked.
const landmarkGroup = new THREE.Group(); scene.add(landmarkGroup); let landmarksBuilt = 0;
const LANDMARKS = [
  null,
  [['pond', 3, 2], ['rocks', 1, 1], ['rocks', 1, 1], ['rocks', 1, 1], ['oak', 2, 2]],
  [['oak', 2, 2], ['stones', 2, 1], ['rocks', 1, 1], ['pond', 3, 2], ['rocks', 1, 1]],
  [['ruin', 3, 3], ['spring', 2, 2], ['rocks', 1, 1], ['stones', 2, 1], ['oak', 2, 2]],
];
const LM_NAME = { pond: 'a quiet pond', rocks: 'boulders', oak: 'an ancient oak', stones: 'a ring of old stones', ruin: 'a ruined watchtower', spring: 'a warm spring' };
function buildLandmark(kind) {
  const g = new THREE.Group();
  if (kind === 'pond' || kind === 'spring') { const hot = kind === 'spring'; g.add(cyl(1.5, 1.55, 0.12, 0x8a8f98, 0, 0, 0, 16), cyl(1.36, 1.36, 0.08, hot ? 0x5ad8d0 : 0x3b8fd8, 0, 0.1, 0, 16, hot ? 0x2fb8b0 : 0x1d5fa8, 0.5)); if (!hot) g.add(sph(0.18, 0x5aa03a, -0.5, 0.12, 0.2, 0, 0, 6), sph(0.14, 0x6bbf4a, 0.6, 0.12, -0.2, 0, 0, 6)); else g.add(sph(0.22, 0xe8f6ff, 0, 0.3, 0, 0xffffff, 0.3, 6)); g.scale.set(1, 1, 0.7); }
  else if (kind === 'rocks') g.add(PROPS.rockCluster(1.3));
  else if (kind === 'oak') { g.add(cyl(0.34, 0.5, 1.3, 0x6b4a2a, 0, 0, 0, 7), sph(1.15, 0x2f7a32, 0, 0.9, 0, 0, 0, 8), sph(0.8, 0x3a8a2a, 0.7, 1.4, 0.3, 0, 0, 8), sph(0.7, 0x2a8a3a, -0.6, 1.3, -0.3, 0, 0, 8)); }
  else if (kind === 'stones') { for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; g.add(rot(vox(0.22, 0.9 + (i % 2) * 0.3, 0.22, 0x9a9ea6, Math.cos(a) * 0.8, 0, Math.sin(a) * 0.55), 0, a, 0.05)); } }
  else if (kind === 'ruin') { g.add(vox(2.2, 0.25, 2.2, 0x7f838b, 0, 0, 0), vox(0.5, 1.9, 0.5, 0x9a9ea6, -0.8, 0.25, -0.8), vox(0.5, 1.3, 0.5, 0x8a8e96, 0.8, 0.25, -0.8), vox(0.5, 0.8, 0.5, 0x9a9ea6, 0.8, 0.25, 0.8), vox(1.5, 0.3, 0.4, 0x8a8e96, 0, 1.5, -0.8)); }
  return g;
}
function buildLandmarks(announce = true) {
  while (landmarksBuilt < Math.min(3, G.land)) {
    landmarksBuilt++; const L = landmarksBuilt, E = L * 4, E0 = (L - 1) * 4; let seed = 1234 + L * 777; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280, made = [];
    for (const [kind, w, d] of LANDMARKS[L]) {
      for (let tries = 0; tries < 40; tries++) {   // somewhere in the new ring, away from where heroes arrive
        const x = Math.floor(2 - E + r() * (N - 4 + 2 * E - w)), z = Math.floor(2 - E + r() * (N - 4 + 2 * E - d));
        const inOld = x >= 2 - E0 - 1 && x + w <= N - 2 + E0 + 1 && z >= 2 - E0 - 1 && z + d <= N - 2 + E0 + 1; if (inOld) continue;
        if ((x + w > N - 7 && Math.abs(z + d / 2 - (HALL.cz + 2)) < 4) || (z + d > N - 7 && Math.abs(x + w / 2 - (HALL.cx + 2.5)) < 4)) continue;
        let free = true; for (let i = x; i < x + w; i++) for (let j = z; j < z + d; j++) if (occ.has(key(i, j))) free = false; if (!free) continue;
        for (let i = x; i < x + w; i++) for (let j = z; j < z + d; j++) occ.add(key(i, j));
        const m = buildLandmark(kind); m.position.set(x + w / 2, 0, z + d / 2); m.rotation.y = r() * 6.28; stripLights(m); landmarkGroup.add(m); made.push(kind); break;
      }
    }
    occVersion++; if (made.length && announce) toast(`🏞 New land revealed: ${[...new Set(made)].map(k => LM_NAME[k]).join(', ')}.`);
  }
}
let loadedOnce = false;
function applyLand() {   // clear the trees from newly unlocked land and redraw the boundary
  const B = landBounds(), dummy = new THREE.Object3D(); dummy.scale.setScalar(0); dummy.updateMatrix();
  for (const t of forest.trees) if (!t.hidden && t.x > B.x0 - 0.6 && t.x < B.x1 + 0.6 && t.z > B.z0 - 0.6 && t.z < B.z1 + 0.6) { t.hidden = true; forest.meshes.forEach(m => m.setMatrixAt(t.n, dummy.matrix)); }
  forest.meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; });
  if (typeof buildGrid === 'function' && typeof scene !== 'undefined' && grid !== undefined) buildGrid();
  if (loadedOnce) { try { buildLandmarks(); } catch (e) { /* landmarks are decoration */ } }
}
/* ------------------------------------------------------------------ *
 *  Buildings
 * ------------------------------------------------------------------ */
const bGroup = new THREE.Group(); scene.add(bGroup);
const worldEl = document.getElementById('world');

const footprint = (type, rot) => { const t = BUILDINGS[type]; return rot % 2 ? [t.d, t.w] : [t.w, t.d]; };
const roadCells = new Set(), walkCells = new Set();   // paved tiles and walkable decor: not in `occ`, so heroes walk over them (only roads are faster)
// A new building is linked to the street network: a short cobble path from its door to the nearest paved tile or to the hall
function autoRoad(b) {
  const hall = G.buildings[0], from = b.door.clone(); let best = null, bd = 1e9;
  const consider = v => { const d = Math.hypot(v.x - from.x, v.z - from.z); if (d < bd) { bd = d; best = v; } };
  consider(hall.door); for (const k of roadCells) { const [x, z] = k.split(',').map(Number); consider(new THREE.Vector3(x + 0.5, 0, z + 0.5)); }
  if (!best || bd < 2.2) return;
  const wp = findPath(from, best), cells = [], seen = new Set(); let cur = from;
  for (const q of wp) { const n = Math.max(1, Math.ceil(Math.hypot(q.x - cur.x, q.z - cur.z) / 0.35)); for (let i = 0; i <= n; i++) { const x = Math.floor(cur.x + (q.x - cur.x) * i / n), z = Math.floor(cur.z + (q.z - cur.z) * i / n), k = key(x, z); if (!seen.has(k)) { seen.add(k); const pv = cells[cells.length - 1]; if (pv && Math.abs(pv[0] - x) === 1 && Math.abs(pv[1] - z) === 1 && canPlace('road', x, pv[1]) && !seen.has(key(x, pv[1]))) { seen.add(key(x, pv[1])); cells.push([x, pv[1]]); } if (canPlace('road', x, z)) cells.push([x, z]); } } cur = q; }
  const c = cells.length * BUILDINGS.road.cost; if (!cells.length || cells.length > 40 || G.gold < c) return;
  G.gold -= c; cells.forEach(([x, z]) => addBuilding('road', x, z)); toast(`🛤 Linked to the town with ${cells.length} path tiles (−${c}g).`);
}
function pavable() {   // worn cells inside the land that are free of buildings and not yet paved
  const B = landBounds(), out = [];
  for (let z = B.z0; z < B.z1; z++) for (let x = B.x0; x < B.x1; x++) if (wear[(z + OFF) * MG + x + OFF] >= WEAR_DIRT && !occ.has(key(x, z)) && !walkCells.has(key(x, z))) out.push([x, z]);
  return out;
}
function canPlace(type, cx, cz, rot = 0) {
  const [w, d] = footprint(type, rot);
  if (BUILDINGS[type].walkable) { const B0 = landBounds(); return cx >= B0.x0 && cz >= B0.z0 && cx < B0.x1 && cz < B0.z1 && !occ.has(key(cx, cz)) && !walkCells.has(key(cx, cz)); }
  const B = landBounds(); if (cx < B.x0 || cz < B.z0 || cx + w > B.x1 || cz + d > B.z1) return false;
  for (let x = cx; x < cx + w; x++) for (let z = cz; z < cz + d; z++) if (occ.has(key(x, z))) return false;
  return true;
}
// Cobble tiles are merged into a single mesh (hundreds of tiles would otherwise be hundreds of draw calls)
const roadTiles = []; let roadDirty = false, roadMesh = null, roadT = 0;
function rebuildRoads() {
  roadDirty = false; if (roadMesh) { scene.remove(roadMesh); roadMesh.geometry.dispose(); roadMesh = null; } if (!roadTiles.length) return;
  const n = roadTiles.length, pos = new Float32Array(n * 12), nor = new Float32Array(n * 12), col = new Float32Array(n * 12), idx = new Uint32Array(n * 6), c = new THREE.Color();
  roadTiles.forEach((t, i) => { const x = t.x, z = t.z; pos.set([x, 0.05, z, x + 1, 0.05, z, x + 1, 0.05, z + 1, x, 0.05, z + 1], i * 12); for (let k = 0; k < 4; k++) { nor[i * 12 + k * 3 + 1] = 1; c.setHex(t.shade); col.set([c.r, c.g, c.b], i * 12 + k * 3); } idx.set([i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2], i * 6); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  roadMesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); roadMesh.receiveShadow = true; scene.add(roadMesh);
}
function addBuilding(type, cx, cz, rot = 0) {
  const t = BUILDINGS[type], [w, d] = footprint(type, rot), th = rot * Math.PI / 2;
  const variant = type === 'memorial' ? Math.min(12, G.fallen.length) : type === 'tent' ? (ofType('tent').length % 2 ? 0 : 1) : 0;
  const group = BUILDINGS[type].road ? new THREE.Group() : mergeStatic(buildBuilding(type, variant));   // a road tile has no mesh of its own; the rest is merged to save draw calls
  group.position.set(cx + w / 2, 0, cz + d / 2);
  group.rotation.y = th;
  if (t.road) { roadTiles.push({ x: cx, z: cz, shade: [0x8f8a80, 0x9a958a, 0x86817a, 0x938d82][(cx * 7 + cz * 13 + 400) % 4] }); roadDirty = true; }
  stripLights(group);
  bGroup.add(group);
  const b = {
    id: G.nextId++, type, cx, cz, w, d, rot, level: 1, stock: 0, progress: 0, group,
    door: new THREE.Vector3(cx + w / 2 + Math.sin(th) * (t.d / 2 + 0.7), 0, cz + d / 2 + Math.cos(th) * (t.d / 2 + 0.7)),
  };
  group.userData.bid = b.id;
  for (let x = cx; x < cx + w; x++) for (let z = cz; z < cz + d; z++) { if (t.walkable) { walkCells.add(key(x, z)); if (t.road) roadCells.add(key(x, z)); } else occ.add(key(x, z)); }
  if (type === 'forge' || type === 'alchemy') {
    b.bar = document.createElement('div'); b.bar.className = 'pbar'; b.bar.innerHTML = '<i></i>'; worldEl.appendChild(b.bar);
    b.tag = document.createElement('div'); b.tag.className = 'btag'; worldEl.appendChild(b.tag);
  }
  // pop-in animation
  group.scale.setScalar(0.01); b.pop = 0;
  G.buildings.push(b); occVersion++;
  return b;
}
// ---- production chain and specializations
const SPEC = {
  tavern: { feast: ['🍽', 'Feast Hall', 'Meals pay 25% more.'], inn: ['🛏', 'Cosy Inn', 'Heroes who rest here gain +15 extra happiness.'] },
  lumber: { saw: ['🪚', 'Sawmill', 'Wood comes 60% faster.'], lodge: ['🌿', "Forester's Lodge", 'Also gathers 1 herb every 20 s.'] },
  farm: { granary: ['🌾', 'Granary', 'Grain comes 60% faster.'], orchard: ['🍎', 'Orchard', 'Sells fruit: +0.4 gold per second.'] },
  bakery: { loaves: ['🥖', 'Big Ovens', 'Each batch makes 2 loaves.'], pastry: ['🥐', 'Pastry Shop', 'Sells pastries: +0.5 gold per second.'] },
};
const specOf = (type) => { const b = first(type); return b && b.spec; };
const specCost = b => 200 + 100 * b.level;
const grain = () => (G.flags.grain || 0), bread = () => (G.flags.bread || 0);
function tickProduction(dt) {
  const f = G.flags;
  for (const b of ofType('farm')) { b.acc = (b.acc || 0) + dt; if (b.acc >= 9 / (1 + 0.3 * (b.level - 1)) / (b.spec === 'granary' ? 1.6 : 1)) { b.acc = 0; f.grain = Math.min(60, grain() + 1); } if (b.spec === 'orchard') G.gold += 0.4 * dt; }
  for (const b of ofType('bakery')) { b.acc = (b.acc || 0) + dt; if (b.acc >= 12 / (1 + 0.3 * (b.level - 1)) && grain() >= 2 && bread() < 40) { b.acc = 0; f.grain -= 2; f.bread = Math.min(40, bread() + (b.spec === 'loaves' ? 2 : 1)); } if (b.spec === 'pastry') G.gold += 0.5 * dt; }
  for (const b of ofType('lumber')) if (b.spec === 'lodge') { b.acc2 = (b.acc2 || 0) + dt; if (b.acc2 >= 20) { b.acc2 = 0; G.herbs++; } }
}
const ofType = t => G.buildings.filter(b => b.type === t);
const first = t => G.buildings.find(b => b.type === t);

addBuilding('hall', HALL.cx, HALL.cz);
G.buildings[0].pop = 1; G.buildings[0].group.scale.setScalar(1);

/* ------------------------------------------------------------------ *
 *  Derived stats
 * ------------------------------------------------------------------ */
const popCap = () => 4 + ofType('tent').length * 3 + ofType('cottage').length + ofType('tavern').length * 4 + G.outpost * 3 + G.rank * 4 + 2 * regionPerk('greenwood');
const maxLevel = () => [3, 5, 7, 9][G.rank];
const boardSlots = () => 3 + G.boardLvl + (G.rank >= 2 ? 1 : 0) + (G.rank >= 3 ? 1 : 0);
const craftSpeed = () => (1 + 0.25 * G.staff.smith) * (G.research.forging ? 1.3 : 1) * (G.research.mythril ? 1.4 : 1) * (1 + 0.1 * regionPerk('stonepeak')) * (G.flags.faction === 'vanguard' ? 1.15 : 1) * (G.flags.smithTaught ? 1.1 : 1);
const alchSpeed = () => (1 + 0.25 * G.staff.alch) * (G.research.forging ? 1.15 : 1) * (1 + 0.1 * regionPerk('ashen')) * (G.flags.faction === 'arcane' ? 1.15 : 1);
const mealGold = tav => { tav = tav || first('tavern'); return (tav && tav.spec === 'feast' ? 1.25 : 1) * (G.flags.fest ? 1.5 : 1) * (seasonIdx() === 3 ? 1.25 : 1) * 9 * (1 + 0.15 * G.staff.cook) * (1 + 0.3 * ((tav?.level || 1) - 1)) * (tav ? adj(tav).meal : 1); };
const questGoldMul = () => (calEvent() ? calEvent().mul : 1) * (1 + 0.04 * Math.min(3, retireN('quartermaster'))) * (G.research.charter ? 1.25 : 1) * (seasonIdx() === 1 ? 1.1 : 1) * (1 + 0.002 * (G.flags.rep ?? 10)) * (first('monument') ? 1.05 : 1) * (1 + 0.03 * squares()) * (1 + 0.05 * regionPerk('dunes')) * (1 + 0.03 * legacyLvl('trade'));
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
  rogue: { label: 'Rogue', icon: '🗡️', base: 2.7, price: 16, survive: 0.84, quest: 'gather' },        // sneaky: extra loot, great against ambushes
  cleric: { label: 'Cleric', icon: '🙏', base: 2.2, price: 18, survive: 0.9, quest: 'combat' },       // keeps the party alive
  alchemist: { label: 'Alchemist', icon: '⚗️', base: 2.6, price: 17, survive: 0.8, quest: 'arcane' }, // lives on potions, boosts potion use
};
const usesLab = c => c === 'wizard' || c === 'alchemist';   // these classes are equipped with potions from the Alchemical Lab
const MELEE = ['knight', 'rogue'];
const NAMES = ['Aldric', 'Brienne', 'Cael', 'Dara', 'Eldon', 'Fenna', 'Garrick', 'Hilda', 'Ivar', 'Jora', 'Kellan', 'Lyra', 'Mordo', 'Nessa', 'Orin', 'Piper', 'Quill', 'Rurik', 'Sera', 'Thane'];
const TRAITS = {
  clumsy: { label: 'Clumsy', icon: '🤕', epithet: 'the Clumsy', desc: '−10% quest success chance, but +20% loot from every quest.' },
  lucky: { label: 'Lucky', icon: '🍀', epithet: 'the Lucky', desc: '+8% quest success chance.' },
  glutton: { label: 'Glutton', icon: '🍖', epithet: 'the Hungry', desc: 'Eats double: tavern meals pay twice as much, but stamina drains 40% faster.' },
  brave: { label: 'Brave', icon: '🦁', epithet: 'the Bold', desc: 'Far less likely to fall in battle.' },
  scholar: { label: 'Scholar', icon: '📖', epithet: 'the Wise', desc: 'Gains experience twice as fast.' },
};
const VIP_POOL = [['Sir Galahad', 'knight'], ['Dame Rowena', 'knight'], ['Lord Percival', 'knight'], ['Lady Isolde', 'ranger'], ['Ranger Thistle', 'ranger'], ['Archmage Orwyn', 'wizard'], ['Mage Lysandra', 'wizard'], ['Shade Vesper', 'rogue'], ['Mother Aveline', 'cleric'], ['Brewmaster Quill', 'alchemist']];
const traitOf = h => (h.vip ? h.vip.trait : null);
function addStar(h) {   // a spinning golden star marks VIP heroes
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: 0xffd24a }));
  star.position.y = h.cls === 'wizard' ? 1.95 : 1.4; h.mesh.add(star); h.mesh.userData.star = star;
}
const PROMO = {
  knight: { name: 'Paladin', icon: '⚜️', pw: 1.3, survive: 0.1, desc: '+30% power, far fewer casualties.' },
  ranger: { name: 'Warden', icon: '🦅', pw: 1.3, loot: 0.25, desc: '+30% power, +25% loot.' },
  wizard: { name: 'Archmage', icon: '🔮', pw: 1.35, mana: 3, desc: '+35% power, +3 Mana after each success.' },
  rogue: { name: 'Shadowblade', icon: '🌑', pw: 1.25, loot: 0.3, desc: '+25% power, +30% loot.' },
  cleric: { name: 'Saint', icon: '✨', pw: 1.2, survive: 0.1, mana: 2, desc: '+20% power, far fewer casualties, +2 Mana.' },
  alchemist: { name: 'Grand Alchemist', icon: '🧪', pw: 1.3, mana: 2, desc: '+30% power, +2 Mana after each success.' },
};
const TALENTS = {
  knight: [[['shield', 'Shield Wall', 'Far fewer casualties.', { survive: 0.15 }], ['cleave', 'Cleave', '+15% power on combat quests.', { pwType: { combat: 1.15 } }]], [['ironwill', 'Iron Will', 'Stamina drains 30% slower.', { decay: 0.3 }], ['warlord', 'Warlord', '+15% power everywhere.', { pw: 1.15 }]]],
  ranger: [[['forager', 'Forager', '+25% loot from quests.', { loot: 0.25 }], ['sharp', 'Sharpshooter', '+20% power on gather quests.', { pwType: { gather: 1.2 } }]], [['swift', 'Swift Feet', 'Stamina drains 30% slower.', { decay: 0.3 }], ['eagle', 'Eagle Eye', '+4% party success chance.', { succ: 0.04 }]]],
  rogue: [[['pick', 'Pickpocket', '+30% loot from quests.', { loot: 0.3 }], ['ambush', 'Ambusher', '+20% power on combat quests.', { pwType: { combat: 1.2 } }]], [['nimble', 'Nimble', 'Far fewer casualties.', { survive: 0.12 }], ['edge', 'Killer Instinct', '+25% power, but more casualties.', { pw: 1.25, survive: -0.1 }]]],
  cleric: [[['mend', 'Mending Hands', '+3% party success chance.', { succ: 0.03 }], ['ward', 'Sacred Ward', 'Far fewer casualties.', { survive: 0.15 }]], [['zeal', 'Holy Zeal', '+20% power on combat quests.', { pwType: { combat: 1.2 } }], ['grace', 'Grace', '+2 Mana after each successful quest.', { mana: 2 }]]],
  alchemist: [[['dist', 'Distiller', '+20% power on arcane quests.', { pwType: { arcane: 1.2 } }], ['herbal', 'Herbalist', '+25% loot from quests.', { loot: 0.25 }]], [['potent', 'Potent Brews', '+4% party success chance.', { succ: 0.04 }], ['volatile', 'Volatile Mixtures', '+25% power, but more casualties.', { pw: 1.25, survive: -0.1 }]]],
  wizard: [[['focus', 'Arcane Focus', '+20% power on arcane quests.', { pwType: { arcane: 1.2 } }], ['siphon', 'Mana Siphon', '+2 Mana after each successful quest.', { mana: 2 }]], [['friend', "Alchemist's Friend", '+4% party success chance.', { succ: 0.04 }], ['glass', 'Glass Cannon', '+25% power, but more casualties.', { pw: 1.25, survive: -0.1 }]]],
};
const talentSlots = h => (h.level >= 3 ? 1 : 0) + (h.level >= 6 ? 1 : 0);
const talentDef = (cls, id) => TALENTS[cls].flat().find(t => t[0] === id);
function heroMods(h) {
  const m = { pw: 1, pwType: {}, survive: 0, loot: 0, mana: 0, decay: 0, succ: 0, xp: 1, happy: 1 };
  if (h.boon) { m.pw *= h.boon.pw || 1; m.succ += h.boon.succ || 0; m.loot += h.boon.loot || 0; m.survive += h.boon.survive || 0; }
  if ((h.loy ?? 60) >= 80) m.pw *= 1.04; else if ((h.loy ?? 60) <= 25) m.pw *= 0.96;
  if (h.cls === 'rogue') m.loot += 0.15;
  { const tm = tagMods(h.tags); m.pw *= tm.pw; m.survive += tm.survive; m.loot += tm.loot; m.decay += tm.decay; m.succ += tm.succ; m.xp = tm.xp; m.happy = tm.happy * (1 - 0.04 * legacyLvl('hearth')); }
  if (h.promo) { const P = PROMO[h.cls]; m.pw *= P.pw; m.survive += P.survive || 0; m.loot += P.loot || 0; m.mana += P.mana || 0; }
  for (const id of h.talents || []) { const t = talentDef(h.cls, id); if (!t) continue; const f = t[3]; if (f.pw) m.pw *= f.pw; if (f.pwType) for (const k of Object.keys(f.pwType)) m.pwType[k] = (m.pwType[k] || 1) * f.pwType[k]; m.survive += f.survive || 0; m.loot += f.loot || 0; m.mana += f.mana || 0; m.decay += f.decay || 0; m.succ += f.succ || 0; }
  return m;
}
const survBonus = h => (traitOf(h) === 'brave' ? 0.35 : 0) + heroMods(h).survive;
const heroLabel = h => h.promo ? PROMO[h.cls].name : CLASSES[h.cls].label;
function gainXp(h, n) {
  h.xp += n * heroMods(h).xp * (1 + 0.06 * legacyLvl('tutor')) * (1 + 0.1 * Math.min(3, retireN('instructor')));
  while (h.xp >= h.level + 1) { h.xp -= h.level + 1; h.level++; sfx('level'); floatText(h.pos, `⬆ ${h.name} Lv${h.level}`, '#9bff9b'); if (h.level === 3 || h.level === 6) toast(`✨ ${h.name} can choose a new talent! (tap the hero)`); }
}
function addPromoGear(h) { h.mesh.add(vox(0.46, 0.5, 0.05, 0xe8c04a, 0, 0.3, -0.2), vox(0.1, 0.1, 0.06, 0xc0392b, 0, 0.62, -0.23)); }
// Bonds come from a number: affinity, -100..100, kept on both heroes (h.aff[otherId]). It grows by questing together and by chatting in the
// guild; the bond KIND (friend, rival, sweethearts, mentor/apprentice) is derived from it and announced when it changes.
const BOND_ICON = { friend: '🤝 Friends with ', rival: '⚡ Rival of ', sweet: '💘 Sweethearts with ', mentor: '🎓 Mentor of ', apprentice: '🎓 Apprentice of ' };
function recomputeBond(a, b, quiet) {
  const v = (a.aff || {})[b.id] || 0; let ka = null, kb = null;
  if (v >= 30) { ka = kb = 'friend'; if (v >= 60 && ((a.tags || []).includes('romantic') || (b.tags || []).includes('romantic'))) ka = kb = 'sweet'; else if (v >= 40 && Math.abs(a.level - b.level) >= 3) { ka = a.level > b.level ? 'mentor' : 'apprentice'; kb = ka === 'mentor' ? 'apprentice' : 'mentor'; } }
  else if (v <= -30) ka = kb = 'rival';
  const before = (a.bonds || {})[b.id]; a.bonds = a.bonds || {}; b.bonds = b.bonds || {};
  if (ka) { a.bonds[b.id] = ka; b.bonds[a.id] = kb; } else { delete a.bonds[b.id]; delete b.bonds[a.id]; }
  if (!quiet && ka && ka !== before) {
    if (ka === 'sweet') { toast(`💘 ${a.name} and ${b.name} have grown close.`); chron(`💘 ${a.name} and ${b.name} fell for each other.`); }
    else if (ka === 'mentor' || ka === 'apprentice') { const m = ka === 'mentor' ? a : b, ap = m === a ? b : a; toast(`🎓 ${m.name} has taken ${ap.name} under their wing.`); chron(`🎓 ${m.name} became ${ap.name}'s mentor.`); }
    else if (ka === 'rival' && before !== 'rival') toast(`⚡ ${a.name} and ${b.name} have become rivals.`);
    else if (ka === 'friend' && !before) toast(`🤝 ${a.name} and ${b.name} became friends.`);
  }
}
function addAff(a, b, v, quiet) {
  if (v > 0) v *= tagMods(a.tags).affinity * tagMods(b.tags).affinity; else v *= Math.max(tagMods(a.tags).rivalry, tagMods(b.tags).rivalry);
  a.aff = a.aff || {}; b.aff = b.aff || {}; const n = Math.max(-100, Math.min(100, ((a.aff[b.id] || 0) + v))); a.aff[b.id] = n; b.aff[a.id] = n; recomputeBond(a, b, quiet);
}
function assignBonds(h) {   // a new hero arrives already knowing a couple of people
  h.aff = h.aff || {}; const others = G.heroes.filter(x => x !== h).sort(() => Math.random() - 0.5).slice(0, 2);
  for (const o of others) { const r = Math.random(); if (r < 0.28) addAff(h, o, 35, true); else if (r < 0.42) addAff(h, o, -35, true); }
}
// after a quest: partners who fight together grow closer, rivals who win together reconcile, losing together strains the rivals
function bondGrow(heroes, ok) {
  for (let i = 0; i < heroes.length; i++) for (let j = i + 1; j < heroes.length; j++) { const a = heroes[i], b = heroes[j]; if (!G.heroes.includes(a) || !G.heroes.includes(b)) continue; const v = (a.aff || {})[b.id] || 0; addAff(a, b, ok ? (v < 0 ? 8 : 6) : (v < 0 ? -4 : 2)); }
}
function grieve(dead) {   // the death of a close companion hurts
  for (const h of G.heroes) { if (h === dead) continue; const v = (h.aff || {})[dead.id] || 0; if (v < 40) continue; h.happy = Math.max(0, h.happy - (first('memorial') ? 15 : 25)); h.loy = Math.max(0, (h.loy ?? 60) - 3); floatText(h.pos, '💔', '#ff7a7a'); toast(`💔 ${h.name} mourns ${dead.name}.`); if (Math.random() < 0.4) { h.vow = dead.name; } delete h.aff[dead.id]; if (h.bonds) delete h.bonds[dead.id]; }
}
function bondInfo(party) {
  let d = 0; const notes = [], PAIR = { friend: [0.04, '🤝'], sweet: [0.06, '💘'], mentor: [0.05, '🎓'], apprentice: [0.05, '🎓'], rival: [-0.05, '⚡'] };
  for (let i = 0; i < party.length; i++) for (let j = i + 1; j < party.length; j++) { const k = (party[i].bonds || {})[party[j].id], f = PAIR[k]; if (!f) continue; d += f[0]; notes.push(`${f[1]} ${party[i].name} & ${party[j].name} (${f[0] > 0 ? '+' : '−'}${Math.abs(Math.round(f[0] * 100))}%)`); }
  return { d, notes };
}
function memorialize(h, deed) { sfx('die'); chron(`✝ ${h.name} ${deed}.`); grieve(h); G.fallen.push({ name: h.name, cls: heroLabel(h), level: h.level, quests: h.quests || 0, vip: !!h.vip, deed, day: Math.floor(G.time / 60) }); if (G.fallen.length > 40) G.fallen.shift(); }
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
const heroPower = (h, type) => { const m = heroMods(h); return CLASSES[h.cls].base * (1 + 0.2 * (h.level - 1)) * (h.gear ? (1 + 0.25 * ((h.gearTier || 1) - 1)) * (1 + 0.05 * (h.plus || 0)) : 0.5) * (CLASSES[h.cls].quest === type ? 1.3 : 1) * m.pw * (m.pwType[type] || 1) * (factionOf() && factionOf().cls === h.cls ? 1.1 : 1); };
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
    quests: d.quests || 0, aff: d.aff || null, plus: d.plus || 0, train: d.train || 0, vow: d.vow || null, vip: d.vip || null, gearTier: d.gearTier || 1, promo: !!d.promo, talents: d.talents || [], bonds: d.bonds || {},
    mesh, pos: mesh.position, bub, state: 'idle', target: null, onArrive: null, timer: 0, onDone: null, cool: 0, phase: Math.random() * 6, vis: true,
  };
  codexAdd('classes', h.cls); if (d.tags) { h.tags = d.tags; h.bio = d.bio; h.likes = d.likes; h.dislikes = d.dislikes; } else Object.assign(h, makeProfile(h.cls));
  (h.tags || []).forEach(t => codexAdd('tags', t)); h.loy = d.loy ?? 60; h.marks = d.marks || []; h.title = d.title || null; h.boon = d.boon || null; h.arc = d.arc || { id: pickArc(h), ch: 0 };
  mesh.userData.hid = h.id; G.heroes.push(h); if (h.vip) addStar(h); if (h.promo) addPromoGear(h); if (d.bonds === undefined) assignBonds(h); else if (!h.aff) { h.aff = {}; for (const [id, k] of Object.entries(h.bonds || {})) h.aff[id] = k === 'rival' ? -35 : 35; }
  return h;
}
function spawnHero(cls, atHall = false) {
  if (G.heroes.length >= popCap()) return null;
  if (!cls) {
    const opts = ['knight', 'ranger'];
    if (first('alchemy')) opts.push('wizard', 'wizard');
    if (G.renown >= 3) opts.push('rogue'); if (G.renown >= 6 || G.rank >= 1) opts.push('cleric'); if (first('alchemy') && G.renown >= 4) opts.push('alchemist');
    cls = pick(opts);
  }
  const p = atHall ? new THREE.Vector3(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1.2)) : spawnPoint();
  if (!atHall && Math.random() < (first('portal') ? 0.2 : 0.05) && G.heroes.filter(x => x.vip).length < 3) {   // a rare named VIP arrives
    const pool = VIP_POOL.filter(v => !usesLab(v[1]) || first('alchemy')), [base, vcls] = pick(pool), trait = pick(Object.keys(TRAITS));
    const h = createHero({ cls: vcls, variant: Math.floor(Math.random() * 3), name: `${base} ${TRAITS[trait].epithet}`, x: p.x, z: p.z, level: 2 + Math.floor(Math.random() * 2), vip: { trait } });
    toast(`⭐ ${h.name} has arrived at your guild! (${TRAITS[trait].label})`); return h;
  }
  return createHero({ cls, variant: Math.floor(Math.random() * 3), name: pick(NAMES), x: p.x, z: p.z, level: 1 + Math.floor(legacyLvl('recruits') / 2) });
}
function removeHero(h, why) {
  heroGroup.remove(h.mesh); h.bub.remove();
  G.heroes.splice(G.heroes.indexOf(h), 1);
  if (why) toast(why);
}
/* ---- A* pathfinding over the base grid (buildings, props and interior trees are blocked cells) ---- */
const OFF = 14, MG = N + 2 * OFF;   // pathfinding grid covers the base and every possible expansion
// ---- worn paths: wherever people keep walking, the grass wears into dirt. No fixed roads: the town's streets grow from its traffic,
// and "Pave worn paths" turns them into cobbles (which are faster still).
const wear = new Float32Array(MG * MG), WEAR_S = 6, WEAR_LO = 3, WEAR_DIRT = 11, WEAR_FULL = 35;
let wearDirty = true, wearTick = 0, wearDraw = 0;
const wearCanvas = document.createElement('canvas'); wearCanvas.width = wearCanvas.height = MG * WEAR_S;
const wearTex = new THREE.CanvasTexture(wearCanvas); wearTex.minFilter = THREE.LinearFilter;
{ const m = new THREE.Mesh(new THREE.PlaneGeometry(MG, MG), new THREE.MeshLambertMaterial({ map: wearTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.set(N / 2, 0.012, N / 2); m.receiveShadow = true; scene.add(m); }
function addWear(x, z, a) {
  const cx = Math.floor(x), cz = Math.floor(z); if (cx < -OFF + 1 || cz < -OFF + 1 || cx >= N + OFF - 1 || cz >= N + OFF - 1) return;
  const i = (cz + OFF) * MG + cx + OFF; wear[i] += a; wear[i + 1] += a * 0.25; wear[i - 1] += a * 0.25; wear[i + MG] += a * 0.25; wear[i - MG] += a * 0.25; wearDirty = true;
}
const wearAt = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z); return cx < -OFF || cz < -OFF || cx >= N + OFF || cz >= N + OFF ? 0 : wear[(cz + OFF) * MG + cx + OFF]; };
function drawWear() {
  const c = wearCanvas.getContext('2d'); c.clearRect(0, 0, wearCanvas.width, wearCanvas.height);
  for (let i = 0; i < wear.length; i++) {
    const w = wear[i]; if (w < WEAR_LO) continue; const t = Math.min(1, (w - WEAR_LO) / (WEAR_FULL - WEAR_LO)), cx = i % MG, cz = (i / MG) | 0, h = Math.sin(i * 12.9898) * 43758.5453, j = h - Math.floor(h);
    const px = (cx + 0.5 + (j - 0.5) * 0.25) * WEAR_S, py = (cz + 0.5 + (((h * 7) % 1) - 0.5) * 0.25) * WEAR_S, r = WEAR_S * (0.55 + 0.4 * t + 0.1 * j);
    const g = c.createRadialGradient(px, py, r * 0.2, px, py, r); const col = `${Math.round(118 + 60 * t)},${Math.round(96 + 38 * t)},${Math.round(58 + 26 * t)}`;
    g.addColorStop(0, `rgba(${col},${0.35 + 0.6 * t})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.beginPath(); c.arc(px, py, r, 0, 6.2832); c.fill();
  }
  wearTex.needsUpdate = true;
}
function tickWear(dt) {
  wearTick += dt; if (wearTick >= 5) { wearTick = 0; for (let i = 0; i < wear.length; i++) if (wear[i] > 0) { wear[i] *= 0.998; if (wear[i] < 0.2) wear[i] = 0; } wearDirty = true; }
  wearDraw -= dt; if (wearDraw <= 0 && wearDirty) { wearDraw = 3; wearDirty = false; drawWear(); }
}
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
  const shop = usesLab(h.cls) ? first('alchemy') : first('forge');
  if (h.stamina < 45) {
    setMood(h, '🍺');
    if (tavern) {
      return visit(h, tavern, 2.5, () => {
        const fed = bread() > 0; if (fed) G.flags.bread--;
        const g = mealGold(tavern) * (traitOf(h) === 'glutton' ? 2 : 1) * (fed ? 1.4 : 1);
        gain(tavern.door, g);
        h.stamina = 100; h.happy = Math.min(100, h.happy + 30 + (fed ? 10 : 0) + (tavern.spec === 'inn' ? 15 : 0));
      });
    }
    return wanderNearHall(h);
  }
  if (!h.gear) {
    const item = usesLab(h.cls) ? '🧪' : CLASSES[h.cls].icon;
    setMood(h, item);
    if (shop && shop.stock > 0) {
      return visit(h, shop, 1.8, () => {
        if (shop.stock > 0) {
          shop.stock--; h.gear = true; h.gearTier = shop.grade || 1;
          gain(shop.door, CLASSES[h.cls].price * (1 + 0.15 * (shop.level - 1)) * (1 + 0.6 * (h.gearTier - 1)) * (G.research.mythril && !usesLab(h.cls) ? 1.25 : 1));
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
const gearName = h => GRADE[usesLab(h.cls) ? 'alchemy' : 'forge'][h.gearTier || 1];
const nearCampfire = h => ofType('campfire').some(b => Math.hypot(b.cx + b.w / 2 - h.pos.x, b.cz + b.d / 2 - h.pos.z) < 6);
function updateHero(h, dt) {
  h.phase += dt * 8;
  if (h.state === 'quest') return;
  if (h.train > 0) { h.train -= dt; gainXp(h, 0.05 * dt * Math.max(1, ofType('training').length)); if (h.train <= 0) { h.train = 0; G.stats.train = (G.stats.train || 0) + 1; floatText(h.pos, '💪', '#9bff9b'); toast(`💪 ${h.name} finished intensive training.`); } }
  const decay = Math.pow(0.7, G.staff.bard);
  h.stamina = Math.max(0, h.stamina - 0.7 * (traitOf(h) === 'glutton' ? 1.4 : 1) * (1 - Math.min(0.6, heroMods(h).decay + (G.flags.faction === 'rangers' ? 0.1 : 0))) * dt);
  if (h.mesh.userData.star) h.mesh.userData.star.rotation.y += dt * 2.5;
  const needy = h.stamina < 45 || !h.gear;
  h.happy = Math.max(0, Math.min(100, h.happy + ((needy ? -0.35 * decay * (1 - decorBonus()) * heroMods(h).happy : 0.15) + likeDelta(h)) * dt));
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
  const s = Math.min(d - stopDist, speed * dt * (roadCells.size && roadCells.has(key(Math.floor(h.pos.x), Math.floor(h.pos.z))) ? 1.25 : wearAt(h.pos.x, h.pos.z) >= WEAR_DIRT ? 1.1 : 1));
  addWear(h.pos.x, h.pos.z, s * 1.6);
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
  frostpeak: { name: 'Frostpeak Pass', icon: '❄️', unlock: () => G.rank >= 1 && G.renown >= 25, need: 'Hold rank, Renown 25', theme: 'cave', types: { combat: 2, gather: 0.8, arcane: 0.8 }, loot: { ore: 1.3 }, goldMul: 1.25, diffMul: 1.35, mods: ['armored', 'storm'], boss: 'frostgiant',
    names: ['Cross the Frozen Pass', 'Thaw the Stuck Caravan', 'Hunt the Rime Wolves', 'Light the Beacon Fire'], desc: 'A howling mountain pass ruled by the Frost Giant.', summary: 'Mostly combat · ×1.25 gold · ×1.35 danger · Boss: Frost Giant', perk: 'Parties +3% success (mastery 3), +6% (mastery 5)' },
  dunes: { name: 'Scorched Dunes', icon: '🏜️', unlock: () => G.rank >= 2 && G.renown >= 60, need: 'Keep rank, Renown 60', theme: 'forest', types: { combat: 1, gather: 1.8, arcane: 0.8 }, loot: { herbs: 1.4, wood: 0.5 }, goldMul: 1.45, diffMul: 1.5, mods: ['rush', 'bounty', 'poison'], boss: 'duneking',
    names: ['Follow the Sand-Map', 'Raid the Oasis Bandits', 'Rescue the Lost Pilgrims', 'Unearth the Buried Vault'], desc: 'Endless dunes, rich bounties, and the Dune Warlord.', summary: 'Mostly gathering · ×1.45 gold · ×1.5 danger · Boss: Dune Warlord', perk: 'Quest gold +5% (mastery 3), +10% (mastery 5)' },
  hollow: { name: 'Hollow Moor', icon: '💀', unlock: () => G.rank >= 2 && G.renown >= 80, need: 'Keep rank, Renown 80', theme: 'ruins', types: { combat: 1, gather: 0.5, arcane: 2.2 }, loot: { arcane: 2 }, goldMul: 1.5, diffMul: 1.6, mods: ['cursed', 'elite', 'storm'], boss: 'lich',
    names: ['Lay the Moor Ghosts to Rest', 'Seal the Barrow', 'Silence the Bell Tower', 'Burn the Hollow Tome'], desc: 'A cursed moor where the Bone Lich walks.', summary: 'Mostly arcane · +100% mana loot · ×1.5 gold · ×1.6 danger · Boss: Bone Lich', perk: '+1 Mana per quest success (mastery 3), +2 (mastery 5)' },
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
  if (type === 'gather') { loot.herbs = Math.round(rnd(2, 5) * minH); loot.wood = Math.round(rnd(3, 6)); }
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
    loot, mods, boss: o.type ? null : (reg.boss || null), special: !!o.special, state: 'open', heroes: [], t: 0, enchant: false, chance: 0,
  };
  G.quests.push(q); return q;
}
const genQuest = () => makeQuest();
const bossTag = q => { const B = BOSS[q.boss]; return B ? `<span class="tag" style="border-color:#ff9a4a" title="${B.note}">👑 ${ENEMY_NAME[q.boss]} · weak: ${B.weak.map(c => CLASSES[c].icon).join('')}</span>` : ''; };
const ENEMY_NAME = { frostgiant: 'Frost Giant', duneking: 'Dune Warlord', lich: 'Bone Lich' };
const modTags = q => (q.contested ? `<span class="tag" style="border-color:#ff6a6a" title="A rival guild is after this job. Finish before the timer runs out!">⚔ ${Math.max(0, Math.ceil((q.expire || 0) - G.time))}s</span>` : '') + bossTag(q) + (q.town ? `<span class="tag" title="A small favour for the town: low pay, but the villagers will remember it.">🏘 ${q.who}</span>` : '') + (q.region && q.region !== 'greenwood' && REGIONS[q.region] ? `<span class="tag">${REGIONS[q.region].icon} ${REGIONS[q.region].name}</span>` : '') + (q.mods || []).map(k => `<span class="tag" title="${MODS[k].desc}">${MODS[k].icon} ${MODS[k].label}</span>`).join('');
const questPay = q => Math.round(q.gold * questGoldMul() * (q.approachGold || 1));
const readyHeroes = () => G.heroes.filter(h => h.gear && !(h.train > 0) && h.stamina >= 45 && h.state !== 'quest' && h.state !== 'leaving');
function bestParty(q) {
  const r = readyHeroes().sort((a, b) => heroPower(b, q.type) - heroPower(a, q.type));
  return r.slice(0, q.maxH);
}
function modPenalty(q, party, opts = {}) {   // returns [delta, [unmet requirement notes]]
  let d = 0; const notes = [], has = c => party.some(h => h.cls === c), avgTier = party.length ? party.reduce((n, h) => n + (h.gearTier || 1), 0) / party.length : 1;
  for (const k of q.mods || []) {
    if (k === 'cursed' && !has('wizard') && !has('cleric')) { d -= 0.15; notes.push('needs a Wizard or Cleric'); }
    if (k === 'storm' && !has('ranger') && !has('rogue')) { d -= 0.12; notes.push('needs a Ranger or Rogue'); }
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
  { const B = BOSS[q.boss]; if (B) c += party.some(h => B.weak.includes(h.cls)) ? 0.08 : -0.04; }
  c += regionPerk('frostpeak') * 0.03;
  c += fmBonus(party, o.formation); if (o.potion && party.some(h => h.cls === 'alchemist')) c += 0.05;   // an Alchemist makes the potion count for more
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
  q.deaths = party.filter(h => Math.random() > CLASSES[h.cls].survive + 0.15 + (h.cls !== 'cleric' && party.some(x => x.cls === 'cleric') ? 0.08 : 0) + ap.survive + FORMATION[q.formation || 'line'].survive + survBonus(h)).map(h => h.id);
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
  onQuestEnd(q, ok); maybeQuestEvent(q);
  const hp = new THREE.Vector3(HALL.cx + 2.5, 0, HALL.cz + 5);
  q.state = 'done'; G.quests.splice(G.quests.indexOf(q), 1);
  const alive = [];
  q.heroes.forEach(h => {
    if (!G.heroes.includes(h)) return;
    h.state = 'idle'; h.cool = 0; h.stamina = Math.max(20, h.stamina - 25 * (1 - 0.12 * Math.min(3, retireN('scout'))));
    h.pos.set(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1)); h.mesh.visible = true; h.target = null;
    if (!ok && q.deaths.includes(h.id)) { memorialize(h, `fell on "${q.name}"`); if (h.vip) G.renown = Math.max(0, G.renown - 1); removeHero(h, h.vip ? `☠ ${h.name} — a legend of the guild — has fallen!` : `${h.name} the ${CLASSES[h.cls].label} fell in battle...`); return; }
    h.quests = (h.quests || 0) + 1;
    if (ok) gainXp(h, traitOf(h) === 'scholar' ? 2 : 1);
    if (ok && h.bonds && Object.entries(h.bonds).some(([id, k]) => k === 'apprentice' && q.heroes.some(x => x.id === +id))) gainXp(h, 1);   // a mentor in the party teaches
    h.loy = Math.max(0, Math.min(100, (h.loy ?? 60) + (ok ? 1 : -1)));
    if (ok && h.vow) { h.happy = Math.min(100, h.happy + 20); chron(`🗡 ${h.name} honoured ${h.vow}.`); toast(`🗡 ${h.name} honoured ${h.vow}'s memory.`); h.vow = null; }
    if (h.likes && h.likes.type === q.type) { h.happy = Math.min(100, h.happy + 8); floatText(h.pos, '💕', '#ff9ac8'); } else if (h.dislikes && h.dislikes.type === q.type) { h.happy = Math.max(0, h.happy - 8); floatText(h.pos, '💢', '#ff7a7a'); }
    if (Math.random() < (ok ? 0.5 : 1)) h.gear = false;
    h.happy = Math.min(100, h.happy + (ok ? 20 : -10));
    alive.push(h);
  });
  bondGrow(q.heroes, ok);
  if (ok) {
    const g = questPay(q);
    if (q.mods && q.mods.includes('elite') && Math.random() < 0.35) { G.rare.mythril++; toast('💀 The elite foe dropped a Mythril shard!'); }
    gain(hp, g); G.renown += q.renown;
    floatText(hp.clone().add(new THREE.Vector3(0, 0.6, 0)), `+${q.renown} ⭐`, '#ffd24a');
    const lootBonus = q.heroes.reduce((n, h) => n + heroMods(h).loot, 0), oreMul = (G.research.prospect ? 1.5 : 1) * (1 + 0.2 * q.party.filter(x => x.trait === 'clumsy').length) * (1 + lootBonus + (G.flags.faction === 'rangers' ? 0.1 : 0));
    G.mana += q.heroes.reduce((n, h) => n + heroMods(h).mana, 0) + regionPerk('hollow');
    if (q.loot.ore) G.ore += Math.round(q.loot.ore * oreMul);
    if (q.loot.herbs) G.herbs += Math.round(q.loot.herbs * oreMul / (G.research.prospect ? 1.5 : 1));
    if (q.loot.wood) G.wood += Math.round(q.loot.wood * oreMul / (G.research.prospect ? 1.5 : 1));
    if (q.loot.arcane) G.mana += Math.round(q.loot.arcane * 5 * oreMul / (G.research.prospect ? 1.5 : 1));
    (q.script && q.script.enemies || []).filter(e => e.boss).forEach(e => codexAdd('bosses', e.kind));
    if (q.contested && G.flags.rival) { G.flags.rival.fame = Math.max(0, G.flags.rival.fame - 1); toast(`⚔ You beat ${G.flags.rival.name} to it!`); chron(`⚔ Beat ${G.flags.rival.name} to “${q.name.replace('Contested: ', '')}”.`); }
    if (g >= 40 && !q.contested && !q.legend) {   // an optional ad doubles this quest's gold and loot (capped)
      const lf = x => Math.round(x * oreMul), bonus = { gold: Math.min(400, g), ore: q.loot.ore ? lf(q.loot.ore) : 0, herbs: q.loot.herbs ? Math.round(q.loot.herbs * oreMul / (G.research.prospect ? 1.5 : 1)) : 0, wood: q.loot.wood ? Math.round(q.loot.wood * oreMul / (G.research.prospect ? 1.5 : 1)) : 0 };
      showAdOffer('doubleLoot', `▶ Watch an ad: double the loot (+${bonus.gold}g${bonus.ore ? ' +' + bonus.ore + ' ore' : ''}${bonus.herbs ? ' +' + bonus.herbs + ' herbs' : ''}${bonus.wood ? ' +' + bonus.wood + ' wood' : ''})`, 9, () => { gain(hp, bonus.gold); G.ore += bonus.ore; G.herbs += bonus.herbs; G.wood += bonus.wood; toast(`🎁 Bonus loot: +${bonus.gold}g${bonus.ore ? ' +' + bonus.ore + ' ore' : ''}`); });
    }
    G.questsDone++; if (q.mods && q.mods.includes('elite')) G.stats.elite = (G.stats.elite || 0) + 1; if (q.town) G.stats.town = (G.stats.town || 0) + 1; if (q.legend) legendWon(q); else if (q.special) chron(`✔ ${q.name}`);
    if (q.town) { repGain(q.rep || 3); toast(`🏘 ${q.who} thanks you warmly. (+${q.rep || 3} town reputation)`); }
    if (q.region && REGIONS[q.region]) { const rec = (G.regions[q.region] = G.regions[q.region] || { done: 0 }), before = regionLevel(q.region); rec.done++; if (regionLevel(q.region) > before) toast(`🗺 ${REGIONS[q.region].name} mastery level ${regionLevel(q.region)}! ${REGIONS[q.region].perk}`); }
    toast(`✔ ${q.name} complete! +${g}g, +${q.renown}⭐, loot collected.`);
  } else {
    G.renown = Math.max(0, G.renown - 1); if (q.town) repGain(-2);
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
  if (G.flags.pending || G.time - (G.flags.lastEv || -999) < 150) return;   // guild events keep a calm gap of at least 2.5 minutes
  const st = STORIES.find(x => !G.flags['story_' + x.id] && x.when()); if (!st) return;
  G.flags['story_' + st.id] = 1; G.flags.pending = st.id; G.flags.lastEv = G.time; showStoryBanner();
}
function showStoryBanner() { const st = STORIES.find(x => x.id === G.flags.pending); if (!st) return; if (G.flags.pol && G.flags.pol.story === 'auto') { const i = st.choices.findIndex(c => !c.ok || c.ok()); if (i >= 0) { chooseStory(i); toast('📬 Auto-handled: ' + st.title); return; } } sfx('chime'); toast('📬 New event: ' + st.title); }
function chooseStory(i) {
  const st = STORIES.find(x => x.id === G.flags.pending); if (!st) return; const c = st.choices[i]; if (!c || (c.ok && !c.ok())) return;
  c.fx(); G.flags.pending = null; hideBanner('story'); closeModal(); toast(`📖 ${st.title}: ${c.label}`); chron(`📖 ${st.title}: ${c.label}`);
}

/* ------------------------------------------------------------------ *
 *  Endless Dive (Waystone Portal): floors forever, real HP, bank or die
 * ------------------------------------------------------------------ */
const newPending = () => ({ gold: 0, ore: 0, wood: 0, herbs: 0, mana: 0, mythril: 0, scale: 0, feather: 0, renown: 0 });
const heroSnap = h => ({ id: h.id, name: h.name, cls: h.cls, level: h.level, variant: h.variant || 0, trait: traitOf(h), vip: !!h.vip, power: heroPower(h, 'combat') });
const diveFloor = q => q.script.floors[diveFloorIndex(q.script, q.elapsed)];
const diveProg = q => { const f = diveFloor(q); return f ? Math.min(100, Math.max(0, (q.elapsed - f.s) / (f.e - f.s) * 100)) : 0; };
function dispatchDive(mode) {
  if (!first('portal')) return toast('Build a Waystone Portal first.');
  if (G.quests.some(q => q.dive)) return toast('A party is already inside the dungeon.');
  const r = readyHeroes().sort((a, b) => heroPower(b, 'combat') - heroPower(a, 'combat')).slice(0, 4);
  if (r.length < 2) return toast('The dive needs at least 2 geared, rested heroes.');
  const q = { id: G.nextId++, name: { daily: 'Daily Dive', rush: 'Boss Rush', hard: 'Hardcore Dive' }[mode] || 'Endless Dive', mode: mode || null, rush: mode === 'rush', hard: mode === 'hard', type: 'dive', dive: true, state: 'active', heroes: r, party: r.map(heroSnap), seed: mode === 'daily' ? dailySeed() : (Math.random() * 1e9) | 0, heals: [], enchants: [], relics: [], offer: null, elapsed: 0, cleared: 0, pending: newPending(), dur: 1e9, t: 1e9, chance: 0.5, minH: 2, maxH: 4, diff: 0, loot: {}, enchant: false, gold: 0, renown: 0 };
  q.script = newDiveScript(q); ensureFloors(q, 0); G.quests.push(q);
  r.forEach(h => { h.state = 'quest'; h.mesh.visible = false; setMood(h, null); h.onDone = null; });
  sfx('horn'); toast(`🌀 ${r.length} heroes step through the portal… Recall to bank your loot!`); renderModal(true);
}
function pickRelic(q, i, auto) {
  const id = q.offer && q.offer[i]; if (!id) return; codexAdd('relics', id);
  const T = q.elapsed, next = diveFloorIndex(q.script, T) + 1; q.relics = q.relics || []; q.relics.push({ id, from: next }); q.offer = null;
  rebuildDive(q, T); toast(`${auto ? 'Relic claimed automatically' : 'Relic chosen'}: ${RELICS[id].icon} ${RELICS[id].name} — ${RELICS[id].desc}`);
}
function bankPending(q) {
  const p = q.pending, pm = G.research.prospect ? 1.5 : 1, txt = rewardText(p);
  G.gold += Math.round(p.gold * questGoldMul() * (q.hard ? 1.5 : 1)); G.ore += Math.round(p.ore * pm); G.wood += p.wood; G.herbs += p.herbs; G.mana += p.mana;
  G.rare.mythril += p.mythril; G.rare.scale += p.scale; G.rare.feather += p.feather; G.renown += p.renown; q.pending = newPending();
  return txt;
}
function diveTick(q, dt) {
  q.elapsed += dt; q.t = q.dur - q.elapsed; const S = q.script; ensureFloors(q, q.elapsed);
  while (q.cleared < S.floors.length && S.floors[q.cleared].e <= q.elapsed && !S.floors[q.cleared].lost) {
    const f = S.floors[q.cleared]; for (const k of Object.keys(q.pending)) q.pending[k] += f.reward[k] || 0;
    q.cleared++; if (!q.mode) G.diveBest = Math.max(G.diveBest, q.cleared);
    if (diveCheckpoint(f.k)) {
      toast(`🏁 Checkpoint — floor ${f.k + 1}! Banked: ${bankPending(q)}`);
      if (q.offer) pickRelic(q, 0, true);   // an unchosen offer is taken automatically
      q.offer = relicOffer(q, f.k);
      if (q.offer.length) { sfx('chime'); toast('🎁 A relic awaits — choose one!'); if (!modalKind) openModal('relic'); }
    }
  }
  if (S.wiped && q.elapsed >= S.endT) { if (diveRescueHold(q)) return; resolveDive(q, 'wiped'); }
}
// On a wipe-out the dive waits a few seconds so the player can accept a rescue offer: keep half of the unbanked loot and save the hero with the most XP.
function diveRescueHold(q) {
  if (q.hard) return false;   // no safety net in a hardcore dive
  const p = q.pending, worth = (p.gold || 0) + (p.ore || 0) * 3 + (p.mythril + p.scale + p.feather) * 150;
  if (q.rescue === undefined) {
    q.rescue = { until: G.time + 10, done: false }; const gold = Math.round((p.gold || 0) / 2);
    if (worth >= 100 && showAdOffer('diveRescue', `▶ Watch an ad: rescue! Keep half the loot (+${gold}g) and save a hero`, 10, () => doDiveRescue(q), () => { q.rescue.done = true; })) return true;
    q.rescue.done = true; return false;
  }
  return !q.rescue.done && G.time < q.rescue.until;
}
function doDiveRescue(q) {
  const S = q.script, p = q.pending; for (const k of Object.keys(p)) if (typeof p[k] === 'number') p[k] = Math.ceil(p[k] / 2);
  const txt = bankPending(q); let best = -1, bl = -1; q.party.forEach((pp, i) => { const hh = G.heroes.find(x => x.id === pp.id); if (hh && S.heroes[i].dies && hh.level > bl) { bl = hh.level; best = i; } });
  if (best >= 0) { S.heroes[best].dies = false; toast(`🛟 Rescued! ${q.party[best].name} is saved. Banked: ${txt}`); } else toast(`🛟 Rescued! Banked: ${txt}`);
  q.rescue.done = true; q.rescued = true; resolveDive(q, 'wiped');   // the run still ends here, but with half the loot and the hero kept
}
function resolveDive(q, mode) {
  const S = q.script, T = q.elapsed; let text;
  if (mode === 'recalled') text = `🏁 Banked & left after floor ${q.cleared} · ${bankPending(q)}`;
  else text = q.rescued ? `🛟 Wiped out on floor ${S.floors.length}, but rescued: half the loot was kept.` : `☠ Wiped out on floor ${S.floors.length}. Lost unbanked loot: ${rewardText(q.pending)}`;
  q.endText = text; if (!q.mode) G.diveBest = Math.max(G.diveBest, q.cleared); else challengeDone(q);
  onQuestEnd(q, mode === 'recalled'); maybeDiveEvent(q);
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
  let d = ofType('tower').reduce((n, t) => n + (ofType('hill').some(h => Math.hypot(h.cx + 1.5 - t.cx - t.w / 2, h.cz + 1.5 - t.cz - t.d / 2) <= 5.5) ? 3 : 0), 0) + Math.min(8, ofType('palisade').length) * 2 + G.staff.guard * (G.research.scales ? 8 : 4) + G.walls * 3 + (G.research.scales ? 6 : 0) + ofType('tower').length * 6;
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
  if (ok) { repGain(2); gain(cp, loot); G.renown += ren; G.stats.raidsWon++; if (q.bossRaid) { G.rare.mythril += 1; q.endText = `🛡️ The warchief falls! +${loot}g, +${ren}⭐, 1 💎`; } else q.endText = `🛡️ The raid is repelled! +${loot}g, +${ren}⭐`; }
  else {
    repGain(-5);
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
  const closable = !['raid', 'poach'].includes(id);   // decisions that matter cannot be waved away
  el.innerHTML = trHtml(`<span>${b.text}</span>` + b.buttons.map(([l, a, c]) => `<button class="act ${c}" data-act="${a}">${l}</button>`).join('')) + (closable ? `<button class="bx" data-act="bannerx" data-id="${id}" title="${tr('Dismiss')}" aria-label="Dismiss">✕</button>` : '');
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
  t.goals -= dt; if (t.goals <= 0) { t.goals = 1; checkGoals(); checkAch(); checkStories(); tutorial.tick(); }
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
  if (t.trickle >= 12) { t.trickle = 0; G.ore += Math.random() < 0.7 ? Math.round(1 * (G.research.prospect ? 1.5 : 1)) : 0; G.herbs += Math.random() < 0.6 ? 1 : 0; G.wood += Math.random() < 0.75 ? 1 : 0; if (G.staff.porter) { G.ore += G.staff.porter; G.herbs += G.staff.porter; G.wood += G.staff.porter; } }
  // tavern + market passive gold
  t.tavern += dt;
  if (t.tavern >= 4) { t.tavern = 0; let g = 0; ofType('tavern').forEach(b => g += b.level); ofType('market').forEach(b => { g += 0.5 * adj(b).gold; }); if (g > 0) { G.gold += g; } }
  // wages
  t.wage -= dt;
  if (t.wage <= 0) { t.wage = 30; const w = wage(); if (w > 0) { const paid = Math.min(w, G.gold); G.gold -= paid; floatText(G.buildings[0].door, `-${paid} wages`, '#ffa'); } }
  // spawning heroes
  t.spawn -= dt;
  if (t.spawn <= 0) {
    t.spawn = Math.max(18, 45 - G.renown * 0.3) / (first('portal') ? 2 : 1) * (1 - 0.004 * (G.flags.rep ?? 10));
    if (ofType('tavern').length && G.heroes.length < popCap()) spawnHero();
  }
  tickProduction(dt);
  for (const b of ofType('lumber')) { b.acc = (b.acc || 0) + dt; if (b.acc >= 8 / (1 + 0.3 * (b.level - 1)) / (b.spec === 'saw' ? 1.6 : 1)) { b.acc = 0; G.wood++; } }
  roadT -= dt; if (roadDirty && roadT <= 0) { roadT = 0.4; rebuildRoads(); }
  tickMemorial(dt); tickAdOffer(dt); tickRival(dt); tickWear(dt); tickWeekly(dt); tickAuto(dt); tickSeason(dt); tickFestival(dt); { const cot = ofType('cottage').length; if (cot) G.gold += cot * 0.06 * dt * (1 + 0.004 * (G.flags.rep ?? 10)); }
  // quests
  t.quest -= dt;
  if (t.quest <= 0) { t.quest = 14; if (G.quests.filter(q => q.state === 'open').length < boardSlots()) genQuest(); legendTick(); }
  townTick(dt); tickPeople(dt); tickDisaster(dt); tickFamily(dt);
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
// ---- purchases: what each product gives (checked again on start so a restored purchase is never lost)
function grantPurchase(id) {
  if (id === 'starter_pack' && !G.flags.starter) { G.flags.starter = 1; G.gold += 2500; G.rare.mythril += 2; G.ore += 30; G.wood += 30; G.herbs += 20; sfx('goal'); toast('🎁 Starter pack: +2500g, +2 Mythril and materials. Thank you!'); chron('🎁 The guild received a starter pack.'); }
  if (id === 'remove_ads') { toast('🚫 Banner ads removed. Thank you for supporting the game!'); }
}
// ---- daily login: a 7-day track of small rewards (claimed from a window that opens once a day)
const DAILY = [{ gold: 150 }, { gold: 200, ore: 10 }, { gold: 250, herbs: 10 }, { gold: 300, wood: 15 }, { gold: 400, mana: 10 }, { gold: 500, ore: 20, herbs: 10 }, { gold: 800, mythril: 1 }];
const dayKey = (d = new Date()) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
function checkDaily() {
  const L = (G.flags.login ||= { last: '', streak: 0, pending: 0 }), today = dayKey(); if (L.last === today) return;
  const y = new Date(); y.setDate(y.getDate() - 1); L.streak = L.last === dayKey(y) ? (L.streak % 7) + 1 : 1; L.last = today; L.pending = 1;
}
const dailyReward = i => { const r = DAILY[i], k = 1 + 0.25 * G.rank, out = {}; for (const [a, v] of Object.entries(r)) out[a] = a === 'mythril' ? v : Math.round(v * k); return out; };
// ---- memorial garden: one stone per fallen hero; it refreshes when the list grows
let memoT = 0;
function tickMemorial(dt) {
  memoT -= dt; if (memoT > 0) return; memoT = 8;
  for (const b of ofType('memorial')) { const n = Math.min(12, G.fallen.length); if (b.nF === n) continue; b.nF = n; while (b.group.children.length) { const c = b.group.children[0]; b.group.remove(c); if (c.geometry) c.geometry.dispose(); } const fresh = mergeStatic(buildBuilding('memorial', n)); [...fresh.children].forEach(c => b.group.add(c)); }
}
// ---- the rival guild: it tracks your fame, steals contested quests when you are slow, and every 10 minutes the town compares you
const RIVALS = ['The Silver Lantern', 'The Crimson Compass', 'Ironvale Company', 'The Wandering Blades'];
const ourFame = () => G.renown + 2 * codexN('bosses') + 0.5 * (G.stats.chapters || 0);
const rivalName = () => (G.flags.rival ? G.flags.rival.name : 'A rival guild');
const CONTESTS = [['gather', 'Contested: The Merchant’s Escort'], ['combat', 'Contested: The Bridge Toll'], ['arcane', 'Contested: The Wandering Relic'], ['combat', 'Contested: The Wolf Bounty']];
function tickRival(dt) {
  const f = G.flags;
  if (!f.rival) { if (G.renown >= 15 && G.questsDone >= 10) { f.rival = { name: pick(RIVALS), fame: Math.round(G.renown * 0.8), t: 600, cq: 80, truce: 0, wins: 0, losses: 0 }; toast(`⚔ A rival guild, ${f.rival.name}, has set up shop nearby!`); chron(`⚔ ${f.rival.name} opened a rival guild hall.`); } return; }
  const r = f.rival; r.fame += (ourFame() * 0.85 + 10 - r.fame) * 0.0015 * dt; r.t -= dt; r.cq -= dt; if (r.truce > 0) r.truce -= dt;
  for (const q of G.quests.filter(x => x.contested && x.state === 'open' && G.time > x.expire)) { G.quests.splice(G.quests.indexOf(q), 1); r.fame += 2; toast(`⚔ ${r.name} took “${q.name.replace('Contested: ', '')}” first!`); }
  if (r.cq <= 0) {
    r.cq = 150 + Math.random() * 120;
    if (r.truce <= 0 && !G.quests.some(x => x.contested && x.state === 'open')) { const [type, name] = pick(CONTESTS), q = makeQuest({ type, minH: 1 + Math.floor(Math.random() * 2), mods: ['bounty'], name, goldMul: 1.6 }); q.contested = true; q.expire = G.time + 140; toast(`⚔ Contested quest! Beat ${r.name} to “${name.replace('Contested: ', '')}”.`); }
  }
  if (r.t <= 0) {
    r.t = 600; const mine = ourFame();
    if (mine >= r.fame) { const g = 300 + 100 * G.rank; G.gold += g; G.renown += 2; r.wins++; r.fame = Math.max(0, r.fame - 2); toast(`🏆 The town prefers your guild over ${r.name}! (+${g}g, +2⭐)`); chron(`🏆 The guild outshone ${r.name}.`); }
    else { const l = Math.min(Math.round(G.gold * 0.1), 400 + 150 * G.rank); G.gold -= l; G.renown = Math.max(0, G.renown - 1); r.losses++; r.fame += 3; toast(`😤 ${r.name} won the town’s favour. (−${l}g, −1⭐)`); chron(`😤 ${r.name} outshone the guild.`); }
  }
}
// ---- rewarded ads: small optional offers (see ads.js). An offer is a chip above the toolbar; nothing happens unless the player taps it.
let adOffer = null;
function hideAdOffer() { adOffer = null; $('adOffer').classList.add('hidden'); }
function showAdOffer(placement, text, secs, onReward, onExpire) {
  if (!Ads.canShow(placement)) return false;
  hideAdOffer(); adOffer = { placement, onReward, onExpire, t: secs };
  $('adOfferText').textContent = tr(text); $('adOffer').classList.remove('hidden'); return true;
}
function tickAdOffer(dt) { if (!adOffer) return; adOffer.t -= dt; if (adOffer.t <= 0) { const o = adOffer; hideAdOffer(); if (o.onExpire) o.onExpire(); } }
$('adOfferGo').onclick = async () => {
  const o = adOffer; if (!o) return; hideAdOffer(); const ok = await Ads.show(o.placement);
  if (ok) { sfx('goal'); o.onReward(); } else { toast('The ad was not completed — no reward.'); if (o.onExpire) o.onExpire(); }
};
$('adOfferNo').onclick = () => { const o = adOffer; hideAdOffer(); if (o && o.onExpire) o.onExpire(); };
// ---- legacy: when the guild passes to the next generation, it earns Legacy Points to spend on permanent family perks
const LEG_KEY = 'fantasy-guild-master-legacy';
let LEGACY = { lp: 0, gen: 0, perks: {} }; try { Object.assign(LEGACY, JSON.parse(localStorage.getItem(LEG_KEY) || '{}')); } catch (e) { /* fresh family */ }
const saveLegacy = () => { try { localStorage.setItem(LEG_KEY, JSON.stringify(LEGACY)); } catch (e) { /* ignore */ } };
const legacyLvl = id => (LEGACY.perks || {})[id] || 0;
const PERKS = {
  purse: { icon: '💰', name: 'Family Fortune', desc: '+300 starting gold per level.' },
  name: { icon: '⭐', name: 'Famous Name', desc: '+2 starting renown per level.' },
  tutor: { icon: '🎓', name: 'Old Tutors', desc: 'Heroes earn +6% experience per level.' },
  trade: { icon: '🧭', name: 'Trade Routes', desc: 'Quest gold +3% per level.' },
  hearth: { icon: '🔥', name: 'Warm Hearth', desc: 'Heroes lose happiness 4% slower per level.' },
  recruits: { icon: '🛡', name: 'Veteran Recruits', desc: 'New heroes arrive 1 level higher every 2 levels.' },
};
const legacyGain = () => 3 + Math.floor(G.renown / 25) + Math.floor((codexN('bosses') + codexN('relics') + codexN('classes') + codexN('tags') + codexN('arcs')) / 4) + Object.keys(G.flags.ach || {}).length + (G.flags.legendDone ? 5 : 0);
const canInherit = () => G.rank >= 3 || !!G.flags.legendDone;
// ---- codex and achievements: what the guild has met, beaten and collected
function codexAdd(k, id) { const c = ((G.flags.codex ||= {})[k] ||= {}); c[id] = (c[id] || 0) + 1; }
const codexN = k => Object.keys(((G.flags.codex || {})[k]) || {}).length;
const CODEX_BOSS = { ogre: 'Ogre Warchief', chief: 'Bandit Chief', golem: 'Ancient Golem', frostgiant: 'Frost Giant', duneking: 'Dune Warlord', lich: 'Bone Lich' };
const ACHS = [
  { id: 'boss3', icon: '👑', name: 'Giant Slayer', desc: 'Defeat 3 different bosses.', ok: () => codexN('bosses') >= 3, rew: { gold: 600 } },
  { id: 'bossall', icon: '🏆', name: 'Bane of Bosses', desc: 'Defeat all 6 bosses.', ok: () => codexN('bosses') >= 6, rew: { gold: 3000, renown: 5, mythril: 2 } },
  { id: 'cls6', icon: '🎭', name: 'A Full Roster', desc: 'Recruit every class.', ok: () => codexN('classes') >= 6, rew: { gold: 800 } },
  { id: 'tag12', icon: '🧑‍🤝‍🧑', name: 'People Person', desc: 'Meet all 12 personalities.', ok: () => codexN('tags') >= 12, rew: { gold: 1000, renown: 2 } },
  { id: 'arc3', icon: '📖', name: 'Storyteller', desc: 'Finish 3 hero stories.', ok: () => codexN('arcs') >= 3, rew: { gold: 700, renown: 1 } },
  { id: 'rel8', icon: '🎁', name: 'Relic Hunter', desc: 'Collect all 8 relics.', ok: () => codexN('relics') >= 8, rew: { gold: 1500, scale: 1 } },
  { id: 'rep75', icon: '🏘', name: 'Beloved', desc: 'Win the town’s love (reputation 75).', ok: () => (G.flags.rep ?? 10) >= 75, rew: { gold: 1200, renown: 3 } },
  { id: 'legend', icon: '🐉', name: 'Legend of the Realm', desc: 'Defeat the Ember Colossus.', ok: () => !!G.flags.legendDone, rew: { gold: 2000, renown: 5 } },
  { id: 'fest3', icon: '🎉', name: 'Life of the Party', desc: 'Hold 3 festivals.', ok: () => (G.stats.fests || 0) >= 3, rew: { gold: 600 } },
  { id: 'road50', icon: '🛤', name: 'City Planner', desc: 'Pave 50 path tiles.', ok: () => G.buildings.filter(b => b.type === 'road').length >= 50, rew: { gold: 800 } },
  { id: 'hero20', icon: '🛡', name: 'A Hall Full of Heroes', desc: 'Have 20 heroes at once.', ok: () => G.heroes.length >= 20, rew: { gold: 1000 } },
  { id: 'rank3', icon: '🛡️', name: 'Fortress Guild', desc: 'Reach Fortress rank.', ok: () => G.rank >= 3, rew: { gold: 2500, renown: 5 } },
  { id: 'deep30', icon: '🌀', name: 'Deep Delver', desc: 'Reach floor 30 of the Endless Dive.', ok: () => G.diveBest >= 30, rew: { gold: 2000, feather: 1 } },
  { id: 'plus5', icon: '⚒', name: 'Masterwork', desc: 'Reinforce a hero’s gear to +5.', ok: () => G.heroes.some(h => (h.plus || 0) >= 5), rew: { gold: 1500 } },
];
function checkAch() {
  const a = (G.flags.ach ||= {});
  for (const x of ACHS) if (!a[x.id] && x.ok()) {
    a[x.id] = 1; const r = x.rew; G.gold += r.gold || 0; G.renown += r.renown || 0; for (const k of ['mythril', 'scale', 'feather']) if (r[k]) G.rare[k] += r[k];
    sfx('goal'); toast(`🏅 Achievement: ${x.name}! (+${r.gold}g${r.renown ? ', +' + r.renown + '⭐' : ''})`); chron(`🏅 ${x.name}`);
  }
}
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
// ---- seasons: a year is four seasons of 4 minutes; each gives a small perk, a tint and falling petals / leaves / snow
const SEASONS = [
  { name: 'Spring', icon: '🌸', desc: 'Herbs grow twice as fast.', tint: [1, 1, 1], emis: [0, 0, 0], part: 0xffb7d5 },
  { name: 'Summer', icon: '☀️', desc: 'Quest gold +10%.', tint: [1.0, 1.0, 0.92], emis: [0.05, 0.04, 0], part: null },
  { name: 'Autumn', icon: '🍂', desc: 'Ore and wood trickle in 50% faster.', tint: [1.0, 0.82, 0.62], emis: [0.06, 0.02, 0], part: 0xe87a20 },
  { name: 'Winter', icon: '❄️', desc: 'Tavern meals pay 25% more.', tint: [0.9, 0.95, 1.0], emis: [0.42, 0.46, 0.52], part: 0xffffff },
];
const SEASON_LEN = 240, seasonIdx = () => Math.floor((G.flags.sT || 0) / SEASON_LEN) % 4;
let seasonShown = -1, seasonAcc = 0;
function tickSeason(dt) {
  G.flags.sT = (G.flags.sT || 0) + dt; const i = seasonIdx();
  if (seasonShown !== i) { if (seasonShown >= 0) { toast(`${SEASONS[i].icon} ${SEASONS[i].name} has come. ${SEASONS[i].desc}`); chron(`${SEASONS[i].icon} ${SEASONS[i].name} began.`); } seasonShown = i; }
  seasonAcc += dt; if (seasonAcc >= 12) { seasonAcc = 0; if (i === 0 && Math.random() < 0.6) G.herbs++; if (i === 2) { if (Math.random() < 0.4) G.ore++; if (Math.random() < 0.3) G.wood++; } }
}
const snow = (() => {   // falling petals / leaves / snow that follow the camera
  const n = 420, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 30; }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.85, depthWrite: false });
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; pts.visible = false; scene.add(pts); return pts;
})();
function updateSeasonFx(rdt) {
  const S = SEASONS[seasonIdx()], k = 1 - Math.exp(-1.5 * rdt);
  if (groundMesh) { const c = groundMesh.material.color, e = groundMesh.material.emissive; c.r += (S.tint[0] - c.r) * k; c.g += (S.tint[1] - c.g) * k; c.b += (S.tint[2] - c.b) * k; e.r += (S.emis[0] - e.r) * k; e.g += (S.emis[1] - e.g) * k; e.b += (S.emis[2] - e.b) * k; }
  snow.visible = !!S.part && !watching; if (!snow.visible) return; snow.material.color.setHex(S.part);
  const a = snow.geometry.attributes.position, fall = seasonIdx() === 3 ? 1.6 : 0.9;
  for (let i = 0; i < a.count; i++) { let y = a.getY(i) - rdt * fall * (0.6 + (i % 5) * 0.12), x = a.getX(i) + Math.sin(performance.now() / 900 + i) * rdt * 0.4; if (y < 0) { y = 14; x = (Math.random() - 0.5) * 30; a.setZ(i, (Math.random() - 0.5) * 30); } a.setXYZ(i, x, y, a.getZ(i)); }
  a.needsUpdate = true; snow.position.set(camTarget.x, 0, camTarget.z);
}
// ---- day and night: a 7-minute cycle of light colour and strength (only on the base map; the battle stage has its own light)
const DAY_LEN = 420, _dn = [new THREE.Color(), new THREE.Color()];
function updateDayNight() {
  if (watching) return;
  const p = ((G.time + 0.3 * DAY_LEN) % DAY_LEN) / DAY_LEN, d = Math.max(0, Math.min(1, 0.5 + 0.6 * Math.sin(2 * Math.PI * (p - 0.25))));
  sun.intensity = 0.28 + 0.8 * d; ambient.intensity = 0.42 + 0.33 * d;
  sun.color.copy(_dn[0].setHex(0x7f93c8).lerp(_dn[1].setHex(d > 0.35 && d < 0.7 ? 0xffd2a0 : 0xfff1d0), d)); scene.background.copy(_dn[0].setHex(0x12281a).lerp(_dn[1].setHex(0x2f7a32), d));
}
// ---- hero chatter: short lines now and then, by class, trait and mood
const CHAT = {
  any: ['What a day!', 'Is the tavern open?', 'I could use a good meal.', 'The guild is growing.'],
  knight: ['My blade is ready.', 'For the guild!', 'No foe shall pass.'], ranger: ['The woods are quiet today.', 'Steady hands, sharp eyes.', 'I hear something out there…'], wizard: ['The stars feel restless.', 'Mana is all around us.', 'Ah, a fine day for research.'],
  glutton: ['Is there any more stew?'], lucky: ['I have a good feeling about today!'], clumsy: ['Oops… did I drop that?'], brave: ['Bring on the monsters!'], scholar: ['Fascinating architecture.'],
  tired: ['I need a rest…'], unhappy: ['This place could be better.'],
};
// ---- town reputation: how much the villagers like the guild (0-100). Small perks: quest gold up to +20%, heroes arrive up to 40% faster.
const REP_NAMES = ['Wary', 'Friendly', 'Trusted', 'Beloved'], repLevel = () => { const r = G.flags.rep ?? 10; return r >= 75 ? 3 : r >= 50 ? 2 : r >= 25 ? 1 : 0; };
function repGain(n) {
  const before = repLevel(); G.flags.rep = Math.max(0, Math.min(100, (G.flags.rep ?? 10) + n));
  if (repLevel() > before) { toast(`🏘 The villagers now consider you ${REP_NAMES[repLevel()]}!`); chron(`🏘 The town grew ${REP_NAMES[repLevel()].toLowerCase()} toward the guild.`); }
}
// small jobs posted by named residents (quick, low-pay quests that raise the town's opinion)
const TOWN_JOBS = [
  { who: 'Marta', name: 'Marta’s Missing Hens', type: 'gather' }, { who: 'Marta', name: 'Wine for the Tavern', type: 'gather' },
  { who: 'Tobin', name: 'Tobin’s Lost Hammer', type: 'combat' }, { who: 'Tobin', name: 'Clear the Old Mine Road', type: 'combat' },
  { who: 'Elsie', name: 'Elsie’s Moonpetals', type: 'gather' }, { who: 'Elsie', name: 'A Cure for the Fever', type: 'arcane' },
  { who: 'Pip', name: 'Find Pip’s Kite', type: 'gather' }, { who: 'Wren', name: 'Wren’s Runaway Goat', type: 'gather' },
  { who: 'Bram', name: 'Bram’s Old Scrolls', type: 'arcane' }, { who: 'Bram', name: 'The Ghost in the Archive', type: 'arcane' },
];
let townT = 30;
function townTick(dt) {
  townT -= dt; if (townT > 0) return; townT = 90 + Math.random() * 60;
  if (G.quests.filter(q => q.town && q.state === 'open').length >= 2) return;
  const who = residents.map(r => r.def.name), opts = TOWN_JOBS.filter(j => who.includes(j.who) && !G.quests.some(q => q.name === j.name)); if (!opts.length) return;
  const j = pick(opts), q = makeQuest({ type: j.type, minH: 1, mods: [], name: j.name, goldMul: 0.5 }); q.town = true; q.who = j.who; q.dur = Math.round(rnd(20, 30)); q.diff *= 0.6; q.rep = 3; q.renown = Math.max(0, q.renown - 1);
  toast(`🏘 ${j.who} has a request: ${j.name}`);
}
// ---- generic event queue: expedition choices, dive rooms and disasters all wait in the inbox as small decisions
const wellN = () => ofType('well').length;
const EVENTS = {
  merchant: { icon: '🧳', title: 'A wounded merchant', text: 'On the road home your party found a merchant whose cart was wrecked by bandits.', ch: [
    { label: 'Help him (−60g, +reputation)', ok: () => G.gold >= 60, fx: () => { G.gold -= 60; repGain(4); toast('🧳 He blesses your guild. +4 reputation.'); } },
    { label: 'Take his goods (+120g, −reputation)', fx: () => { G.gold += 120; repGain(-4); toast('🧳 You took his goods. +120g, but word spreads.'); } },
    { label: 'Ride on', fx: () => { } } ] },
  ruins: { icon: '🏺', title: 'Strange ruins', text: 'A half-buried shrine glints beside the trail. Your heroes are curious.', ch: [
    { label: 'Search it (60% treasure, 40% curse)', fx: () => { if (Math.random() < 0.6) { const n = 2 + (Math.random() * 3 | 0); G.ore += 8; G.herbs += 8; G.gold += 100; toast('🏺 A hidden cache! +100g and materials.'); } else { G.heroes.forEach(h => { h.happy = Math.max(0, h.happy - 10); }); toast('🏺 A curse! The heroes are shaken.'); } } },
    { label: 'Leave a small offering (−30g, heroes +mood)', ok: () => G.gold >= 30, fx: () => { G.gold -= 30; G.heroes.forEach(h => { h.happy = Math.min(100, h.happy + 8); }); toast('🏺 A calm feeling follows the party home.'); } },
    { label: 'Ignore it', fx: () => { } } ] },
  stray: { icon: '🐕', title: 'A stray follows the party', text: 'A scruffy dog trailed your heroes all the way to the guild hall.', ch: [
    { label: 'Adopt it (heroes +mood)', fx: () => { G.heroes.forEach(h => { h.happy = Math.min(100, h.happy + 6); }); G.flags.stray = 1; toast('🐕 The guild has a new mascot!'); chron('🐕 A stray dog became the guild mascot.'); } },
    { label: 'Send it to a villager farm', fx: () => { repGain(2); toast('🐕 A villager is delighted. +2 reputation.'); } } ] },
  fire: { icon: '🔥', title: 'Fire!', text: 'A spark from the forge caught the thatch. Flames spread between the buildings.', ch: [
    { label: 'Fight it together (−100g)', ok: () => G.gold >= 100, fx: () => { G.gold -= 100; repGain(2); toast('🔥 The fire is out. The villagers helped.'); } },
    { label: 'Let it burn out', fx: () => { const k = wellN() ? 0.1 : 0.35; const w = Math.round(G.wood * k), o = Math.round(G.ore * k); G.wood -= w; G.ore -= o; toast(`🔥 Lost ${w} wood and ${o} ore.`); chron('🔥 A fire damaged the guild stores.'); } } ] },
  flood: { icon: '🌊', title: 'Flood!', text: 'Heavy spring rain floods the lower yards.', ch: [
    { label: 'Dig drains (−80g)', ok: () => G.gold >= 80, fx: () => { G.gold -= 80; toast('🌊 The drains held.'); } },
    { label: 'Wait it out', fx: () => { const k = wellN() ? 0.1 : 0.3; const h2 = Math.round(G.herbs * k); G.herbs -= h2; G.heroes.forEach(h => { h.stamina = Math.max(10, h.stamina - 15); }); toast(`🌊 Lost ${h2} herbs; the heroes are weary.`); } } ] },
  plague: { icon: '🤒', title: 'Sickness spreads', text: 'A fever is going around the village and some heroes are coughing.', ch: [
    { label: 'Buy medicine (−10 herbs, −60g)', ok: () => G.gold >= 60 && G.herbs >= 10, fx: () => { G.gold -= 60; G.herbs -= 10; repGain(2); toast('🤒 The fever passes quickly.'); } },
    { label: 'Rest and hope', fx: () => { const k = wellN() ? 6 : 18; G.heroes.forEach(h => { h.stamina = Math.max(5, h.stamina - k); h.happy = Math.max(0, h.happy - k / 2); }); toast('🤒 The heroes recover slowly.'); } } ] },
  rest: { icon: '🛏', title: 'A quiet room', text: 'On the dive you found a safe, dry chamber with a few cots.', ch: [
    { label: 'Rest here (heroes recover stamina)', fx: () => { G.heroes.forEach(h => { h.stamina = Math.min(100, h.stamina + 30); }); toast('🛏 Everyone feels rested.'); } },
    { label: 'Move on', fx: () => { G.gold += 40; toast('🛏 You pressed on. +40g.'); } } ] },
  shop: { icon: '🛒', title: 'A hidden trader', text: 'A hooded trader has set up shop deep in the dive.', ch: [
    { label: 'Buy a Mythril shard (−350g)', ok: () => G.gold >= 350, fx: () => { G.gold -= 350; G.rare.mythril += 1; toast('🛒 +1 Mythril.'); } },
    { label: 'Buy supplies (−120g, +20 ore, +20 herbs)', ok: () => G.gold >= 120, fx: () => { G.gold -= 120; G.ore += 20; G.herbs += 20; toast('🛒 Supplies bought.'); } },
    { label: 'Decline', fx: () => { } } ] },
  trap: { icon: '🪤', title: 'A trapped corridor', text: 'Pressure plates line the floor ahead.', ch: [
    { label: 'Disarm it carefully (needs a rogue)', ok: () => G.heroes.some(h => h.cls === 'rogue'), fx: () => { G.gold += 150; toast('🪤 The rogue disarmed it and found a stash. +150g.'); } },
    { label: 'Run through (−80g of damage and repairs)', fx: () => { G.gold = Math.max(0, G.gold - 80); toast('🪤 Bruised, but through. −80g.'); } } ] },
  treasure: { icon: '💎', title: 'A treasure chamber', text: 'A sealed chest, unguarded. Too good to be true?', ch: [
    { label: 'Open it', fx: () => { if (Math.random() < 0.75) { G.rare.mythril += 1; G.gold += 200; toast('💎 +200g and a Mythril shard!'); } else { G.gold = Math.max(0, G.gold - 100); toast('💎 A mimic! −100g.'); } } },
    { label: 'Leave it', fx: () => { } } ] },
};
const evq = () => (G.flags.evq ||= []);
function pushEvent(id) { const q = evq(); if (q.length >= 3 || q.includes(id)) return; q.push(id); sfx('chime'); toast(`📬 ${EVENTS[id].icon} ${EVENTS[id].title}`); }
function chooseEvent(i) { const q = evq(), E = EVENTS[q[0]]; if (!E) return; const c = E.ch[i]; if (!c || (c.ok && !c.ok())) return; c.fx(); chron(`${E.icon} ${E.title}: ${c.label.replace(/\s*\(.*$/, '')}`); q.shift(); closeModal(); if (q.length) setTimeout(() => openModal('event'), 200); }
let disasterT = 420;
function tickDisaster(dt) {
  disasterT -= dt; if (disasterT > 0) return; disasterT = 420 + Math.random() * 360;
  if (G.buildings.length < 6) return;
  const sea = seasonIdx(), kind = sea === 0 ? 'flood' : sea === 1 ? 'fire' : 'plague'; if (Math.random() < 0.35) pushEvent(kind);
}
function maybeQuestEvent(q) { if (!q.ok || q.town || q.dive || Math.random() > 0.15) return; pushEvent(pick(['merchant', 'ruins', 'stray'])); }
function maybeDiveEvent(q) { if (q.cleared >= 2 && Math.random() < 0.7) pushEvent(pick(['rest', 'shop', 'trap', 'treasure'])); }
// ---- retirement and family: veterans can retire into the guild as instructor, quartermaster or scout; sweethearts may have a child who grows into a new hero
const RETIRE = { instructor: ['🎓', 'Instructor', 'Every hero gains a little extra experience from quests.'], quartermaster: ['📦', 'Quartermaster', '+4% quest gold.'], scout: ['🔭', 'Scout', 'Heroes lose less stamina on expeditions.'] };
const retired = () => (G.flags.retired ||= []), kids = () => (G.flags.kids ||= []);
const retireN = role => retired().filter(r => r.role === role).length;
const retireOk = h => h.level >= 4 && h.state !== 'quest' && !h.vip && retired().length < 6;
function retireHero(h, role) {
  if (!RETIRE[role] || !retireOk(h) || !G.heroes.includes(h)) return;
  retired().push({ name: h.name, cls: h.cls, role, level: h.level, tags: (h.tags || []).slice(0, 2) });
  chron(`${RETIRE[role][0]} ${h.name} retired and became the guild's ${RETIRE[role][1].toLowerCase()}.`); G.renown += 1;
  removeHero(h, `${RETIRE[role][0]} ${h.name} retired as ${RETIRE[role][1]}.`); sfx('goal'); closeModal();
}
function tickFamily(dt) {
  const f = G.flags; f.famT = (f.famT ?? 360) - dt;
  if (f.famT <= 0) {
    f.famT = 300 + Math.random() * 240;
    if (kids().length < 2 && G.heroes.length < popCap() && Math.random() < 0.5) {
      const pairs = []; for (const a of G.heroes) for (const [id, k] of Object.entries(a.bonds || {})) { const b = G.heroes.find(x => x.id === +id); if (k === 'sweet' && b && a.id < b.id && a.state !== 'quest' && b.state !== 'quest') pairs.push([a, b]); }
      if (pairs.length) {
        const [a, b] = pick(pairs), name = pick(NAMES), tags = [...new Set([pick(a.tags || ['brave']), pick(b.tags || ['brave'])])].slice(0, 2);
        kids().push({ name, cls: pick([a.cls, b.cls]), parents: [a.name, b.name], tags, grow: G.time + 480 });
        toast(`👶 ${a.name} and ${b.name} had a child: ${name}!`); chron(`👶 ${a.name} and ${b.name} welcomed ${name} into the world.`); sfx('chime'); a.happy = Math.min(100, a.happy + 20); b.happy = Math.min(100, b.happy + 20);
      }
    }
  }
  for (const k of kids().slice()) if (G.time >= k.grow && G.heroes.length < popCap()) {
    kids().splice(kids().indexOf(k), 1);
    const p = new THREE.Vector3(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1.2)), h = createHero({ cls: k.cls, variant: Math.floor(Math.random() * 3), name: k.name, x: p.x, z: p.z, level: 2 + Math.floor(legacyLvl('recruits') / 2) });
    if (k.tags && TAGS[k.tags[0]]) { h.tags = k.tags.filter(t => TAGS[t]); h.tags.forEach(t => codexAdd('tags', t)); }
    h.bio = [h.bio ? h.bio[0] : 'Raised in the guild.', `Child of ${k.parents[0]} and ${k.parents[1]}.`]; h.loy = 80;
    toast(`🌱 ${k.name}, child of ${k.parents[0]} and ${k.parents[1]}, has grown up and joined the guild!`); chron(`🌱 ${k.name} grew up and joined the guild.`); sfx('goal');
  }
}
// ---- challenge dives: a daily seeded dive, Boss Rush (a boss every floor, double pay) and Hardcore (no rescue, +50% gold)
const dailySeed = () => { let h = 7; for (const c of dayKey()) h = (h * 31 + c.charCodeAt(0)) % 1000003; return h * 977 + 13; };
function challengeDone(q) {
  const f = G.flags, C = (f.chal ||= { daily: {}, rush: 0, hard: 0 }), n = q.cleared, key = dayKey();
  if (q.mode === 'rush') { C.rush = Math.max(C.rush, n); }
  else if (q.mode === 'hard') { C.hard = Math.max(C.hard, n); }
  else if (q.mode === 'daily') {
    const D = C.daily; if (D.key !== key) { C.daily = { key, best: 0, claimed: false }; }
    C.daily.best = Math.max(C.daily.best, n);
    if (!C.daily.claimed && n >= 3) { C.daily.claimed = true; const g = 80 * n; G.gold += g; if (n >= 10) G.rare.mythril += 1; toast(`📅 Daily Dive bonus: +${g}g${n >= 10 ? ' and a Mythril shard' : ''}!`); chron(`📅 Daily Dive: reached floor ${n}.`); }
  }
  if (q.mode !== 'daily' && n >= 5) { const g = (q.rush ? 60 : 40) * n; G.gold += g; toast(`🏅 ${q.name} reward: +${g}g (floor ${n}).`); }
}
// limited-time calendar events (real dates): a small bonus while they last
const CAL = [
  { id: 'spring', icon: '🌸', name: 'Spring Fair', desc: 'Quest gold +10%.', m: 4, d1: 1, d2: 14, mul: 1.1 },
  { id: 'summer', icon: '🏖', name: 'Summer Games', desc: 'Quest gold +10%.', m: 7, d1: 1, d2: 14, mul: 1.1 },
  { id: 'harvest', icon: '🎃', name: 'Harvest Night', desc: 'Quest gold +15%.', m: 10, d1: 24, d2: 31, mul: 1.15 },
  { id: 'winter', icon: '🎄', name: 'Winter Festival', desc: 'Quest gold +15%.', m: 12, d1: 18, d2: 31, mul: 1.15 },
  { id: 'newyear', icon: '🎆', name: 'New Year', desc: 'Quest gold +15%.', m: 1, d1: 1, d2: 7, mul: 1.15 },
];
const calEvent = () => { const d = new Date(), m = d.getMonth() + 1, dd = d.getDate(); return CAL.find(c => c.m === m && dd >= c.d1 && dd <= c.d2) || null; };
// ---- festivals: once per season the villagers offer to hold one; it costs gold and pays back in town reputation and mood
const festCost = lavish => Math.round((lavish ? 300 : 100) * (1 + 0.5 * G.rank));
const FEST = [{ name: 'Blossom Fair', icon: '🌸' }, { name: 'Midsummer Games', icon: '🏅' }, { name: 'Harvest Feast', icon: '🍂' }, { name: 'Lantern Night', icon: '🏮' }];
const confetti = (() => {
  const n = 160, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), C = [0xff6a6a, 0xffd24a, 0x6ad8ff, 0x9bff9b, 0xff9aff];
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 8; pos[i * 3 + 1] = Math.random() * 5; pos[i * 3 + 2] = (Math.random() - 0.5) * 8; const c = new THREE.Color(C[i % 5]); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false })); pts.frustumCulled = false; pts.visible = false; pts.position.set(HALL.cx + 2.5, 0, HALL.cz + 4); scene.add(pts); return pts;
})();
function tickFestival(dt) {
  const f = G.flags, i = seasonIdx(), key = Math.floor((f.sT || 0) / SEASON_LEN), into = (f.sT || 0) % SEASON_LEN;
  if (f.fest) { f.fest.t -= dt; if (f.fest.t <= 0) { f.fest = null; hideBanner('feston'); toast('🎉 The festival is over. What a night!'); } }
  if (f.festPending !== undefined && f.festPending !== null && f.festPending !== key) f.festPending = null;   // the season moved on
  if (!f.fest && f.festOffer !== key && into >= 90 && G.buildings.length > 3) {
    f.festOffer = key; const pol = (f.pol && f.pol.fest) || 'ask';
    if (pol === 'ask') { f.festPending = key; toast(`📬 The villagers want to hold the ${FEST[i].name}!`); sfx('chime'); }
    else if (pol !== 'skip') { startFest(pol === 'lavish' ? 'L' : 'M'); }
  }
}
function startFest(kind) {
  const F = FEST[seasonIdx()], lavish = kind === 'L', cost = festCost(lavish); hideBanner('fest'); G.flags.festPending = null;
  if (G.gold < cost) return toast('Not enough gold.');
  G.gold -= cost; G.stats.fests = (G.stats.fests || 0) + 1; G.flags.fest = { name: F.name, t: lavish ? 60 : 40 }; repGain(lavish ? 6 : 2); if (lavish) G.renown += 2;
  for (const h of G.heroes) { h.happy = Math.min(100, h.happy + (lavish ? 25 : 10)); h.loy = Math.min(100, (h.loy ?? 60) + (lavish ? 5 : 2)); }
  chron(`${F.icon} The guild held the ${F.name}${lavish ? ' with great pomp' : ''}.`); sfx('goal'); showBanner('feston', `${F.icon} ${F.name} is on! Tavern meals pay 50% more.`, []);
}
function updateConfetti(rdt) {
  const on = !!G.flags.fest && !watching; confetti.visible = on; if (!on) return;
  const a = confetti.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - rdt * (0.7 + (i % 4) * 0.2); if (y < 0) y += 5; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(performance.now() / 700 + i) * rdt * 0.5); } a.needsUpdate = true;
}
// ---- personal stories, loyalty and conflict
const sub = (t, h) => t.replace(/\{n\}/g, h.name);
function applyFx(h, fx) {
  if (fx.loy) h.loy = Math.max(0, Math.min(100, (h.loy ?? 60) + fx.loy)); if (fx.happy) h.happy = Math.max(0, Math.min(100, h.happy + fx.happy)); if (fx.stamina) h.stamina = Math.max(0, Math.min(100, h.stamina + fx.stamina));
  if (fx.rep) repGain(fx.rep); if (fx.renown) G.renown += fx.renown; if (fx.gold) G.gold += fx.gold;
  if (fx.boon) { const b = (h.boon = h.boon || {}); for (const [k, v] of Object.entries(fx.boon)) { if (k === 'pw') b.pw = (b.pw || 1) * v; else b[k] = (b[k] || 0) + v; } }
  if (fx.title) h.title = fx.title; if (fx.chron) chron('📖 ' + sub(fx.chron, h));
}
// score a choice and take it (used by the story window and by the auto policy)
function choiceScore(c) { const f = c.fx; return (f.loy || 0) + (f.happy || 0) * 0.5 + (f.rep || 0) * 3 + (f.renown || 0) * 3 + (f.boon ? 6 : 0) + (f.title ? 4 : 0) + (f.stamina || 0) * 0.2; }
function bestChoice(ch) { let best = -1, bs = -1e9; ch.choices.forEach((c, i) => { if (c.cost && G.gold < c.cost) return; const sc = choiceScore(c); if (sc > bs) { bs = sc; best = i; } }); return best; }
function resolveHeroStory(h, i) {
  const ch = storyChapter(h), c = ch && ch.choices[i]; if (!c) return false; if (c.cost && G.gold < c.cost) { toast('Not enough gold.'); return false; } if (c.cost) G.gold -= c.cost;
  applyFx(h, c.fx); (h.marks = h.marks || []).push(c.label.replace(/ \(.*\)$/, '')); if (h.marks.length > 6) h.marks.shift(); chron(`📖 ${h.name}: ${c.label.replace(/ \(.*\)$/, '')}`);
  (G.flags.after = G.flags.after || []).push({ t: G.time + 90 + Math.random() * 90, hid: h.id, good: choiceScore(c) > 0 && Math.random() < 0.6 });
  h.arc.ch++; if (h.arc.ch >= ARCS[h.arc.id].ch.length) codexAdd('arcs', h.arc.id); G.stats.chapters = (G.stats.chapters || 0) + 1; sfx('goal'); toast(`📖 ${h.name}: ${(h.arc.ch >= ARCS[h.arc.id].ch.length ? 'their story reaches its end.' : 'the story goes on…')}`); return true;
}
function storyChapter(h) { const a = ARCS[h.arc && h.arc.id]; return a && h.arc.ch < a.ch.length ? a.ch[h.arc.ch] : null; }
let storyT = 6, stepT = 0; const notified = new Set();
function tickPeople(dt) {
  stepT += dt; storyT -= dt;
  if (stepT >= 5) {   // loyalty drifts with mood
    stepT = 0; for (const h of G.heroes) { const l = h.loy ?? 60; h.loy = Math.max(0, Math.min(100, l + (h.happy > 70 ? 0.5 : h.happy < 35 ? -1 : 0))); }
  }
  if (storyT > 0) return; storyT = 8;
  for (const h of G.heroes) {   // heroes who reached their next chapter wait in the inbox (one note each)
    const ch = storyChapter(h); if (!ch || h.level < ch.lv || h.state === 'quest') continue; const k = h.id + ':' + h.arc.ch;
    if (G.flags.pol && G.flags.pol.hstory === 'auto') { const i = bestChoice(ch); if (i >= 0) { const t = ARCS[h.arc.id].title; resolveHeroStory(h, i); toast(`📬 Auto-handled: ${h.name} — ${t}`); } } else if (!notified.has(k)) { notified.add(k); toast(`📬 ${h.name} has a story to tell.`); sfx('chime'); }
  }
  for (const a of (G.flags.after || []).filter(x => x.t <= G.time)) {   // the aftermath of an earlier choice arrives
    G.flags.after.splice(G.flags.after.indexOf(a), 1); const h = G.heroes.find(x => x.id === a.hid); if (!h) continue;
    if (a.good) { const g = 60 + 30 * G.rank; G.gold += g; h.loy = Math.min(100, (h.loy ?? 60) + 3); toast(`📨 Word from ${h.name}'s story: a grateful gift of ${g} gold.`); } else { h.loy = Math.max(0, (h.loy ?? 60) - 3); toast(`📨 ${h.name} is still brooding over the decision. (−3 loyalty)`); }
  }
  if (!G.flags.poach && Math.random() < 0.2) {   // a rival guild tries to hire a disloyal hero
    const h = G.heroes.find(x => (x.loy ?? 60) < 30 && x.state !== 'quest');
    if (h) { G.flags.poach = h.id; showBanner('poach', `📨 ${rivalName()} is trying to hire ${h.name}!`, [['Counter-offer (−200g)', 'poachPay', 'red'], ['Let them go', 'poachGo', '']]); }
  }
  for (const h of G.heroes.slice()) if ((h.loy ?? 60) <= 5 && h.state !== 'quest') { chron(`🚪 ${h.name} left the guild for good.`); return removeHero(h, `🚪 ${h.name} lost faith in the guild and left.`); }
  if (Math.random() < 0.1) {   // two rivals quarrel
    const idle = G.heroes.filter(x => x.state !== 'quest' && x.state !== 'leaving'), pair = []; for (const a of idle) for (const [id, k] of Object.entries(a.bonds || {})) { const b = idle.find(x => x.id === +id); if (k === 'rival' && b && a.id < b.id) pair.push([a, b]); }
    if (pair.length) { const [a, b] = pick(pair); a.happy = Math.max(0, a.happy - 10); b.happy = Math.max(0, b.happy - 10); a.loy = Math.max(0, (a.loy ?? 60) - 2); b.loy = Math.max(0, (b.loy ?? 60) - 2); addAff(a, b, -5, true); floatText(a.pos, '💢', '#ff7a7a'); floatText(b.pos, '💢', '#ff7a7a'); toast(`💢 ${a.name} and ${b.name} had a loud quarrel.`); }
  }
}
// ---- weekly guild orders: three optional goals every 5 minutes; finish them for gold and renown (and a bonus for all three)
const WEEK_LEN = 300;
const WK = [
  { id: 'quests', text: n => `Complete ${n} quests`, val: () => G.questsDone, n: [4, 6, 8], w: 3 },
  { id: 'elite', text: n => `Win ${n} Elite quest${n > 1 ? 's' : ''}`, val: () => G.stats.elite || 0, n: [1, 2, 2], w: 1.5, ok: () => G.renown >= 3 },
  { id: 'town', text: n => `Help the villagers ${n} time${n > 1 ? 's' : ''}`, val: () => G.stats.town || 0, n: [1, 2, 3], w: 2, ok: () => residents.length > 0 },
  { id: 'orders', text: n => `Deliver ${n} trade order${n > 1 ? 's' : ''}`, val: () => G.stats.orders || 0, n: [1, 2, 2], w: 1.5, ok: () => !!first('market') || G.renown >= 4 },
  { id: 'reinf', text: n => `Reinforce gear ${n} time${n > 1 ? 's' : ''}`, val: () => G.stats.reinf || 0, n: [1, 2, 3], w: 1.5, ok: () => !!first('forge') && G.heroes.some(h => (h.plus || 0) < maxPlus()) },
  { id: 'chapters', text: n => `Hear ${n} hero stor${n > 1 ? 'ies' : 'y'}`, val: () => G.stats.chapters || 0, n: [1, 2, 3], w: 1.5, ok: () => G.heroes.some(h => storyChapter(h)) },
  { id: 'train', text: n => `Finish ${n} training session${n > 1 ? 's' : ''}`, val: () => G.stats.train || 0, n: [1, 1, 2], w: 1, ok: () => !!first('training') },
  { id: 'raid', text: n => `Repel ${n} raid${n > 1 ? 's' : ''}`, val: () => G.stats.raidsWon || 0, n: [1, 1, 2], w: 0.6, ok: () => G.renown >= 6 },
];
function newWeek() {
  const lvl = Math.min(2, G.rank), pool = WK.filter(t => !t.ok || t.ok()), picks = [];
  while (picks.length < 3 && pool.length) { const tot = pool.reduce((a, t) => a + t.w, 0); let r = Math.random() * tot, i = 0; for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; } picks.push(pool.splice(i, 1)[0]); }
  G.flags.wk = { t: WEEK_LEN, goals: picks.map(t => ({ id: t.id, need: t.n[lvl], base: t.val(), done: 0 })), claimed: 0 };
}
function tickWeekly(dt) {
  if (!G.flags.tutDone || G.questsDone < 2) return;
  if (!G.flags.wk) newWeek(); const w = G.flags.wk; w.t -= dt;
  for (const g of w.goals) { const t = WK.find(x => x.id === g.id); if (!g.done && t.val() - g.base >= g.need) { g.done = 1; const gold = 200 + 150 * G.rank; G.gold += gold; G.renown += 1; w.claimed++; sfx('goal'); toast(`📅 Weekly order done: ${t.text(g.need)} (+${gold}g, +1⭐)`); chron(`📅 ${t.text(g.need)}`); } }
  if (w.claimed === w.goals.length && !w.bonus && w.goals.length) { w.bonus = 1; const gold = 400 + 300 * G.rank; G.gold += gold; if (G.rank >= 1) G.rare.mythril++; toast(`📅 All weekly orders done! +${gold}g${G.rank >= 1 ? ' and a Mythril shard' : ''}`); }
  if (w.t <= 0) { if (w.claimed < w.goals.length) toast('📅 The week ended. New orders are posted.'); newWeek(); }
}
let wkHtml = '';
function renderWeekly() {
  const el = $('weekly'), w = G.flags.wk; if (!w) { el.innerHTML = ''; return; }
  const m = Math.floor(Math.max(0, w.t) / 60), sec = String(Math.floor(Math.max(0, w.t) % 60)).padStart(2, '0');
  const html = `<h4 style="margin-top:6px">📅 Weekly orders <span style="font-weight:400;opacity:.8">${m}:${sec}</span></h4><ul>` + w.goals.map(g => { const t = WK.find(x => x.id === g.id), have = Math.min(g.need, t.val() - g.base); return `<li class="${g.done ? 'done' : ''}">${g.done ? '☑' : '☐'} ${t.text(g.need)} (${have}/${g.need})</li>`; }).join('') + '</ul>';
  if (html !== wkHtml) { wkHtml = html; el.innerHTML = trHtml(html); }
}
function inboxItems() {
  const out = [], st = STORIES.find(x => x.id === G.flags.pending); if (G.flags.login && G.flags.login.pending) out.push({ icon: '🎁', title: 'Daily reward', sub: `Day ${G.flags.login.streak} of 7 is waiting.`, act: 'dailyopen' });
  for (const id of evq()) out.push({ icon: EVENTS[id].icon, title: EVENTS[id].title, sub: 'A decision awaits.', act: 'eventopen' });
  if (st) out.push({ icon: '📖', title: st.title, sub: 'A decision awaits.', act: 'openStory' });
  for (const h of G.heroes) { const ch = storyChapter(h); if (ch && h.level >= ch.lv && h.state !== 'quest') out.push({ icon: '🗣', title: `${h.name}: ${ARCS[h.arc.id].title}`, sub: `Chapter ${h.arc.ch + 1} is ready.`, act: 'hstoryopen', id: h.id }); }
  if (G.flags.festPending !== undefined && G.flags.festPending !== null) out.push({ icon: FEST[seasonIdx()].icon, title: FEST[seasonIdx()].name, sub: 'The villagers are waiting for your answer.', act: 'festinbox' });
  return out;
}
const SCENE = {
  friend: { e: ['🤝', '😄'], a: ['Care to share a table?', 'Good to see you!'], b: ['Always!', 'Pull up a chair.'] },
  sweet: { e: ['💘', '💕'], a: ['You look lovely today.', 'Walk with me?'], b: ['You always say that…', 'Of course.'] },
  rival: { e: ['⚡', '💢'], a: ['Think you can keep up?', 'I saw how you fought.'], b: ['Try me.', 'Lucky shot.'] },
  mentor: { e: ['🎓', '📖'], a: ['Keep your guard up.', 'Again, from the start.'], b: ['Yes, teacher!', 'I think I understand.'] },
};
SCENE.apprentice = { e: SCENE.mentor.e.slice().reverse(), a: SCENE.mentor.b, b: SCENE.mentor.a };
let chatT = 12, saveBuf = '';
// what a hero likes and dislikes: a liked building in the guild or a liked season lifts the mood, a disliked season lowers it
const likeDelta = h => { let d = 0; const L = h.likes || {}, D = h.dislikes || {}, s = seasonIdx(); if (L.bld && first(L.bld)) d += 0.04; if (L.season === s) d += 0.05; if (D.season === s) d -= 0.05; return d; };
// ---- town squares: a fountain, statue or monument with at least three working buildings around it (within 7 tiles) forms a lively square
let sqKey = '', sqVal = 0;
function squares() {
  const k = G.buildings.length + ':' + moveVer; if (k === sqKey) return sqVal; sqKey = k;
  const work = G.buildings.filter(b => !BUILDINGS[b.type].decor), c = b => [b.cx + b.w / 2, b.cz + b.d / 2];
  sqVal = Math.min(3, G.buildings.filter(b => ['fountain', 'statue', 'monument'].includes(b.type)).filter(b => { const [x, z] = c(b); return work.filter(w => { const [wx, wz] = c(w); return Math.hypot(wx - x, wz - z) <= 7; }).length >= 3; }).length);
  return sqVal;
}
// ---- gold sinks for heroes: reinforce gear at the forge (+5% power per step) and intensive training at the training grounds
const forgeLv = () => ofType('forge').reduce((m, b) => Math.max(m, b.level), 0);
const maxPlus = () => Math.min(5, forgeLv() + 1);
const plusCost = h => ({ gold: Math.round(100 * Math.pow(1.7, h.plus || 0)), ore: 4 * ((h.plus || 0) + 1), ing: (h.plus || 0) >= 3 ? (h.plus || 0) - 2 : 0 });
const trainCost = h => 100 + 50 * h.level;
const decorBonus = () => Math.min(0.55, (first('memorial') ? 0.03 : 0) + landmarkGroup.children.length * 0.01 + Math.min(3, ofType('hill').length) * 0.02 + squares() * 0.02 + Math.min(3, ofType('pond').length) * 0.05 + 0.01 * Math.min(10, ofType('flowers').length + ofType('sapling').length) + (first('monument') ? 0.1 : 0) + 0.02 * Math.min(3, ofType('well').length) + 0.05 * (ofType('fountain').length + ofType('banner').length + ofType('statue').length) + 0.01 * Math.min(10, ofType('lamp').length + ofType('campfire').length));
function tickChat(dt) {
  chatT -= dt; if (chatT > 0) return; chatT = 40 + Math.random() * 50;
  const c = G.heroes.filter(h => h.state !== 'quest' && h.state !== 'leaving' && h.mesh.visible); if (!c.length) return; const h = pick(c);
  if (Math.random() < 0.4) {   // two bonded heroes meet in the guild: a little scene (emoji, a line, a bit more affinity)
    const pairs = []; for (const a of c) for (const [id, k] of Object.entries(a.bonds || {})) { const b = c.find(x => x.id === +id); if (b && a.id < b.id) pairs.push([a, b, k]); }
    if (pairs.length) {
      const [a, b, k] = pick(pairs), L = SCENE[k] || SCENE.friend; floatText(a.pos, L.e[0] + ' ' + tr(pick(L.a)), '#fff'); floatText(b.pos, L.e[1] + ' ' + tr(pick(L.b)), '#fff'); addAff(a, b, k === 'rival' ? 0.6 : 1.2, true); return;
    }
  }
  if (h.bio && Math.random() < 0.25) return floatText(h.pos, '“' + tr(h.bio[1]) + '”', '#fff');
  const pool = [...CHAT.any, ...(CHAT[h.cls] || []), ...(h.tags || []).flatMap(t => (TAGS[t] ? TAGS[t].chat : [])), ...(h.stamina < 40 ? CHAT.tired : []), ...(h.happy < 35 ? CHAT.unhappy : []), ...(traitOf(h) ? CHAT[traitOf(h)] || [] : [])];
  floatText(h.pos, '“' + tr(pick(pool)) + '”', '#fff');
}
// ---- guild chronicle: a short diary of the big moments
const chron = text => { const c = (G.flags.chron ||= []); c.push({ d: Math.floor(G.time / 60) + 1, t: text }); if (c.length > 80) c.shift(); };
// ---- the legend: after reaching Fortress, three escalating special quests end with the Ember Colossus
const LEGEND = [
  { name: 'The Ember Peak Omen', type: 'arcane', minH: 2, mods: ['elite'], goldMul: 2 },
  { name: 'Embers in the Mines', type: 'combat', minH: 3, mods: ['elite', 'hoard'], goldMul: 2.5 },
  { name: 'Slay the Ember Colossus', type: 'arcane', minH: 3, mods: ['elite', 'bounty'], goldMul: 4 },
];
function legendTick() {
  const st = G.flags.legend || 0; if (G.rank < 3 || st >= 3 || G.quests.some(q => q.legend)) return;
  const L = LEGEND[st], q = makeQuest({ type: L.type, minH: L.minH, mods: L.mods, name: L.name, special: true, goldMul: L.goldMul }); q.legend = st + 1; q.diff *= 1 + 0.3 * st;
  toast(`🐉 A legendary quest awaits: ${L.name}`); if (st === 0) chron('🐉 Whispers of the Ember Colossus reached the guild.');
}
function legendWon(q) {
  G.flags.legend = q.legend; chron(`🐉 ${q.name} — done.`);
  if (q.legend >= 3) { G.gold += 5000; G.renown += 20; G.rare.mythril += 3; G.flags.legendDone = 1; chron('🏆 The Ember Colossus fell. The guild became a legend.'); sfx('goal'); openModal('legend'); }
  else toast(`🐉 The legend deepens… (${q.legend}/3)`);
}
function rankUp() {
  if (G.rank >= 3) return; const r = G.rank + 1, reqs = rankReqs(r);
  if (!reqs.every(x => x[0])) return toast('Requirements for the next rank are not met yet.');
  const q = RANKS[r].req; G.gold -= q.gold; if (q.wood) G.wood -= q.wood; if (q.ore) G.ore -= q.ore; if (q.rare) spendRare(q.rare);
  chron(`${RANKS[r].icon} The guild became a ${RANKS[r].name}.`); G.rank = r; floatText(G.buildings[0].door, `${RANKS[r].icon} ${RANKS[r].name}!`, '#ffd24a'); toast(`${RANKS[r].icon} The guild is now a ${RANKS[r].name}! ${RANKS[r].perks}`);
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
  { const S = SEASONS[seasonIdx()]; $('hSeason').textContent = S.icon + ' ' + tr(S.name); $('seasonPill').title = tr(S.desc); }
  renderWeekly();
  { const n = inboxItems().length, el = $('hInbox'); if (el.textContent !== String(n)) { el.textContent = n; $('inboxPill').classList.toggle('new', n > 0); } }
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
      const pv = pavable(), pvCost = pv.length * BUILDINGS.road.cost, sq = squares();
      const all = Object.entries(BUILDINGS).filter(([k]) => k !== 'hall');
      return ['🔨 Build Menu', `<div class="row" style="border-color:#b58a56"><div style="font-size:30px">🛤</div><div class="grow"><div class="t">Pave worn paths</div><div class="s">${pv.length ? `${pv.length} well-trodden tiles can be paved with cobbles: ${pvCost}g` : 'No well-trodden paths yet — your streets form where people walk.'}</div><div class="s">🏛 Town squares: ${sq}/3 active (a fountain, statue or monument with 3 buildings nearby: +3% quest gold, +2% mood each)</div></div><button class="act" data-act="pave" ${pv.length && G.gold >= pvCost ? '' : 'disabled'}>Pave</button></div>` + '<div class="sec">Facilities</div>' + all.filter(([, t]) => !t.decor).map(row).join('') + '<div class="sec">Outpost Props & Minor Facilities</div>' + all.filter(([, t]) => t.decor).map(row).join('')];
    }
    case 'quests': {
      const rd = readyHeroes();
      const open = G.quests.filter(q => q.state === 'open'), act = G.quests.filter(q => q.state === 'active');
      const tired = G.heroes.filter(x => x.state !== 'quest' && x.state !== 'leaving' && x.stamina < 45);
      let h = (tired.length >= 2 && open.length && Ads.canShow('restGuild') ? `<div class="row" style="border-color:#ffd24a"><div class="grow"><div class="t">😴 ${tired.length} heroes are too tired to go out</div><div class="s">Watch a short ad to rest them all to full stamina.</div></div><button class="act" data-act="adrest">▶ Rest everyone</button></div>` : '') + `<div class="s">Ready heroes (geared & rested): <b>${rd.length}</b> / ${G.heroes.length} · 🏘 Town: <b>${REP_NAMES[repLevel()]}</b> (${Math.round(G.flags.rep ?? 10)}/100)</div>`;
      h += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0"><button class="act" data-act="sendall">▶ Send all possible</button><button class="act ${G.flags.autoQ ? '' : 'red'}" data-act="autoq">${G.flags.autoQ ? '⏱ Auto-send: ON' : '⏱ Auto-send: OFF'}</button>${G.flags.autoQ ? `<button class="act red" data-act="automin">min ${G.flags.autoMin || 60}%</button>` : ''}</div>`;
      if (first('portal')) {
        const dq = G.quests.find(q => q.dive);
        h += `<div class="sec">Waystone Portal</div><div class="row" style="border-color:#b070ff"><div style="font-size:30px">🌀</div><div class="grow"><div class="t">Endless Dive</div><div class="s">Send 2–4 geared heroes through the portal. Floors get harder forever: <b>recall to bank your loot</b> or fight on for rare materials (💎 🐉 🪶). Loot is banked automatically every 5 floors; a wipe-out loses what is unbanked. Best: floor ${G.diveBest}.</div></div><button class="act" data-act="dive" ${dq || rd.length < 2 ? 'disabled' : ''}>${dq ? 'In progress' : (rd.length < 2 ? 'Need 2 ready' : 'Dive!')}</button></div>`;
        { const C = G.flags.chal || { daily: {}, rush: 0, hard: 0 }, dd = C.daily.key === dayKey() ? C.daily : { best: 0, claimed: false }, off = dq || rd.length < 2 ? 'disabled' : '', ce = calEvent();
          h += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0"><button class="act red" data-act="dive" data-m="daily" ${off}>📅 Daily Dive (best ${dd.best}${dd.claimed ? ' ✔' : ''})</button><button class="act red" data-act="dive" data-m="rush" ${off}>👹 Boss Rush (best ${C.rush})</button><button class="act red" data-act="dive" data-m="hard" ${off}>💀 Hardcore (best ${C.hard})</button></div><div class="s">Daily: the same dungeon for everyone today; first run to floor 3+ earns a bonus. Boss Rush: a boss every floor, double pay. Hardcore: no rescue, +50% gold.</div>`;
          if (ce) h += `<div class="s" style="color:#ffd24a">${ce.icon} ${ce.name}: ${ce.desc}</div>`; }
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
      if (retired().length || kids().length) h += `<div class="sec">Retired veterans & family</div>` + retired().map(r => `<div class="row"><div style="font-size:24px">${RETIRE[r.role][0]}</div><div class="grow"><div class="t">${r.name} <span class="tag">${RETIRE[r.role][1]}</span></div><div class="s">Level ${r.level} ${r.cls} · ${RETIRE[r.role][2]}</div></div></div>`).join('') + kids().map(k => `<div class="row"><div style="font-size:24px">👶</div><div class="grow"><div class="t">${k.name}</div><div class="s">Child of ${k.parents[0]} and ${k.parents[1]} · grows up in ${Math.max(0, Math.ceil((k.grow - G.time) / 60))} min</div></div></div>`).join('');
      return ['🛡️ Recruit & Staff', h];
    }
    case 'research': return ['⚗️ Research', Object.entries(TECHS).map(([k, [n, d, c, req]]) => `<div class="row"><div class="grow"><div class="t">${n}</div><div class="s">${d}</div>${cost(c)}${rareTags(req)}</div>
        ${G.research[k] ? '<span class="tag">✔ Researched</span>' : `<button class="act" data-act="research" data-k="${k}" ${G.gold < c || !hasRare(req) ? 'disabled' : ''}>Research</button>`}</div>`).join('')];
    case 'settings': return ['⚙ Settings & Save', `
      <div class="row"><div class="grow"><div class="t">🔊 Sound</div><div class="s">Procedural sound effects and music (no downloads).</div></div><button class="act ${getPrefs().sfx ? '' : 'red'}" data-act="sfxtoggle">Effects: ${getPrefs().sfx ? 'On' : 'Off'}</button><button class="act ${getPrefs().music ? '' : 'red'}" data-act="musictoggle">Music: ${getPrefs().music ? 'On' : 'Off'}</button></div>
      <div class="row"><div class="grow"><div class="t">🌐 Language</div><div class="s">English / 한국어</div></div>${Object.entries(LANGS).map(([k, n]) => `<button class="act ${getLang() === k ? '' : 'red'}" style="${getLang() === k ? 'outline:2px solid #fff8' : ''}" data-act="lang" data-l="${k}">${n}</button>`).join('')}</div>
      ${IAP.available ? `<div class="row"><div class="grow"><div class="t">🛒 Shop</div><div class="s">Remove the banner, or a one-time starter pack.</div></div><button class="act" data-act="shop">Open</button></div>` : ''}
      <div class="row"><div class="grow"><div class="t">📺 Rewarded ads</div><div class="s">Optional offers: double a quest's loot, rest tired heroes, rescue a wiped dive. Never forced.</div></div><button class="act ${Ads.enabled ? '' : 'red'}" data-act="adstoggle">${Ads.enabled ? 'On' : 'Off'}</button></div>
      <div class="row"><div class="grow"><div class="t">🎚 Graphics</div><div class="s">Auto lowers the resolution when the game runs slowly. Low turns shadows off for the smoothest play.</div></div><button class="act red" data-act="gfxcycle">${{ auto: 'Auto', high: 'High', low: 'Low' }[gfx]}</button></div>
      <div class="row"><div class="grow"><div class="t">🛤 Auto paths</div><div class="s">Link every new building to the street network with a short cobble path (a few coins).</div></div><button class="act ${G.flags.noAutoRoad ? 'red' : ''}" data-act="autoroadtoggle">${G.flags.noAutoRoad ? 'Off' : 'On'}</button></div>
      <div class="row"><div class="grow"><div class="t">📂 Save slots & export</div><div class="s">Three extra slots, plus copy/paste a save between devices.</div></div><button class="act" data-act="saveio">Open</button></div>
      <div class="row"><div class="grow"><div class="t">🏛 Legacy</div><div class="s">Generation ${LEGACY.gen + 1} · ${LEGACY.lp} Legacy Points. Pass the guild to an heir for permanent perks.</div></div><button class="act" data-act="legacy">Open</button></div>
      <div class="row"><div class="grow"><div class="t">📚 Codex & achievements</div><div class="s">Bosses, relics, classes and personalities you have met, and medals to earn.</div></div><button class="act" data-act="codex">Open</button></div>
      <div class="row"><div class="grow"><div class="t">📖 Guild Chronicle</div><div class="s">The diary of your guild's big moments.</div></div><button class="act" data-act="chron">Open</button></div>
      <div class="row"><div class="grow"><div class="t">🔔 Notifications</div><div class="s">Alert when a quest ends or a raid arrives while the game is in the background (browser only; needs permission).</div></div><button class="act ${G.flags.notif ? '' : 'red'}" data-act="notiftoggle">${G.flags.notif ? 'On' : 'Off'}</button></div>
      <div class="row"><div class="grow"><div class="t">🧍 Characters</div><div class="s">Body style. Rigged bodies use motion-capture clips (walk, run, sword, bow, magic, heal). Changing it reloads the game (progress is saved).</div></div>${Object.entries(CHAR_STYLES).map(([k, n]) => `<button class="act ${charStyle === k ? '' : 'red'}" style="${charStyle === k ? 'outline:2px solid #fff8' : ''}" data-act="cstyle" data-s="${k}">${n}</button>`).join('')}</div>
      <div class="row"><div class="grow"><div class="t">💾 Save</div><div class="s">The game autosaves every 15 seconds and when you leave. Last save: ${lastSaved ? Math.round((Date.now() - lastSaved) / 1000) + 's ago' : 'not yet'}.</div></div><button class="act" data-act="save">Save now</button></div>
      <div class="row"><div class="grow"><div class="t">🎓 Tutorial</div><div class="s">Show the first-run guide again.</div></div><button class="act" data-act="tutorial">Replay</button></div>
      <div class="row"><div class="grow"><div class="t">🗑 New game</div><div class="s">${modalArg === 'confirm' ? '<b style="color:#ff9a9a">This erases your saved guild. Tap again to confirm.</b>' : 'Delete the save and start a fresh guild.'}</div></div><button class="act red" data-act="newgame">${modalArg === 'confirm' ? 'Really erase' : 'New game'}</button></div>
      <div class="s" style="margin-top:8px">Quests keep running for up to 10 minutes while you are away.</div>
      <div class="sec">✝ Hall of the Fallen</div>${G.fallen.length ? [...G.fallen].reverse().slice(0, 12).map(f => `<div class="s">${f.vip ? '⭐ ' : ''}<b>${f.name}</b> — level ${f.level} ${f.cls}, ${f.quests} expeditions; ${f.deed} (day ${f.day})</div>`).join('') : '<div class="s">No heroes have fallen. Yet.</div>'}`];
    case 'saveio': {  // (saveBuf keeps the text across the window's refreshes)
      const slot = n => { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY + '-s' + n) || 'null'); return d ? `${d.g.gold ? Math.round(d.g.gold) : 0}g · ${d.heroes.length} heroes · ${new Date(d.savedAt).toLocaleString()}` : 'empty'; } catch (e) { return 'empty'; } };
      let h = '<div class="s">Keep up to three extra copies of your guild, or move a save to another device by copying the text below.</div>';
      for (const n of [1, 2, 3]) h += `<div class="row"><div class="grow"><div class="t">Slot ${n}</div><div class="s">${slot(n)}</div></div><button class="act" data-act="slotsave" data-n="${n}">Save here</button><button class="act red" data-act="slotload" data-n="${n}">Load</button></div>`;
      h += `<div class="sec">Export / import</div><textarea id="saveText" rows="4" style="width:100%;box-sizing:border-box;font:11px monospace" placeholder="Press Export, or paste a save here and press Import">${saveBuf}</textarea><div style="display:flex;gap:6px;margin-top:6px"><button class="act" data-act="exportsave">Export</button><button class="act red" data-act="importsave">Import (replaces your guild)</button></div>`;
      return ['💾 Save slots', h];
    }
    case 'event': {
      const E = EVENTS[evq()[0]]; if (!E) { return ['📬 Event', '<div class="s">Nothing to decide.</div>']; }
      return [E.icon + ' ' + E.title, `<div class="s" style="line-height:1.5;margin-bottom:8px">${E.text}</div>` + E.ch.map((c, i) => `<div class="row"><div class="grow"><div class="t">${c.label}</div></div><button class="act" data-act="eventchoose" data-i="${i}" ${c.ok && !c.ok() ? 'disabled' : ''}>Choose</button></div>`).join('')];
    }
    case 'shop': {
      let h = '<div class="s">Optional purchases that support the game. Nothing here is needed to play, and none of it makes the game easier to win.</div>';
      h += Object.entries(PRODUCTS).map(([id, P]) => { const have = IAP.owned(id), gone = id === 'starter_pack' && G.flags.starter; return `<div class="row"><div style="font-size:30px">${P.icon}</div><div class="grow"><div class="t">${P.name}</div><div class="s">${P.desc}</div></div>${have || gone ? '<span class="tag">✔ Owned</span>' : `<button class="act" data-act="iapbuy" data-id="${id}" ${IAP.available ? '' : 'disabled'}>${IAP.price(id)}</button>`}</div>`; }).join('');
      h += IAP.available ? '' : '<div class="s">Purchases are not available right now (they need the Android app and a connection).</div>';
      return ['🛒 Shop', h];
    }
    case 'daily': {
      const L = G.flags.login || { streak: 1, pending: 0 };
      let h = `<div class="s">Come back every day for a bigger reward. Missing a day starts the track over.</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin:8px 0">` + DAILY.map((r, i) => { const rw = dailyReward(i), cur = i === L.streak - 1, done = i < L.streak - (L.pending ? 1 : 0); return `<div class="row" style="flex:1 1 90px;flex-direction:column;align-items:center;text-align:center;${cur ? 'border-color:#ffd24a;background:#ffd24a22' : ''}${done ? ';opacity:.55' : ''}"><div class="t">Day ${i + 1}</div><div class="s">${rw.gold}g${rw.ore ? '<br>+' + rw.ore + ' ore' : ''}${rw.herbs ? '<br>+' + rw.herbs + ' herbs' : ''}${rw.wood ? '<br>+' + rw.wood + ' wood' : ''}${rw.mana ? '<br>+' + rw.mana + ' mana' : ''}${rw.mythril ? '<br>+1 💎' : ''}</div>${done ? '✔' : ''}</div>`; }).join('') + '</div>';
      h += L.pending ? `<button class="act" data-act="dailyclaim">🎁 Claim day ${L.streak}</button>` : '<div class="s">Today\'s reward is already claimed. See you tomorrow!</div>';
      return ['🎁 Daily reward', h];
    }
    case 'inbox': {
      const items = inboxItems(), pol = G.flags.pol || {}, POL = { hstory: ['Hero stories', { ask: 'Ask me', auto: 'Auto: best choice' }], story: ['Guild events', { ask: 'Ask me', auto: 'Auto: first option' }], fest: ['Festivals', { ask: 'Ask me', modest: 'Auto: modest', lavish: 'Auto: lavish', skip: 'Skip them' }] };
      const R = G.flags.rival, me = ourFame(), tot = Math.max(1, me + (R ? R.fame : 0)), card = R ? `<div class="row" style="border-color:#ff6a6a"><div style="font-size:26px">⚔</div><div class="grow"><div class="t">Rival: ${R.name}</div><div class="s">Fame — you ${Math.round(me)} vs them ${Math.round(R.fame)} · next town comparison in ${Math.max(0, Math.ceil(R.t / 60))} min · record ${R.wins}–${R.losses}</div><div class="bar"><i style="width:${me / tot * 100}%;background:#5be35b"></i></div></div></div>` : '';
      let h = card + (items.length ? items.map(x => `<div class="row"><div style="font-size:26px">${x.icon}</div><div class="grow"><div class="t">${x.title}</div><div class="s">${x.sub}</div></div><button class="act" data-act="${x.act}" ${x.id ? `data-id="${x.id}"` : ''}>Open</button></div>`).join('') : '<div class="s">Nothing is waiting for you. Enjoy the quiet.</div>');
      h += '<div class="sec">When something arrives…</div>' + Object.entries(POL).map(([k, [n, opts]]) => `<div class="row"><div class="grow"><div class="t">${n}</div></div><button class="act red" data-act="polcycle" data-k="${k}">${opts[pol[k] || 'ask']}</button></div>`).join('');
      return ['📬 Inbox', h];
    }
    case 'fest': { const F = FEST[seasonIdx()]; return [F.icon + ' ' + F.name, `<div class="s" style="line-height:1.5">The villagers want to hold the ${F.name}. A festival lifts everyone's mood, raises the town's opinion of the guild, and tavern meals pay 50% more while it lasts.</div><div style="display:flex;gap:6px;margin-top:8px"><button class="act red" data-act="festL">Lavish (−${festCost(true)}g)</button><button class="act" data-act="festM">Modest (−${festCost(false)}g)</button><button class="act red" data-act="festS">Skip</button></div>`]; }
    case 'heroStory': {
      const h = G.heroes.find(x => x.id === modalArg), ch = h && storyChapter(h); if (!h || !ch) return ['', '<div class="s">No story to tell right now.</div>'];
      return ['📖 ' + ARCS[h.arc.id].title, `<div class="s" style="font-size:14px;line-height:1.5">${sub(tr(ch.text), h)}</div>` + ch.choices.map((c, i) => `<div class="row" style="border-color:#c9a0ff"><div class="grow"><div class="t">${sub(tr(c.label), h)}</div></div><button class="act" data-act="hstorypick" data-i="${i}" ${c.cost && G.gold < c.cost ? 'disabled' : ''}>Choose</button></div>`).join('')];
    }
    case 'resident': {
      const def = [...RESIDENTS, ...villagerDefs].find(x => x && x.id === modalArg); if (!def) return ['', ''];
      let h = `<div class="row"><div style="font-size:34px">${def.icon}</div><div class="grow"><div class="t">${def.name}</div><div class="s">${def.role}</div></div></div><div class="s" style="margin:6px 0">${def.bio}</div><div class="s" style="font-size:14px">“${def.lines[Math.floor(G.time / 20) % def.lines.length]}”</div>`;
      h += `<div class="s" style="margin-top:6px">🏘 Town reputation: <b>${REP_NAMES[repLevel()]}</b> (${Math.round(G.flags.rep ?? 10)}/100) — quest gold +${(0.2 * (G.flags.rep ?? 10)).toFixed(0)}%, heroes arrive ${(0.4 * (G.flags.rep ?? 10)).toFixed(0)}% faster. Do villagers’ requests to raise it.</div>`;
      if (def.hint) { const g = GOALS.map((x, i) => [x, i]).find(([, i]) => !G.goalsDone[i]); h += g ? `<div class="sec">Bram’s advice</div><div class="s">“You could try this: <b>${g[0][0]}</b>.”</div>` : '<div class="sec">Bram’s advice</div><div class="s">“You have done everything I have written down. Go write your own story.”</div>'; }
      return [def.icon + ' ' + def.name, h];
    }
    case 'relmap': {
      const hs = G.heroes.slice(0, 14), W = 340, H = 300, cx = W / 2, cy = H / 2, R = 108, pos = hs.map((x, i) => [cx + R * Math.cos(i / hs.length * 6.283 - 1.57), cy + R * Math.sin(i / hs.length * 6.283 - 1.57)]);
      const COL = { friend: '#5be35b', sweet: '#ff7ac8', mentor: '#8fd4ff', apprentice: '#8fd4ff', rival: '#e0503a' };
      let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:420px;background:#0003;border-radius:10px">`;
      hs.forEach((a, i) => hs.forEach((b, j) => { const k = (a.bonds || {})[b.id]; if (j > i && k) svg += `<line x1="${pos[i][0]}" y1="${pos[i][1]}" x2="${pos[j][0]}" y2="${pos[j][1]}" stroke="${COL[k]}" stroke-width="3" ${k === 'rival' ? 'stroke-dasharray="5 4"' : ''} opacity=".85"/>`; }));
      hs.forEach((a, i) => { svg += `<g><circle cx="${pos[i][0]}" cy="${pos[i][1]}" r="15" fill="#3a2a18" stroke="#e8c04a" stroke-width="2"/><text x="${pos[i][0]}" y="${pos[i][1] + 5}" text-anchor="middle" font-size="15">${CLASSES[a.cls].icon}</text><text x="${pos[i][0]}" y="${pos[i][1] + 30}" text-anchor="middle" font-size="9" fill="#fff">${a.name.split(' ')[0]}</text></g>`; });
      svg += '</svg>';
      return ['🕸 Relations map', `<div class="s">🟩 friends · 🩷 sweethearts · 🟦 mentor/apprentice · 🟥 rivals (dashed)</div>${svg}<button class="act" data-act="open" data-k="quests" style="margin-top:8px">Open Quest Board</button>`];
    }
    case 'legacy': {
      const gain = legacyGain(), ok = canInherit(), confirm = modalArg === 'confirm';
      let h = `<div class="s" style="line-height:1.5">When a guild reaches Fortress rank (or slays the Ember Colossus), you can <b>pass it on to an heir</b>: the guild starts over, but the family keeps its name. You earn Legacy Points for renown, codex entries and achievements, and spend them on permanent perks.</div><div class="row" style="border-color:#e8c04a"><div class="grow"><div class="t">Generation ${LEGACY.gen + 1} · Legacy Points: ${LEGACY.lp}</div></div></div><div class="sec">Family perks</div>`;
      h += Object.entries(PERKS).map(([k, P]) => { const l = legacyLvl(k), c = l + 1; return `<div class="row"><div style="font-size:26px">${P.icon}</div><div class="grow"><div class="t">${P.name} <span class="tag">Lv ${l}/5</span></div><div class="s">${P.desc}</div></div><button class="act" data-act="legbuy" data-k="${k}" ${l >= 5 || LEGACY.lp < c ? 'disabled' : ''}>${l >= 5 ? 'Max' : 'Buy · ' + c + ' LP'}</button></div>`; }).join('');
      h += `<div class="sec">Pass on the guild</div><div class="row" style="border-color:#ff9a4a"><div class="grow"><div class="t">Earn ${gain} Legacy Points</div><div class="s">${ok ? (confirm ? '<b style="color:#ff9a9a">This ends your current guild and starts a new one. Tap again to confirm.</b>' : 'Your current guild will be erased (a save slot copy is not made).') : 'Reach Fortress rank or defeat the Ember Colossus first.'}</div></div><button class="act red" data-act="inherit" ${ok ? '' : 'disabled'}>${confirm ? 'Confirm' : 'Pass it on'}</button></div>`;
      return ['🏛 Legacy', h];
    }
    case 'codex': {
      const cx = G.flags.codex || {}, got = (k, id) => (cx[k] || {})[id], ach = G.flags.ach || {};
      const chips = (arr, k, show) => arr.map(([id, label, icon]) => got(k, id) ? `<span class="tag" style="border-color:#9bff9b">${icon || ''} ${label}${show ? ' ×' + got(k, id) : ''}</span>` : `<span class="tag" style="opacity:.45">❔ ???</span>`).join(' ');
      let h = `<div class="sec">Bosses (${codexN('bosses')}/6)</div><div class="s">${chips(Object.entries(CODEX_BOSS).map(([id, n]) => [id, n, '👑']), 'bosses', true)}</div>`;
      h += `<div class="sec">Relics (${codexN('relics')}/8)</div><div class="s">${chips(Object.entries(RELICS).map(([id, r]) => [id, r.name, r.icon]), 'relics')}</div>`;
      h += `<div class="sec">Classes (${codexN('classes')}/6)</div><div class="s">${chips(Object.entries(CLASSES).map(([id, c]) => [id, c.label, c.icon]), 'classes')}</div>`;
      h += `<div class="sec">Personalities (${codexN('tags')}/12)</div><div class="s">${chips(Object.entries(TAGS).map(([id, t]) => [id, t.label, t.icon]), 'tags')}</div>`;
      h += `<div class="sec">Hero stories (${codexN('arcs')}/5)</div><div class="s">${chips(Object.entries(ARCS).map(([id, a]) => [id, a.title, '📖']), 'arcs')}</div>`;
      h += `<div class="sec">Achievements (${Object.keys(ach).length}/${ACHS.length})</div>` + ACHS.map(x => `<div class="row" style="${ach[x.id] ? 'border-color:#9bff9b' : 'opacity:.7'}"><div style="font-size:24px">${x.icon}</div><div class="grow"><div class="t">${x.name} ${ach[x.id] ? '✔' : ''}</div><div class="s">${x.desc}</div></div><div class="s">${x.rew.gold}g${x.rew.renown ? ' · ' + x.rew.renown + '⭐' : ''}</div></div>`).join('');
      return ['📚 Codex', h];
    }
    case 'chronicle': return ['📖 Guild Chronicle', (G.flags.chron || []).length ? [...G.flags.chron].reverse().map(c => `<div class="row"><div class="s" style="min-width:48px">Day ${c.d}</div><div class="grow"><div class="t" style="font-weight:400">${c.t}</div></div></div>`).join('') : '<div class="s">Nothing has been written yet. Great deeds will appear here.</div>'];
    case 'legend': return ['🏆 A Legend of the Realm', `<div class="s" style="font-size:14px;line-height:1.5">The Ember Colossus is no more. Bards in every tavern sing of your guild, and the kingdom sends its thanks: <b>+5000 gold, +20 renown, +3 Mythril</b>.<br><br>Your guild is a legend — but its story is not over. Keep building, keep exploring, and see how deep the Endless Dive goes.</div><button class="act" data-act="close" style="margin-top:10px">Continue</button>`];
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
      if (bondNames.length) body += `<div class="s" style="margin-top:6px">${bondNames.map(([x, k]) => (BOND_ICON[k] || '🤝 ') + x.name).join(' · ')} <span style="opacity:.7">(same party: friends +4%, sweethearts +6%, mentor +5%, rivals −5%)</span></div>`;
      if (G.heroes.length > 1) body += `<button class="act" data-act="relmap" style="margin:6px 0">🕸 Relations map</button>`;
      if (h.vow) body += `<div class="s" style="color:#ffb0b0">🗡 Has sworn to honour ${h.vow}.</div>`;
      if (tr) body += `<div class="row" style="border-color:#ffd24a"><div style="font-size:30px">${tr.icon}</div><div class="grow"><div class="t">VIP trait: ${tr.label}</div><div class="s">${tr.desc}</div></div></div>`;
      if (h.tags) { const L = h.likes || {}, D = h.dislikes || {}; body += `<div class="row"><div class="grow"><div class="t">Personality</div><div class="s">${h.tags.map(t => `<span class="tag" title="${TAGS[t].desc}">${TAGS[t].icon} ${TAGS[t].label}</span>`).join(' ')}</div><div class="s" style="margin-top:4px">${h.bio[0]}</div><div class="s" style="margin-top:4px">❤ Likes: ${L.type} quests · ${L.bld && BUILDINGS[L.bld] ? BUILDINGS[L.bld].name : ''} · ${SEASON_NAMES[L.season]} · ${L.food}</div><div class="s">💢 Dislikes: ${D.type} quests · ${SEASON_NAMES[D.season]}</div></div></div>`; }
      { const ch = storyChapter(h), A = ARCS[h.arc && h.arc.id], ready = ch && h.level >= ch.lv;
        body += `<div class="s" style="margin-top:6px">Loyalty ${Math.round(h.loy ?? 60)}${(h.loy ?? 60) >= 80 ? ' · devoted (+4% power)' : (h.loy ?? 60) <= 25 ? ' · restless (−4% power)' : ''}</div>${bar(h.loy ?? 60, '#ff9ac8')}`;
        if (A) body += `<div class="row" style="border-color:#c9a0ff"><div style="font-size:26px">📖</div><div class="grow"><div class="t">${A.title}${h.title ? ' · ' + h.title : ''}</div><div class="s">Chapter ${Math.min(h.arc.ch + 1, A.ch.length)}/${A.ch.length}${!ch ? ' · complete' : ready ? ' · ready' : ' · unlocks at level ' + ch.lv}</div></div>${ready && !h.vip ? '' : ''}${ready ? `<button class="act" data-act="hstoryopen" data-id="${h.id}">Read</button>` : ''}</div>`;
        if ((h.marks || []).length) body += `<div class="s" style="margin-top:4px">📜 Choices so far: ${h.marks.join(' · ')}</div>`; }
      body += `<div class="s" style="margin-top:6px">Experience ${h.xp}/${h.level + 1}</div>${bar(h.xp / (h.level + 1) * 100, '#8fd4ff')}
        <div class="s" style="margin-top:6px">Stamina ${Math.round(h.stamina)}</div>${bar(h.stamina, h.stamina < 45 ? '#e0503a' : '#5be35b')}
        <div class="s" style="margin-top:6px">Happiness ${Math.round(h.happy)}</div>${bar(h.happy, h.happy < 30 ? '#e0503a' : '#f0c040')}
        <div class="row"><div class="grow"><div class="t">Gear</div><div class="s">${h.gear ? '✔ ' + gearName(h) + ' gear equipped' : '✘ Needs ' + (usesLab(h.cls) ? 'potions from the Alchemical Lab' : 'a weapon from the Forge')}</div></div>
        <div class="grow"><div class="t">Power</div><div class="s">${heroPower(h, c.quest).toFixed(1)} on ${c.quest} quests</div></div></div>`;
      { const pc = plusCost(h), pl = h.plus || 0, mp = maxPlus(), canP = first('forge') && pl < mp && G.gold >= pc.gold && G.ore >= pc.ore && G.ingots >= pc.ing, tc = trainCost(h);
        body += `<div class="row"><div class="grow"><div class="t">⚒ Gear +${pl}/${mp}</div><div class="s">Each step: +5% power. ${first('forge') ? (pl >= mp ? 'Upgrade the Forge for more steps.' : `Next: ${pc.gold}g, ${pc.ore} ore${pc.ing ? ', ' + pc.ing + ' ingots' : ''}`) : 'Needs a Forge.'}</div></div><button class="act" data-act="reinforce" data-id="${h.id}" ${canP ? '' : 'disabled'}>Reinforce</button></div>`;
        body += `<div class="row"><div class="grow"><div class="t">🏋 Intensive training</div><div class="s">${h.train > 0 ? 'Training… ' + Math.ceil(h.train) + 's left' : first('training') ? `80 s of drills for ${tc}g — heroes in training cannot go on quests.` : 'Needs a Training Grounds.'}</div></div><button class="act" data-act="trainhero" data-id="${h.id}" ${first('training') && !(h.train > 0) && h.state !== 'quest' && G.gold >= tc ? '' : 'disabled'}>Train</button></div>`; }
      if (retireOk(h)) body += `<div class="sec">🏡 Retire (a veteran can stay as a resident)</div>` + Object.entries(RETIRE).map(([k, R]) => `<div class="row"><div style="font-size:24px">${R[0]}</div><div class="grow"><div class="t">${R[1]}</div><div class="s">${R[2]}</div></div><button class="act red" data-act="retire" data-id="${h.id}" data-k="${k}">Retire</button></div>`).join('');
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
      if (b.type === 'farm') h += `<div class="s">Grain: <b>${grain()}</b>/60</div>`;
      if (b.type === 'bakery') h += `<div class="s">Grain: ${grain()} · Bread: <b>${bread()}</b>/40</div>`;
      if (b.type === 'tavern' && bread() > 0) h += `<div class="s">🥖 Bread in stock: ${bread()} (meals pay 40% more)</div>`;
      if (SPEC[b.type]) {
        if (b.spec) { const S = SPEC[b.type][b.spec]; h += `<div class="s" style="color:#ffd24a;margin-top:4px">${S[0]} Specialization: <b>${S[1]}</b> — ${S[2]}</div>`; }
        else if (b.level >= 3) h += `<div class="sec">Choose a specialization (${specCost(b)}g, permanent)</div>` + Object.entries(SPEC[b.type]).map(([k, S]) => `<div class="row"><div style="font-size:24px">${S[0]}</div><div class="grow"><div class="t">${S[1]}</div><div class="s">${S[2]}</div></div><button class="act" data-act="spec" data-id="${b.id}" data-k="${k}" ${G.gold < specCost(b) ? 'disabled' : ''}>Choose</button></div>`).join('');
        else h += `<div class="s" style="opacity:.7">At level 3 this building can specialize.</div>`;
      }
      const uc = 150 * b.level + 100;
      if (['forge', 'alchemy', 'tavern', 'warehouse', 'smelter', 'lumber', 'farm', 'bakery'].includes(b.type)) h += `</div><button class="act" data-act="upBuilding" data-id="${b.id}" ${G.gold < uc || G.wood < 5 * b.level || b.level >= maxLevel() || !hasRare(upReq(b)) ? 'disabled' : ''}>${b.level >= maxLevel() ? (G.rank < 3 ? 'Raise guild rank' : 'Max level') : `Upgrade<br>${uc}g + ${5 * b.level}🪵 ${rareTags(upReq(b))}`}</button></div>`; else h += '</div></div>';
      if (b.type !== 'hall' && !t.walkable) h += `<button class="act red" data-act="moveB" data-id="${b.id}" style="margin:6px 0">🧭 Move building (free)</button>`;
      if (b.type === 'memorial') h += `<div class="sec">In memory</div>` + (G.fallen.length ? [...G.fallen].reverse().slice(0, 12).map(f => `<div class="s">${f.vip ? '⭐ ' : ''}<b>${f.name}</b> — level ${f.level} ${f.cls}; ${f.deed}</div>`).join('') : '<div class="s">No one has fallen yet.</div>');
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
  dive(d) { dispatchDive(d && d.m); },
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
  chron() { openModal('chronicle'); },
  relmap() { openModal('relmap'); },
  dailyopen() { openModal('daily'); },
  shop() { openModal('shop'); },
  spec(d) { const b = G.buildings.find(x => x.id === +d.id); if (!b || b.spec || b.level < 3 || !SPEC[b.type] || !SPEC[b.type][d.k] || G.gold < specCost(b)) return; G.gold -= specCost(b); b.spec = d.k; sfx('goal'); toast(`${SPEC[b.type][d.k][0]} ${BUILDINGS[b.type].name} became a ${SPEC[b.type][d.k][1]}!`); chron(`${SPEC[b.type][d.k][0]} The ${BUILDINGS[b.type].name} became a ${SPEC[b.type][d.k][1]}.`); renderModal(true); },
  retire(d) { const h = G.heroes.find(x => x.id === +d.id); if (h) retireHero(h, d.k); },
  eventopen() { openModal('event'); },
  eventchoose(d) { chooseEvent(+d.i); },
  async iapbuy(d) { const ok = await IAP.buy(d.id); if (!ok) return toast('The purchase was not completed.'); grantPurchase(d.id); renderModal(true); },
  dailyclaim() { const L = G.flags.login; if (!L || !L.pending) return; const r = dailyReward(L.streak - 1); G.gold += r.gold; G.ore += r.ore || 0; G.herbs += r.herbs || 0; G.wood += r.wood || 0; G.mana += r.mana || 0; G.rare.mythril += r.mythril || 0; L.pending = 0; sfx('goal'); toast(`🎁 Daily reward claimed: +${r.gold}g${r.mythril ? ' +1 Mythril' : ''}`); chron(`🎁 Day ${L.streak} reward`); },
  async adrest() { const ok = await Ads.show('restGuild'); if (!ok) return toast('The ad was not completed — no reward.'); let n = 0; for (const h of G.heroes) if (h.state !== 'quest' && h.state !== 'leaving' && h.stamina < 100) { h.stamina = 100; n++; floatText(h.pos, '✨', '#9bff9b'); } sfx('goal'); toast(`✨ ${n} heroes are rested and ready.`); renderModal(true); },
  adstoggle() { Ads.setEnabled(!Ads.enabled); },
  gfxcycle() { gfx = { auto: 'high', high: 'low', low: 'auto' }[gfx]; quality = gfx === 'low' ? 0.6 : 1; try { localStorage.setItem(GFX_KEY, gfx); } catch (e) { /* ignore */ } resize(); },
  codex() { openModal('codex'); },
  legacy() { openModal('legacy'); },
  legbuy(d) { const P = PERKS[d.k], l = legacyLvl(d.k), c = l + 1; if (!P || l >= 5 || LEGACY.lp < c) return; LEGACY.lp -= c; (LEGACY.perks ||= {})[d.k] = l + 1; saveLegacy(); sfx('goal'); toast(`🏛 ${P.name} is now level ${l + 1}.`); },
  inherit() { if (!canInherit()) return; if (modalArg !== 'confirm') { modalArg = 'confirm'; return; } LEGACY.lp += legacyGain(); LEGACY.gen++; saveLegacy(); try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } window.__noSave = true; location.reload(); },
  autoroadtoggle() { G.flags.noAutoRoad = G.flags.noAutoRoad ? 0 : 1; },
  pave() { const pv = pavable(), c = pv.length * BUILDINGS.road.cost; if (!pv.length || G.gold < c) return; G.gold -= c; pv.forEach(([x, z]) => addBuilding('road', x, z)); sfx('build'); toast(`🛤 Paved ${pv.length} tiles (−${c}g).`); },
  inbox() { openModal('inbox'); },
  polcycle(d) { const O = { hstory: ['ask', 'auto'], story: ['ask', 'auto'], fest: ['ask', 'modest', 'lavish', 'skip'] }[d.k]; if (!O) return; const p = (G.flags.pol = G.flags.pol || {}); p[d.k] = O[(O.indexOf(p[d.k] || 'ask') + 1) % O.length]; },
  reinforce(d) { const h = G.heroes.find(x => x.id === +d.id); if (!h || !first('forge') || (h.plus || 0) >= maxPlus()) return; const c = plusCost(h); if (G.gold < c.gold || G.ore < c.ore || G.ingots < c.ing) return toast('Not enough materials.'); G.gold -= c.gold; G.ore -= c.ore; G.ingots -= c.ing; h.plus = (h.plus || 0) + 1; G.stats.reinf = (G.stats.reinf || 0) + 1; floatText(h.pos, `⚒ +${h.plus}`, '#ffd24a'); sfx('build'); toast(`⚒ ${h.name}'s gear is now +${h.plus}.`); },
  trainhero(d) { const h = G.heroes.find(x => x.id === +d.id); if (!h || !first('training') || h.train > 0 || h.state === 'quest') return; const c = trainCost(h); if (G.gold < c) return toast('Not enough gold.'); G.gold -= c; h.train = 80; toast(`🏋 ${h.name} begins intensive training.`); },
  bannerx(d) { hideBanner(d.id); },
  festL() { startFest('L'); closeModal(); }, festM() { startFest('M'); closeModal(); }, festS() { G.flags.festPending = null; closeModal(); },
  festinbox() { openModal('fest'); },
  hstoryopen(d) { const id = d.id ? +d.id : G.flags.hs; if (id) openModal('heroStory', id); },
  hstorypick(d) { const h = G.heroes.find(x => x.id === modalArg); if (!h) return; if (resolveHeroStory(h, +d.i)) { sfx('goal'); closeModal(); } },
  poachPay() { const h = G.heroes.find(x => x.id === G.flags.poach); G.flags.poach = null; hideBanner('poach'); if (!h) return; if (G.gold < 200) { toast('Not enough gold.'); h.loy = Math.max(0, h.loy - 15); return; } G.gold -= 200; h.loy = Math.min(100, (h.loy ?? 60) + 35); h.happy = Math.min(100, h.happy + 15); toast(`🤝 ${h.name} chose to stay.`); },
  poachGo() { const h = G.heroes.find(x => x.id === G.flags.poach); G.flags.poach = null; hideBanner('poach'); if (!h) return; chron(`🚪 ${h.name} left for a rival guild.`); removeHero(h, `🚪 ${h.name} joined a rival guild.`); },
  saveio() { openModal('saveio'); },
  slotsave(d) { try { saveGame(); localStorage.setItem(SAVE_KEY + '-s' + d.n, localStorage.getItem(SAVE_KEY)); toast(`💾 Saved to slot ${d.n}.`); } catch (e) { toast('Could not save (storage unavailable).'); } },
  slotload(d) { const v = localStorage.getItem(SAVE_KEY + '-s' + d.n); if (!v) return toast('That slot is empty.'); window.__noSave = true; localStorage.setItem(SAVE_KEY, v); location.reload(); },
  exportsave() { saveGame(); saveBuf = btoa(unescape(encodeURIComponent(localStorage.getItem(SAVE_KEY) || ''))); setTimeout(() => { const t = document.getElementById('saveText'); if (t) { t.select(); try { document.execCommand('copy'); toast('Save text copied.'); } catch (e) { /* select it for the user */ } } }, 60); },
  importsave() { const t = document.getElementById('saveText'); try { const raw = decodeURIComponent(escape(atob(t.value.trim()))), d = JSON.parse(raw); if (!d || !d.g || !d.buildings) throw 0; window.__noSave = true; localStorage.setItem(SAVE_KEY, raw); location.reload(); } catch (e) { toast('That does not look like a valid save.'); } },
  close() { closeModal(); },
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
  G.gold -= t.cost; const b = addBuilding(placing, ghostCell[0], ghostCell[1], ghostRot);
  if (t.walkable) { moveGhost(ghostCell[0], ghostCell[1]); return; }   // paths: no fuss, drag to lay a whole street
  sfx('build'); floatText(new THREE.Vector3(b.cx + b.w / 2, 1, b.cz + b.d / 2), `-${t.cost} Gold`, '#ff9a9a');
  toast(`${t.name} constructed!`); if (!t.decor && !G.flags.noAutoRoad) autoRoad(b); cancelPlacement();
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
      if (p && (BUILDINGS[placing].walkable || (Math.abs(p.x - ghost.position.x) < w / 2 + 0.8 && Math.abs(p.z - ghost.position.z) < d / 2 + 0.8))) { drag.mode = 'ghost'; drag.off = [p.x - ghost.position.x, p.z - ghost.position.z]; }
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
    else if (drag.mode === 'ghost') { const p = groundAt(e.clientX, e.clientY); if (p) { const [cx, cz] = cellFor(p.x - drag.off[0], p.z - drag.off[1]); moveGhost(cx, cz); if (BUILDINGS[placing].walkable && ghost.userData.ok) confirmPlacement(); } }
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
  if (watching) return watchTap(e);
  ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
  const rh = ray.intersectObjects(residentGroup.children, true)[0];
  if (rh) { let o = rh.object; while (o && o.userData.rid === undefined) o = o.parent; if (o) return openModal('resident', o.userData.rid); }
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
// ---- named residents: villagers with a job who live around the buildings (see people.js); tap one to hear what they have to say
const residentGroup = new THREE.Group(); scene.add(residentGroup);
const residents = []; let resSig = '';
// ordinary villagers: one family per cottage, plus one for every 25 points of town reputation (up to 8)
const VNAMES = ['Hob', 'Mina', 'Garr', 'Lotte', 'Fenwick', 'Orla', 'Jem', 'Tilda'], VROLES = [['Farmer', '🌾'], ['Woodcutter', '🪓'], ['Weaver', '🧵'], ['Baker', '🥖'], ['Fisher', '🎣'], ['Potter', '🏺'], ['Shepherd', '🐑'], ['Miller', '⚙️']];
const VLOOK = [{ shirt: 0xf4f0e6, vest: 0x3b6cc0, hair: 0x6b4a2a }, { shirt: 0xe6c8a0, vest: 0xb06a3a, hair: 0x4a2c12, hat: 'cap', hatColor: 0x8a5a2b }, { shirt: 0xd8d0c0, vest: 0x7ab648, hair: 0xf0d46a, longHair: true }, { shirt: 0xf4f0e6, apron: 0xf4f0e6, hair: 0xdcdcdc }];
const VLINES = ['Lovely weather for a walk.', 'The guild keeps the road safe — thank you.', 'My little one wants to be a hero.', 'Fresh bread at dawn, as always.', 'Have you tried Marta’s stew?', 'Good day to you!'];
const villagerDefs = [];
function villagerDef(i) {
  if (!villagerDefs[i]) { const [role, icon] = VROLES[i % VROLES.length]; villagerDefs[i] = { id: 'v' + i, vil: i, name: VNAMES[i % VNAMES.length], role, icon, anchor: ['cottage', 'market', 'hall'], speed: 0.9, scale: 1, wander: 3.5, look: { skin: 0xf0c8a0, pants: 0x5a4636, ...VLOOK[i % VLOOK.length] }, bio: 'Settled here for a quiet life — right next to a guild of heroes.', lines: [VLINES[i % VLINES.length], VLINES[(i + 2) % VLINES.length], VLINES[(i + 4) % VLINES.length]] }; }
  return villagerDefs[i];
}
const villagerCount = () => Math.min(8, ofType('cottage').length + Math.floor((G.flags.rep ?? 10) / 25));
function syncResidents() {
  const sig = G.buildings.length + ':' + G.rank + ':' + moveVer + ':' + villagerCount(); if (sig === resSig) return; resSig = sig;
  const defs = [...RESIDENTS, ...Array.from({ length: 8 }, (_, i) => villagerDef(i))];
  for (const def of defs) {
    const here = residents.find(r => r.def === def), ok = def.vil !== undefined ? def.vil < villagerCount() : residentHome(def, G, first);
    if (here && !ok) { residentGroup.remove(here.mesh); residents.splice(residents.indexOf(here), 1); }
    else if (!here && ok) {
      const mesh = buildChar(def.look); mesh.scale.multiplyScalar(def.scale); const a = residentAnchor(def, 0); mesh.position.set(a.x + rnd(-1, 1), 0, a.z + rnd(0.5, 1.5)); mesh.userData.rid = def.id; residentGroup.add(mesh);
      residents.push({ def, mesh, pos: mesh.position, path: null, pi: 0, pv: -1, target: null, phase: Math.random() * 6, timer: rnd(0, 3), say: 8 + Math.random() * 10, ai: 0 });
    }
  }
}
function residentAnchor(def, i) {
  const names = def.anchor, b = names.map(n => first(n)).filter(Boolean);
  if (def.anchor[0] === 'hall' || !b.length) return new THREE.Vector3(HALL.cx + 2.5, 0, HALL.cz + 4);
  const t = b[i % b.length]; return t.door.clone();
}
function tickResidents(dt) {
  syncResidents();
  for (const r of residents) {
    if (r.target) { r.phase += dt * 8; if (stepPath(r, dt, r.def.speed)) { r.target = null; r.timer = rnd(2, 7); } }
    else {
      r.timer -= dt;
      if (r.timer <= 0) {
        const a = residentAnchor(r.def, r.ai++), w = r.def.wander || 1.6; r.target = new THREE.Vector3(a.x + rnd(-w, w), 0, a.z + rnd(-w * 0.6, w)); setPath(r);
      }
    }
    r.say -= dt; if (r.say <= 0) { r.say = 18 + Math.random() * 26; if (r.mesh.visible && Math.random() < 0.7) floatText(r.pos, '“' + tr(pick(r.def.lines)) + '”', '#fff'); }
  }
}
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
    buildings: G.buildings.map(b => ({ type: b.type, cx: b.cx, cz: b.cz, rot: b.rot || 0, level: b.level, stock: b.stock, progress: b.progress, spec: b.spec })),
    heroes: G.heroes.map(h => ({ id: h.id, cls: h.cls, variant: h.variant, name: h.name, level: h.level, xp: h.xp, stamina: h.stamina, happy: h.happy, gear: h.gear, gearTier: h.gearTier || 1, promo: h.promo, talents: h.talents, bonds: h.bonds, aff: h.aff, vow: h.vow, quests: h.quests, vip: h.vip, tags: h.tags, bio: h.bio, likes: h.likes, dislikes: h.dislikes, loy: h.loy, marks: h.marks, plus: h.plus, train: h.train, arc: h.arc, title: h.title, boon: h.boon, x: h.pos.x, z: h.pos.z, onQuest: h.state === 'quest' })),
    quests: G.quests.map(q => { const o = {}; for (const [k, v] of Object.entries(q)) if (k !== 'heroes' && k !== 'script') o[k] = v; o.heroIds = (q.heroes || []).map(h => h.id); return o; }),
    extra: serializeExtra(),
  };
}
function serializeExtra() { const w = []; for (let i = 0; i < wear.length; i++) if (wear[i] >= WEAR_LO) w.push(i, Math.round(wear[i])); return { wear: w }; }
function applyExtra(x) { if (x.wear) { wear.fill(0); for (let i = 0; i + 1 < x.wear.length; i += 2) wear[x.wear[i]] = x.wear[i + 1]; wearDirty = true; } }
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
      const b = addBuilding(sb.type, sb.cx, sb.cz, sb.rot || 0); b.level = sb.level; b.stock = sb.stock; b.progress = sb.progress; if (sb.spec) b.spec = sb.spec; b.pop = 1; b.group.scale.setScalar(1);
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
    if (G.flags.pending && !(G.flags.pol && G.flags.pol.story === 'auto')) { /* waits in the inbox */ }
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
const SKILLS = { knight: { icon: '🛡', name: 'Shield Wall', kind: 'wall', boost: 0.06 }, ranger: { icon: '🏹', name: 'Volley', kind: 'volley', boost: 0.05 }, wizard: { icon: '🔥', name: 'Nova', kind: 'nova', boost: 0.05 }, rogue: { icon: '🗡', name: 'Backstab', kind: 'stab', boost: 0.05 }, cleric: { icon: '🙏', name: 'Blessing', kind: 'bless', boost: 0.03, heal: 0.25 }, alchemist: { icon: '⚗️', name: 'Elixir', kind: 'elixir', boost: 0.03, heal: 0.2 } };
const SKILL_CD = 25, SKILL_CAP = 0.12;   // seconds between uses (a dive: floors), and the most the skills can add to one quest's odds
function skillLeft(q, cls) {
  const T = nowT(watching), S = q.script, used = ((q.dive ? q.skillsUsed : q.skillT) || {})[cls]; if (used === undefined) return 0;
  return q.dive ? Math.max(0, used + 5 - diveFloorIndex(S, T)) : Math.max(0, SKILL_CD - (T - used));
}
function skillReady(q, cls) {
  const sk = SKILLS[cls], T = nowT(watching), S = q.script; if (!sk || !canIntervene(q)) return false;
  const h = q.party.findIndex((p, i) => p.cls === cls && !(S.heroes[i].dies && T >= S.heroes[i].D)); if (h < 0) return false;
  return skillLeft(q, cls) <= 0;
}
// Tap a hero who stands in a boss's red circle to dodge the blow: no damage numbers, a little extra success chance (up to +9%)
function watchTap(e) {
  const w = watching; if (!w || w.finish || w.exiting) return;
  // forgiving tap: the nearest hero on screen within a finger's width (heroes are small)
  let h = -1, best = 64; w.exp.hero.forEach((o, i) => { const [sx, sy] = toScreen(o.m.position.clone().add(w.exp.origin), 0.45), d = Math.hypot(sx - e.clientX, sy - e.clientY); if (d < best) { best = d; h = i; } });
  if (h < 0) return;
  const T = nowT(w), ev = w.exp.dodgeable(h, T); if (!ev) return;
  w.exp.dodged.add(ev.id); w.exp.fired.add(ev.id); (w.q.casts ||= []).push({ t: T, kind: 'dodge', h });
  const q = w.q; if (!q.dive) { const add = Math.max(0, Math.min(0.015, 0.09 - (q.dodgeBoost || 0))); q.dodgeBoost = (q.dodgeBoost || 0) + add; if (add > 0) boostQuest(q, add); }
  floatText(w.exp.hero[h].m.position.clone().add(w.exp.origin), '✓ Dodged!', '#9bff9b'); sfx('chime');
}
function watchSkill(cls) {
  const w = watching, q = w?.q, sk = SKILLS[cls]; if (!q || !sk) return;
  if (!skillReady(q, cls)) return toast('That skill is not ready.');
  const T = nowT(w), S = q.script, h = q.party.findIndex((p, i) => p.cls === cls && !(S.heroes[i].dies && T >= S.heroes[i].D));
  (q.casts ||= []).push({ t: T, kind: sk.kind, h });
  if (q.dive) (q.skillsUsed ||= {})[cls] = diveFloorIndex(S, T); else (q.skillT ||= {})[cls] = T;
  if (q.dive) {
    const next = diveFloorIndex(S, T) + 1;
    if (sk.kind === 'wall' && !(q.enchants || []).some(x => x.floor + 3 > next)) q.enchants.push({ floor: next, t: T }); else q.heals.push({ t: T, amt: sk.heal || 0.15 });
    rebuildDive(q, T); toast(`${sk.icon} ${sk.name}!`);
  } else { if (sk.heal) q.heals.push({ t: T, amt: sk.heal }); const add = Math.max(0, Math.min(sk.boost, SKILL_CAP - (q.skillBoost || 0))); q.skillBoost = (q.skillBoost || 0) + add; if (add > 0) boostQuest(q, add); toast(`${sk.icon} ${sk.name}! ${add > 0 ? `Success chance now ${Math.round(q.chance * 100)}%` : 'The party is already at its best.'}`); }
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
  $('wSkills').innerHTML = trHtml(q.party.map(p => p.cls).filter((c, i, a) => a.indexOf(c) === i && SKILLS[c]).map(c => `<button class="act ${skillReady(q, c) ? '' : 'off'}" data-skill="${c}" ${skillReady(q, c) ? '' : 'disabled'}>${SKILLS[c].icon} ${SKILLS[c].name}${skillLeft(q, c) > 0 ? ' · ' + Math.ceil(skillLeft(q, c)) + (q.dive ? 'f' : 's') : ''}</button>`).join(''));
  $('wRecall').classList.toggle('hidden', !!q.defense);
  const potions = ofType('alchemy').reduce((n, b) => n + b.stock, 0), nextF = dv ? diveFloorIndex(S, T) + 1 : 0, warded = dv && (q.enchants || []).some(x => x.floor + 3 > nextF);
  $('wEnchant').disabled = !ci || G.mana < 5 || (dv ? warded : !!(q.enchant || q.enchantedMid)); $('wEnchant').textContent = tr(dv ? (warded ? '✨ Ward active' : '✨ Ward (5)') : `✨ Enchant (5) · ${Math.round(q.chance * 100)}%`);
  $('wPotion').disabled = !ci || potions < 1; $('wPotion').textContent = tr(`🧪 Potion (${potions})`);
  $('wRecall').disabled = !!w.finish; $('wRecall').textContent = tr(w.recallArm > 0 ? (dv ? '🏁 Confirm: bank & leave?' : '🏳 Confirm recall?') : (dv ? '🏁 Bank & leave' : '🏳 Recall'));
  $('wFollow').classList.toggle('on', w.follow); $('wFollow').textContent = tr(w.follow ? '🎯 Following' : '🎯 Follow');
  $('wPipBtn').classList.toggle('on', w.pip); $('pipFrame').classList.toggle('off', !w.pip);
  $('wSpeed').textContent = '⏵ x' + G.speed;
  $('wSwitch').innerHTML = trHtml(G.quests.filter(x => x.state === 'active' && x !== q).map(x => `<button class="act" data-act="watch" data-q="${x.id}">👁 ${x.name}</button>`).join(''));
  $('wHint').textContent = tr(dv ? (w.finish ? '' : (S.wiped ? 'The party has fallen…' : `At risk: ${rewardText(q.pending)} · next checkpoint: floor ${Math.ceil((q.cleared + 1) / 5) * 5}`)) : (w.exp.warnActive ? 'Tap a hero inside a red circle to dodge!' : ci ? 'Intervene before the finale!' : (w.finish ? '' : 'The finale has begun — no more help possible')));
}
$('wBack').onclick = endWatch; $('pipFrame').onclick = endWatch;
$('wFollow').onclick = () => { if (watching) { watching.follow = !watching.follow; updateWatchHUD(); } };
$('wPipBtn').onclick = () => { if (watching) { watching.pip = !watching.pip; updateWatchHUD(); } };
$('wSpeed').onclick = () => $('speedBtn').click();
$('wRelic').onclick = () => openModal('relic'); $('wEnchant').onclick = watchEnchant; $('wPotion').onclick = watchPotion; { const ob = $('objectives'), K = 'fantasy-guild-master-obj', set = c => { ob.classList.toggle('collapsed', c); $('objToggle').textContent = c ? '📋' : '▾'; try { localStorage.setItem(K, c ? '1' : '0'); } catch (e) { /* ignore */ } };
  let c0 = false; try { c0 = localStorage.getItem(K) === '1'; } catch (e) { /* default open */ } set(c0); $('objToggle').onclick = () => set(!ob.classList.contains('collapsed')); }
  $('wRecall').onclick = watchRecall; $('wSkills').onclick = e => { const b = e.target.closest('[data-skill]'); if (b && !b.disabled) watchSkill(b.dataset.skill); }; $('readyPill').onclick = () => openModal('quests'); $('inboxPill').onclick = () => openModal('inbox'); $('seasonPill').onclick = () => openModal('chronicle');
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
  updateSeasonFx(rdt); updateConfetti(rdt); updateDayNight(); tickChat(dt); tickResidents(dt); residentGroup.children.forEach(m => autoAnim(m, rdt, frustum.containsPoint(m.position)));
  camera.updateMatrixWorld(); frustumM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(frustumM);
  const seen = m => frustum.containsPoint(m.position);
  if (charStyle !== 'classic') { heroGroup.children.forEach(m => autoAnim(m, rdt, seen(m))); staffMeshes.forEach(x => autoAnim(x.mesh, rdt, seen(x.mesh))); G.goblins.forEach(x => autoAnim(x.mesh, rdt, seen(x.mesh))); }
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
  // quality: in Auto the resolution follows the frame rate (down when slower than ~28 fps, back up when there is room)
  perfEma = perfEma * 0.96 + Math.min(rdt, 0.2) * 0.04; adaptT += rdt;
  if (adaptT > 3) { adaptT = 0; if (gfx === 'auto') { if (perfEma > 0.036 && quality > 0.55) { quality = Math.max(0.55, quality - 0.15); resize(); } else if (perfEma < 0.021 && quality < 1) { quality = Math.min(1, quality + 0.1); resize(); } } }
  sun.castShadow = gfx !== 'low' && quality > 0.6; if ((frameN++ & 1) === 0) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, camera);
  renderPip();
}

/* ------------------------------------------------------------------ *
 *  Boot: starter heroes + quests
 * ------------------------------------------------------------------ */
initLang();
resize();
const loaded = loadGame(); setTimeout(() => { try { if (IAP.owned('starter_pack') && !G.flags.starter) grantPurchase('starter_pack'); } catch (e) { /* offline */ } }, 5000); checkDaily(); setTimeout(() => { if (G.flags.login && G.flags.login.pending && (G.flags.tutDone || G.questsDone > 0)) openModal('daily'); }, 2500); loadedOnce = true; try { buildLandmarks(false); } catch (e) { /* decoration */ }
if (!loaded) {
  G.gold += 300 * legacyLvl('purse'); G.renown += 2 * legacyLvl('name'); G.flags.gen = LEGACY.gen + 1; if (LEGACY.gen) chron(`🏛 Generation ${LEGACY.gen + 1} of the guild begins.`);
  spawnHero('knight', true); spawnHero('ranger', true);
  genQuest(); genQuest();
  toast('Welcome, Guild Master! Build a Tavern and a Forge to attract & equip heroes.');
}
tutorial.init();
frame();
window.__heroHp = heroHp; window.__rebuild = rebuildDive;
window.__sim = { updateEconomy, updateHero, updateGoblins, resolveDive, rankUp, staffCost, STAFF, TECHS, hasRare, spendRare, upReq, readyHeroes, bestParty, deliverOrder, musterHeroes, chooseStory, STORIES };
window.__renderer = renderer; window.__scene = scene; window.__api = { calEvent, challengeDone, spawnHero, tickFamily, retireHero, pushEvent, inboxItems, checkDaily, tickMemorial, dispatchDive, applyLand, tickRival, legacyGain, checkAch, chanceFor, endWatch, makeQuest, squares, autoRoad, pavable, defense, watchTap, heroScreen: h => toScreen(watching.exp.hero[h].m.position.clone().add(watching.exp.origin), 0.45), skillLeft, startFest, tickFestival, tickPeople, storyChapter, townTick, repGain, addAff, bondGrow, grieve, memorialize, legendTick, resolveQuest, seasonIdx, openModal, startPlacement, confirmPlacement, moveGhost, FACTIONS, applyFactionLook, REGIONS, regionLevel, landBounds, applyLand, audioState, tutorial, gainXp, talentSlots, heroLabel, raidQuest, genScript, relicMods, makeQuest, STORIES, chooseStory, checkStories, modPenalty, chanceFor, maxLevel, previewBonus, adj, gradeUnlocked, heroPower, tickMarket, checkGoals, closeModal, dispatchDive, diveTick, resolveDive, toScreen, findPath, blocked, saveGame, loadGame, serialize, startWatch, endWatch, watchEnchant, watchPotion, watchRecall, addBuilding, canPlace, spawnHero, openModal, ACT, startRaid, startMerchant, addOrder, deliverOrder, genQuest, dispatch, readyHeroes };
