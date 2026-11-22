// Low-poly voxel-style model library, modelled after the concept sheet:
// buildings, props, and characters are all built procedurally from boxes/cylinders/cones.
import * as THREE from '../vendor/three.module.js';

/* ---------------------------------------------------------------- helpers */
const matCache = new Map();
export function mat(color, emissive = 0, ei = 0) {
  const k = color + '_' + emissive + '_' + ei;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: ei, flatShading: true }));
  return matCache.get(k);
}
const shade = m => { m.castShadow = m.receiveShadow = true; return m; };
// box whose BOTTOM sits at y
export function vox(w, h, d, color, x = 0, y = 0, z = 0, emissive = 0, ei = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, emissive, ei));
  m.position.set(x, y + h / 2, z); return shade(m);
}
export const cyl = (rt, rb, h, color, x = 0, y = 0, z = 0, seg = 10, emissive = 0, ei = 0) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color, emissive, ei));
  m.position.set(x, y + h / 2, z); return shade(m);
};
export const cone = (r, h, color, x = 0, y = 0, z = 0, seg = 6, emissive = 0, ei = 0) => {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color, emissive, ei));
  m.position.set(x, y + h / 2, z); return shade(m);
};
export const sph = (r, color, x = 0, y = 0, z = 0, emissive = 0, ei = 0, seg = 8) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg - 2), mat(color, emissive, ei));
  m.position.set(x, y + r, z); return shade(m);
};
export const rot = (m, x = 0, y = 0, z = 0) => { m.rotation.set(x, y, z); return m; };
export const grp = (...c) => { const g = new THREE.Group(); c.flat().forEach(x => g.add(x)); return g; };
export const at = (o, x = 0, y = 0, z = 0) => { o.position.set(x, y, z); return o; };

// triangular prism roof (apex up). ridge along x (default) or z. base sits at y.
function roof(len, width, height, color, y, axis = 'x') {
  const g = new THREE.CylinderGeometry(1, 1, len, 3);
  g.rotateX(-Math.PI / 2); g.scale((width / 2) / 0.866, height / 1.5, 1); g.translate(0, height / 3, 0);
  if (axis === 'x') g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, mat(color)); m.position.y = y; return shade(m);
}

const STONE = 0x8f9096, STONE2 = 0x74757c, STONE3 = 0xa9aab0;
const GOLD_B = 0xe8c04a;
const WOOD = 0x8a5a2b, WOOD_D = 0x5a3a1a, WOOD_L = 0xb98a50, PLASTER = 0xe9d3a6, SHINGLE = 0x9a5428, SHINGLE_D = 0x6e3a18;
const GLOW = 0xffc860;

/* ------------------------------------------------- pixel-art style textures */
let _seed = 7; const rng = () => { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; };
const hex = c => '#' + c.toString(16).padStart(6, '0');
const jitter = (c, a) => { const k = 1 + (rng() - 0.5) * a; const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k); return `rgb(${r | 0},${g | 0},${b | 0})`; };
const TEXDEF = {
  stone:   { size: 32, density: 1.6, draw: (x, S) => { x.fillStyle = hex(0x8f9096); x.fillRect(0, 0, S, S); for (let r = 0; r < 4; r++) { const off = (r % 2) * 8; for (let c = -1; c < 3; c++) { x.fillStyle = jitter(0x93949b, 0.28); x.fillRect(c * 16 + off + 1, r * 8 + 1, 15, 7); } } x.fillStyle = '#5d5e66'; for (let r = 0; r < 4; r++) { x.fillRect(0, r * 8, S, 1); for (let c = -1; c < 3; c++) x.fillRect(c * 16 + (r % 2) * 8, r * 8, 1, 8); } } },
  plaster: { size: 32, density: 1.0, draw: (x, S) => { x.fillStyle = hex(0xe9d3a6); x.fillRect(0, 0, S, S); for (let i = 0; i < 40; i++) { x.fillStyle = jitter(0xe9d3a6, 0.14); x.fillRect((rng() * S) | 0, (rng() * S) | 0, 2, 2); } } },
  shingle: { size: 32, density: 1.4, draw: (x, S) => { x.fillStyle = hex(0x7a3f1c); x.fillRect(0, 0, S, S); for (let r = 0; r < 4; r++) { const off = (r % 2) * 4; for (let c = -1; c < 5; c++) { x.fillStyle = jitter(0x9a5428, 0.3); x.fillRect(c * 8 + off, r * 8, 7, 7); x.fillStyle = 'rgba(40,16,4,0.55)'; x.fillRect(c * 8 + off, r * 8 + 6, 7, 2); } } } },
  plank:   { size: 32, density: 1.2, draw: (x, S) => { for (let i = 0; i < 4; i++) { x.fillStyle = jitter(0x8a5a2b, 0.25); x.fillRect(i * 8, 0, 8, S); x.fillStyle = 'rgba(30,14,4,0.6)'; x.fillRect(i * 8, 0, 1, S); for (let k = 0; k < 4; k++) { x.fillStyle = 'rgba(30,14,4,0.25)'; x.fillRect(i * 8 + 2 + ((rng() * 4) | 0), (rng() * S) | 0, 1, 5); } } } },
  floor:   { size: 32, density: 1.0, draw: (x, S) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? hex(0xa9aab0) : hex(0x8a8b92); x.fillRect(i * 16, j * 16, 16, 16); } x.fillStyle = 'rgba(40,40,50,0.5)'; x.fillRect(0, 0, S, 1); x.fillRect(0, 16, S, 1); x.fillRect(0, 0, 1, S); x.fillRect(16, 0, 1, S); } },
  canvasBlue: { size: 32, density: 1.0, draw: (x, S) => { for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#e8eef8' : '#3b6cc0'; x.fillRect(i * 8, 0, 8, S); } x.fillStyle = 'rgba(0,0,40,0.15)'; for (let i = 0; i < 4; i++) x.fillRect(i * 8, 0, 1, S); } },
  canvasBeige: { size: 32, density: 1.0, draw: (x, S) => { x.fillStyle = '#e6d5b0'; x.fillRect(0, 0, S, S); x.fillStyle = 'rgba(120,90,50,0.35)'; x.fillRect(0, 0, 1, S); x.fillRect(16, 0, 1, S); x.fillRect(0, 10, S, 1); x.fillRect(0, 22, S, 1); } },
  grass:   { size: 32, density: 0.5, draw: (x, S) => { x.fillStyle = '#58b046'; x.fillRect(0, 0, S, S); for (let i = 0; i < 60; i++) { x.fillStyle = jitter(0x58b046, 0.25); x.fillRect((rng() * S) | 0, (rng() * S) | 0, 2, 2); } } },
};
const texCache = {}, texMatCache = {};
function texMat(kind) {
  if (texMatCache[kind]) return texMatCache[kind];
  const d = TEXDEF[kind], c = document.createElement('canvas'); c.width = c.height = d.size;
  d.draw(c.getContext('2d'), d.size);
  const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapLinearFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return (texMatCache[kind] = new THREE.MeshLambertMaterial({ map: t, flatShading: true }));
}
// textured box (bottom at y); UVs scaled per face so texels stay square at any size
export function tbox(w, h, d, kind, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, k = TEXDEF[kind].density;
  const dim = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dim[f][0] * k, uv.getY(i) * dim[f][1] * k); }
  const m = new THREE.Mesh(g, texMat(kind)); m.position.set(x, y + h / 2, z); return shade(m);
}
// gable roof built from two shingled slabs (ridge along x, or z via axis) + plaster gable fill + ridge cap
function gableRoof(len, width, height, y, axis = 'x', fill = PLASTER, kind = 'shingle', overhang = 0.25) {
  const g = new THREE.Group();
  const half = width / 2, ang = Math.atan2(height, half), sl = Math.hypot(half, height) + overhang;
  for (const sgn of [-1, 1]) {
    const slab = tbox(len + overhang * 2, 0.12, sl, kind, 0, 0, 0);
    const c = new THREE.Group(); c.add(slab); slab.position.set(0, 0, 0);
    c.position.set(0, y + height - (sl / 2) * Math.sin(ang) + 0.03, sgn * (sl / 2) * Math.cos(ang)); c.rotation.x = sgn * ang;
    g.add(c);
  }
  g.add(vox(len + overhang * 2 + 0.04, 0.12, 0.2, SHINGLE_D, 0, y + height - 0.02, 0));
  if (fill !== null) g.add(roof(len - 0.1, width - 0.2, height - 0.12, fill, y, 'x'));
  if (axis === 'z') g.rotation.y = Math.PI / 2;
  return g;
}

/* ---------------------------------------------------------------- props */
function barrel(x = 0, z = 0, y = 0, c = 0x8a5a2b) {
  const g = grp(cyl(0.26, 0.26, 0.5, c, 0, 0, 0, 10), cyl(0.28, 0.28, 0.05, 0x3b3b40, 0, 0.1, 0, 10), cyl(0.28, 0.28, 0.05, 0x3b3b40, 0, 0.36, 0, 10), cyl(0.2, 0.2, 0.02, 0x6b4a2a, 0, 0.5, 0, 10));
  return at(g, x, y, z);
}
function crate(s = 0.45, x = 0, z = 0, y = 0, c = 0xa8743a) {
  return at(grp(vox(s, s, s, c), vox(s + 0.02, 0.05, s + 0.02, WOOD_D, 0, 0.02, 0), vox(s + 0.02, 0.05, s + 0.02, WOOD_D, 0, s - 0.07, 0), vox(0.06, s, s + 0.02, 0x7a4f28, 0, 0, 0), vox(s + 0.02, s, 0.06, 0x7a4f28, 0, 0, 0)), x, y, z);
}
function sack(x, z, c = 0xd9c79a) { return at(grp(sph(0.2, c, 0, 0), vox(0.12, 0.08, 0.12, 0x8a6a3a, 0, 0.32, 0)), x, 0, z); }
function stump(x, z) { return at(cyl(0.2, 0.24, 0.3, 0x7a4f28, 0, 0, 0, 8), x, 0, z); }
function table(x = 0, z = 0) {
  return at(grp(vox(0.9, 0.06, 0.55, WOOD_L, 0, 0.42, 0), vox(0.07, 0.42, 0.07, WOOD_D, -0.38, 0, -0.2), vox(0.07, 0.42, 0.07, WOOD_D, 0.38, 0, -0.2), vox(0.07, 0.42, 0.07, WOOD_D, -0.38, 0, 0.2), vox(0.07, 0.42, 0.07, WOOD_D, 0.38, 0, 0.2),
    cyl(0.07, 0.06, 0.1, 0xd0c8b0, -0.15, 0.48, 0, 8), cyl(0.06, 0.05, 0.08, 0xc9962f, 0.2, 0.48, 0.05, 8)), x, 0, z);
}
function bench(x, z, ry = 0) { return at(rot(grp(vox(0.8, 0.05, 0.22, WOOD, 0, 0.26, 0), vox(0.06, 0.26, 0.2, WOOD_D, -0.33, 0, 0), vox(0.06, 0.26, 0.2, WOOD_D, 0.33, 0, 0)), 0, ry, 0), x, 0, z); }
function logs(x, z, ry = 0) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const l = rot(cyl(0.1, 0.1, 0.9, 0x9c6b3c, 0, 0, 0, 7), 0, 0, Math.PI / 2); l.position.set(0, 0.12 + (i === 2 ? 0.18 : 0), (i === 2 ? 0 : (i - 0.5) * 0.2)); g.add(l); }
  return at(rot(g, 0, ry, 0), x, 0, z);
}
function wheel(x, y, z, r = 0.3) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 5, 12), mat(WOOD_D)); rim.castShadow = true; g.add(rim);
  g.add(cyl(0.07, 0.07, 0.08, WOOD_D, 0, -0.04, 0, 6).rotateX?.(Math.PI / 2) || new THREE.Group());
  for (let i = 0; i < 4; i++) g.add(rot(vox(0.05, r * 2, 0.05, 0x6b4a2a, 0, -r, 0), 0, 0, i * Math.PI / 4));
  g.position.set(x, y + r, z); return g;
}
export function cartProp(variant = 0) {
  const g = new THREE.Group();
  g.add(vox(1.2, 0.08, 0.7, WOOD, 0, 0.3, 0));
  g.add(vox(1.2, 0.3, 0.06, 0x9c6b3c, 0, 0.38, 0.34), vox(1.2, 0.3, 0.06, 0x9c6b3c, 0, 0.38, -0.34), vox(0.06, 0.3, 0.7, 0x9c6b3c, -0.57, 0.38, 0), vox(0.06, 0.3, 0.7, 0x9c6b3c, 0.57, 0.38, 0));
  g.add(wheel(0, 0, 0.42, 0.3), wheel(0, 0, -0.42, 0.3));
  g.add(vox(1.0, 0.05, 0.05, WOOD_D, 1.0, 0.28, 0.12).rotateY?.(0) || new THREE.Group());
  g.add(vox(0.7, 0.05, 0.05, WOOD_D, -1.0, 0.3, 0.15), vox(0.7, 0.05, 0.05, WOOD_D, -1.0, 0.3, -0.15));
  if (variant === 0) { g.add(logs(0, 0.0, 0).translateY(0.35)); g.add(vox(0.9, 0.2, 0.5, 0xb98a50, 0, 0.38, 0)); }
  else { g.add(crate(0.4, -0.3, 0.1, 0.38), crate(0.38, 0.25, -0.1, 0.38), sack(0.3, 0.15)); g.children[g.children.length - 1].position.y = 0.38; }
  return g;
}
export function crateStack() {
  return grp(crate(0.55, 0, 0, 0), crate(0.5, 0.6, 0.05, 0, 0xb5803f), crate(0.45, 0.12, 0.05, 0.55, 0x9c6b3c), crate(0.4, -0.55, 0.15, 0, 0xa8743a), sack(0.1, 0.65, 0xd9c79a));
}
export function marketStall() {
  const g = new THREE.Group();
  g.add(tbox(1.7, 0.55, 0.8, 'plank', 0, 0, 0.1), vox(1.8, 0.07, 0.9, WOOD_L, 0, 0.55, 0.1));
  for (const [x, z] of [[-0.85, 0.5], [0.85, 0.5], [-0.85, -0.4], [0.85, -0.4]]) g.add(vox(0.08, 1.45, 0.08, WOOD_D, x, 0, z));
  for (let i = 0; i < 6; i++) g.add(rot(vox(0.3, 0.06, 1.35, i % 2 ? 0xf4f0e6 : 0xc0392b, -0.75 + i * 0.3, 1.5 - 0.0, 0.1), 0.0, 0, 0));
  g.add(vox(1.85, 0.12, 0.08, 0xc0392b, 0, 1.38, 0.78), vox(0.3, 0.1, 0.05, 0xf4f0e6, 0, 1.38, 0.8));
  for (let i = 0; i < 6; i++) g.add(vox(0.3, 0.06, 0.12, i % 2 ? 0xf4f0e6 : 0xc0392b, -0.75 + i * 0.3, 1.44, 0.8));
  // goods
  g.add(sph(0.12, 0xcc4444, -0.6, 0.62, 0.15), sph(0.12, 0xe0a030, -0.3, 0.62, 0.2), sph(0.12, 0x66bb44, 0.0, 0.62, 0.1), sph(0.12, 0xcc4444, 0.3, 0.62, 0.2), vox(0.25, 0.2, 0.25, 0x9c6b3c, 0.65, 0.62, 0.1));
  g.add(crate(0.4, -1.15, 0.45), crate(0.35, -1.15, 0.0, 0), crate(0.4, 1.15, 0.5), sack(1.15, 0.0), barrel(-1.1, -0.5));
  return g;
}
export function dummyProp(bow = false) {
  const g = grp(cyl(0.05, 0.05, 0.8, WOOD_D, 0, 0, 0, 6), vox(0.55, 0.08, 0.08, WOOD_D, 0, 0.55, 0), vox(0.32, 0.35, 0.2, 0xc88a4a, 0, 0.4, 0), vox(0.26, 0.04, 0.26, WOOD_D, 0, 0, 0), sph(0.14, 0xe6c88a, 0, 0.75), vox(0.2, 0.09, 0.23, 0xc0392b, 0, 0.82, 0), vox(0.22, 0.05, 0.05, 0xc0392b, 0, 0.55, 0.12));
  if (bow) { g.add(rot(cyl(0.02, 0.02, 0.5, 0x7a4f28, 0.27, 0.35, 0.12, 5), 0, 0, 0.1)); }
  return g;
}
export function archeryTarget() {
  const g = new THREE.Group();
  g.add(rot(vox(0.05, 0.9, 0.05, WOOD_D, -0.18, 0, 0), 0, 0, 0.18), rot(vox(0.05, 0.9, 0.05, WOOD_D, 0.18, 0, 0), 0, 0, -0.18));
  const t = new THREE.Group();
  [[0.32, 0xf4f0e6], [0.25, 0xc0392b], [0.17, 0xf4f0e6], [0.1, 0xc0392b]].forEach(([r, c], i) => { const d = cyl(r, r, 0.04, c, 0, 0, 0.0 + i * 0.012, 14); d.rotation.x = Math.PI / 2; d.position.set(0, 0.7, 0.06 + i * 0.012); t.add(d); });
  g.add(t, rot(vox(0.04, 0.3, 0.04, 0xddddcc, 0.1, 0.55, 0.12), 0, 0, 0.3));
  return g;
}
export function noticeBoard() {
  const g = grp(vox(0.12, 1.3, 0.12, WOOD_D, -0.6, 0, 0), vox(0.12, 1.3, 0.12, WOOD_D, 0.6, 0, 0), vox(1.4, 0.8, 0.1, WOOD_L, 0, 0.5, 0), vox(1.5, 0.08, 0.14, WOOD_D, 0, 1.3, 0), vox(1.5, 0.08, 0.14, WOOD_D, 0.0, 0.45, 0));
  [[-0.4, 0.8, 0xf4ecd0], [0.0, 0.95, 0xf4ecd0], [0.4, 0.8, 0xe8d49a], [-0.15, 0.62, 0xf4ecd0], [0.3, 0.62, 0xf4ecd0]].forEach(([x, y, c]) => g.add(vox(0.28, 0.3, 0.03, c, x, y, 0.06)));
  g.add(cone(0.05, 0.06, 0xc0392b, -0.4, 1.05, 0.08, 4), cone(0.05, 0.06, 0xc0392b, 0.4, 1.05, 0.08, 4));
  return g;
}
export function barricade(striped = true) {
  const g = new THREE.Group();
  g.add(vox(0.08, 0.7, 0.08, WOOD_D, -0.7, 0, 0), vox(0.08, 0.7, 0.08, WOOD_D, 0.7, 0, 0));
  for (let i = 0; i < 2; i++) for (let k = 0; k < 6; k++) g.add(vox(0.24, 0.16, 0.06, k % 2 ? 0xf4f0e6 : 0xc0392b, -0.6 + k * 0.24, 0.3 + i * 0.28, 0.0));
  g.add(vox(0.08, 0.7, 0.08, WOOD_D, -0.7, 0, 0.0));
  return g;
}
export function spikeBarricade() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) { const s = cyl(0.04, 0.06, 1.0, 0x8a5a2b, 0, 0, 0, 5); s.rotation.z = (i % 2 ? 0.7 : -0.7); s.position.set(-0.5 + i * 0.35, 0.45, 0); g.add(s); const t = cone(0.05, 0.14, 0xb98a50, 0, 0, 0, 5); t.position.set(-0.5 + i * 0.35 + (i % 2 ? -0.38 : 0.38), 0.92, 0); t.rotation.z = (i % 2 ? 0.7 : -0.7); g.add(t); }
  g.add(vox(1.4, 0.07, 0.07, WOOD_D, 0, 0.3, 0.08), vox(1.4, 0.07, 0.07, WOOD_D, 0, 0.3, -0.08));
  return g;
}
export function campfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.add(vox(0.2, 0.14, 0.18, STONE, Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38)); }
  for (let i = 0; i < 3; i++) g.add(rot(cyl(0.05, 0.05, 0.6, 0x5a3a1a, 0, 0.08, 0, 6), 0.5, i * 2.1, 0.0));
  const f = cone(0.2, 0.55, 0xff8a1a, 0, 0.1, 0, 5, 0xff6a00, 1.4), f2 = cone(0.11, 0.38, 0xffd24a, 0, 0.12, 0, 5, 0xffd24a, 1.5);
  g.add(f, f2); g.userData.flames = [f, f2];
  const l = new THREE.PointLight(0xff9a3a, 1.2, 6); l.position.y = 0.6; g.add(l); g.userData.flicker = l;
  return g;
}
export function bigMushroom(color = 0xd6336c, s = 1) {
  const g = grp(cyl(0.12, 0.17, 0.55, 0xf0e6d0, 0, 0, 0, 7));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2), mat(color)); cap.position.y = 0.5; cap.scale.y = 0.75; shade(g.add(cap) && cap);
  for (const [x, z] of [[0.18, 0.2], [-0.2, 0.1], [0.02, -0.28], [0.25, -0.1]]) g.add(sph(0.07, 0xf6efe0, x, 0.78 - Math.hypot(x, z) * 0.35, z));
  g.scale.setScalar(s); return g;
}
export function standingStones() {
  const g = new THREE.Group();
  [[-0.6, 0.1, 0.5, 1.5, 0.15], [0.0, -0.3, 0.45, 1.9, -0.1], [0.55, 0.15, 0.4, 1.2, 0.1]].forEach(([x, z, w, h, r]) => {
    g.add(rot(vox(w, h, w * 0.8, STONE2, x, 0, z), 0, r, 0), vox(w * 0.7, 0.15, w * 0.6, 0x5d9b45, x, h - 0.1, z)); // mossy top
    g.add(vox(0.08, h * 0.5, 0.03, 0x55d6c0, x, 0.3, z + w * 0.4 + 0.01, 0x33ffd0, 0.8)); // rune glow
  });
  g.add(vox(0.55, 0.35, 0.45, STONE, 0.9, 0, -0.6), vox(0.4, 0.25, 0.4, STONE3, -0.9, 0, -0.5));
  const l = new THREE.PointLight(0x55ffd0, 0.7, 4); l.position.set(0, 1, 0.5); g.add(l);
  return g;
}
export function rockCluster(s = 1) {
  const g = grp(rot(vox(0.7, 0.5, 0.6, STONE, 0, 0, 0), 0, 0.5, 0), rot(vox(0.45, 0.35, 0.4, STONE3, 0.5, 0, 0.2), 0, 1.1, 0), rot(vox(0.35, 0.25, 0.3, STONE2, -0.4, 0, 0.35), 0, 0.2, 0));
  g.scale.setScalar(s); return g;
}
export function weaponRack() {
  const g = grp(vox(0.1, 1.1, 0.1, WOOD_D, -0.85, 0, 0), vox(0.1, 1.1, 0.1, WOOD_D, 0.85, 0, 0), vox(1.8, 0.08, 0.1, WOOD, 0, 1.0, 0), vox(1.8, 0.08, 0.1, WOOD, 0, 0.3, 0));
  // swords
  for (const x of [-0.6, -0.35]) g.add(vox(0.07, 0.65, 0.03, 0xdfe3ea, x, 0.4, 0.07), vox(0.2, 0.05, 0.05, 0xc9962f, x, 0.35, 0.07), vox(0.05, 0.14, 0.05, WOOD_D, x, 0.2, 0.07));
  // shield
  g.add(vox(0.45, 0.55, 0.06, 0xb0b5bd, 0.25, 0.4, 0.07), vox(0.3, 0.38, 0.03, 0x3b6cc0, 0.25, 0.48, 0.11), vox(0.05, 0.4, 0.035, 0xe8c04a, 0.25, 0.47, 0.13), vox(0.28, 0.05, 0.035, 0xe8c04a, 0.25, 0.58, 0.13));
  g.add(vox(0.07, 0.65, 0.03, 0xb0b5bd, 0.62, 0.4, 0.07), vox(0.2, 0.05, 0.05, 0xc9962f, 0.62, 0.35, 0.07));
  return g;
}
export function shieldRack() {
  const g = grp(vox(0.1, 1.0, 0.1, WOOD_D, -0.8, 0, 0), vox(0.1, 1.0, 0.1, WOOD_D, 0.8, 0, 0), vox(1.7, 0.08, 0.1, WOOD, 0, 0.9, 0), vox(1.7, 0.08, 0.1, WOOD, 0, 0.25, 0));
  for (const x of [-0.4, 0.4]) { const s = cyl(0.33, 0.33, 0.07, 0x8a5a2b, 0, 0, 0, 14); s.rotation.x = Math.PI / 2; s.position.set(x, 0.58, 0.08); g.add(s); const r = cyl(0.37, 0.37, 0.05, 0x6b6e75, 0, 0, 0, 14); r.rotation.x = Math.PI / 2; r.position.set(x, 0.58, 0.075); g.add(r); const b = sph(0.09, 0xc0c4cc, x, 0.5, 0.12); g.add(b); }
  return g;
}
export function spearFence() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) { g.add(vox(0.07, 0.9, 0.07, WOOD, -0.7 + i * 0.28, 0, 0), cone(0.07, 0.25, 0xc0c4cc, -0.7 + i * 0.28, 0.9, 0, 4)); }
  g.add(vox(1.6, 0.07, 0.05, WOOD_D, 0, 0.7, 0.05), vox(1.6, 0.07, 0.05, WOOD_D, 0, 0.3, 0.05));
  return g;
}
export function potion(color = 0xc050ff, round = false) {
  const g = new THREE.Group();
  if (round) { g.add(sph(0.18, color, 0, 0.1, 0, color, 0.6, 10), cyl(0.06, 0.06, 0.16, 0xdde7ee, 0, 0.42, 0, 8), cyl(0.07, 0.07, 0.05, WOOD, 0, 0.56, 0, 8)); }
  else { g.add(cyl(0.12, 0.14, 0.26, color, 0, 0, 0, 8, color, 0.6), cyl(0.05, 0.05, 0.14, 0xdde7ee, 0, 0.26, 0, 8), cyl(0.06, 0.06, 0.05, WOOD, 0, 0.4, 0, 8)); }
  return g;
}
export function flaskStand(color = 0xc050ff, shape = 'round') {
  const g = new THREE.Group();
  g.add(cyl(0.02, 0.02, 0.1, WOOD_D, 0, 0, 0), vox(0.05, 0.38, 0.05, WOOD_D, -0.2, 0, -0.2), vox(0.05, 0.38, 0.05, WOOD_D, 0.2, 0, -0.2), vox(0.05, 0.38, 0.05, WOOD_D, -0.2, 0, 0.2), vox(0.05, 0.38, 0.05, WOOD_D, 0.2, 0, 0.2), vox(0.5, 0.05, 0.5, WOOD, 0, 0.38, 0));
  const f = sph(shape === 'round' ? 0.21 : 0.18, color, 0, 0.42, 0, color, 0.7, 10);
  g.add(f, cyl(0.06, 0.06, 0.22, 0xdde7ee, 0, 0.8, 0, 8));
  const b = sph(0.04, color, 0.05, 1.05, 0, color, 1); const b2 = sph(0.03, color, -0.05, 1.15, 0.02, color, 1); g.add(b, b2);
  return g;
}
export function planter(kind = 0) {
  const g = grp(vox(1.3, 0.28, 0.6, WOOD, 0, 0, 0), vox(1.2, 0.04, 0.5, 0x4a2c12, 0, 0.28, 0));
  if (kind === 0) [[-0.45, 0xff7aa8], [-0.15, 0xffe066], [0.15, 0xc050ff], [0.45, 0xffffff]].forEach(([x, c], i) => { g.add(vox(0.03, 0.2, 0.03, 0x3f8a2c, x, 0.3, (i % 2 - 0.5) * 0.2), sph(0.1, c, x, 0.45, (i % 2 - 0.5) * 0.2), cone(0.14, 0.18, 0x4fa63f, x, 0.3, -(i % 2 - 0.5) * 0.15, 5)); });
  else for (let i = 0; i < 5; i++) g.add(cone(0.14, 0.35, i % 2 ? 0x4fb03f : 0x2f8a2c, -0.5 + i * 0.25, 0.28, (i % 2 - 0.5) * 0.2, 5), sph(0.07, i === 2 ? 0xc050ff : 0xe0553a, -0.5 + i * 0.25, 0.4, (i % 2 - 0.5) * 0.2 + 0.1));
  return g;
}
export function anvil(variant = 0) {
  const g = new THREE.Group();
  g.add(cyl(0.2, 0.24, 0.22, 0x7a4f28, 0, 0, 0, 8));
  g.add(vox(0.38, 0.14, 0.28, 0x3e4046, 0, 0.22, 0), vox(0.22, 0.12, 0.2, 0x2f3136, 0, 0.1 + 0.22, 0), vox(0.62, 0.12, 0.3, 0x4a4d54, 0, 0.44, 0), vox(0.22, 0.08, 0.22, 0x4a4d54, 0.4, 0.46, 0));
  if (variant) g.add(vox(0.18, 0.04, 0.04, 0xff6a1a, -0.1, 0.56, 0, 0xff5a00, 1), cyl(0.03, 0.03, 0.3, 0x5a3a1a, 0.15, 0.56, 0.0, 5));
  return g;
}
export function lantern() {
  const g = grp(vox(0.12, 1.7, 0.12, WOOD_D, 0, 0), vox(0.7, 0.08, 0.08, WOOD_D, 0.3, 1.55, 0), vox(0.1, 0.35, 0.1, WOOD_D, 0.6, 1.2, 0, 0, 0));
  g.add(vox(0.26, 0.34, 0.26, 0x3a3a3e, 0.62, 1.1, 0), vox(0.18, 0.24, 0.18, 0xffd27a, 0.62, 1.15, 0, 0xffb040, 1.4), cone(0.19, 0.14, 0x3a3a3e, 0.62, 1.44, 0, 4));
  const l = new THREE.PointLight(0xffb050, 0.9, 5); l.position.set(0.62, 1.2, 0); g.add(l); g.userData.flicker = l;
  return g;
}
export function lanternSmall() {
  const g = grp(vox(0.1, 0.9, 0.1, WOOD_D, 0, 0), vox(0.22, 0.3, 0.22, 0x3a3a3e, 0, 0.9), vox(0.14, 0.2, 0.14, 0xffd27a, 0, 0.95, 0, 0xffb040, 1.4), cone(0.17, 0.12, 0x3a3a3e, 0, 1.2, 0, 4));
  const l = new THREE.PointLight(0xffb050, 0.6, 4); l.position.y = 1.0; g.add(l); g.userData.flicker = l; return g;
}
export function tree(s = 1, kind = 0) {
  const g = new THREE.Group(); const c = [0x2f7a32, 0x2a8a3a, 0x3a8a2a][kind % 3];
  g.add(cyl(0.12, 0.16, 0.5, 0x6b4a2a, 0, 0, 0, 6));
  g.add(cone(0.7, 1.0, c, 0, 0.4, 0, 6), cone(0.55, 0.9, c + 0x0a1408, 0, 0.9, 0, 6), cone(0.38, 0.8, c + 0x142610, 0, 1.4, 0, 6));
  g.scale.setScalar(s); return g;
}

/* --------------------------------------------------------- building table */
export const BUILDINGS = {
  hall:    { name: 'Quest Board & Guild Hall', w: 5, d: 4, cost: 0,   renown: 0, icon: '📜', desc: 'Central hub. Post quests, dispatch parties and collect loot.' },
  tavern:  { name: 'Rusty Boar Tavern & Inn',  w: 4, d: 3, cost: 200, renown: 0, icon: '🍺', desc: 'Restores hero stamina & happiness. Earns gold from meals. +4 beds.' },
  forge:   { name: 'Iron & Ember Forge',       w: 4, d: 3, cost: 300, renown: 0, icon: '⚒️', desc: 'Crafts weapons from Iron Ore. Sold to Knights and Rangers.' },
  alchemy: { name: "Sage's Alchemical Lab",    w: 4, d: 3, cost: 450, renown: 3, icon: '🧪', desc: 'Brews potions from Herbs for Wizards. Generates Mana.' },
  portal:  { name: 'Waystone Portal',          w: 3, d: 3, cost: 700, renown: 6, icon: '🌀', desc: 'Ancient arch. Heroes arrive twice as often and rare VIP heroes are drawn to it. Unlocks the Endless Dive.' },
  warehouse: { name: 'Warehouse',            w: 4, d: 3, cost: 250, renown: 2, icon: '📦', desc: 'Storage hall. Raises the stock limit of every Forge and Lab (+6, +4 per upgrade level). Needed for bulk orders.' },
  smelter: { name: 'Smeltery',                w: 3, d: 2, cost: 350, renown: 3, rank: 1, icon: '🔩', desc: 'Smelts 2 Iron Ore into 1 Ingot. Steel and Mythril weapons need ingots. Next to a Forge: +25% speed for both.' },
  tower:   { name: 'Guard Tower',              w: 2, d: 2, cost: 400, renown: 3, rank: 1, icon: '🗼', desc: 'Archers add +6 defense and fight beside your guards when raiders attack.' },
  market:  { name: 'Market Stall',             w: 3, d: 2, cost: 120, renown: 0, icon: '🛒', desc: 'Buy raw materials. Boosts passive gold slightly.' },
  memorial:{ name: 'Memorial Garden',        w: 3, d: 2, cost: 150, renown: 0, icon: '🪦', desc: 'A quiet garden with a stone for every fallen hero (up to 12): heroes grieve less and are a bit happier (+3% mood).', decor: true },
  road:    { name: 'Cobble Path',             w: 1, d: 1, cost: 6,   renown: 0, icon: '🟫', desc: 'Paving: heroes and villagers walk 25% faster on it. Keep placing to lay a whole road; press ✖ when done.', decor: true, walkable: true, road: true },
  hill:    { name: 'Grassy Hill',             w: 3, d: 3, cost: 120, renown: 0, icon: '⛰️', desc: 'A raised mound with a view: Guard Towers within 5 tiles gain +3 defense and the heroes like the scenery (+2% mood, up to 3 hills).', decor: true },
  farm:    { name: 'Farm',                    w: 3, d: 3, cost: 180, renown: 0, icon: '🌾', desc: 'Fields of wheat: +1 grain every 9 s (faster with levels). Feed it to a Bakery.' },
  bakery:  { name: 'Bakery',                  w: 3, d: 2, cost: 220, renown: 1, icon: '🥖', desc: 'Bakes 2 grain into 1 loaf of bread every 12 s. Tavern meals eaten with bread pay 40% more and cheer the hero up.' },
  well:    { name: 'Well',                    w: 2, d: 2, cost: 140, renown: 1, icon: '🪣', desc: 'A village well. Cuts the damage of fires, floods and sickness by two thirds. +2% happiness upkeep.', decor: true },
  pond:    { name: 'Pond',                    w: 3, d: 2, cost: 90,  renown: 0, icon: '🪷', desc: 'A little pond with lily pads: +5% happiness upkeep (up to 3 count).', decor: true },
  flowers: { name: 'Flower Bed',              w: 1, d: 1, cost: 20,  renown: 0, icon: '🌷', desc: 'Flowers you can walk through: +1% happiness upkeep each (10 flowers and trees count).', decor: true, walkable: true },
  sapling: { name: 'Young Tree',              w: 1, d: 1, cost: 15,  renown: 0, icon: '🌳', desc: 'Plant a tree inside the town: +1% happiness upkeep each (10 flowers and trees count).', decor: true },
  palisade:{ name: 'Palisade Wall',           w: 3, d: 1, cost: 70,  renown: 0, icon: '🧱', desc: 'A wall of sharpened logs: +2 raid defense per segment (up to 8 segments count).' },
  lumber:  { name: 'Lumber Camp',             w: 3, d: 2, cost: 160, renown: 0, icon: '🪓', desc: 'Woodcutters bring in Pine Wood: +1 wood every 8 s (faster with levels).' },
  monument:{ name: 'Grand Monument',          w: 3, d: 3, cost: 4000, renown: 100, rank: 2, icon: '🏛️', desc: 'A towering monument to the guild: quest gold +5% and +10% happiness upkeep. A showpiece for rich guilds.', decor: true },
  cottage: { name: 'Cottage',                 w: 2, d: 2, cost: 140, renown: 1, rank: 1, icon: '🏠', desc: 'Homes for villagers: +1 population capacity, a family moves in and pays a little tax.' },
  tent:    { name: 'Hero Tent',                w: 2, d: 2, cost: 80,  renown: 0, icon: '⛺', desc: 'Cheap lodging: +3 population capacity.' },
  // decor / minor facilities
  garden:  { name: 'Herb Garden',              w: 3, d: 2, cost: 90,  renown: 0, icon: '🌿', desc: 'Planter boxes: +1 Herb every few seconds.', decor: true },
  training:{ name: 'Training Yard',            w: 4, d: 2, cost: 160, renown: 2, icon: '🎯', desc: 'Dummies and archery targets: idle heroes slowly gain XP.', decor: true },
  stones:  { name: 'Mana Standing Stones',     w: 3, d: 2, cost: 220, renown: 4, icon: '🗿', desc: 'Ancient stones that slowly generate Mana.', decor: true },
  campfire:{ name: 'Campfire',                 w: 1, d: 1, cost: 30,  renown: 0, icon: '🔥', desc: 'Cosy fire: heroes within 6 tiles recover happiness faster.', decor: true },
  weapons: { name: 'Weapon & Shield Rack',     w: 3, d: 1, cost: 60,  renown: 0, icon: '🛡️', desc: 'Decor. Racks of swords, shields and spears.', decor: true },
  cart:    { name: 'Supply Carts',             w: 3, d: 2, cost: 50,  renown: 0, icon: '🛒', desc: 'Decor. Wooden carts loaded with logs and crates.', decor: true },
  lamp:    { name: 'Lantern Post',             w: 1, d: 1, cost: 15,  renown: 0, icon: '🏮', desc: 'Decor. Warm lantern light.', decor: true },
  fountain:{ name: 'Fountain',                w: 2, d: 2, cost: 180, renown: 2, icon: '⛲', desc: 'Decor. A bubbling fountain: heroes keep their spirits up (+5% happiness upkeep each, up to 30% with other decor).', decor: true },
  banner:  { name: 'Guild Banner',             w: 1, d: 1, cost: 40,  renown: 1, icon: '🚩', desc: 'Decor. Your colours on a tall pole (+5% happiness upkeep).', decor: true },
  statue:  { name: 'Hero Statue',              w: 2, d: 2, cost: 300, renown: 3, icon: '🗽', desc: 'Decor. A monument to the guild’s heroes (+5% happiness upkeep).', decor: true },
  shrooms: { name: 'Giant Mushrooms',          w: 2, d: 2, cost: 25,  renown: 0, icon: '🍄', desc: 'Decor. Whimsical oversized mushrooms.', decor: true },
};

/* ---------------------------------------------------------------- buildings */
function tavern() {
  const g = new THREE.Group();
  g.add(tbox(3.7, 0.28, 2.7, 'stone', 0, 0, 0));
  g.add(tbox(3.5, 1.1, 2.5, 'plaster', 0, 0.28, 0));
  g.add(tbox(3.8, 1.0, 2.7, 'plaster', 0, 1.38, 0));
  g.add(vox(3.85, 0.1, 2.75, WOOD_D, 0, 1.3, 0));
  // timber frame (front face z=+1.26/1.36)
  for (const x of [-1.72, -0.58, 0.58, 1.72]) g.add(vox(0.12, 1.1, 0.1, WOOD_D, x, 0.28, 1.26), vox(0.12, 1.0, 0.1, WOOD_D, x * 1.03, 1.4, 1.36));
  g.add(vox(3.5, 0.09, 0.1, WOOD_D, 0, 0.28, 1.26), vox(3.8, 0.09, 0.1, WOOD_D, 0, 2.3, 1.36));
  for (const x of [-1.15, 1.15]) g.add(rot(vox(0.08, 1.2, 0.08, WOOD_D, x, 1.38, 1.4), 0, 0, 0.5), rot(vox(0.08, 1.2, 0.08, WOOD_D, x, 1.38, 1.4), 0, 0, -0.5));
  // side timbers
  for (const z of [-0.6, 0.6]) g.add(vox(0.1, 1.0, 0.12, WOOD_D, 1.92, 1.4, z), vox(0.1, 1.1, 0.12, WOOD_D, 1.76, 0.28, z));
  // door + steps
  g.add(vox(0.7, 0.95, 0.07, WOOD_D, 0.0, 0.28, 1.28), vox(0.55, 0.78, 0.04, 0x7a4f28, 0, 0.3, 1.32), sph(0.04, 0xe8c04a, 0.18, 0.6, 1.35), vox(0.9, 0.12, 0.35, STONE3, 0, 0, 1.45));
  // windows with warm glow and shutters
  for (const x of [-1.15, 1.15]) {
    g.add(vox(0.5, 0.45, 0.06, WOOD_D, x, 0.6, 1.27), vox(0.4, 0.35, 0.04, GLOW, x, 0.65, 1.3, 0xffa030, 1.0), vox(0.04, 0.35, 0.05, WOOD_D, x, 0.65, 1.32), vox(0.4, 0.04, 0.05, WOOD_D, x, 0.8, 1.32));
    g.add(vox(0.2, 0.45, 0.04, 0x3f8a5a, x - 0.32, 0.6, 1.3), vox(0.2, 0.45, 0.04, 0x3f8a5a, x + 0.32, 0.6, 1.3));
  }
  for (const x of [-1.15, 0, 1.15]) g.add(vox(0.46, 0.46, 0.06, WOOD_D, x, 1.65, 1.38), vox(0.36, 0.36, 0.04, GLOW, x, 1.7, 1.42, 0xffa030, 1.0), vox(0.04, 0.36, 0.05, WOOD_D, x, 1.7, 1.44), vox(0.2, 0.46, 0.04, 0x3f8a5a, x - 0.31, 1.65, 1.42), vox(0.2, 0.46, 0.04, 0x3f8a5a, x + 0.31, 1.65, 1.42));
  // side window glow
  g.add(vox(0.06, 0.4, 0.4, GLOW, 1.93, 0.65, 0, 0xffa030, 1), vox(0.06, 0.4, 0.4, GLOW, 1.98, 1.7, 0, 0xffa030, 1));
  // main roof with ridge + dormer + chimney
  g.add(gableRoof(4.1, 3.7, 1.7, 2.38, 'x', PLASTER));
  g.add(vox(0.75, 0.75, 0.7, PLASTER, -0.9, 2.38, 0.6), gableRoof(0.9, 1.0, 0.55, 3.13, 'z', null, 'shingle', 0.1).translateX(-0.9).translateZ(0.6), vox(0.4, 0.4, 0.05, GLOW, -0.9, 2.55, 0.96, 0xffa030, 1), vox(0.5, 0.06, 0.08, WOOD_D, -0.9, 2.5, 0.97));
  g.add(tbox(0.6, 2.0, 0.6, 'stone', 1.3, 2.4, -0.5), tbox(0.72, 0.14, 0.72, 'stone', 1.3, 4.3, -0.5), vox(0.3, 0.05, 0.3, 0x222, 1.3, 4.44, -0.5));
  // lower stone chimney rows
  for (let i = 0; i < 4; i++) g.add(vox(0.62, 0.02, 0.62, STONE2, 1.3, 2.8 + i * 0.5, -0.5));
  // hanging sign
  g.add(vox(0.08, 0.08, 0.7, WOOD_D, 1.9, 1.85, 1.7), vox(0.08, 0.5, 0.06, WOOD_D, 1.9, 1.4, 2.0), vox(0.5, 0.5, 0.07, 0xc9962f, 1.9, 1.35, 2.0), sph(0.12, 0xb06a3a, 1.9, 1.45, 2.05));
  // barrels (left) and outdoor tables
  g.add(barrel(-2.0, 0.6), barrel(-2.0, 1.0), barrel(-1.85, 0.8, 0.5), barrel(-2.0, -0.2));
  g.add(table(-1.3, 2.0), bench(-1.3, 2.35), bench(-1.3, 1.65), table(0.5, 2.15), bench(0.5, 2.5), bench(0.5, 1.8));
  g.add(logs(2.1, 1.0, Math.PI / 2));
  return g;
}

function forge() {
  const g = new THREE.Group();
  g.add(tbox(3.7, 0.12, 2.8, 'floor', 0, 0, 0));
  // back wall + two side walls (open front)
  g.add(tbox(3.4, 1.5, 0.5, 'stone', 0, 0.12, -1.0), tbox(0.5, 1.5, 2.0, 'stone', -1.55, 0.12, 0.0), tbox(0.5, 1.1, 1.2, 'stone', 1.55, 0.12, -0.4));
  // furnace glowing mouth in back wall
  g.add(vox(1.1, 0.95, 0.35, 0x2a2a2e, 0.1, 0.3, -0.7), vox(0.85, 0.6, 0.12, 0xff7a1a, 0.1, 0.4, -0.55, 0xff5a00, 1.6), vox(0.95, 0.12, 0.2, 0xffd24a, 0.1, 0.4, -0.52, 0xffd24a, 1.5));
  // big stone chimney rising from back
  g.add(tbox(1.0, 3.2, 0.8, 'stone', -0.9, 1.0, -1.0), tbox(0.85, 0.5, 0.65, 'stone', -0.9, 4.2, -1.0), vox(0.55, 0.3, 0.4, 0x222, -0.9, 4.7, -1.0));
  // wooden roof beams (partial) + plank roof on left
  g.add(rot(vox(2.0, 0.1, 1.9, 0x6b4a2a, 0, 1.85, 0.0), 0, 0, 0.0).translateX(-0.9));
  g.add(vox(0.15, 1.8, 0.15, WOOD_D, 0.9, 0.12, 1.2), vox(0.15, 1.8, 0.15, WOOD_D, -1.5, 0.12, 1.2), vox(3.5, 0.16, 0.16, WOOD_D, -0.3, 1.8, 1.2), vox(3.5, 0.14, 0.14, WOOD_D, -0.3, 1.8, -0.3));
  g.add(tbox(2.5, 0.08, 1.7, 'plank', -0.35, 1.96, 0.4));
  // anvil, bellows, rack, coal, barrels
  g.add(at(anvil(1), -0.1, 0.12, 0.7), vox(0.5, 0.3, 0.4, 0x1a1a1c, 1.3, 0.12, 0.5), sph(0.1, 0x222, 1.2, 0.4, 0.5), sph(0.08, 0xff7a1a, 1.4, 0.38, 0.5, 0xff5a00, 1));
  g.add(vox(0.6, 0.5, 0.3, WOOD, 0.5, 0.12, -0.2), cone(0.18, 0.5, 0xa8743a, 0.5, 0.2, 0.15, 4));
  g.add(at(weaponRack(), 0.9, 0.12, 1.35).rotateY?.(0) || new THREE.Group());
  g.add(barrel(1.45, 1.1), barrel(-1.7, 1.3), crate(0.4, -1.7, -1.0, 0.12));
  const l = new THREE.PointLight(0xff8a2a, 1.8, 7); l.position.set(0, 0.9, -0.2); g.add(l); g.userData.flicker = l;
  return g;
}

function alchemy() {
  const g = new THREE.Group();
  // raised stone-tile platform (checker)
  g.add(tbox(4.0, 0.12, 3.0, 'floor', 0, 0, 0));
  // cauldrons x2 with fire + glowing brew
  for (const [x, z, c] of [[-0.6, 0.15, 0x55ff77], [0.55, 0.15, 0x7cff55]]) {
    g.add(vox(0.7, 0.08, 0.7, STONE2, x, 0.12, z));
    g.add(rot(vox(0.5, 0.06, 0.06, 0x5a3a1a, x, 0.2, z), 0, 0.4, 0), rot(vox(0.5, 0.06, 0.06, 0x5a3a1a, x, 0.2, z), 0, -0.4, 0), vox(0.18, 0.12, 0.18, 0xff7a1a, x, 0.15, z, 0xff5a00, 1.4));
    g.add(sph(0.5, 0x232326, x, 0.25, z, 0, 0, 12), cyl(0.5, 0.5, 0.1, 0x2f2f33, x, 0.78, z, 12), cyl(0.42, 0.42, 0.04, c, x, 0.86, z, 12, c, 1.2));
    g.add(sph(0.09, c, x + 0.15, 1.0, z - 0.1, c, 1.2), sph(0.07, c, x - 0.12, 1.15, z + 0.1, c, 1.2), sph(0.05, c, x + 0.05, 1.3, z, c, 1.2));
    const l = new THREE.PointLight(c, 0.9, 4.5); l.position.set(x, 1.2, z + 0.3); g.add(l);
  }
  // tall wooden shelving (back)
  g.add(tbox(2.1, 2.0, 0.4, 'plank', -0.75, 0.12, -1.15), vox(1.9, 0.07, 0.42, WOOD_D, -0.75, 0.75, -1.15), vox(1.9, 0.07, 0.42, WOOD_D, -0.75, 1.35, -1.15), vox(2.2, 0.1, 0.5, WOOD_D, -0.75, 2.1, -1.15));
  const cols = [0xc050ff, 0x55e07a, 0xff5a8a, 0x50b0ff, 0xffd24a, 0xc050ff, 0x55e07a, 0xff8a3a];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const c = cols[(i + r * 3) % cols.length]; g.add(i % 2 ? at(potion(c, false), -1.5 + i * 0.3, 0.19 + r * 0.6, -1.0) : at(potion(c, true), -1.5 + i * 0.3, 0.19 + r * 0.6, -1.0).translateY(-0.08)); }
  g.children.slice(-18).forEach(m => m.scale.setScalar(0.55));
  // side shelf (right back)
  g.add(vox(1.0, 1.6, 0.4, WOOD, 1.35, 0.12, -1.15), vox(0.9, 0.07, 0.42, WOOD_D, 1.35, 0.8, -1.15));
  [0xff5a8a, 0x50b0ff, 0xc050ff, 0xffd24a].forEach((c, i) => { const p = at(potion(c, i % 2 === 0), 1.05 + i * 0.22, 0.19, -1.0); p.scale.setScalar(0.55); g.add(p); const p2 = at(potion(c, i % 2 === 1), 1.05 + i * 0.22, 0.86, -1.0); p2.scale.setScalar(0.55); g.add(p2); });
  // front table with flasks, plus flask stands
  g.add(vox(1.0, 0.65, 0.55, WOOD, 1.3, 0.12, 0.7), vox(1.1, 0.06, 0.65, WOOD_L, 1.3, 0.77, 0.7));
  [0xc050ff, 0x50e0ff, 0xff8a3a].forEach((c, i) => { const p = at(potion(c, i === 1), 1.0 + i * 0.28, 0.83, 0.7); p.scale.setScalar(0.6); g.add(p); });
  g.add(at(flaskStand(0xc050ff, 'round'), -1.5, 0.12, 0.7), at(flaskStand(0x55e07a, 'tall'), 1.6, 0.12, -0.1).translateX(0));
  // barrels + herb crates
  g.add(barrel(-1.65, -0.55), barrel(-1.65, 1.15, 0, 0x6b4a2a), crate(0.4, 1.7, 1.1, 0.12), sph(0.12, 0x55e07a, 1.7, 0.55, 1.1));
  const pl = new THREE.PointLight(0xb040ff, 0.8, 5); pl.position.set(0, 1.4, 1.0); g.add(pl);
  return g;
}

function portal() {
  const g = new THREE.Group();
  g.add(tbox(3.0, 0.18, 2.4, 'stone', 0, 0, 0), tbox(2.6, 0.14, 2.0, 'floor', 0, 0.18, 0), vox(2.0, 0.14, 0.4, STONE, 0, 0, 1.4), vox(1.6, 0.1, 0.4, STONE3, 0, 0, 1.75));
  // pillars with stacked blocks
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) g.add(tbox(0.55 + (i % 2) * 0.05, 0.36, 0.55, 'stone', sx * 0.95, 0.32 + i * 0.36, 0));
  // arch blocks
  const R = 0.95;
  for (let k = 0; k <= 8; k++) { const a = k / 8 * Math.PI; const m = vox(0.55, 0.34, 0.55, k % 2 ? STONE2 : STONE, Math.cos(a) * R, 0, 0); m.position.set(Math.cos(a) * R, 2.55 + Math.sin(a) * 1.0, 0); m.rotation.z = a - Math.PI / 2 + Math.PI; m.rotation.z = a + Math.PI / 2; g.add(m); }
  g.add(vox(0.3, 0.4, 0.3, 0x55d6c0, 0, 3.4, 0.2, 0x33ffd0, 0.9));
  // moss
  g.add(vox(0.6, 0.12, 0.6, 0x5d9b45, -0.95, 2.45, 0), vox(0.5, 0.1, 0.5, 0x5d9b45, 0.95, 1.4, 0.0));
  // swirl
  const sw = new THREE.Group(); sw.position.set(0, 1.9, 0);
  const cols = [0x3a1b7a, 0x7a3dd0, 0xb06aff, 0xe0b0ff];
  cols.forEach((c, i) => { const m = new THREE.Mesh(new THREE.CircleGeometry(1.05 - i * 0.24, 20), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); m.position.z = i * 0.01; sw.add(m); const arm = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.9 - i * 0.18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); arm.position.set(0.0, 0.0, 0.03 + i * 0.01); arm.userData.arm = i; sw.add(arm); });
  g.add(sw); g.userData.swirl = sw;
  const l = new THREE.PointLight(0xb070ff, 1.6, 8); l.position.set(0, 2, 1); g.add(l);
  g.add(barrel(-1.6, 0.5)); // mossy rubble
  g.add(rockCluster(0.6).translateX(1.4).translateZ(0.7));
  return g;
}

function hall() {
  const g = new THREE.Group();
  g.add(tbox(4.6, 0.3, 3.4, 'stone', 0, 0, 0));
  g.add(tbox(4.4, 1.3, 3.2, 'stone', 0, 0.3, 0));
  g.add(tbox(4.5, 1.2, 3.3, 'plaster', 0, 1.6, 0), vox(4.6, 0.1, 3.4, WOOD_D, 0, 1.55, 0));
  for (const x of [-2.1, -1.0, 1.0, 2.1]) g.add(vox(0.14, 1.2, 0.1, WOOD_D, x, 1.6, 1.68));
  g.add(vox(4.5, 0.1, 0.1, WOOD_D, 0, 2.7, 1.68));
  // door + windows
  g.add(vox(1.0, 1.15, 0.08, WOOD_D, 0, 0.3, 1.62), vox(0.8, 0.95, 0.05, 0x7a4f28, 0, 0.35, 1.66), vox(1.3, 0.14, 0.4, STONE3, 0, 0, 1.8));
  for (const x of [-1.55, 1.55]) g.add(vox(0.5, 0.5, 0.06, WOOD_D, x, 0.7, 1.62), vox(0.4, 0.4, 0.04, GLOW, x, 0.75, 1.66, 0xffa030, 1));
  for (const x of [-1.55, -0.5, 0.5, 1.55]) g.add(vox(0.42, 0.5, 0.06, WOOD_D, x, 1.95, 1.7), vox(0.32, 0.4, 0.04, GLOW, x, 2.0, 1.74, 0xffa030, 1));
  g.add(gableRoof(4.8, 4.0, 1.8, 2.8, 'x', PLASTER));
  g.add(vox(1.6, 1.0, 0.3, PLASTER, 0, 2.8, 1.6), gableRoof(1.8, 1.7, 0.9, 3.8, 'z', null, 'shingle', 0.1).translateZ(1.6), vox(0.5, 0.4, 0.05, GLOW, 0, 3.0, 1.77, 0xffa030, 1));
  g.add(vox(0.6, 1.5, 0.6, STONE, -1.8, 2.8, -0.8), vox(0.7, 0.12, 0.7, STONE2, -1.8, 4.3, -0.8));
  // banner poles and red banners
  for (const x of [-2.2, 2.2]) g.add(vox(0.1, 3.2, 0.1, WOOD_D, x, 0.3, 1.9), vox(0.5, 0.9, 0.05, 0xc0392b, x + (x > 0 ? -0.3 : 0.3), 2.2, 1.9), vox(0.16, 0.16, 0.06, 0xe8c04a, x + (x > 0 ? -0.3 : 0.3), 2.65, 1.93), cone(0.1, 0.2, 0xe8c04a, x, 3.5, 1.9, 4));
  g.add(at(noticeBoard(), -1.2, 0, 2.5), barrel(2.0, 2.2), crate(0.45, 2.45, 2.0), sack(2.1, 1.9));
  return g;
}

function warehouse() {
  const g = new THREE.Group();
  g.add(tbox(3.7, 0.25, 2.7, 'stone', 0, 0, 0), tbox(3.5, 1.45, 2.5, 'plank', 0, 0.25, 0));
  for (const x of [-1.72, 1.72]) for (const z of [-1.22, 1.22]) g.add(vox(0.16, 1.5, 0.16, WOOD_D, x, 0.25, z));
  // big double doors with cross bracing
  g.add(vox(1.6, 1.25, 0.06, 0x2e1c0e, 0, 0.25, 1.27), vox(0.74, 1.15, 0.05, 0x7a4f28, -0.39, 0.28, 1.31), vox(0.74, 1.15, 0.05, 0x7a4f28, 0.39, 0.28, 1.31));
  g.add(rot(vox(0.07, 1.3, 0.04, WOOD_D, -0.39, 0.25, 1.35), 0, 0, 0.7), rot(vox(0.07, 1.3, 0.04, WOOD_D, 0.39, 0.25, 1.35), 0, 0, -0.7), vox(0.1, 0.1, 0.05, 0xe8c04a, -0.06, 0.8, 1.36), vox(0.1, 0.1, 0.05, 0xe8c04a, 0.06, 0.8, 1.36));
  for (const x of [-1.15, 1.15]) g.add(vox(0.4, 0.4, 0.05, 0x2e1c0e, x, 0.8, 1.27), vox(0.3, 0.3, 0.04, GLOW, x, 0.85, 1.3, 0xffa030, 0.8));
  g.add(gableRoof(3.9, 3.0, 1.25, 1.7, 'x', 0x8a5a2b));
  // hoist crane with a hanging crate
  g.add(vox(0.14, 2.6, 0.14, WOOD_D, 1.95, 0, 1.0), vox(1.2, 0.12, 0.12, WOOD_D, 1.4, 2.5, 1.0), vox(0.03, 0.9, 0.03, 0xc9b27a, 0.9, 1.6, 1.0), crate(0.4, 0.9, 1.0, 1.2));
  // goods piled outside
  g.add(crate(0.55, -2.15, 1.0, 0), crate(0.5, -2.1, 1.55, 0, 0xb5803f), crate(0.45, -2.15, 1.05, 0.55, 0x9c6b3c), barrel(-2.0, -0.3), barrel(-2.0, 0.2), sack(1.5, 1.8), sack(1.8, 1.55), logs(-0.9, 1.9, 0));
  return g;
}

function smelter() {
  const g = new THREE.Group();
  g.add(tbox(2.7, 0.2, 1.9, 'floor', 0, 0, 0), tbox(1.5, 1.3, 1.2, 'stone', -0.5, 0.2, -0.2), vox(0.9, 0.55, 0.3, 0x1c1c20, -0.5, 0.35, 0.42), vox(0.6, 0.35, 0.12, 0xff7a1a, -0.5, 0.42, 0.5, 0xff5a00, 1.6));
  g.add(tbox(0.7, 2.6, 0.7, 'stone', -0.95, 0.2, -0.45), tbox(0.85, 0.3, 0.85, 'stone', -0.95, 2.8, -0.45), vox(0.4, 0.2, 0.4, 0x222226, -0.95, 3.1, -0.45));
  g.add(vox(1.0, 0.1, 1.0, WOOD_D, 0.9, 0.2, 0.5), vox(0.9, 0.12, 0.3, 0xb8bcc4, 0.9, 0.3, 0.3), vox(0.9, 0.12, 0.3, 0xc9ccd4, 0.9, 0.42, 0.3), vox(0.9, 0.12, 0.3, 0xb8bcc4, 0.9, 0.3, 0.7), vox(0.9, 0.12, 0.3, 0xe8c04a, 0.9, 0.42, 0.7));
  g.add(crate(0.4, 1.1, -0.5, 0.2), barrel(0.4, -0.7, 0.2), sph(0.2, 0x2a2a2e, 1.2, 0.2, -0.2), sph(0.16, 0x333338, 1.05, 0.2, -0.4));
  const l = new THREE.PointLight(0xff8a2a, 1.4, 6); l.position.set(-0.5, 0.9, 0.8); g.add(l);
  return g;
}
function tower() {
  const g = new THREE.Group();
  g.add(tbox(1.9, 0.3, 1.9, 'stone', 0, 0, 0), tbox(1.5, 2.6, 1.5, 'stone', 0, 0.3, 0), tbox(1.9, 0.35, 1.9, 'stone', 0, 2.9, 0));
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8], [0, -0.8], [0, 0.8], [-0.8, 0], [0.8, 0]]) g.add(tbox(0.4, 0.4, 0.4, 'stone', x, 3.25, z));
  g.add(vox(0.16, 0.5, 0.06, 0x14141a, 0, 1.6, 0.76), vox(0.16, 0.5, 0.06, 0x14141a, 0, 2.3, 0.76), vox(0.7, 1.0, 0.06, 0x5a3a1a, 0, 0.3, 0.77), vox(0.7, 0.1, 0.1, 0x3b3b40, 0, 0.9, 0.78));
  g.add(vox(0.1, 1.3, 0.1, WOOD_D, 0.5, 3.4, 0.5), vox(0.55, 0.4, 0.04, 0xc0392b, 0.78, 4.2, 0.5), cone(0.1, 0.2, 0xe8c04a, 0.5, 4.7, 0.5, 4));
  g.add(at(makeArcher(), 0.0, 3.25, 0.1));
  return g;
}
function makeArcher() { const a = makeChar(LOOKS.elfHood); a.scale.setScalar(0.55); return a; }

function market() {
  const g = marketStall();
  return g;
}

function tent(variant = 0) {
  const g = new THREE.Group(); const kind = variant ? 'canvasBlue' : 'canvasBeige';
  const len = variant ? 2.0 : 2.3, wid = variant ? 1.9 : 1.8, h = variant ? 1.3 : 1.4;
  const half = wid / 2, ang = Math.atan2(h, half), sl = Math.hypot(half, h) + 0.1;
  for (const sgn of [-1, 1]) {
    const slab = tbox(len, 0.07, sl, kind, 0, 0, 0); const c = new THREE.Group(); c.add(slab);
    c.position.set(0, h - (sl / 2) * Math.sin(ang) + 0.02, sgn * (sl / 2) * Math.cos(ang)); c.rotation.x = sgn * ang; g.add(c);
  }
  g.add(cyl(0.05, 0.05, 1.7, WOOD_D, len / 2 + 0.05, 0, 0, 5), cyl(0.05, 0.05, 1.7, WOOD_D, -len / 2 - 0.05, 0, 0, 5));
  g.add(vox(len + 0.3, 0.07, 0.07, WOOD_D, 0, h, 0));
  // front gable (dark opening) and tent flaps
  g.add(vox(0.06, h * 0.55, wid * 0.55, 0x2e2418, len / 2 - 0.02, 0.05, 0));
  g.add(rot(vox(0.05, h * 0.62, 0.34, kind === 'canvasBlue' ? 0x3b6cc0 : 0xcdb98c, len / 2 + 0.02, 0.05, -0.26), 0, 0, 0), rot(vox(0.05, h * 0.62, 0.34, kind === 'canvasBlue' ? 0xe8eef8 : 0xcdb98c, len / 2 + 0.02, 0.05, 0.26), 0, 0, 0));
  if (variant) g.add(vox(0.35, 0.22, 0.04, 0xc0392b, -len / 2 - 0.05, 1.7, 0.0), vox(0.04, 0.6, 0.04, WOOD_D, -len / 2 - 0.05, 1.7, 0)); else g.add(vox(0.4, 0.22, 0.04, 0x3b6cc0, len / 2 + 0.25, 1.55, 0));
  g.add(crate(0.4, 0.2, 1.1), barrel(-0.9, -1.1), sack(1.3, 1.0));
  g.rotation.y = -Math.PI / 2; // door faces the camera-side (+z)
  return grp(g);
}

function garden() {
  const g = grp(at(planter(0), -0.5, 0, 0.0), at(planter(1), 0.7, 0, 0.0), at(planter(1), -0.5, 0, 0.8), at(planter(0), 0.7, 0, 0.8));
  g.children.forEach(c => c.scale.setScalar(0.9));
  return g;
}
function training() {
  const g = new THREE.Group();
  g.add(at(dummyProp(false), -1.3, 0, -0.2), at(dummyProp(true), -0.4, 0, -0.2), at(archeryTarget(), 0.8, 0, -0.35), at(dummyProp(false), 1.5, 0, 0.1));
  g.add(vox(0.2, 0.2, 0.2, STONE, 0.0, 0, 0.5));
  return g;
}

// Guild Hall decoration that changes with the chosen specialization
export function factionDecor(kind) {
  const g = new THREE.Group();
  if (kind === 'vanguard') {
    for (let i = -4; i <= 4; i++) g.add(cone(0.1, 0.5, 0x9aa0a8, i * 0.5, 4.5, 0, 4));            // iron spikes along the ridge
    for (const x of [-1.6, 1.6]) { g.add(vox(0.5, 0.6, 0.06, 0x8a8f98, x, 0.55, 2.05), vox(0.3, 0.4, 0.04, 0xc0392b, x, 0.65, 2.1)); }
    g.add(rot(vox(0.08, 0.9, 0.05, 0xdfe3ea, -0.35, 2.7, 1.74), 0, 0, 0.7), rot(vox(0.08, 0.9, 0.05, 0xdfe3ea, -0.35, 2.7, 1.74), 0, 0, -0.7), vox(0.3, 0.3, 0.05, 0xc0392b, -0.35, 2.7, 1.7));
    g.add(vox(0.9, 0.12, 0.3, 0x55585f, 2.3, 0, 2.3), vox(0.12, 1.0, 0.12, 0x55585f, 2.3, 0.12, 2.3));
  } else if (kind === 'arcane') {
    g.userData.spin = [];
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshBasicMaterial({ color: [0xb070ff, 0x55e0ff, 0xff70c0, 0x7affd0][i] })); c.position.set([-2, 2, -2, 2][i], 3.6 + (i % 2) * 0.5, [1.6, 1.6, -1.2, -1.2][i]); g.add(c); g.userData.spin.push(c); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.7, 40), new THREE.MeshBasicMaterial({ color: 0xb070ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.09, 3.0); g.add(ring);
    for (const x of [-0.9, 0.9]) g.add(vox(0.12, 0.7, 0.04, 0xb070ff, x, 0.4, 2.08, 0xb070ff, 1));
  } else if (kind === 'rangers') {
    for (const x of [-1.6, -0.5, 0.7, 1.7]) { g.add(vox(0.1, 1.2 + (x > 0 ? 0.3 : 0), 0.08, 0x3f7a2c, x, 0.5, 2.03)); g.add(vox(0.3, 0.14, 0.08, 0x5aa03a, x + 0.12, 1.0, 2.06), vox(0.26, 0.12, 0.08, 0x4f9a3f, x - 0.12, 0.7, 2.06)); }
    g.add(vox(1.0, 0.8, 0.06, 0x3f7a2c, 0, 3.0, 1.72), vox(0.4, 0.4, 0.05, 0xe8c04a, 0, 3.2, 1.76));
    for (const [x, z] of [[2.3, 2.0], [-2.4, 2.2]]) { g.add(cone(0.5, 1.3, 0x2f7a32, x, 0.4, z, 6), vox(0.14, 0.4, 0.14, 0x6b4a2a, x, 0, z)); }
  }
  return g;
}

// Draw-call saver for finished buildings: every plain mesh that shares a material is baked into one (a tavern is ~150 boxes). Anything animated by
// the game (listed in some userData: flames, swirls, lids...), glowing, transparent or instanced is left alone so it still moves and glows.
export function mergeStatic(root) {
  root.updateMatrixWorld(true); const keep = new Set();
  const protect = o => { if (o && o.isObject3D) o.traverse(c => keep.add(c)); };
  root.traverse(o => { for (const v of Object.values(o.userData || {})) { if (Array.isArray(v)) v.forEach(protect); else protect(v); } });
  const byMat = new Map(), inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), rel = new THREE.Matrix4();
  root.traverse(o => { if (!o.isMesh || o.isInstancedMesh || keep.has(o) || !o.material || o.material.isMaterial === false || Array.isArray(o.material)) return; const m = o.material; if (m.transparent || (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) || !m.isMeshLambertMaterial) return; if (!byMat.has(m)) byMat.set(m, []); byMat.get(m).push(o); });
  for (const [m, list] of byMat) {
    if (list.length < 2) continue; let nv = 0, ni = 0;
    const geos = list.map(o => { const g = o.geometry.clone(); rel.multiplyMatrices(inv, o.matrixWorld); g.applyMatrix4(rel); nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; return g; });
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni); let vo = 0, io = 0;
    for (const g of geos) { const n = g.attributes.position.count; pos.set(g.attributes.position.array, vo * 3); nor.set(g.attributes.normal.array, vo * 3); if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2); if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.array[i] + vo; else for (let i = 0; i < n; i++) idx[io++] = vo + i; vo += n; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
    list.forEach(o => { o.parent.remove(o); o.geometry.dispose(); });
  }
  return root;
}
export function buildBuilding(type, variant = 0) {
  switch (type) {
    case 'tavern': return tavern();
    case 'forge': return forge();
    case 'alchemy': return alchemy();
    case 'portal': return portal();
    case 'hall': return hall();
    case 'warehouse': return warehouse();
    case 'smelter': return smelter();
    case 'tower': return tower();
    case 'market': return market();
    case 'tent': return tent(variant);
    case 'garden': return garden();
    case 'training': return training();
    case 'stones': return standingStones();
    case 'campfire': return campfire();
    case 'weapons': return grp(at(weaponRack(), 0, 0, 0), at(shieldRack(), 0, 0, 0).translateX(0));
    case 'cart': return grp(at(cartProp(0), -0.7, 0, 0), at(cartProp(1), 0.7, 0, 0.6).rotateY(-0.4));
    case 'hill': { const g = new THREE.Group(); g.add(cyl(1.45, 1.5, 0.3, 0x58a846, 0, 0, 0, 14), cyl(1.1, 1.35, 0.3, 0x5fb04c, 0, 0.3, 0, 14), cyl(0.7, 0.95, 0.3, 0x68ba54, 0, 0.6, 0, 12), cyl(0.3, 0.5, 0.2, 0x72c45c, 0, 0.9, 0, 10), vox(0.4, 0.3, 0.35, 0x8a8f98, 0.9, 0.05, 0.6), vox(0.3, 0.22, 0.3, 0x7a7f87, -1.0, 0.05, -0.5)); g.add(at(cone(0.3, 0.7, 0x3f8a3a, 0, 0, 0, 7), 0.15, 1.1, 0.1)); return g; }
    case 'farm': { const g = new THREE.Group(); for (let i = 0; i < 4; i++) { g.add(vox(2.6, 0.08, 0.45, 0x6b4a2a, 0, 0, -1.0 + i * 0.66)); for (let j = 0; j < 8; j++) g.add(vox(0.12, 0.35, 0.12, 0xe0c24a, -1.2 + j * 0.34, 0.08, -1.0 + i * 0.66)); } g.add(vox(0.9, 0.7, 0.8, 0xb04a3a, 1.9, 0, -0.9), vox(1.0, 0.25, 0.9, 0x8a3a2a, 1.9, 0.7, -0.9)); return g; }
    case 'bakery': { const g = new THREE.Group(); g.add(vox(2.2, 0.9, 1.5, 0xd8b88a, 0, 0, 0), vox(2.5, 0.35, 1.8, 0xb04a3a, 0, 0.9, 0), vox(0.35, 1.0, 0.35, 0x8a8f98, 0.7, 0.9, -0.3), vox(0.5, 0.5, 0.06, 0xffd890, -0.5, 0.25, 0.78, 0xffc060, 0.5)); return g; }
    case 'well': { const g = new THREE.Group(); g.add(cyl(0.7, 0.75, 0.6, 0x9aa0a8, 0, 0, 0, 12), cyl(0.5, 0.5, 0.05, 0x1d5fa8, 0, 0.58, 0, 12, 0x1d5fa8, 0.4), vox(0.08, 1.2, 0.08, 0x6b4a2b, -0.6, 0.3, 0), vox(0.08, 1.2, 0.08, 0x6b4a2b, 0.6, 0.3, 0), vox(1.6, 0.12, 0.9, 0xb04a3a, 0, 1.5, 0)); return g; }
    case 'pond': { const g = new THREE.Group(); g.add(cyl(1.5, 1.55, 0.14, 0x8a8f98, 0, 0, 0, 20), cyl(1.38, 1.38, 0.08, 0x3b8fd8, 0, 0.1, 0, 20, 0x1d5fa8, 0.5), sph(0.2, 0x5aa03a, -0.6, 0.12, 0.2, 0, 0, 6), sph(0.16, 0x6bbf4a, 0.5, 0.12, -0.3, 0, 0, 6), sph(0.08, 0xffc0e0, 0.5, 0.2, -0.3, 0, 0, 6)); g.scale.set(1, 1, 0.66); return g; }
    case 'flowers': { const g = new THREE.Group(); const C = [0xff6a8a, 0xffd24a, 0xffffff, 0xb070ff, 0xff9a4a]; g.add(vox(0.9, 0.05, 0.9, 0x5aa03a, 0, 0, 0)); for (let i = 0; i < 7; i++) g.add(sph(0.07, C[i % 5], -0.32 + (i % 3) * 0.32, 0.05, -0.3 + Math.floor(i / 3) * 0.3, 0, 0, 5)); return g; }
    case 'sapling': return grp(cyl(0.07, 0.09, 0.5, 0x7a4f28, 0, 0, 0, 6), cone(0.38, 0.8, 0x3f8a3a, 0, 0.35, 0, 7), cone(0.28, 0.6, 0x4aa044, 0, 0.8, 0, 7));
    case 'memorial': { const g = new THREE.Group(); g.add(vox(2.9, 0.08, 1.9, 0x5aa03a, 0, 0, 0), vox(0.5, 0.25, 0.25, 0x7a4f28, 0, 0.08, 0.7)); for (let i = 0; i < 4; i++) g.add(sph(0.07, [0xffc0e0, 0xffe27a, 0xffffff, 0xb070ff][i], -1.2 + i * 0.25, 0.1, 0.78, 0, 0, 5)); const n = Math.min(12, variant | 0); for (let i = 0; i < n; i++) { const x = -1.1 + (i % 6) * 0.44, z = -0.45 + Math.floor(i / 6) * 0.55; g.add(vox(0.22, 0.34 + (i % 3) * 0.05, 0.08, 0xa8acb4, x, 0.08, z), vox(0.14, 0.1, 0.1, 0x8a8e96, x, 0.42 + (i % 3) * 0.05, z)); } return g; }
    case 'road': return vox(1.0, 0.05, 1.0, 0x8f8a80, 0, 0, 0);
    case 'palisade': { const g = new THREE.Group(); for (let i = 0; i < 7; i++) { const x = -1.35 + i * 0.45; g.add(cyl(0.17, 0.19, 0.95 + (i % 2) * 0.12, 0x7a4f28, x, 0, 0, 7), cone(0.17, 0.3, 0x7a4f28, x, 0.95 + (i % 2) * 0.12, 0, 7)); } g.add(vox(2.9, 0.1, 0.12, 0x5a3a1a, 0, 0.45, 0.16), vox(2.9, 0.1, 0.12, 0x5a3a1a, 0, 0.8, 0.16)); return g; }
    case 'lumber': { const g = new THREE.Group(); g.add(vox(1.3, 0.2, 1.1, 0x6b4a2a, -0.7, 0, -0.1), vox(1.1, 0.7, 0.9, 0x8a5a2b, -0.7, 0.2, -0.1), vox(0.3, 0.5, 0.06, 0x3b2a18, -0.7, 0.2, 0.37)); g.add(roof(1.5, 1.3, 0.55, 0x7a3a1a, 0.9, 'x').translateX(-0.7).translateZ(-0.1)); g.add(logs(0.9, 0.2, 0.3), logs(1.2, -0.3, -0.2), stump(0.8, 0.7), stump(1.3, 0.55)); const ax = vox(0.05, 0.4, 0.05, 0x5a3a1a, 0.5, 0, 0.8); g.add(ax, vox(0.2, 0.12, 0.04, 0xb8bcc4, 0.58, 0.32, 0.8)); return g; }
    case 'monument': { const g = new THREE.Group(); g.add(vox(2.4, 0.3, 2.4, 0x9aa0a8, 0, 0, 0), vox(1.8, 0.3, 1.8, 0xb8bcc4, 0, 0.3, 0), vox(1.2, 0.3, 1.2, 0xc9ccd2, 0, 0.6, 0), vox(0.5, 2.6, 0.5, 0xd0d3da, 0, 0.9, 0), cone(0.34, 0.7, 0xe8c04a, 0, 3.5, 0, 4), sph(0.16, 0xffd24a, 0, 4.1, 0, 0xffd24a, 1.2), vox(0.9, 0.12, 0.12, 0xe8c04a, 0, 2.3, 0.28), vox(0.12, 0.12, 0.9, 0xe8c04a, 0, 2.3, 0.28)); return g; }
    case 'cottage': { const g = new THREE.Group(); g.add(vox(1.7, 0.2, 1.5, 0x8a8f98, 0, 0, 0), vox(1.5, 0.85, 1.3, PLASTER, 0, 0.2, 0), vox(0.34, 0.6, 0.06, 0x6b4a2a, 0, 0.2, 0.67), vox(0.3, 0.3, 0.06, 0x8fd4ff, -0.5, 0.55, 0.67, 0xffd24a, 0.4), vox(0.3, 0.3, 0.06, 0x8fd4ff, 0.5, 0.55, 0.67, 0xffd24a, 0.4), vox(0.26, 0.5, 0.26, 0x8a8f98, 0.5, 1.0, -0.3)); g.add(roof(1.9, 1.7, 0.8, SHINGLE, 1.05, 'x')); return g; }
    case 'lamp': return lantern();
    case 'fountain': { const g = new THREE.Group(); g.add(cyl(0.95, 1.0, 0.3, 0x9aa0a8, 0, 0, 0, 16), cyl(0.82, 0.82, 0.08, 0x3b8fd8, 0, 0.26, 0, 16, 0x1d5fa8, 0.5), cyl(0.18, 0.22, 0.9, 0xb8bcc4, 0, 0.3, 0, 10), cyl(0.5, 0.2, 0.14, 0xb8bcc4, 0, 1.0, 0, 12), cyl(0.4, 0.4, 0.05, 0x6bbcff, 0, 1.12, 0, 12, 0x3b8fd8, 0.6), sph(0.1, 0xbfe4ff, 0, 1.2, 0, 0x6bbcff, 0.8)); g.position.set(0, 0, 0); return g; }
    case 'banner': return grp(vox(0.08, 2.2, 0.08, 0x5a3a1a, 0, 0, 0), vox(0.6, 0.9, 0.04, 0xc0392b, 0.34, 1.2, 0), vox(0.5, 0.08, 0.05, GOLD_B, 0.34, 2.05, 0), vox(0.18, 0.18, 0.05, GOLD_B, 0.34, 1.55, 0.03), sph(0.07, GOLD_B, 0, 2.2, 0));
    case 'statue': { const g = new THREE.Group(); g.add(vox(1.3, 0.35, 1.3, 0x9aa0a8, 0, 0, 0), vox(1.0, 0.25, 1.0, 0xb8bcc4, 0, 0.35, 0)); const c = makeChar({ ...LOOKS.knightA, belt: 0x80848c }); c.traverse(o => { if (o.isMesh) o.material = mat(0xc9ccd2); }); c.scale.setScalar(1.15); c.position.y = 0.6; g.add(c); return g; }
    case 'shrooms': return grp(at(bigMushroom(0xd6336c, 1.0), -0.3, 0, 0.1), at(bigMushroom(0x7b3fb5, 0.8), 0.4, 0, -0.2), at(bigMushroom(0x2aa9a0, 0.6), 0.3, 0, 0.45), at(bigMushroom(0xe07a1f, 0.5), -0.5, 0, -0.45));
  }
  return new THREE.Group();
}

/* --------------------------------------------------------------- characters */
// generic chunky chibi character: big head, belt, boots, pivoting arms/legs
export function makeChar(o = {}) {
  const g = new THREE.Group();
  const skin = o.skin ?? 0xf0c8a0, pants = o.pants ?? 0x5a4636, boots = o.boots ?? 0x3b2a18, shirt = o.shirt ?? 0xd8d0c0, sleeve = o.sleeve ?? shirt;
  const dwarf = !!o.dwarf, k = dwarf ? 0.82 : 1;
  const body = new THREE.Group(); g.add(body);
  const mkLeg = x => { const l = new THREE.Group(); l.position.set(x, 0.3 * k, 0); l.add(vox(0.16, 0.22 * k, 0.17, pants, 0, -0.22 * k, 0), vox(0.18, 0.1, 0.23, boots, 0, -0.3 * k, 0.03)); body.add(l); return l; };
  const legL = mkLeg(-0.1), legR = mkLeg(0.1);
  const ty = 0.3 * k;
  body.add(vox(0.46, 0.4 * k, 0.28, shirt, 0, ty, 0));
  if (o.belt !== false) body.add(vox(0.48, 0.06, 0.3, o.belt ?? 0x4a2c12, 0, ty, 0), vox(0.1, 0.07, 0.05, 0xe8c04a, 0, ty, 0.15));
  if (o.skirt) { body.add(vox(0.54, 0.22, 0.34, o.skirt, 0, ty - 0.14, 0), vox(0.64, 0.2, 0.42, o.skirt, 0, ty - 0.3, 0), vox(0.68, 0.04, 0.46, 0xe8c04a, 0, ty - 0.3, 0), vox(0.1, 0.5, 0.02, 0xe8c04a, 0, ty - 0.3, 0.22)); }
  if (o.apron) body.add(vox(0.34, 0.45 * k, 0.04, o.apron, 0, ty - 0.08, 0.16));
  if (o.vest) body.add(vox(0.48, 0.34 * k, 0.3, o.vest, 0, ty + 0.04, 0));
  if (o.cape) body.add(vox(0.44, 0.6 * k, 0.05, o.cape, 0, ty - 0.2, -0.18));
  if (o.plate) {
    body.add(vox(0.5, 0.36 * k, 0.32, o.plate, 0, ty + 0.04, 0), vox(0.22, 0.12, 0.22, o.plate, -0.3, ty + 0.34 * k - 0.08, 0), vox(0.22, 0.12, 0.22, o.plate, 0.3, ty + 0.34 * k - 0.08, 0));
    body.add(vox(0.18, 0.14, 0.04, o.trim ?? 0xe8c04a, 0, ty + 0.18 * k, 0.17));
  }
  const sy = ty + 0.38 * k; // shoulder height
  const mkArm = x => { const a = new THREE.Group(); a.position.set(x, sy, 0); a.add(vox(0.13, 0.3 * k, 0.14, sleeve, 0, -0.28 * k, 0), vox(0.11, 0.1, 0.11, o.glove ?? skin, 0, -0.36 * k, 0)); body.add(a); return a; };
  const armL = mkArm(-0.3), armR = mkArm(0.3);
  // head
  const hy = sy - 0.02;
  body.add(vox(0.42, 0.38, 0.38, skin, 0, hy, 0));
  body.add(vox(0.045, 0.065, 0.02, 0x1a1a1a, -0.1, hy + 0.17, 0.2), vox(0.045, 0.065, 0.02, 0x1a1a1a, 0.1, hy + 0.17, 0.2), vox(0.07, 0.02, 0.02, shadeC(skin), -0.1, hy + 0.25, 0.2), vox(0.07, 0.02, 0.02, shadeC(skin), 0.1, hy + 0.25, 0.2), vox(0.07, 0.07, 0.06, shadeC(skin), 0, hy + 0.1, 0.21));
  if (o.ears) body.add(rot(vox(0.05, 0.14, 0.05, skin, -0.24, hy + 0.2, 0), 0, 0, 0.5), rot(vox(0.05, 0.14, 0.05, skin, 0.24, hy + 0.2, 0), 0, 0, -0.5));
  if (o.hair) { const hc = o.hair; body.add(vox(0.45, 0.12, 0.42, hc, 0, hy + 0.32, 0), vox(0.45, o.longHair ? 0.42 : 0.22, 0.1, hc, 0, hy + (o.longHair ? -0.04 : 0.16), -0.19), vox(0.06, 0.2, 0.36, hc, -0.22, hy + 0.16, 0), vox(0.06, 0.2, 0.36, hc, 0.22, hy + 0.16, 0), vox(0.46, 0.08, 0.06, hc, 0, hy + 0.3, 0.2)); }
  if (o.beard) { const bc = o.beard, L = o.beardLen ?? 0.22; body.add(vox(0.4, 0.14, 0.1, bc, 0, hy + 0.0, 0.2), vox(0.34, L, 0.1, bc, 0, hy - L + 0.04, 0.22), vox(0.22, L * 0.8, 0.1, bc, 0, hy - L * 1.7 + 0.04, 0.23), vox(0.1, 0.08, 0.04, bc, 0, hy + 0.12, 0.23)); }
  // headgear
  const top = hy + 0.38;
  if (o.hat === 'wizard') {
    const c = o.hatColor;
    body.add(cyl(0.4, 0.4, 0.05, c, 0, top - 0.08, 0, 12), cone(0.25, 0.5, c, 0, top - 0.04, 0, 8), at(rot(cone(0.15, 0.42, c, 0, 0, 0, 7), 0, 0, -0.35), 0.05, top + 0.42, 0), at(rot(cone(0.07, 0.28, c, 0, 0, 0, 6), 0, 0, -1.05), 0.26, top + 0.74, 0), vox(0.5, 0.06, 0.46, o.hatBand ?? 0xe8c04a, 0, top - 0.04, 0));
    body.add(sph(0.05, 0xe8c04a, 0.1, top + 0.0, 0.2));
  } else if (o.hat === 'helm') {
    const m = o.metal ?? 0xc3c7cf;
    body.add(vox(0.48, 0.34, 0.44, m, 0, hy + 0.12, 0), sph(0.27, m, 0, hy + 0.2, 0, 0, 0, 10), vox(0.3, 0.07, 0.02, 0x15151a, 0, hy + 0.22, 0.23), vox(0.08, 0.2, 0.03, 0x15151a, 0, hy + 0.08, 0.23), vox(0.46, 0.05, 0.46, 0x9a9ea6, 0, hy + 0.12, 0));
    if (o.plume) body.add(vox(0.07, 0.2, 0.34, o.plume, 0, top + 0.17, -0.02), vox(0.07, 0.14, 0.2, o.plume, 0, top + 0.1, -0.26));
    if (o.horns) body.add(rot(vox(0.05, 0.2, 0.05, 0xf4f0e6, -0.26, hy + 0.3, 0), 0, 0, 0.7), rot(vox(0.05, 0.2, 0.05, 0xf4f0e6, 0.26, hy + 0.3, 0), 0, 0, -0.7));
  } else if (o.hat === 'guard') {
    const m = 0x9aa0a8; body.add(vox(0.48, 0.24, 0.44, m, 0, hy + 0.18, 0), cyl(0.0, 0.26, 0.14, m, 0, top - 0.02, 0, 8), vox(0.06, 0.24, 0.04, m, 0, hy + 0.06, 0.23), vox(0.46, 0.05, 0.46, 0x5a5e66, 0, hy + 0.2, 0));
  } else if (o.hat === 'hood') {
    const c = o.hatColor ?? 0x3f7a2c;
    body.add(vox(0.5, 0.2, 0.46, c, 0, hy + 0.26, 0), vox(0.5, 0.42, 0.1, c, 0, hy - 0.02, -0.2), vox(0.06, 0.36, 0.4, c, -0.25, hy + 0.04, -0.02), vox(0.06, 0.36, 0.4, c, 0.25, hy + 0.04, -0.02), rot(vox(0.3, 0.14, 0.2, c, 0, top - 0.02, -0.12), 0.5, 0, 0));
    body.add(vox(0.5, 0.14, 0.48, c, 0, hy + 0.36, 0));
  } else if (o.hat === 'cap') { body.add(vox(0.46, 0.1, 0.44, o.hatColor ?? 0x8a5a2b, 0, top - 0.04, 0), vox(0.4, 0.04, 0.12, o.hatColor ?? 0x8a5a2b, 0, top - 0.08, 0.26)); }
  else if (o.hat === 'dwarf') { body.add(vox(0.46, 0.12, 0.44, 0x8a8f98, 0, top - 0.06, 0), cyl(0.0, 0.24, 0.14, 0x8a8f98, 0, top + 0.04, 0, 8), vox(0.08, 0.2, 0.06, 0xb06a3a, 0, top + 0.1, -0.2)); }
  // held items
  if (o.sword) { body.add(vox(0.06, 0.6, 0.03, 0xe6e9ef, 0.34, ty - 0.2, 0.18), vox(0.2, 0.05, 0.06, 0xc9962f, 0.34, ty - 0.2, 0.18), vox(0.05, 0.12, 0.05, WOOD_D, 0.34, ty - 0.3, 0.18)); }
  if (o.shield) { const s = o.shield; const sh = new THREE.Group(); sh.add(vox(0.08, 0.46, 0.36, s.body, 0, -0.5, 0), vox(0.1, 0.34, 0.04, s.trim, 0, -0.44, 0), vox(0.1, 0.04, 0.26, s.trim, 0, -0.34, 0), vox(0.1, 0.06, 0.2, s.trim, 0, -0.22, 0)); sh.position.set(-0.06, 0.15, 0.08); armL.add(sh); }
  if (o.bow) { const bw = new THREE.Group(); bw.add(rot(vox(0.04, 0.8, 0.04, 0x8a5a2b, 0, -0.5, 0), 0, 0, 0), at(rot(vox(0.04, 0.34, 0.04, 0x8a5a2b, 0, 0, 0), 0.5, 0, 0), 0, 0.0, 0.0).translateZ(0)); bw.position.set(0.06, 0.0, 0.18); armR.add(bw); body.add(vox(0.02, 0.7, 0.02, 0xeeeeee, 0.36, ty - 0.35, 0.2)); }
  if (o.quiver) { body.add(vox(0.16, 0.4, 0.12, 0x6b4a2a, 0.0, ty + 0.0, -0.22), vox(0.04, 0.18, 0.04, 0xf4f0e6, -0.04, ty + 0.38, -0.22), vox(0.04, 0.16, 0.04, 0xf4f0e6, 0.04, ty + 0.38, -0.22)); }
  if (o.staff) { const st = new THREE.Group(); st.add(vox(0.06, 1.5, 0.06, 0x7a4f28, 0, -0.52, 0), sph(0.1, o.staff, 0, 0.95 - 0.52, 0, o.staff, 1.1), vox(0.18, 0.04, 0.18, 0xc9962f, 0, 0.88 - 0.52, 0)); st.position.set(0.0, 0, 0.12); armR.add(st); }
  if (o.spear) { const sp = new THREE.Group(); sp.add(vox(0.05, 1.6, 0.05, 0x7a4f28, 0, -0.5, 0), cone(0.07, 0.25, 0xdfe3ea, 0, 1.1, 0, 4)); sp.position.set(0.0, 0, 0.1); armR.add(sp); }
  if (o.hammer) { const hm = new THREE.Group(); hm.add(vox(0.05, 0.5, 0.05, 0x7a4f28, 0, -0.55, 0), vox(0.24, 0.14, 0.14, 0x55585f, 0, -0.1, 0)); hm.position.set(0.0, 0, 0.1); armR.add(hm); }
  if (o.lute) { body.add(sph(0.16, 0xb06a3a, 0.0, ty + 0.1, 0.22), vox(0.05, 0.4, 0.05, WOOD_D, 0.0, ty + 0.2, 0.3)); }
  if (o.pack) body.add(vox(0.34, 0.4, 0.2, 0x8a5a2b, 0, ty - 0.02, -0.24), vox(0.3, 0.08, 0.22, 0x6b4a2a, 0, ty + 0.36, -0.24));
  if (dwarf) body.scale.set(1.22, 1, 1.12);
  g.userData.legs = [legL, legR]; g.userData.arms = [armL, armR];
  g.scale.setScalar(0.85);
  return g;
}
function shadeC(c) { const col = new THREE.Color(c); col.multiplyScalar(0.88); return col.getHex(); }

const SILVER = 0xc3c7cf;
// Looks taken from the concept sheet's character line-up
export const LOOKS = {
  wizardBlue:  { skin: 0xf0c8a0, shirt: 0x3a5fd0, skirt: 0x3a5fd0, hat: 'wizard', hatColor: 0x2f4fb8, beard: 0xf2f2f2, beardLen: 0.42, hair: 0xe8e8e8, longHair: true, staff: 0x55e0ff, pants: 0x2a3a80, belt: 0xc9962f, sleeve: 0x3a5fd0 },
  wizardPurple:{ skin: 0xf0c8a0, shirt: 0x7a3db5, skirt: 0x7a3db5, hat: 'wizard', hatColor: 0x6a2da5, beard: 0xdcd0e8, beardLen: 0.42, hair: 0xdcd0e8, longHair: true, staff: 0xff7aff, pants: 0x3a1a60, belt: 0xc9962f, sleeve: 0x7a3db5, hatBand: 0xff7aff },
  dwarfBrown:  { skin: 0xe8b890, dwarf: true, shirt: 0x8a5a2b, vest: 0x6b4a2a, pants: 0x4a3a2a, beard: 0x7a4a22, beardLen: 0.3, hair: 0x7a4a22, hat: 'dwarf', hammer: true, apron: 0x3b3b40 },
  dwarfOrange: { skin: 0xe8b890, dwarf: true, shirt: 0x7a5a3a, vest: 0x5a4636, pants: 0x4a3a2a, beard: 0xd8661a, beardLen: 0.34, hair: 0xd8661a, apron: 0x3b3b40, pack: true },
  knightA:     { skin: 0xf0c8a0, plate: SILVER, shirt: SILVER, sleeve: SILVER, pants: 0x80848c, boots: 0x4a4d54, hat: 'helm', metal: SILVER, plume: 0xc0392b, sword: true, glove: 0x80848c },
  knightB:     { skin: 0xf0c8a0, plate: 0xb8bcc4, shirt: 0xb8bcc4, sleeve: 0xb8bcc4, pants: 0x80848c, boots: 0x4a4d54, hat: 'helm', metal: 0xb8bcc4, plume: 0x3b6cc0, sword: true, cape: 0x3b6cc0, shield: { body: 0xb8bcc4, trim: 0x3b6cc0 }, glove: 0x80848c },
  knightC:     { skin: 0xf0c8a0, plate: 0xd0d3da, shirt: 0xd0d3da, sleeve: 0xd0d3da, pants: 0x9a9ea6, boots: 0x4a4d54, hat: 'helm', metal: 0xd0d3da, horns: true, sword: true, shield: { body: 0xc0392b, trim: 0xe8c04a }, cape: 0xc0392b, glove: 0x80848c },
  elfBlond:    { skin: 0xf4d0a8, shirt: 0x5aa03a, sleeve: 0x5aa03a, pants: 0x6b4a2a, boots: 0x5a3a1a, hair: 0xf0d46a, longHair: true, ears: true, bow: true, quiver: true, vest: 0x3f7a2c },
  elfHood:     { skin: 0xf4d0a8, shirt: 0x3f7a2c, sleeve: 0x3f7a2c, pants: 0x5a4636, boots: 0x5a3a1a, hat: 'hood', hatColor: 0x3f7a2c, cape: 0x3f7a2c, bow: true, quiver: true, ears: false },
  elfGreen:    { skin: 0xf4d0a8, shirt: 0x7ab648, sleeve: 0xe9d3a6, pants: 0x6b4a2a, boots: 0x5a3a1a, hair: 0xf0d46a, ears: true, vest: 0x7ab648 },
  rogueA:      { skin: 0xe6b88a, shirt: 0x2f2f3a, sleeve: 0x2f2f3a, pants: 0x1f1f28, boots: 0x15151a, hat: 'hood', hatColor: 0x26262e, cape: 0x1c1c24, sword: true, belt: 0x5a1d1d, glove: 0x15151a },
  rogueB:      { skin: 0xf0c8a0, shirt: 0x5a3a2a, sleeve: 0x5a3a2a, vest: 0x2a2a30, pants: 0x2a2a30, boots: 0x15151a, hat: 'cap', hatColor: 0x7a1d1d, hair: 0x2a1a10, sword: true, ears: false },
  clericA:     { skin: 0xf0c8a0, shirt: 0xf4f0e6, sleeve: 0xf4f0e6, skirt: 0xf4f0e6, vest: 0xe8c04a, hair: 0xc8a060, hat: 'cap', hatColor: 0xf4f0e6, staff: 0xffe27a, pants: 0xd8d0c0, belt: 0xe8c04a },
  clericB:     { skin: 0xe6b88a, shirt: 0xe9e2d0, sleeve: 0xe9e2d0, skirt: 0xe9e2d0, vest: 0x3b6cc0, hair: 0x4a2c12, longHair: true, staff: 0xaee6ff, pants: 0xd8d0c0, belt: 0xc9962f },
  alchemistA:  { skin: 0xf0c8a0, shirt: 0x7ab648, sleeve: 0xe9d3a6, apron: 0x5a4636, hat: 'cap', hatColor: 0x2aa9a0, hair: 0x6b4a2a, pack: true, pants: 0x4a3a2a, glove: 0x7a5a3a },
  alchemistB:  { skin: 0xe6b88a, shirt: 0xb06a3a, sleeve: 0xb06a3a, apron: 0xe9d3a6, hat: 'cap', hatColor: 0x7b3fb5, hair: 0xd8661a, pack: true, pants: 0x3a2a22, glove: 0x5a3a1a },
  villagerA:   { skin: 0xf0c8a0, shirt: 0xf4f0e6, sleeve: 0xf4f0e6, vest: 0x3b6cc0, pants: 0x5a4636, hair: 0x6b4a2a },
  villagerB:   { skin: 0xe6b88a, shirt: 0xf4f0e6, sleeve: 0xf4f0e6, vest: 0xb06a3a, pants: 0x4a3a2a, hair: 0x4a2c12, hat: 'cap', hatColor: 0x8a5a2b },
  guardA:      { skin: 0xf0c8a0, plate: 0x9aa0a8, shirt: 0x9aa0a8, sleeve: 0x7a7f87, pants: 0x4a4d54, hat: 'guard', spear: true, cape: 0xc0392b, shield: { body: 0x9aa0a8, trim: 0xc0392b } },
  guardB:      { skin: 0xe6b88a, plate: 0xb8bcc4, shirt: 0xb8bcc4, sleeve: 0x8a8f98, pants: 0x4a4d54, hat: 'guard', sword: true, shield: { body: 0xb8bcc4, trim: 0xe8c04a } },
};
const CLASS_LOOKS = { knight: ['knightA', 'knightB', 'knightC'], ranger: ['elfBlond', 'elfHood', 'elfGreen'], wizard: ['wizardBlue', 'wizardPurple'], rogue: ['rogueA', 'rogueB'], cleric: ['clericA', 'clericB'], alchemist: ['alchemistA', 'alchemistB'] };
// Which builder makes people: the classic box figure, or a rigged one (src/rigchar.js) that plays motion clips. Set once at boot.
let charMaker = makeChar;
export const setCharMaker = f => { charMaker = f || makeChar; };
export const buildChar = look => charMaker(look);
export function buildHero(cls, variant = 0) {
  const list = CLASS_LOOKS[cls];
  return buildChar(LOOKS[list[variant % list.length]]);
}
export const STAFF_LOOK = { smith: 'dwarfOrange', alch: 'wizardBlue', cook: 'villagerA', bard: 'villagerB', guard: 'guardA', porter: 'dwarfBrown' };
export const buildStaff = kind => {
  const look = { ...LOOKS[STAFF_LOOK[kind]] };
  if (kind === 'bard') look.lute = true; if (kind === 'cook') look.apron = 0xf4f0e6;
  if (kind === 'smith') look.hammer = true; if (kind === 'porter') look.pack = true;
  return buildChar(look);
};

export function buildGoblin() {
  return buildChar({ skin: 0x6fbf3f, shirt: 0x5a3a1a, sleeve: 0x6fbf3f, pants: 0x3a5a2a, boots: 0x2a1a0a, dwarf: true, hat: 'cap', hatColor: 0x7a2a2a, ears: true, hammer: true, belt: 0x2a1a0a });
}
export function buildMerchantCart() {
  const g = cartProp(1); g.add(vox(1.0, 0.7, 0.7, 0xe6d5b0, 0, 0.7, 0), roof(1.2, 1.1, 0.4, 0xc0392b, 1.4, 'x'), vox(0.3, 0.3, 0.3, 0xffd24a, 0.1, 1.8, 0, 0xffd24a, 0.7)); return g;
}
export const PROPS = { cartProp, crateStack, marketStall, dummyProp, archeryTarget, noticeBoard, barricade, spikeBarricade, campfire, bigMushroom, standingStones, rockCluster, weaponRack, shieldRack, spearFence, potion, flaskStand, planter, anvil, lantern, lanternSmall, tree, barrel, crate, sack, table, bench, stump, logs };
