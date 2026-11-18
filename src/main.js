import * as THREE from '../vendor/three.module.js';
import { BUILDINGS, buildBuilding, buildHero, buildStaff, buildGoblin, buildMerchantCart, vox, mat, PROPS } from './models.js';
import { Expedition, genScript, STAGE_X, heroHp, phaseText, newDiveScript, ensureFloors, rebuildDive, diveFloorIndex, diveCheckpoint, rewardText } from './expedition.js';

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

// Free 3D camera: orbit (yaw/pitch), pan, zoom, optional perspective. Orthographic isometric by default.
const VIEW0 = { yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2), zoom: 10 };   // true isometric angles
let watching = null, viewFly = null;   // expedition watch mode state
let yaw = VIEW0.yaw, pitch = VIEW0.pitch, viewS = VIEW0.zoom, perspective = false;
const FOV = 38;
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 500);
const perspCam = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
let camera = orthoCam;
const camTarget = new THREE.Vector3(N / 2 + 1, 0, N / 2 + 1);
const clampView = () => {
  pitch = Math.max(0.28, Math.min(1.42, pitch)); viewS = Math.max(3.5, Math.min(24, viewS));
  if (!watching) { camTarget.x = Math.max(2, Math.min(N - 2, camTarget.x)); camTarget.z = Math.max(2, Math.min(N - 2, camTarget.z)); }
};
function updateCamera() {
  clampView();
  const a = innerWidth / innerHeight;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  camera = perspective ? perspCam : orthoCam;
  if (perspective) {
    const dist = viewS / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    perspCam.aspect = a; perspCam.position.copy(camTarget).addScaledVector(dir, dist);
  } else {
    orthoCam.left = -viewS * a; orthoCam.right = viewS * a; orthoCam.top = viewS; orthoCam.bottom = -viewS;
    orthoCam.position.copy(camTarget).addScaledVector(dir, 80);
  }
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
function togglePerspective() { perspective = !perspective; $('camPersp').classList.toggle('on', perspective); updateCamera(); }
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
  orders: [], rare: { mythril: 0, scale: 0, feather: 0 }, diveBest: 0, merchant: null, alarm: false, questsDone: 0, nextId: 1,
  tm: { spawn: 4, quest: 1, wage: 30, trickle: 0, merchant: 100, royal: 160, caravan: 260, raid: 150, tavern: 0, mana: 0 },
};
window.__G = G;

const occ = new Set(); let occVersion = 0;   // occVersion bumps whenever the walkable grid changes (heroes repath)
const key = (x, z) => x + ',' + z;

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
    n++;
  }
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

/* ------------------------------------------------------------------ *
 *  Buildings
 * ------------------------------------------------------------------ */
const bGroup = new THREE.Group(); scene.add(bGroup);
const worldEl = document.getElementById('world');

const footprint = (type, rot) => { const t = BUILDINGS[type]; return rot % 2 ? [t.d, t.w] : [t.w, t.d]; };
function canPlace(type, cx, cz, rot = 0) {
  const [w, d] = footprint(type, rot);
  if (cx < 2 || cz < 2 || cx + w > N - 2 || cz + d > N - 2) return false;
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
const popCap = () => 4 + ofType('tent').length * 3 + ofType('tavern').length * 4 + G.outpost * 3;
const craftSpeed = () => (1 + 0.25 * G.staff.smith) * (G.research.forging ? 1.3 : 1) * (G.research.mythril ? 1.4 : 1);
const alchSpeed = () => (1 + 0.25 * G.staff.alch) * (G.research.forging ? 1.15 : 1);
const mealGold = () => 12 * (1 + 0.15 * G.staff.cook) * (1 + 0.3 * ((first('tavern')?.level || 1) - 1));
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
  const el = document.createElement('div'); el.className = 'fl'; el.textContent = text; if (color) el.style.color = color;
  worldEl.appendChild(el);
  floaters.push({ el, pos: pos.clone(), t: 0 });
}
function toast(msg) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  $('toasts').appendChild(el); setTimeout(() => el.remove(), 4000);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}
const gain = (pos, g) => { G.gold += g; floatText(pos, (g >= 0 ? '+' : '') + Math.round(g) + ' Gold'); };

/* ------------------------------------------------------------------ *
 *  Heroes (state machine)
 * ------------------------------------------------------------------ */
const CLASSES = {
  knight: { label: 'Knight', icon: '🗡️', base: 3.0, price: 25, survive: 0.92, quest: 'combat' },
  ranger: { label: 'Ranger', icon: '🏹', base: 2.5, price: 18, survive: 0.88, quest: 'gather' },
  wizard: { label: 'Wizard', icon: '🪄', base: 3.5, price: 22, survive: 0.75, quest: 'arcane' },
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
const heroPower = (h, type) => CLASSES[h.cls].base * (1 + 0.2 * (h.level - 1)) * (h.gear ? 1 : 0.5) * (CLASSES[h.cls].quest === type ? 1.3 : 1);
const heroGroup = new THREE.Group(); scene.add(heroGroup);

function spawnPoint() {
  return Math.random() < 0.5 ? new THREE.Vector3(N - 1.5, 0, HALL.cz + 2) : new THREE.Vector3(HALL.cx + 2.5, 0, N - 1.5);
}
function createHero(d) {
  const mesh = buildHero(d.cls, d.variant), p = new THREE.Vector3(d.x, 0, d.z);
  mesh.position.copy(p); heroGroup.add(mesh);
  const bub = document.createElement('div'); bub.className = 'bub hidden'; worldEl.appendChild(bub);
  const h = {
    id: d.id ?? G.nextId++, cls: d.cls, variant: d.variant, name: d.name, level: d.level ?? 1, xp: d.xp ?? 0, stamina: d.stamina ?? rnd(60, 100), happy: d.happy ?? 100, gear: !!d.gear,
    quests: d.quests || 0, vip: d.vip || null,
    mesh, pos: mesh.position, bub, state: 'idle', target: null, onArrive: null, timer: 0, onDone: null, cool: 0, phase: Math.random() * 6, vis: true,
  };
  mesh.userData.hid = h.id; G.heroes.push(h); if (h.vip) addStar(h);
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
const blocked = (x, z) => x < 0 || z < 0 || x >= N || z >= N || occ.has(key(x, z));
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
  const ci = v => Math.max(0, Math.min(N - 1, Math.floor(v)));
  const sx = ci(from.x), sz = ci(from.z); let gx = ci(to.x), gz = ci(to.z);
  const exactOk = !blocked(gx, gz);
  if (!exactOk) { const f = nearestFree(gx, gz); if (!f) return [to.clone()]; [gx, gz] = f; }
  if (lineClear(from, exactOk ? to : new THREE.Vector3(gx + 0.5, 0, gz + 0.5))) return [exactOk ? to.clone() : new THREE.Vector3(gx + 0.5, 0, gz + 0.5)];
  const idx = (x, z) => z * N + x, g = new Float32Array(N * N).fill(Infinity), par = new Int32Array(N * N).fill(-1), done = new Uint8Array(N * N);
  const hf = (x, z) => { const dx = Math.abs(x - gx), dz = Math.abs(z - gz); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
  const open = [idx(sx, sz)]; g[open[0]] = 0; let found = false;
  const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (open.length) {
    let bi = 0, bf = Infinity;
    for (let i = 0; i < open.length; i++) { const k = open[i], f = g[k] + hf(k % N, (k / N) | 0); if (f < bf) { bf = f; bi = i; } }
    const cur = open.splice(bi, 1)[0]; if (done[cur]) continue; done[cur] = 1;
    const cx = cur % N, cz = (cur / N) | 0; if (cx === gx && cz === gz) { found = true; break; }
    for (const [dx, dz, c] of D) {
      const nx = cx + dx, nz = cz + dz; if (blocked(nx, nz)) continue;
      if (dx && dz && (blocked(cx + dx, cz) || blocked(cx, cz + dz))) continue;   // no corner cutting
      const k = idx(nx, nz), ng = g[cur] + c; if (ng < g[k]) { g[k] = ng; par[k] = cur; open.push(k); }
    }
  }
  if (!found) return [to.clone()];
  const cells = []; for (let k = idx(gx, gz); k !== -1 && k !== idx(sx, sz); k = par[k]) cells.push(new THREE.Vector3(k % N + 0.5, 0, ((k / N) | 0) + 0.5));
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
        const g = mealGold() * (traitOf(h) === 'glutton' ? 2 : 1);
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
          shop.stock--; h.gear = true;
          gain(shop.door, CLASSES[h.cls].price * (1 + 0.15 * (shop.level - 1)) * (G.research.mythril && h.cls !== 'wizard' ? 1.25 : 1));
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

const nearCampfire = h => ofType('campfire').some(b => Math.hypot(b.cx + b.w / 2 - h.pos.x, b.cz + b.d / 2 - h.pos.z) < 6);
function updateHero(h, dt) {
  h.phase += dt * 8;
  if (h.state === 'quest') return;
  const decay = Math.pow(0.7, G.staff.bard);
  h.stamina = Math.max(0, h.stamina - 0.7 * (traitOf(h) === 'glutton' ? 1.4 : 1) * dt);
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
  if (G.alarm && G.goblins.length) {
    const c = G.goblins[0].mesh.position;
    stepToward(h, dt, 4.2, c, 3.2); setMood(h, '⚔️'); return;
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
  h.mesh.position.y = Math.abs(Math.sin(h.phase)) * 0.06;
  const sw = Math.sin(h.phase) * 0.6; const L = h.mesh.userData.legs; L[0].rotation.x = sw; L[1].rotation.x = -sw;
  const A = h.mesh.userData.arms; if (A) { A[0].rotation.x = -sw * 0.7; A[1].rotation.x = sw * 0.7; }
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
function genQuest() {
  const type = pick(['combat', 'gather', 'arcane']);
  const tier = 1 + G.renown / 6;
  const minH = Math.random() < 0.5 ? 1 : (Math.random() < 0.7 ? 2 : 3);
  const diff = (2.6 + rnd(0, 1.2) + (minH - 1) * 2.4) * (0.9 + 0.1 * tier);
  const loot = {};
  if (type === 'combat') loot.ore = Math.round(rnd(2, 5) * minH);
  if (type === 'gather') { loot.herbs = Math.round(rnd(2, 5) * minH); loot.wood = Math.round(rnd(2, 4)); }
  if (type === 'arcane') loot.arcane = Math.round(rnd(1, 3) * minH);
  G.quests.push({
    id: G.nextId++, name: pick(QNAMES[type]), type, diff, minH, maxH: Math.min(4, minH + 1),
    dur: rnd(22, 40) + minH * 6, gold: Math.round((55 + diff * 28) * rnd(0.9, 1.15)), renown: Math.max(1, Math.round(diff / 2.2)),
    loot, state: 'open', heroes: [], t: 0, enchant: false, chance: 0,
  });
}
const readyHeroes = () => G.heroes.filter(h => h.gear && h.stamina >= 45 && h.state !== 'quest' && h.state !== 'leaving');
function bestParty(q) {
  const r = readyHeroes().sort((a, b) => heroPower(b, q.type) - heroPower(a, q.type));
  return r.slice(0, q.maxH);
}
function chanceFor(q, party, enchant) {
  const P = party.reduce((s, h) => s + heroPower(h, q.type), 0);
  let c = P / (q.diff * 1.25);
  if (G.research.valor) c += 0.1;
  for (const h of party) { const t = traitOf(h); if (t === 'lucky') c += 0.08; if (t === 'clumsy') c -= 0.10; }
  if (enchant) c += G.research.arcane ? 0.3 : 0.2;
  return Math.max(0.03, Math.min(0.97, c));
}
function dispatch(qid, enchant) {
  const q = G.quests.find(x => x.id === qid); if (!q || q.state !== 'open') return;
  const party = bestParty(q);
  if (party.length < q.minH) return toast(`Need ${q.minH} ready hero(es) with gear and stamina.`);
  if (enchant) { if (G.mana < 5) return toast('Not enough Mana.'); G.mana -= 5; }
  q.enchant = enchant; q.chance = chanceFor(q, party, enchant); q.heroes = party; q.state = 'active'; q.t = q.dur;
  // the outcome is rolled now so the expedition can be watched live without ever contradicting the result
  q.party = party.map(h => heroSnap(h));
  q.seed = (Math.random() * 1e9) | 0; q.ok = Math.random() < q.chance; q.heals = [];
  q.deaths = party.filter(h => Math.random() > CLASSES[h.cls].survive + 0.15 + (traitOf(h) === 'brave' ? 0.35 : 0)).map(h => h.id);
  q.script = genScript(q);
  party.forEach(h => { h.state = 'quest'; h.mesh.visible = false; setMood(h, null); h.onDone = null; });
  toast(`Party of ${party.length} dispatched: ${q.name}`);
  renderModal(true);
}
function resolveQuest(q) {
  const ok = q.ok;
  onQuestEnd(q, ok);
  const hp = new THREE.Vector3(HALL.cx + 2.5, 0, HALL.cz + 5);
  q.state = 'done'; G.quests.splice(G.quests.indexOf(q), 1);
  const alive = [];
  q.heroes.forEach(h => {
    if (!G.heroes.includes(h)) return;
    h.state = 'idle'; h.cool = 0; h.stamina = Math.max(20, h.stamina - 25);
    h.pos.set(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1)); h.mesh.visible = true; h.target = null;
    if (!ok && q.deaths.includes(h.id)) { if (h.vip) G.renown = Math.max(0, G.renown - 1); removeHero(h, h.vip ? `☠ ${h.name} — a legend of the guild — has fallen!` : `${h.name} the ${CLASSES[h.cls].label} fell in battle...`); return; }
    h.quests = (h.quests || 0) + 1;
    if (ok) { h.xp += traitOf(h) === 'scholar' ? 2 : 1; while (h.xp >= h.level + 1) { h.xp -= h.level + 1; h.level++; floatText(h.pos, `⬆ ${h.name} Lv${h.level}`, '#9bff9b'); } }
    if (Math.random() < (ok ? 0.5 : 1)) h.gear = false;
    h.happy = Math.min(100, h.happy + (ok ? 20 : -10));
    alive.push(h);
  });
  if (ok) {
    const g = Math.round(q.gold * questGoldMul());
    gain(hp, g); G.renown += q.renown;
    floatText(hp.clone().add(new THREE.Vector3(0, 0.6, 0)), `+${q.renown} ⭐`, '#ffd24a');
    const oreMul = (G.research.prospect ? 1.5 : 1) * (1 + 0.2 * q.party.filter(x => x.trait === 'clumsy').length);
    if (q.loot.ore) G.ore += Math.round(q.loot.ore * oreMul);
    if (q.loot.herbs) G.herbs += Math.round(q.loot.herbs * oreMul / (G.research.prospect ? 1.5 : 1));
    if (q.loot.wood) G.wood += Math.round(q.loot.wood * oreMul / (G.research.prospect ? 1.5 : 1));
    if (q.loot.arcane) G.mana += Math.round(q.loot.arcane * 5 * oreMul / (G.research.prospect ? 1.5 : 1));
    G.questsDone++;
    toast(`✔ ${q.name} complete! +${g}g, +${q.renown}⭐, loot collected.`);
  } else {
    G.renown = Math.max(0, G.renown - 1);
    toast(`✘ ${q.name} failed. The party limps home.`);
  }
  renderModal(true);
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
  const q = { id: G.nextId++, name: 'Endless Dive', type: 'dive', dive: true, state: 'active', heroes: r, party: r.map(heroSnap), seed: (Math.random() * 1e9) | 0, heals: [], enchants: [], elapsed: 0, cleared: 0, pending: newPending(), dur: 1e9, t: 1e9, chance: 0.5, minH: 2, maxH: 4, diff: 0, loot: {}, enchant: false, gold: 0, renown: 0 };
  q.script = newDiveScript(q); ensureFloors(q, 0); G.quests.push(q);
  r.forEach(h => { h.state = 'quest'; h.mesh.visible = false; setMood(h, null); h.onDone = null; });
  toast(`🌀 ${r.length} heroes step through the portal… Recall to bank your loot!`); renderModal(true);
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
    if (diveCheckpoint(f.k)) toast(`🏁 Checkpoint — floor ${f.k + 1}! Banked: ${bankPending(q)}`);
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
    if (H.dies && H.D <= T) { if (h.vip) G.renown = Math.max(0, G.renown - 1); removeHero(h, h.vip ? `☠ ${h.name} — a legend of the guild — fell on floor ${diveFloorIndex(S, H.D) + 1}!` : `${h.name} fell on floor ${diveFloorIndex(S, H.D) + 1} of the dive.`); return; }
    h.quests = (h.quests || 0) + 1; h.xp += Math.floor(q.cleared / 3) * (traitOf(h) === 'scholar' ? 2 : 1);
    while (h.xp >= h.level + 1) { h.xp -= h.level + 1; h.level++; floatText(h.pos, `⬆ ${h.name} Lv${h.level}`, '#9bff9b'); }
    h.stamina = Math.max(15, h.stamina - 25 - q.cleared); h.happy = Math.min(100, h.happy + 10); if (Math.random() < 0.7) h.gear = false;
  });
  toast(text); renderModal(true);
}

/* ------------------------------------------------------------------ *
 *  Events: monster incursion, wandering merchant, royal demand
 * ------------------------------------------------------------------ */
function startRaid() {
  const count = 2 + Math.floor(G.renown / 6);
  const side = Math.random() < 0.5;
  for (let i = 0; i < count; i++) {
    const m = buildGoblin();
    m.position.set(side ? 1.5 + rnd(0, 1.5) : 1.5 + rnd(0, 3), 0, side ? 4 + rnd(0, 3) + i : 1.5 + rnd(0, 1.5));
    scene.add(m);
    G.goblins.push({ mesh: m, phase: rnd(0, 6) });
  }
  G.alarm = false;
  showBanner('raid', `👹 Monster incursion! ${count} goblins approach!`, [['Sound the Alarm', 'alarm', 'red']]);
  toast('Goblins at the perimeter!');
}
function defense() {
  let d = G.staff.guard * (G.research.scales ? 8 : 4) + G.walls * 3 + (G.research.scales ? 6 : 0);
  if (G.alarm) d += G.heroes.filter(h => h.state !== 'quest' && h.state !== 'leaving').reduce((s, h) => s + CLASSES[h.cls].base * (h.gear ? 1 : 0.6) * 0.8, 0);
  return d;
}
function updateGoblins(dt) {
  if (!G.goblins.length) return;
  const target = new THREE.Vector3(HALL.cx + 2.5, 0, HALL.cz + 2);
  let close = false;
  for (const g of G.goblins) {
    const p = g.mesh.position, dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
    g.phase += dt * 9;
    if (d > 5.5) { p.x += dx / d * 1.5 * dt; p.z += dz / d * 1.5 * dt; g.mesh.rotation.y = Math.atan2(dx, dz); p.y = Math.abs(Math.sin(g.phase)) * 0.05; } else close = true;
  }
  if (close) {
    const threat = G.goblins.length * 3.5, def = defense();
    const cp = G.goblins[0].mesh.position.clone();
    if (def >= threat) {
      const loot = 35 * G.goblins.length; gain(cp, loot); G.renown += 1;
      toast(`🛡️ The goblins were driven off! +${loot}g, +1⭐`);
    } else {
      const lost = Math.round(G.gold * 0.2 + 20); G.gold = Math.max(0, G.gold - lost);
      floatText(cp, `-${lost} Gold`, '#ff7a7a'); toast(`👹 The goblins raided the guild! Lost ${lost}g. Hire guards or sound the alarm sooner.`);
    }
    G.goblins.forEach(g => scene.remove(g.mesh)); G.goblins = []; G.alarm = false; hideBanner('raid');
  }
}
let cart = null;
function startMerchant() {
  G.merchant = { t: 70 };
  cart = buildMerchantCart(); cart.position.set(HALL.cx + 7.5, 0, HALL.cz + 5.5); scene.add(cart);
  showBanner('merchant', '🛒 A wandering merchant arrived with rare wares!', [['Trade', 'openMerchant', '']]);
}
function endMerchant() { G.merchant = null; if (cart) { scene.remove(cart); cart = null; } hideBanner('merchant'); if (modalKind === 'merchant') closeModal(); }
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
  if (kind === 'royal') { const n = 5 + Math.floor(G.renown / 8); Object.assign(o, { need: { sword: n }, t: 150, tMax: 150, reward: 150 + n * 40, ren: 5, pen: 3, title: 'Royal Demand', icon: '👑' }); toast(`👑 Royal Demand: ${n} iron swords!`); }
  else {
    const sw = 6 + Math.floor(G.renown / 2), po = first('alchemy') ? 4 + Math.floor(G.renown / 3) : 0; o.need.sword = sw; if (po) o.need.potion = po;
    Object.assign(o, { t: 260, tMax: 260, reward: 60 + sw * 38 + po * 32, ren: 3 + Math.floor((sw + po) / 8), pen: 2, title: 'Trade Caravan', icon: '🐪' });
    spawnCaravan(); toast(`🐪 A trade caravan arrived! Bulk order: ${sw} swords${po ? ` + ${po} potions` : ''}.`);
  }
  G.orders.push(o);
}
function deliverOrder(id) {
  const o = G.orders.find(x => x.id === id); if (!o) return; let moved = 0;
  for (const kind of Object.keys(o.need)) for (const b of ofType(ORDER_SRC[kind].src)) while (o.need[kind] > 0 && b.stock > 0) { b.stock--; o.need[kind]--; moved++; }
  if (Object.values(o.need).every(v => v <= 0)) {
    G.orders.splice(G.orders.indexOf(o), 1); gain(G.buildings[0].door, o.reward); G.renown += o.ren; endCaravanIfDone();
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
  el.innerHTML = `<span>${b.text}</span>` + b.buttons.map(([l, a, c]) => `<button class="act ${c}" data-act="${a}">${l}</button>`).join('');
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
      const isF = b.type === 'forge', res = isF ? 'ore' : 'herbs';
      b.crafting = false;
      if (b.stock < stockCap(b) && G[res] > 0) {
        b.crafting = true;
        b.progress += dt * (isF ? craftSpeed() : alchSpeed()) * (1 + 0.3 * (b.level - 1)) / 8;
        if (b.progress >= 1) { b.progress = 0; G[res]--; b.stock++; floatText(b.door, isF ? '🗡️ +1' : '🧪 +1', '#fff'); }
      }
    }
  }
  if (first('alchemy')) { t.mana += dt; if (t.mana >= 5) { t.mana = 0; G.mana += 1 + (G.research.arcane ? 1 : 0); } }
  // minor facilities
  t.minor = (t.minor || 0) + dt;
  if (t.minor >= 6) {
    t.minor = 0;
    G.herbs += ofType('garden').length;
    G.mana += ofType('stones').length;
    if (ofType('training').length) { const idle = G.heroes.filter(h => h.state !== 'quest' && h.state !== 'leaving'); if (idle.length) { const h = pick(idle); h.xp += 0.5 * ofType('training').length; if (h.xp >= h.level + 1) { h.xp = 0; h.level++; floatText(h.pos, `⬆ ${h.name} Lv${h.level}`, '#9bff9b'); } } }
  }
  // passive trickle: workers gather basic materials
  t.trickle += dt;
  if (t.trickle >= 12) { t.trickle = 0; G.ore += Math.random() < 0.7 ? Math.round(1 * (G.research.prospect ? 1.5 : 1)) : 0; G.herbs += Math.random() < 0.6 ? 1 : 0; G.wood += Math.random() < 0.5 ? 1 : 0; if (G.staff.porter) { G.ore += G.staff.porter; G.herbs += G.staff.porter; } }
  // tavern + market passive gold
  t.tavern += dt;
  if (t.tavern >= 4) { t.tavern = 0; let g = 0; ofType('tavern').forEach(b => g += b.level); g += ofType('market').length * 0.5; if (g > 0) { G.gold += g; } }
  // wages
  t.wage -= dt;
  if (t.wage <= 0) { t.wage = 30; const w = wage(); if (w > 0) { const paid = Math.min(w, G.gold); G.gold -= paid; floatText(G.buildings[0].door, `-${paid} wages`, '#ffa'); } }
  // spawning heroes
  t.spawn -= dt;
  if (t.spawn <= 0) {
    t.spawn = Math.max(8, 20 - G.renown * 0.4) / (first('portal') ? 2 : 1);
    if (ofType('tavern').length && G.heroes.length < popCap()) spawnHero();
  }
  // quests
  t.quest -= dt;
  if (t.quest <= 0) { t.quest = 14; if (G.quests.filter(q => q.state === 'open').length < 3 + G.boardLvl) genQuest(); }
  for (const q of [...G.quests]) if (q.state === 'active') { if (q.dive) diveTick(q, dt); else { q.t -= dt; if (q.t <= 0) resolveQuest(q); } }
  // events
  t.merchant -= dt; if (t.merchant <= 0) { t.merchant = rnd(150, 220); if (G.renown >= 2 && !G.merchant) startMerchant(); }
  if (G.merchant) { G.merchant.t -= dt; if (G.merchant.t <= 0) endMerchant(); }
  t.raid -= dt; if (t.raid <= 0) { t.raid = rnd(120, 190); if (G.renown >= 3 && !G.goblins.length) startRaid(); }
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
const OBJ = [
  ['Build a Tavern', () => !!first('tavern')],
  ['Build the Forge', () => !!first('forge')],
  ['Send your first party', () => G.questsDone > 0],
  ['Reach 3 Renown', () => G.renown >= 3],
  ["Build the Alchemist's Lab", () => !!first('alchemy')],
  ['Recruit a Blacksmith', () => G.staff.smith > 0],
  ['Reach 15 Renown', () => G.renown >= 15],
  ['Own 6 heroes', () => G.heroes.length >= 6],
];
let hudCache = '';
function updateHUD() {
  $('hGold').textContent = Math.floor(G.gold).toLocaleString();
  $('hRenown').textContent = G.renown;
  $('hMana').textContent = G.mana;
  $('hPop').textContent = `${G.heroes.length}/${popCap()}`;
  { const r = G.rare; $('hRare').classList.toggle('hidden', !(r.mythril || r.scale || r.feather)); $('hMyth').textContent = r.mythril; $('hScale').textContent = r.scale; $('hFeather').textContent = r.feather; }
  $('hOre').textContent = G.ore; $('hWood').textContent = G.wood; $('hHerbs').textContent = G.herbs;
  const ex = G.quests.filter(q => q.state === 'active').map(q => { const dv = q.dive, lab = dv ? `Floor ${diveFloorIndex(q.script, q.elapsed) + 1}` : `${Math.ceil(q.t)}s`, pr = dv ? diveProg(q) : 100 - q.t / q.dur * 100; return `<div class="exp" data-act="watch" data-q="${q.id}" title="Watch this expedition live"><span>${dv ? '🌀' : '👁'} ${q.name}</span><span>${lab}</span><div class="bar"><i style="width:${pr}%"></i></div></div>`; }).join('');
  if (ex !== $('expeds')._h) { $('expeds')._h = ex; $('expeds').innerHTML = ex ? '<h4>Expeditions:</h4>' + ex : ''; }
  const pend = OBJ.filter(o => !o[1]()).slice(0, 3);
  const done = OBJ.filter(o => o[1]()).slice(-1);
  const html = [...done, ...pend].map(o => `<li class="${o[1]() ? 'done' : ''}">${o[1]() ? '☑' : '☐'} ${o[0]}</li>`).join('');
  if (html !== hudCache) { hudCache = html; $('objList').innerHTML = html; }
  const rh = G.orders.map(o => {
    const needs = Object.entries(o.need).filter(([, v]) => v > 0).map(([k, v]) => `${ORDER_SRC[k].icon} ${v}`).join(' + '), avail = Object.keys(o.need).reduce((n, k) => n + (o.need[k] > 0 ? stockOf(k) : 0), 0);
    return `<div class="ord"><b>${o.icon} ${o.title}</b> · ${Math.ceil(o.t)}s<br>Need ${needs}<br>Reward ${o.reward}g +${o.ren}⭐<br><button class="act" data-act="deliver" data-id="${o.id}" ${avail < 1 ? 'disabled' : ''}>Deliver (${avail} in stock)</button></div>`;
  }).join('');
  if (rh !== $('royal')._h) { $('royal')._h = rh; $('royal').innerHTML = rh; }
}

/* ------------------------------------------------------------------ *
 *  Modals
 * ------------------------------------------------------------------ */
let modalKind = null, modalArg = null, lastHtml = '';
const modal = $('modal');
function openModal(kind, arg) { modalKind = kind; modalArg = arg; modal.classList.remove('hidden'); renderModal(true); }
function closeModal() { modalKind = null; modal.classList.add('hidden'); lastHtml = ''; }
$('modalClose').onclick = closeModal;
modal.addEventListener('pointerdown', e => { if (e.target === modal) closeModal(); });
const cost = n => `<span class="tag">💰 ${n}</span>`;
const RARE = { mythril: { icon: '💎', label: 'Mythril' }, scale: { icon: '🐉', label: 'Dragon Scale' }, feather: { icon: '🪶', label: 'Phoenix Feather' } };
const hasRare = req => !req || Object.entries(req).every(([k, v]) => G.rare[k] >= v);
const rareTags = req => req ? Object.entries(req).map(([k, v]) => `<span class="tag" title="${RARE[k].label}">${RARE[k].icon} ${v}${G.rare[k] < v ? ' (have ' + G.rare[k] + ')' : ''}</span>`).join('') : '';
const spendRare = req => { if (req) for (const [k, v] of Object.entries(req)) G.rare[k] -= v; };
const upReq = b => (['forge', 'alchemy'].includes(b.type) && b.level >= 4) ? { mythril: 3 } : null;

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
        const locked = G.renown < t.renown, poor = G.gold < t.cost;
        return `<div class="row"><div style="font-size:30px">${t.icon}</div><div class="grow"><div class="t">${t.name} <span class="tag">${t.w}×${t.d}</span></div><div class="s">${t.desc}</div>${cost(t.cost)}${t.renown ? `<span class="tag">⭐ ${t.renown} req.</span>` : ''}</div>
        <button class="act" data-act="place" data-k="${k}" ${locked || poor ? 'disabled' : ''}>${locked ? '🔒 Locked' : 'Place'}</button></div>`;
      };
      const all = Object.entries(BUILDINGS).filter(([k]) => k !== 'hall');
      return ['🔨 Build Menu', '<div class="sec">Facilities</div>' + all.filter(([, t]) => !t.decor).map(row).join('') + '<div class="sec">Outpost Props & Minor Facilities</div>' + all.filter(([, t]) => t.decor).map(row).join('')];
    }
    case 'quests': {
      const rd = readyHeroes();
      const open = G.quests.filter(q => q.state === 'open'), act = G.quests.filter(q => q.state === 'active');
      let h = `<div class="s">Ready heroes (geared & rested): <b>${rd.length}</b> / ${G.heroes.length}</div>`;
      if (first('portal')) {
        const dq = G.quests.find(q => q.dive);
        h += `<div class="sec">Waystone Portal</div><div class="row" style="border-color:#b070ff"><div style="font-size:30px">🌀</div><div class="grow"><div class="t">Endless Dive</div><div class="s">Send 2–4 geared heroes through the portal. Floors get harder forever: <b>recall to bank your loot</b> or fight on for rare materials (💎 🐉 🪶). Loot is banked automatically every 5 floors; a wipe-out loses what is unbanked. Best: floor ${G.diveBest}.</div></div><button class="act" data-act="dive" ${dq || rd.length < 2 ? 'disabled' : ''}>${dq ? 'In progress' : (rd.length < 2 ? 'Need 2 ready' : 'Dive!')}</button></div>`;
      }
      h += '<div class="sec">Active Expeditions</div>' + (act.map(q => q.dive
        ? `<div class="row"><div class="grow"><div class="t">🌀 Endless Dive — floor ${diveFloorIndex(q.script, q.elapsed) + 1}</div><div class="s">${q.heroes.map(x => x.name).join(', ')} · at risk: ${rewardText(q.pending)}</div><div class="bar"><i style="width:${diveProg(q)}%"></i></div></div><div style="text-align:center"><button class="act" data-act="watch" data-q="${q.id}">👁 Watch</button></div></div>`
        : `<div class="row"><div class="grow"><div class="t">${q.name}</div><div class="s">${q.heroes.map(x => x.name).join(', ')} · success ${Math.round(q.chance * 100)}%</div><div class="bar"><i style="width:${100 - q.t / q.dur * 100}%"></i></div></div><div style="text-align:center">${Math.ceil(q.t)}s<br><button class="act" data-act="watch" data-q="${q.id}">👁 Watch</button></div></div>`).join('') || '<div class="s">None.</div>');
      h += '<div class="sec">Quest Board</div>' + (open.map(q => {
        const party = bestParty(q), ok = party.length >= q.minH, c = Math.round(chanceFor(q, party, false) * 100), ce = Math.round(chanceFor(q, party, true) * 100);
        const loot = Object.entries(q.loot).map(([k, v]) => ({ ore: '⛏️', herbs: '🌿', wood: '🪵', arcane: '✨' }[k]) + v).join(' ');
        return `<div class="row"><div class="grow"><div class="t">${q.name} <span class="tag">${q.type}</span></div>
          <div class="s">Party ${q.minH}–${q.maxH} · Danger ${q.diff.toFixed(1)} · ${Math.round(q.dur)}s</div>
          ${cost(q.gold)}<span class="tag">⭐ ${q.renown}</span><span class="tag">${loot}</span>
          <div class="s">${ok ? `Best party: ${party.map(x => x.name).join(', ')} → <b>${c}%</b> (${ce}% enchanted)` : '<span style="color:#ff9a9a">Not enough ready heroes</span>'}</div></div>
          <div style="display:flex;flex-direction:column;gap:4px"><button class="act" data-act="dispatch" data-q="${q.id}" ${ok ? '' : 'disabled'}>Dispatch</button>
          <button class="act" data-act="dispatchE" data-q="${q.id}" ${ok && G.mana >= 5 ? '' : 'disabled'}>✨ Enchant (5)</button></div></div>`;
      }).join('') || '<div class="s">No quests posted right now — new ones appear regularly.</div>');
      h += '<div class="sec">Roster <span class="s">(tap a hero for details)</span></div>' + (G.heroes.map(x => `<div class="s" data-act="hero" data-id="${x.id}" style="cursor:pointer">${x.vip ? '⭐ ' : ''}${CLASSES[x.cls].icon} ${x.name} · Lv${x.level} ${CLASSES[x.cls].label} · 🔋${Math.round(x.stamina)} · 😊${Math.round(x.happy)} · ${x.gear ? 'geared' : 'needs gear'}${x.state === 'quest' ? ' · on quest' : ''}</div>`).join('') || '<div class="s">No heroes yet. Build a Tavern to attract them!</div>');
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
      <div class="row"><div class="grow"><div class="t">💾 Save</div><div class="s">The game autosaves every 15 seconds and when you leave. Last save: ${lastSaved ? Math.round((Date.now() - lastSaved) / 1000) + 's ago' : 'not yet'}.</div></div><button class="act" data-act="save">Save now</button></div>
      <div class="row"><div class="grow"><div class="t">🗑 New game</div><div class="s">${modalArg === 'confirm' ? '<b style="color:#ff9a9a">This erases your saved guild. Tap again to confirm.</b>' : 'Delete the save and start a fresh guild.'}</div></div><button class="act red" data-act="newgame">${modalArg === 'confirm' ? 'Really erase' : 'New game'}</button></div>
      <div class="s" style="margin-top:8px">Quests keep running for up to 10 minutes while you are away.</div>`];
    case 'hero': {
      const h = G.heroes.find(x => x.id === modalArg); if (!h) return ['Hero', '<div class="s">This hero is no longer in the guild.</div>'];
      const c = CLASSES[h.cls], tr = h.vip ? TRAITS[h.vip.trait] : null, aq = G.quests.find(q => q.state === 'active' && q.heroes.includes(h));
      const bar = (v, col) => `<div class="bar"><i style="width:${Math.max(0, Math.min(100, v))}%;${col ? 'background:' + col : ''}"></i></div>`;
      const stateTxt = { idle: 'Idle', walking: 'Walking', busy: 'Busy', waiting: 'Waiting around', quest: 'On an expedition', leaving: 'Leaving the guild' }[h.state] || h.state;
      let body = `<div class="row"><div style="font-size:34px">${c.icon}</div><div class="grow"><div class="t">${h.vip ? '⭐ ' : ''}${h.name}</div><div class="s">Level ${h.level} ${c.label} · ${stateTxt}${h.quests ? ' · ' + h.quests + ' expeditions' : ''}</div></div>${aq ? `<button class="act" data-act="watch" data-q="${aq.id}">👁 Watch</button>` : ''}</div>`;
      if (tr) body += `<div class="row" style="border-color:#ffd24a"><div style="font-size:30px">${tr.icon}</div><div class="grow"><div class="t">VIP trait: ${tr.label}</div><div class="s">${tr.desc}</div></div></div>`;
      body += `<div class="s" style="margin-top:6px">Experience ${h.xp}/${h.level + 1}</div>${bar(h.xp / (h.level + 1) * 100, '#8fd4ff')}
        <div class="s" style="margin-top:6px">Stamina ${Math.round(h.stamina)}</div>${bar(h.stamina, h.stamina < 45 ? '#e0503a' : '#5be35b')}
        <div class="s" style="margin-top:6px">Happiness ${Math.round(h.happy)}</div>${bar(h.happy, h.happy < 30 ? '#e0503a' : '#f0c040')}
        <div class="row"><div class="grow"><div class="t">Gear</div><div class="s">${h.gear ? '✔ Equipped — ready for quests' : '✘ Needs ' + (h.cls === 'wizard' ? 'potions from the Alchemical Lab' : 'a weapon from the Forge')}</div></div>
        <div class="grow"><div class="t">Power</div><div class="s">${heroPower(h, c.quest).toFixed(1)} on ${c.quest} quests</div></div></div>`;
      return [(h.vip ? '⭐ ' : '') + h.name, body];
    }
    case 'upgrades': {
      const c1 = 300 * (G.outpost + 1), c2 = 250 * (G.boardLvl + 1), c3 = 200 * (G.walls + 1);
      return ['⬆️ Outpost Upgrades', `
        <div class="row"><div class="grow"><div class="t">Expand Outpost <span class="tag">Lv ${G.outpost}/5</span></div><div class="s">+3 population capacity.</div>${cost(c1)}</div><button class="act" data-act="up" data-k="outpost" ${G.gold < c1 || G.outpost >= 5 ? 'disabled' : ''}>Upgrade</button></div>
        <div class="row"><div class="grow"><div class="t">Quest Board Expansion <span class="tag">Lv ${G.boardLvl}/3</span></div><div class="s">+1 quest slot on the board.</div>${cost(c2)}</div><button class="act" data-act="up" data-k="boardLvl" ${G.gold < c2 || G.boardLvl >= 3 ? 'disabled' : ''}>Upgrade</button></div>
        <div class="row"><div class="grow"><div class="t">Fortify Walls <span class="tag">Lv ${G.walls}/4</span></div><div class="s">+3 defense against monster raids.</div>${cost(c3)}</div><button class="act" data-act="up" data-k="walls" ${G.gold < c3 || G.walls >= 4 ? 'disabled' : ''}>Upgrade</button></div>`];
    }
    case 'building': {
      const b = G.buildings.find(x => x.id === modalArg); if (!b) return ['', ''];
      const t = BUILDINGS[b.type]; let h = `<div class="s">${t.desc}</div><div class="row"><div class="grow"><div class="t">Level ${b.level}</div>`;
      if (b.type === 'forge') h += `<div class="s">Weapons in stock: <b>${b.stock}/${stockCap(b)}</b> · Iron Ore: ${G.ore}</div><div class="bar"><i style="width:${b.progress * 100}%"></i></div>`;
      if (b.type === 'alchemy') h += `<div class="s">Potions in stock: <b>${b.stock}/${stockCap(b)}</b> · Herbs: ${G.herbs}</div><div class="bar"><i style="width:${b.progress * 100}%"></i></div>`;
      if (b.type === 'warehouse') h += `<div class="s">This warehouse adds <b>+${6 + 4 * (b.level - 1)}</b> stock to every Forge and Lab · total bonus +${warehouseBonus()}</div>`;
      if (b.type === 'tavern') h += `<div class="s">Meal price: ${mealGold().toFixed(1)}g · Passive: ${b.level * 0.25}g/s</div>`;
      const uc = 150 * b.level + 100;
      if (['forge', 'alchemy', 'tavern', 'warehouse'].includes(b.type)) h += `</div><button class="act" data-act="upBuilding" data-id="${b.id}" ${G.gold < uc || G.wood < 5 * b.level || b.level >= 5 || !hasRare(upReq(b)) ? 'disabled' : ''}>Upgrade<br>${uc}g + ${5 * b.level}🪵 ${rareTags(upReq(b))}</button></div>`; else h += '</div></div>';
      if (b.type === 'portal') h += `<div class="s">Deepest dive so far: floor <b>${G.diveBest}</b></div><button class="act" data-act="open" data-k="quests" style="margin:6px 0">Open the Endless Dive</button>`;
      if (b.type === 'hall') h += `<button class="act" data-act="open" data-k="quests" style="margin:6px 0">Open Quest Board</button>`;
      if (b.type === 'market') h += '<div class="sec">Buy Materials</div>' + [['ore', '⛏️ Iron Ore', 8], ['herbs', '🌿 Herbs', 6], ['wood', '🪵 Pine Wood', 6]].map(([k, n, p]) => `<div class="row"><div class="grow"><div class="t">${n} ×5</div>${cost(p * 5)}<span class="tag">have ${G[k]}</span></div><button class="act" data-act="buy" data-k="${k}" data-p="${p * 5}" ${G.gold < p * 5 ? 'disabled' : ''}>Buy</button></div>`).join('');
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
  lastHtml = html; $('modalTitle').textContent = title; $('modalBody').innerHTML = body;
}

const ACT = {
  dive() { dispatchDive(); },
  hero(d) { openModal('hero', +d.id); },
  save() { saveGame(false); renderModal(true); },
  newgame() { if (modalArg !== 'confirm') { modalArg = 'confirm'; return; } try { localStorage.removeItem(SAVE_KEY); } catch (e) { } window.__noSave = true; location.reload(); },
  watch(d) { startWatch(+d.q); },
  alarm() { G.alarm = true; toast('🔔 Alarm sounded! Heroes rush to defend!'); hideBanner('raid'); showBanner('raid', '🔔 Alarm sounded — heroes are defending!', []); },
  openMerchant() { openModal('merchant'); },
  deliver(d) { deliverOrder(+d.id); },
  place(d) { startPlacement(d.k); closeModal(); },
  dispatch(d) { dispatch(+d.q, false); },
  dispatchE(d) { dispatch(+d.q, true); },
  flyer() { if (G.gold >= 60 && spawnHero()) { G.gold -= 60; toast('A new hero answers your flyer!'); } },
  hire(d) { const c = staffCost(d.k); if (G.gold >= c && G.staff[d.k] < maxStaff) { G.gold -= c; G.staff[d.k]++; } },
  fire(d) { if (G.staff[d.k] > 0) G.staff[d.k]--; },
  research(d) { const c = TECHS[d.k][2], req = TECHS[d.k][3]; if (G.gold >= c && !G.research[d.k] && hasRare(req)) { G.gold -= c; spendRare(req); G.research[d.k] = true; toast(`Researched ${TECHS[d.k][0]}!`); } },
  up(d) {
    const k = d.k, c = { outpost: 300 * (G.outpost + 1), boardLvl: 250 * (G.boardLvl + 1), walls: 200 * (G.walls + 1) }[k];
    if (G.gold >= c) { G.gold -= c; G[k]++; }
  },
  upBuilding(d) { const b = G.buildings.find(x => x.id === +d.id), c = 150 * b.level + 100; if (b && b.level < 5 && G.gold >= c && G.wood >= 5 * b.level && hasRare(upReq(b))) { G.gold -= c; G.wood -= 5 * b.level; spendRare(upReq(b)); b.level++; b.pop = 0.6; toast(`${BUILDINGS[b.type].name} upgraded to level ${b.level}!`); } },
  open(d) { openModal(d.k); },
  buy(d) { const p = +d.p; if (G.gold >= p) { G.gold -= p; G[d.k] += 5; } },
  mbuy(d) {
    const p = +d.p, n = +d.n; if (G.gold < p) return; G.gold -= p;
    if (d.k === 'arcane') { G.rare.scale++; toast('🐉 You acquired a Dragon Scale!'); } else G[d.k] += n;
  },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (t && ACT[t.dataset.act]) { ACT[t.dataset.act](t.dataset); renderModal(true); updateHUD(); return; }
  const o = e.target.closest('[data-open]'); if (o) { cancelPlacement(); openModal(o.dataset.open); }
});
$('settingsBtn').onclick = () => openModal('settings');
$('speedBtn').onclick = () => { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 4 : 1; $('speedBtn').textContent = '⏵ x' + G.speed; };

/* ------------------------------------------------------------------ *
 *  Placement & input (raycaster, grid snapping, pan/zoom)
 * ------------------------------------------------------------------ */
const grid = new THREE.GridHelper(N, N, 0xffffff, 0xffffff);
grid.position.set(N / 2, 0.05, N / 2); grid.material.transparent = true; grid.material.opacity = 0.18; grid.visible = false; scene.add(grid);
let placing = null, ghost = null, ghostCell = [0, 0], ghostRot = 0;
function startPlacement(type) {
  cancelPlacement(); placing = type; ghostRot = 0;
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
  $('placeCost').textContent = t.cost; $('placeName').textContent = t.name;
  const [w, d] = footprint(type, 0);
  moveGhost(Math.floor(camTarget.x - w / 2 + 0.5), Math.floor(camTarget.z - d / 2 + 0.5));
}
function cancelPlacement() {
  placing = null; if (ghost) { scene.remove(ghost); ghost = null; } grid.visible = false;
  $('placeHint').classList.add('hidden'); $('placeBar').classList.add('hidden'); $('toolbar').classList.remove('hidden'); document.body.classList.remove('placing');
}
function moveGhost(cx, cz) {
  const [w, d] = footprint(placing, ghostRot), t = BUILDINGS[placing];
  cx = Math.max(2, Math.min(N - 2 - w, cx)); cz = Math.max(2, Math.min(N - 2 - d, cz));
  ghostCell = [cx, cz];
  ghost.position.set(cx + w / 2, 0, cz + d / 2);
  ghost.userData.pivot.rotation.y = ghostRot * Math.PI / 2;
  const ok = canPlace(placing, cx, cz, ghostRot) && G.gold >= t.cost;
  ghost.userData.mats.forEach((m, i) => m.color.setHex(i === 1 ? (ok ? 0xffffff : 0xff6060) : (ok ? 0xffd24a : 0xff4040)));
  ghost.userData.ok = ok; $('placeOk').disabled = !ok;
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
  if (!ghost.userData.ok) return toast(G.gold < t.cost ? 'Not enough gold.' : 'Cannot build there.');
  G.gold -= t.cost; const b = addBuilding(placing, ghostCell[0], ghostCell[1], ghostRot);
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
  if (e.key.toLowerCase() === 'v') return togglePerspective();
  const k = watching ? null : { b: 'build', q: 'quests', r: 'recruit', t: 'research', u: 'upgrades' }[e.key.toLowerCase()]; if (k) openModal(k);
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
  $('camPersp').onclick = togglePerspective; $('camReset').onclick = resetView;
}

/* ------------------------------------------------------------------ *
 *  Staff characters (visible employees: dwarf smith, wizard alchemist, cook, bard, guards, porters)
 * ------------------------------------------------------------------ */
const staffMeshes = []; let staffSig = '';
function syncStaff() {
  const sig = JSON.stringify(G.staff) + G.buildings.length;
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
const SCALARS = ['gold', 'renown', 'mana', 'ore', 'wood', 'herbs', 'time', 'speed', 'outpost', 'boardLvl', 'walls', 'questsDone', 'nextId', 'diveBest'];
let lastSaved = 0;
function serialize() {
  const g = {}; SCALARS.forEach(k => { g[k] = G[k]; });
  Object.assign(g, { staff: G.staff, research: G.research, tm: G.tm, orders: G.orders, rare: G.rare });
  return {
    v: 1, savedAt: Date.now(), g,
    buildings: G.buildings.map(b => ({ type: b.type, cx: b.cx, cz: b.cz, rot: b.rot || 0, level: b.level, stock: b.stock, progress: b.progress })),
    heroes: G.heroes.map(h => ({ id: h.id, cls: h.cls, variant: h.variant, name: h.name, level: h.level, xp: h.xp, stamina: h.stamina, happy: h.happy, gear: h.gear, quests: h.quests, vip: h.vip, x: h.pos.x, z: h.pos.z, onQuest: h.state === 'quest' })),
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
    Object.assign(G.rare, d.g.rare || {}); Object.assign(G.staff, d.g.staff); G.research = d.g.research || {}; Object.assign(G.tm, d.g.tm);
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
  const el = document.createElement('div'); el.className = 'lg l-' + e.type; el.textContent = e.log + (e.dmg ? e.dmg : '');
  const box = $('watchLog'); box.appendChild(el); while (box.children.length > 7) box.firstChild.remove();
}
function startWatch(qid) {
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
  w.exiting = true; stageEl.style.display = 'none'; worldEl.style.display = ''; document.body.classList.remove('watching');
  flyTo({ yaw: watchSaved.yaw, pitch: watchSaved.pitch, viewS: watchSaved.viewS, x: watchSaved.x, z: watchSaved.z }, 1.0);
}
function cleanupWatch() {
  if (!watching) return; watching.exp.dispose(); watching = null;
  scene.background.setHex(0x2f7a32); sun.position.set(N / 2 + 18, 30, N / 2 + 8); sun.target.position.set(N / 2, 0, N / 2); sun.intensity = 1.05; ambient.intensity = 0.75;
  updateCamera();
}
function onQuestEnd(q, ok) {
  if (!watching || watching.q !== q || watching.exiting) return;
  watching.finish = { ok, t: 4.5, T: q.dive ? q.elapsed : q.dur, text: q.endText || (ok ? `🏆 Victory! +${Math.round(q.gold * questGoldMul())}g · +${q.renown}⭐` : '☠ Defeat — the party limps home') };
  updateWatchHUD();
}
// --- in-fight actions (only before the finale begins)
function boostQuest(q, amt) {
  const c0 = q.chance; q.chance = Math.min(0.97, c0 + amt);
  if (!q.ok && Math.random() < (q.chance - c0) / (1 - c0)) { q.ok = true; q.deaths = []; q.script = genScript(q); }
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
  if (q.dive) { q.heals.push({ t: q.elapsed, amt: G.research.feather ? 0.5 : 0.35 }); rebuildDive(q, q.elapsed); toast('🧪 Healing potions delivered to the party!'); }
  else { q.heals.push({ t: q.dur - q.t, amt: G.research.feather ? 0.5 : 0.35 }); boostQuest(q, 0.08); toast(`🧪 Healing potions delivered! Success chance now ${Math.round(q.chance * 100)}%`); }
  updateWatchHUD();
}
function watchRecall() {
  const w = watching, q = w?.q; if (!q || w.finish) return;
  if (w.recallArm <= 0) { w.recallArm = 3; return updateWatchHUD(); }
  if (q.dive) return resolveDive(q, 'recalled');
  const i = G.quests.indexOf(q); if (i >= 0) G.quests.splice(i, 1); q.state = 'done';
  q.heroes.forEach(h => { if (!G.heroes.includes(h)) return; h.state = 'idle'; h.cool = 0; h.target = null; h.stamina = Math.max(20, h.stamina - 10); h.happy = Math.max(0, h.happy - 8); h.pos.set(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1)); h.mesh.visible = true; });
  toast('🏳 Party recalled — no rewards.'); endWatch();
}
function updateWatchHUD() {
  const w = watching; if (!w) return; const q = w.q, S = q.script, T = nowT(w), dv = !!q.dive;
  $('wName').textContent = dv ? `Endless Dungeon — floor ${diveFloorIndex(S, T) + 1} · best ${G.diveBest}` : `${w.exp.name} — ${q.name}`;
  $('wPhase').textContent = w.finish ? w.finish.text : phaseText(S, T);
  $('wProg').style.width = (dv ? (diveFloor({ script: S, elapsed: T }) ? Math.min(100, (T - diveFloor({ script: S, elapsed: T }).s) / (diveFloor({ script: S, elapsed: T }).e - diveFloor({ script: S, elapsed: T }).s) * 100) : 0) : T / q.dur * 100) + '%';
  $('watchBar').classList.toggle('dive', dv);
  $('wParty').innerHTML = q.party.map((p, h) => { const hp = heroHp(q, S, h, T), dead = S.heroes[h].dies && T >= S.heroes[h].D; return `<div class="chip ${dead ? 'dead' : ''}"><span>${dead ? '☠' : CLASSES[p.cls].icon} ${p.name}</span><b><i style="width:${hp * 100}%;background:${hp > 0.5 ? '#5be35b' : hp > 0.25 ? '#f0c040' : '#e0503a'}"></i></b></div>`; }).join('');
  const ci = canIntervene(q), lab = first('alchemy');
  const potions = ofType('alchemy').reduce((n, b) => n + b.stock, 0), nextF = dv ? diveFloorIndex(S, T) + 1 : 0, warded = dv && (q.enchants || []).some(x => x.floor + 3 > nextF);
  $('wEnchant').disabled = !ci || G.mana < 5 || (dv ? warded : !!(q.enchant || q.enchantedMid)); $('wEnchant').textContent = dv ? (warded ? '✨ Ward active' : '✨ Ward (5)') : `✨ Enchant (5) · ${Math.round(q.chance * 100)}%`;
  $('wPotion').disabled = !ci || potions < 1; $('wPotion').textContent = `🧪 Potion (${potions})`;
  $('wRecall').disabled = !!w.finish; $('wRecall').textContent = w.recallArm > 0 ? (dv ? '🏁 Confirm: bank & leave?' : '🏳 Confirm recall?') : (dv ? '🏁 Bank & leave' : '🏳 Recall');
  $('wFollow').classList.toggle('on', w.follow); $('wFollow').textContent = w.follow ? '🎯 Following' : '🎯 Follow';
  $('wPipBtn').classList.toggle('on', w.pip); $('pipFrame').classList.toggle('off', !w.pip);
  $('wSpeed').textContent = '⏵ x' + G.speed;
  $('wSwitch').innerHTML = G.quests.filter(x => x.state === 'active' && x !== q).map(x => `<button class="act" data-act="watch" data-q="${x.id}">👁 ${x.name}</button>`).join('');
  $('wHint').textContent = dv ? (w.finish ? '' : (S.wiped ? 'The party has fallen…' : `At risk: ${rewardText(q.pending)} · next checkpoint: floor ${Math.ceil((q.cleared + 1) / 5) * 5}`)) : (ci ? 'Intervene before the finale!' : (w.finish ? '' : 'The finale has begun — no more help possible'));
}
$('wBack').onclick = endWatch; $('pipFrame').onclick = endWatch;
$('wFollow').onclick = () => { if (watching) { watching.follow = !watching.follow; updateWatchHUD(); } };
$('wPipBtn').onclick = () => { if (watching) { watching.pip = !watching.pip; updateWatchHUD(); } };
$('wSpeed').onclick = () => $('speedBtn').click();
$('wEnchant').onclick = watchEnchant; $('wPotion').onclick = watchPotion; $('wRecall').onclick = watchRecall;
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
  // animation: building pop-in, light flicker
  for (const b of G.buildings) {
    if (b.pop < 1) { b.pop = Math.min(1, b.pop + rdt * 3); const s = b.pop; b.group.scale.setScalar(Math.max(0.01, 1 - Math.pow(1 - s, 2) + Math.sin(s * Math.PI) * 0.1)); }
    const f = b.group.userData.flicker; if (f) f.intensity = 1.4 + Math.sin(performance.now() / 90) * 0.25 + Math.random() * 0.2;
  }
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
resize();
if (!loadGame()) {
  spawnHero('knight', true); spawnHero('ranger', true);
  genQuest(); genQuest();
  toast('Welcome, Guild Master! Build a Tavern and a Forge to attract & equip heroes.');
}
frame();
window.__heroHp = heroHp; window.__rebuild = rebuildDive;
window.__api = { dispatchDive, diveTick, resolveDive, toScreen, findPath, blocked, saveGame, loadGame, serialize, startWatch, endWatch, watchEnchant, watchPotion, watchRecall, addBuilding, canPlace, spawnHero, openModal, ACT, startRaid, startMerchant, addOrder, deliverOrder, genQuest, dispatch, readyHeroes };
