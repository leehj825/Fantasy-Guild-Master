import * as THREE from '../vendor/three.module.js';
import { BUILDINGS, buildBuilding, buildHero, buildStaff, buildGoblin, buildMerchantCart, vox, mat, PROPS } from './models.js';

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
let yaw = VIEW0.yaw, pitch = VIEW0.pitch, viewS = VIEW0.zoom, perspective = false;
const FOV = 38;
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 500);
const perspCam = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);
let camera = orthoCam;
const camTarget = new THREE.Vector3(N / 2 + 1, 0, N / 2 + 1);
const clampView = () => {
  pitch = Math.max(0.28, Math.min(1.42, pitch)); viewS = Math.max(3.5, Math.min(24, viewS));
  camTarget.x = Math.max(2, Math.min(N - 2, camTarget.x)); camTarget.z = Math.max(2, Math.min(N - 2, camTarget.z));
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
  const u = 2 * viewS / innerHeight, rx = Math.cos(yaw), rz = -Math.sin(yaw), ux = -Math.sin(yaw), uz = -Math.cos(yaw), k = u / Math.sin(pitch);
  camTarget.x += -dx * u * rx + dy * k * ux; camTarget.z += -dx * u * rz + dy * k * uz; updateCamera();
}
function rotateBy(dyaw, dpitch) { yaw += dyaw; pitch += dpitch; updateCamera(); }
function zoomBy(f) { viewS *= f; updateCamera(); }
function resetView() { yaw = VIEW0.yaw; pitch = VIEW0.pitch; viewS = VIEW0.zoom; camTarget.set(N / 2 + 1, 0, N / 2 + 1); updateCamera(); }
function togglePerspective() { perspective = !perspective; $('camPersp').classList.toggle('on', perspective); updateCamera(); }
function resize() { renderer.setSize(innerWidth, innerHeight, false); updateCamera(); }
addEventListener('resize', resize);

scene.add(new THREE.AmbientLight(0xcfe3ff, 0.75));
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
  royal: null, merchant: null, alarm: false, questsDone: 0, nextId: 1,
  tm: { spawn: 4, quest: 1, wage: 30, trickle: 0, merchant: 100, royal: 160, raid: 150, tavern: 0, mana: 0 },
};
window.__G = G;

const occ = new Set();
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
  G.buildings.push(b);
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
const craftSpeed = () => (1 + 0.25 * G.staff.smith) * (G.research.forging ? 1.3 : 1);
const alchSpeed = () => (1 + 0.25 * G.staff.alch) * (G.research.forging ? 1.15 : 1);
const mealGold = () => 12 * (1 + 0.15 * G.staff.cook) * (1 + 0.3 * ((first('tavern')?.level || 1) - 1));
const questGoldMul = () => (G.research.charter ? 1.25 : 1);
const trickleMul = () => (1 + 0.5 * G.staff.porter);
const stockCap = b => 4 + 2 * b.level;
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
const heroPower = (h, type) => CLASSES[h.cls].base * (1 + 0.2 * (h.level - 1)) * (h.gear ? 1 : 0.5) * (CLASSES[h.cls].quest === type ? 1.3 : 1);
const heroGroup = new THREE.Group(); scene.add(heroGroup);

function spawnPoint() {
  return Math.random() < 0.5 ? new THREE.Vector3(N - 1.5, 0, HALL.cz + 2) : new THREE.Vector3(HALL.cx + 2.5, 0, N - 1.5);
}
function spawnHero(cls, atHall = false) {
  if (G.heroes.length >= popCap()) return null;
  if (!cls) {
    const opts = ['knight', 'ranger'];
    if (first('alchemy')) opts.push('wizard', 'wizard');
    cls = pick(opts);
  }
  const mesh = buildHero(cls, Math.floor(Math.random() * 2));
  const p = atHall ? new THREE.Vector3(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1.2)) : spawnPoint();
  mesh.position.copy(p); heroGroup.add(mesh);
  const bub = document.createElement('div'); bub.className = 'bub hidden'; worldEl.appendChild(bub);
  const h = {
    id: G.nextId++, cls, name: pick(NAMES), level: 1, xp: 0, stamina: rnd(60, 100), happy: 100, gear: false,
    mesh, pos: mesh.position, bub, state: 'idle', target: null, onArrive: null, timer: 0, onDone: null, cool: 0, phase: Math.random() * 6, vis: true,
  };
  G.heroes.push(h);
  return h;
}
function removeHero(h, why) {
  heroGroup.remove(h.mesh); h.bub.remove();
  G.heroes.splice(G.heroes.indexOf(h), 1);
  if (why) toast(why);
}
function goTo(h, p, onArrive) { h.target = p.clone(); h.target.x += rnd(-0.5, 0.5); h.onArrive = onArrive; h.state = 'walking'; }
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
        const g = mealGold();
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
          gain(shop.door, CLASSES[h.cls].price * (1 + 0.15 * (shop.level - 1)));
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

function updateHero(h, dt) {
  h.phase += dt * 8;
  if (h.state === 'quest') return;
  const decay = Math.pow(0.7, G.staff.bard);
  h.stamina = Math.max(0, h.stamina - 0.7 * dt);
  const needy = h.stamina < 45 || !h.gear;
  h.happy = Math.max(0, Math.min(100, h.happy + (needy ? -0.35 * decay : 0.15) * dt));
  if (h.state === 'leaving') {
    stepToward(h, dt, 3);
    if (!h.target) removeHero(h);
    return;
  }
  if (h.happy <= 0 && h.state !== 'busy') {
    h.state = 'leaving'; h.target = spawnPoint(); setMood(h, '💢'); toast(`${h.name} the ${CLASSES[h.cls].label} got fed up and left.`); return;
  }
  if (G.alarm && G.goblins.length) {
    const c = G.goblins[0].mesh.position;
    stepToward(h, dt, 4.2, c, 3.2); setMood(h, '⚔️'); return;
  }
  if (h.state === 'walking') {
    if (stepToward(h, dt, 2.4)) { h.target = null; const f = h.onArrive; h.onArrive = null; if (f) f(); }
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
  if (enchant) c += G.research.arcane ? 0.3 : 0.2;
  return Math.max(0.03, Math.min(0.97, c));
}
function dispatch(qid, enchant) {
  const q = G.quests.find(x => x.id === qid); if (!q || q.state !== 'open') return;
  const party = bestParty(q);
  if (party.length < q.minH) return toast(`Need ${q.minH} ready hero(es) with gear and stamina.`);
  if (enchant) { if (G.mana < 5) return toast('Not enough Mana.'); G.mana -= 5; }
  q.enchant = enchant; q.chance = chanceFor(q, party, enchant); q.heroes = party; q.state = 'active'; q.t = q.dur;
  party.forEach(h => { h.state = 'quest'; h.mesh.visible = false; setMood(h, null); h.onDone = null; });
  toast(`Party of ${party.length} dispatched: ${q.name}`);
  renderModal(true);
}
function resolveQuest(q) {
  const ok = Math.random() < q.chance;
  const hp = new THREE.Vector3(HALL.cx + 2.5, 0, HALL.cz + 5);
  q.state = 'done'; G.quests.splice(G.quests.indexOf(q), 1);
  const alive = [];
  q.heroes.forEach(h => {
    if (!G.heroes.includes(h)) return;
    h.state = 'idle'; h.cool = 0; h.stamina = Math.max(20, h.stamina - 25);
    h.pos.set(HALL.cx + 2.5 + rnd(-1.5, 1.5), 0, HALL.cz + 5 + rnd(0, 1)); h.mesh.visible = true; h.target = null;
    if (!ok && Math.random() > CLASSES[h.cls].survive + 0.15) { removeHero(h, `${h.name} the ${CLASSES[h.cls].label} fell in battle...`); return; }
    if (ok) { h.xp++; if (h.xp >= h.level + 1) { h.xp = 0; h.level++; floatText(h.pos, `⬆ ${h.name} Lv${h.level}`, '#9bff9b'); } }
    if (Math.random() < (ok ? 0.5 : 1)) h.gear = false;
    h.happy = Math.min(100, h.happy + (ok ? 20 : -10));
    alive.push(h);
  });
  if (ok) {
    const g = Math.round(q.gold * questGoldMul());
    gain(hp, g); G.renown += q.renown;
    floatText(hp.clone().add(new THREE.Vector3(0, 0.6, 0)), `+${q.renown} ⭐`, '#ffd24a');
    const oreMul = G.research.prospect ? 1.5 : 1;
    if (q.loot.ore) G.ore += Math.round(q.loot.ore * oreMul);
    if (q.loot.herbs) G.herbs += q.loot.herbs;
    if (q.loot.wood) G.wood += q.loot.wood;
    if (q.loot.arcane) G.mana += q.loot.arcane * 5;
    G.questsDone++;
    toast(`✔ ${q.name} complete! +${g}g, +${q.renown}⭐, loot collected.`);
  } else {
    G.renown = Math.max(0, G.renown - 1);
    toast(`✘ ${q.name} failed. The party limps home.`);
  }
  renderModal(true);
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
  let d = G.staff.guard * 4 + G.walls * 3;
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
function startRoyal() {
  const need = 5 + Math.floor(G.renown / 8);
  G.royal = { need, t: 150, reward: 150 + need * 40, ren: 5 };
  toast(`👑 Royal Demand: ${need} iron swords!`);
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
  for (const q of [...G.quests]) if (q.state === 'active') { q.t -= dt; if (q.t <= 0) resolveQuest(q); }
  // events
  t.merchant -= dt; if (t.merchant <= 0) { t.merchant = rnd(150, 220); if (G.renown >= 2 && !G.merchant) startMerchant(); }
  if (G.merchant) { G.merchant.t -= dt; if (G.merchant.t <= 0) endMerchant(); }
  t.raid -= dt; if (t.raid <= 0) { t.raid = rnd(120, 190); if (G.renown >= 3 && !G.goblins.length) startRaid(); }
  t.royal -= dt; if (t.royal <= 0) { t.royal = rnd(200, 280); if (G.renown >= 4 && first('forge') && !G.royal) startRoyal(); }
  if (G.royal) {
    G.royal.t -= dt;
    if (G.royal.t <= 0) { G.renown = Math.max(0, G.renown - 3); toast('👑 You failed the King. Reputation damaged! (-3 ⭐)'); G.royal = null; }
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
  $('hOre').textContent = G.ore; $('hWood').textContent = G.wood; $('hHerbs').textContent = G.herbs;
  const ex = G.quests.filter(q => q.state === 'active').map(q => `<div class="exp"><span>⚔️ ${q.name}</span><span>${Math.ceil(q.t)}s</span><div class="bar"><i style="width:${100 - q.t / q.dur * 100}%"></i></div></div>`).join('');
  if (ex !== $('expeds')._h) { $('expeds')._h = ex; $('expeds').innerHTML = ex ? '<h4>Expeditions:</h4>' + ex : ''; }
  const pend = OBJ.filter(o => !o[1]()).slice(0, 3);
  const done = OBJ.filter(o => o[1]()).slice(-1);
  const html = [...done, ...pend].map(o => `<li class="${o[1]() ? 'done' : ''}">${o[1]() ? '☑' : '☐'} ${o[0]}</li>`).join('');
  if (html !== hudCache) { hudCache = html; $('objList').innerHTML = html; }
  const r = G.royal;
  const rh = r ? `<b>👑 Royal Demand</b><br>${r.need} swords · ${Math.ceil(r.t)}s<br>Reward ${r.reward}g +${r.ren}⭐<br><button class="act" data-act="deliver" ${(first('forge')?.stock || 0) < 1 ? 'disabled' : ''}>Deliver from Forge (${first('forge')?.stock || 0})</button>` : '';
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

const TECHS = {
  prospect: ['Prospecting', 'Ore yields from quests and workers +50%.', 200],
  forging: ['Efficient Forging', 'Forge +30% and Lab +15% crafting speed.', 250],
  charter: ['Guild Charter', 'Quest gold rewards +25%.', 300],
  arcane: ['Arcane Studies', 'Mana regen doubled; Enchant bonus +30%.', 350],
  valor: ['Banner of Valor', 'All parties +10% success chance.', 400],
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
      h += '<div class="sec">Active Expeditions</div>' + (act.map(q => `<div class="row"><div class="grow"><div class="t">${q.name}</div><div class="s">${q.heroes.map(x => x.name).join(', ')} · success ${Math.round(q.chance * 100)}%</div><div class="bar"><i style="width:${100 - q.t / q.dur * 100}%"></i></div></div><div>${Math.ceil(q.t)}s</div></div>`).join('') || '<div class="s">None.</div>');
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
      h += '<div class="sec">Roster</div>' + (G.heroes.map(x => `<div class="s">${CLASSES[x.cls].icon} ${x.name} · Lv${x.level} ${CLASSES[x.cls].label} · 🔋${Math.round(x.stamina)} · 😊${Math.round(x.happy)} · ${x.gear ? 'geared' : 'needs gear'}${x.state === 'quest' ? ' · on quest' : ''}</div>`).join('') || '<div class="s">No heroes yet. Build a Tavern to attract them!</div>');
      return ['📜 Quest Board & Guild Hall', h];
    }
    case 'recruit': {
      let h = `<div class="row"><div style="font-size:28px">📣</div><div class="grow"><div class="t">Post Recruitment Flyer</div><div class="s">Attract a hero right now (needs free beds).</div>${cost(60)}</div><button class="act" data-act="flyer" ${G.gold < 60 || G.heroes.length >= popCap() ? 'disabled' : ''}>Recruit</button></div>`;
      h += `<div class="sec">Guild Staff <span class="s">· wages: ${wage()}g / 30s</span></div>`;
      h += Object.entries(STAFF).map(([k, [n, i, d]]) => `<div class="row"><div style="font-size:28px">${i}</div><div class="grow"><div class="t">${n} <span class="tag">${G.staff[k]}/${maxStaff}</span></div><div class="s">${d} · wage 4g/30s</div>${cost(staffCost(k))}</div>
        <div style="display:flex;gap:4px"><button class="act" data-act="hire" data-k="${k}" ${G.gold < staffCost(k) || G.staff[k] >= maxStaff ? 'disabled' : ''}>Hire</button>${G.staff[k] ? `<button class="act red" data-act="fire" data-k="${k}">Fire</button>` : ''}</div></div>`).join('');
      return ['🛡️ Recruit & Staff', h];
    }
    case 'research': return ['⚗️ Research', Object.entries(TECHS).map(([k, [n, d, c]]) => `<div class="row"><div class="grow"><div class="t">${n}</div><div class="s">${d}</div>${cost(c)}</div>
        ${G.research[k] ? '<span class="tag">✔ Researched</span>' : `<button class="act" data-act="research" data-k="${k}" ${G.gold < c ? 'disabled' : ''}>Research</button>`}</div>`).join('')];
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
      if (b.type === 'tavern') h += `<div class="s">Meal price: ${mealGold().toFixed(1)}g · Passive: ${b.level * 0.25}g/s</div>`;
      const uc = 150 * b.level + 100;
      if (['forge', 'alchemy', 'tavern'].includes(b.type)) h += `</div><button class="act" data-act="upBuilding" data-id="${b.id}" ${G.gold < uc || G.wood < 5 * b.level || b.level >= 5 ? 'disabled' : ''}>Upgrade<br>${uc}g + ${5 * b.level}🪵</button></div>`; else h += '</div></div>';
      if (b.type === 'hall') h += `<button class="act" data-act="open" data-k="quests" style="margin:6px 0">Open Quest Board</button>`;
      if (b.type === 'market') h += '<div class="sec">Buy Materials</div>' + [['ore', '⛏️ Iron Ore', 8], ['herbs', '🌿 Herbs', 6], ['wood', '🪵 Pine Wood', 6]].map(([k, n, p]) => `<div class="row"><div class="grow"><div class="t">${n} ×5</div>${cost(p * 5)}<span class="tag">have ${G[k]}</span></div><button class="act" data-act="buy" data-k="${k}" data-p="${p * 5}" ${G.gold < p * 5 ? 'disabled' : ''}>Buy</button></div>`).join('');
      return [t.icon + ' ' + t.name, h];
    }
    case 'merchant': {
      if (!G.merchant) return ['', ''];
      return ['🛒 Wandering Merchant', `<div class="s">Rare wares, heavily discounted! Leaves in ${Math.ceil(G.merchant.t)}s.</div>` +
        [['ore', 20, 70, '⛏️ 20 Iron Ore'], ['herbs', 15, 45, '🌿 15 Herbs'], ['mana', 10, 60, '✨ 10 Mana'], ['arcane', 1, 90, '🐉 Dragon Scale (+3 Renown)']].map(([k, n, p, l]) => `<div class="row"><div class="grow"><div class="t">${l}</div>${cost(p)}</div><button class="act" data-act="mbuy" data-k="${k}" data-n="${n}" data-p="${p}" ${G.gold < p ? 'disabled' : ''}>Buy</button></div>`).join('')];
    }
  }
  return ['', ''];
}
function renderModal(force) {
  if (!modalKind) return;
  const [title, body] = modalContent();
  const html = title + '||' + body;
  if (!force && html === lastHtml) return;
  lastHtml = html; $('modalTitle').textContent = title; $('modalBody').innerHTML = body;
}

const ACT = {
  alarm() { G.alarm = true; toast('🔔 Alarm sounded! Heroes rush to defend!'); hideBanner('raid'); showBanner('raid', '🔔 Alarm sounded — heroes are defending!', []); },
  openMerchant() { openModal('merchant'); },
  deliver() {
    const f = first('forge'), r = G.royal; if (!f || !r) return;
    const n = Math.min(f.stock, r.need); f.stock -= n; r.need -= n;
    if (r.need <= 0) { gain(f.door, r.reward); G.renown += r.ren; toast(`👑 The King is pleased! +${r.reward}g, +${r.ren}⭐`); G.royal = null; }
    else toast(`Delivered ${n}. ${r.need} still needed.`);
  },
  place(d) { startPlacement(d.k); closeModal(); },
  dispatch(d) { dispatch(+d.q, false); },
  dispatchE(d) { dispatch(+d.q, true); },
  flyer() { if (G.gold >= 60 && spawnHero()) { G.gold -= 60; toast('A new hero answers your flyer!'); } },
  hire(d) { const c = staffCost(d.k); if (G.gold >= c && G.staff[d.k] < maxStaff) { G.gold -= c; G.staff[d.k]++; } },
  fire(d) { if (G.staff[d.k] > 0) G.staff[d.k]--; },
  research(d) { const c = TECHS[d.k][2]; if (G.gold >= c && !G.research[d.k]) { G.gold -= c; G.research[d.k] = true; toast(`Researched ${TECHS[d.k][0]}!`); } },
  up(d) {
    const k = d.k, c = { outpost: 300 * (G.outpost + 1), boardLvl: 250 * (G.boardLvl + 1), walls: 200 * (G.walls + 1) }[k];
    if (G.gold >= c) { G.gold -= c; G[k]++; }
  },
  upBuilding(d) { const b = G.buildings.find(x => x.id === +d.id), c = 150 * b.level + 100; if (b && G.gold >= c && G.wood >= 5 * b.level) { G.gold -= c; G.wood -= 5 * b.level; b.level++; b.pop = 0.6; toast(`${BUILDINGS[b.type].name} upgraded to level ${b.level}!`); } },
  open(d) { openModal(d.k); },
  buy(d) { const p = +d.p; if (G.gold >= p) { G.gold -= p; G[d.k] += 5; } },
  mbuy(d) {
    const p = +d.p, n = +d.n; if (G.gold < p) return; G.gold -= p;
    if (d.k === 'arcane') { G.renown += 3; toast('The scale is displayed proudly. +3 ⭐'); } else G[d.k] += n;
  },
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (t && ACT[t.dataset.act]) { ACT[t.dataset.act](t.dataset); renderModal(true); updateHUD(); return; }
  const o = e.target.closest('[data-open]'); if (o) { cancelPlacement(); openModal(o.dataset.open); }
});
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
  ptr.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ptr, camera);
  const hit = ray.intersectObjects(bGroup.children, true)[0];
  if (hit) { let o = hit.object; while (o && o.userData.bid === undefined) o = o.parent; if (o) openModal('building', o.userData.bid); }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { e.preventDefault(); if (e.shiftKey || e.ctrlKey) rotateBy(-e.deltaX * 0.004 - e.deltaY * 0.004, 0); else zoomBy(1 + Math.sign(e.deltaY) * 0.1); }, { passive: false });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { cancelPlacement(); closeModal(); return; }
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
  const k = { b: 'build', q: 'quests', r: 'recruit', t: 'research', u: 'upgrades' }[e.key.toLowerCase()]; if (k) openModal(k);
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
 *  Main loop
 * ------------------------------------------------------------------ */
const clock = new THREE.Clock(); let modalTick = 0, hudTick = 0;
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
  hudTick -= rdt; if (hudTick <= 0) { hudTick = 0.15; updateHUD(); }
  modalTick -= rdt; if (modalTick <= 0) { modalTick = 0.4; renderModal(false); }
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ *
 *  Boot: starter heroes + quests
 * ------------------------------------------------------------------ */
resize();
spawnHero('knight', true); spawnHero('ranger', true);
genQuest(); genQuest();
toast('Welcome, Guild Master! Build a Tavern and a Forge to attract & equip heroes.');
frame();
window.__api = { addBuilding, canPlace, spawnHero, openModal, ACT, startRaid, startMerchant, startRoyal, genQuest, dispatch, readyHeroes };
