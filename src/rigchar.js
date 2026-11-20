// Rigged characters. Same look options as makeChar (models.js), but the body is split into the 15 joints of the
// model_check rig (hips, waist, head, and hip/knee/ankle + shoulder/elbow/wrist on each side), so the Mixamo-derived clips
// in clips.js can play on it. Two body styles share one rig:  'voxel' (flat-shaded boxes, like the old look) and
// 'round' (tapered limbs, ball joints, ellipsoid head). Left = +x, the character faces +z.
import * as THREE from '../vendor/three.module.js';
import { mat, vox, cyl, cone, sph, rot, at, tbox } from './models.js';
import CLIPS from './clips.js';

const WOOD_D = 0x5a3a1a, GOLD = 0xe8c04a;
const shadeC = c => { const col = new THREE.Color(c); col.multiplyScalar(0.88); return col.getHex(); };
const smoothCache = new Map();
const smat = c => { if (!smoothCache.has(c)) smoothCache.set(c, new THREE.MeshLambertMaterial({ color: c })); return smoothCache.get(c); };
const flag = m => { m.castShadow = m.receiveShadow = true; return m; };

// ------------------------------------------------------------------ the rig
const BONES = ['hips', 'torso', 'head', 'hipL', 'kneeL', 'ankL', 'hipR', 'kneeR', 'ankR', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR'];
const PARENT = { torso: 'hips', head: 'torso', hipL: 'hips', kneeL: 'hipL', ankL: 'kneeL', hipR: 'hips', kneeR: 'hipR', ankR: 'kneeR', shL: 'torso', elL: 'shL', wrL: 'elL', shR: 'torso', elR: 'shR', wrR: 'elR' };

export function makeRigChar(o = {}, style = 'voxel') {
  const round = style === 'round';
  const skin = o.skin ?? 0xf0c8a0, pants = o.pants ?? 0x5a4636, boots = o.boots ?? 0x3b2a18, shirt = o.shirt ?? 0xd8d0c0, sleeve = o.sleeve ?? shirt, glove = o.glove ?? skin;
  const dwarf = !!o.dwarf, k = dwarf ? 0.82 : 1;
  const ty = 0.3 * k, sy = ty + 0.38 * k, hy = sy - 0.02, top = hy + 0.38;   // hip, shoulder, head-bottom and head-top heights (game units)

  // rest positions of the joints (absolute); Left = +x
  const J = { hips: [0, ty, 0], torso: [0, ty + 0.08 * k, 0], head: [0, hy, 0] };
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    J['hip' + s] = [sx * 0.1, ty, 0]; J['knee' + s] = [sx * 0.1, ty - 0.13 * k, 0]; J['ank' + s] = [sx * 0.1, 0.08, 0];
    J['sh' + s] = [sx * 0.3, sy, 0]; J['el' + s] = [sx * 0.3, sy - 0.17 * k, 0]; J['wr' + s] = [sx * 0.3, sy - 0.29 * k, 0];
  }
  const g = new THREE.Group(), root = new THREE.Group(); g.add(root);
  const j = {}; for (const b of BONES) j[b] = new THREE.Group();
  for (const b of BONES) { const p = PARENT[b]; if (p) { j[b].position.fromArray(J[b].map((v, i) => v - J[p][i])); j[p].add(j[b]); } else { j[b].position.fromArray(J[b]); root.add(j[b]); } }
  // add meshes given in absolute rest coordinates to a joint
  const put = (jn, ...meshes) => { for (const m of meshes.flat()) { if (!m) continue; m.position.x -= J[jn][0]; m.position.y -= J[jn][1]; m.position.z -= J[jn][2]; j[jn].add(m); } };

  // ---- body-part factories: a box in the voxel style, a smooth shape in the round one
  // bottom-centre at (x, y, z); w/d across, h tall; 'tube' tapers (top radius = taper * bottom radius)
  const box = (w, h, d, c, x, y, z) => vox(w, h, d, c, x, y, z);
  const tube = (w, h, d, c, x, y, z, taper = 0.85) => {
    if (!round) return vox(w, h, d, c, x, y, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * taper, 0.5, 1, 12), smat(c)); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); return flag(m);
  };
  const ell = (w, h, d, c, x, y, z) => {
    if (!round) return vox(w, h, d, c, x, y, z);
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), smat(c)); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); return flag(m);
  };
  const ball = (r, c, x, y, z) => {      // joint cap, round style only
    if (!round) return null;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), smat(c)); m.position.set(x, y, z); return flag(m);
  };

  // ---- legs
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const kneeY = J['knee' + s][1];
    put('hip' + s, tube(0.16, ty - kneeY + 0.01, 0.17, pants, sx * 0.1, kneeY, 0, 0.9));
    put('knee' + s, tube(0.145, kneeY - 0.08 + 0.01, 0.155, pants, sx * 0.1, 0.08, 0, 0.9), ball(0.075, pants, sx * 0.1, kneeY, 0));
    put('ank' + s, ell(0.18, 0.1, 0.23, boots, sx * 0.1, 0, 0.03));
  }
  // ---- pelvis + waist + chest
  put('hips', tube(0.44, 0.14 * k, 0.27, o.skirt ? o.skirt : (o.plate ? pants : shirt), 0, ty - 0.02, 0, 0.95));
  if (o.belt !== false) put('hips', box(0.48, 0.06, 0.3, o.belt ?? 0x4a2c12, 0, ty + 0.0, 0), box(0.1, 0.07, 0.05, GOLD, 0, ty - 0.005, 0.15));
  put('torso', tube(0.46, 0.34 * k, 0.28, shirt, 0, J.torso[1] - 0.0, 0, 1.06));
  if (o.skirt) put('hips', box(0.54, 0.22, 0.34, o.skirt, 0, ty - 0.14, 0), box(0.64, 0.2, 0.42, o.skirt, 0, ty - 0.3, 0), box(0.68, 0.04, 0.46, GOLD, 0, ty - 0.3, 0), box(0.1, 0.5, 0.02, GOLD, 0, ty - 0.3, 0.22));
  if (o.apron) put('torso', box(0.34, 0.45 * k, 0.04, o.apron, 0, ty - 0.08, 0.16));
  if (o.vest) put('torso', box(0.48, 0.34 * k, 0.3, o.vest, 0, ty + 0.04, 0));
  if (o.cape) put('torso', box(0.44, 0.6 * k, 0.05, o.cape, 0, ty - 0.2, -0.18));
  if (o.plate) {
    put('torso', box(0.5, 0.36 * k, 0.32, o.plate, 0, ty + 0.04, 0), box(0.18, 0.14, 0.04, o.trim ?? GOLD, 0, ty + 0.18 * k, 0.17));
    put('shL', ell(0.22, 0.12, 0.22, o.plate, 0.3, ty + 0.34 * k - 0.08, 0)); put('shR', ell(0.22, 0.12, 0.22, o.plate, -0.3, ty + 0.34 * k - 0.08, 0));
  }
  // ---- arms
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    const elY = J['el' + s][1], wrY = J['wr' + s][1];
    put('sh' + s, tube(0.13, sy + 0.02 - elY, 0.14, sleeve, sx * 0.3, elY, 0, 0.88), ball(0.075, sleeve, sx * 0.3, sy - 0.02, 0));
    put('el' + s, tube(0.115, elY - (sy - 0.28 * k), 0.125, sleeve, sx * 0.3, sy - 0.28 * k, 0, 0.9), ball(0.062, sleeve, sx * 0.3, elY, 0));
    put('wr' + s, ell(0.11, 0.1, 0.11, glove, sx * 0.3, sy - 0.36 * k, 0));
  }
  // ---- head
  put('head', ell(0.42, 0.38, 0.38, skin, 0, hy, 0));
  put('head', box(0.045, 0.065, 0.02, 0x1a1a1a, -0.1, hy + 0.17, 0.2), box(0.045, 0.065, 0.02, 0x1a1a1a, 0.1, hy + 0.17, 0.2), box(0.07, 0.02, 0.02, shadeC(skin), -0.1, hy + 0.25, 0.2), box(0.07, 0.02, 0.02, shadeC(skin), 0.1, hy + 0.25, 0.2), box(0.07, 0.07, 0.06, shadeC(skin), 0, hy + 0.1, 0.21));
  if (o.ears) put('head', rot(box(0.05, 0.14, 0.05, skin, -0.24, hy + 0.2, 0), 0, 0, 0.5), rot(box(0.05, 0.14, 0.05, skin, 0.24, hy + 0.2, 0), 0, 0, -0.5));
  if (o.hair) { const hc = o.hair; put('head', box(0.45, 0.12, 0.42, hc, 0, hy + 0.32, 0), box(0.45, o.longHair ? 0.42 : 0.22, 0.1, hc, 0, hy + (o.longHair ? -0.04 : 0.16), -0.19), box(0.06, 0.2, 0.36, hc, -0.22, hy + 0.16, 0), box(0.06, 0.2, 0.36, hc, 0.22, hy + 0.16, 0), box(0.46, 0.08, 0.06, hc, 0, hy + 0.3, 0.2)); }
  if (o.beard) { const bc = o.beard, L = o.beardLen ?? 0.22; put('head', box(0.4, 0.14, 0.1, bc, 0, hy + 0.0, 0.2), box(0.34, L, 0.1, bc, 0, hy - L + 0.04, 0.22), box(0.22, L * 0.8, 0.1, bc, 0, hy - L * 1.7 + 0.04, 0.23), box(0.1, 0.08, 0.04, bc, 0, hy + 0.12, 0.23)); }
  // headgear
  if (o.hat === 'wizard') {
    const c = o.hatColor;
    put('head', cyl(0.4, 0.4, 0.05, c, 0, top - 0.08, 0, 12), cone(0.25, 0.5, c, 0, top - 0.04, 0, 8), at(rot(cone(0.15, 0.42, c, 0, 0, 0, 7), 0, 0, -0.35), 0.05, top + 0.42, 0), at(rot(cone(0.07, 0.28, c, 0, 0, 0, 6), 0, 0, -1.05), 0.26, top + 0.74, 0), box(0.5, 0.06, 0.46, o.hatBand ?? GOLD, 0, top - 0.04, 0), sph(0.05, GOLD, 0.1, top + 0.0, 0.2));
  } else if (o.hat === 'helm') {
    const m = o.metal ?? 0xc3c7cf;
    put('head', box(0.48, 0.34, 0.44, m, 0, hy + 0.12, 0), sph(0.27, m, 0, hy + 0.2, 0, 0, 0, 10), box(0.3, 0.07, 0.02, 0x15151a, 0, hy + 0.22, 0.23), box(0.08, 0.2, 0.03, 0x15151a, 0, hy + 0.08, 0.23), box(0.46, 0.05, 0.46, 0x9a9ea6, 0, hy + 0.12, 0));
    if (o.plume) put('head', box(0.07, 0.2, 0.34, o.plume, 0, top + 0.17, -0.02), box(0.07, 0.14, 0.2, o.plume, 0, top + 0.1, -0.26));
    if (o.horns) put('head', rot(box(0.05, 0.2, 0.05, 0xf4f0e6, -0.26, hy + 0.3, 0), 0, 0, 0.7), rot(box(0.05, 0.2, 0.05, 0xf4f0e6, 0.26, hy + 0.3, 0), 0, 0, -0.7));
  } else if (o.hat === 'guard') {
    const m = 0x9aa0a8; put('head', box(0.48, 0.24, 0.44, m, 0, hy + 0.18, 0), cyl(0.0, 0.26, 0.14, m, 0, top - 0.02, 0, 8), box(0.06, 0.24, 0.04, m, 0, hy + 0.06, 0.23), box(0.46, 0.05, 0.46, 0x5a5e66, 0, hy + 0.2, 0));
  } else if (o.hat === 'hood') {
    const c = o.hatColor ?? 0x3f7a2c;
    put('head', box(0.5, 0.2, 0.46, c, 0, hy + 0.26, 0), box(0.5, 0.42, 0.1, c, 0, hy - 0.02, -0.2), box(0.06, 0.36, 0.4, c, -0.25, hy + 0.04, -0.02), box(0.06, 0.36, 0.4, c, 0.25, hy + 0.04, -0.02), rot(box(0.3, 0.14, 0.2, c, 0, top - 0.02, -0.12), 0.5, 0, 0), box(0.5, 0.14, 0.48, c, 0, hy + 0.36, 0));
  } else if (o.hat === 'cap') put('head', box(0.46, 0.1, 0.44, o.hatColor ?? 0x8a5a2b, 0, top - 0.04, 0), box(0.4, 0.04, 0.12, o.hatColor ?? 0x8a5a2b, 0, top - 0.08, 0.26));
  else if (o.hat === 'dwarf') put('head', box(0.46, 0.12, 0.44, 0x8a8f98, 0, top - 0.06, 0), cyl(0.0, 0.24, 0.14, 0x8a8f98, 0, top + 0.04, 0, 8), box(0.08, 0.2, 0.06, 0xb06a3a, 0, top + 0.1, -0.2));

  // ---- things carried. Held items ride on the wrists (right hand: weapon, left: shield / bow) so the clips swing them.
  const grip = (key, make, tilt = true) => {         // a holder at the right hand, grip at the origin, item along +y
    const holder = new THREE.Group(); const item = make(); holder.add(item);
    if (tilt) { holder.quaternion.set(0.7931, -0.1585, 0.1425, 0.5706); holder.position.set(-0.003, -0.09, -0.002); } else holder.position.set(0, -0.04, 0.02);
    holder.name = key; j.wrR.add(holder); return holder;
  };
  if (o.sword) grip('sword', () => { const s = new THREE.Group(); s.add(box(0.05, 0.12, 0.05, WOOD_D, 0, -0.08, 0), box(0.2, 0.05, 0.06, 0xc9962f, 0, 0.03, 0), box(0.03, 0.6, 0.06, 0xe6e9ef, 0, 0.08, 0)); return s; });
  if (o.shield) { const s = o.shield; const sh = new THREE.Group(); sh.add(box(0.08, 0.46, 0.36, s.body, 0, -0.34, 0), box(0.1, 0.34, 0.04, s.trim, 0, -0.28, 0), box(0.1, 0.04, 0.26, s.trim, 0, -0.18, 0), box(0.1, 0.06, 0.2, s.trim, 0, -0.06, 0)); sh.position.set(0.11, 0.1, 0.06); j.elL.add(sh); }
  if (o.bow) {
    const bw = new THREE.Group(); bw.add(box(0.04, 0.8, 0.04, 0x8a5a2b, 0, -0.4, 0), at(rot(box(0.04, 0.3, 0.04, 0x8a5a2b, 0, 0, 0), 0.55, 0, 0), 0, 0.3, 0.05), at(rot(box(0.04, 0.3, 0.04, 0x8a5a2b, 0, -0.3, 0), -0.55, 0, 0), 0, -0.4, 0.05), box(0.015, 0.7, 0.015, 0xeeeeee, 0, -0.35, -0.05));
    bw.position.set(0.0, 0.0, 0.05); bw.quaternion.setFromEuler(new THREE.Euler(0.0, Math.PI / 2, 0.0)); const h = new THREE.Group(); h.add(bw); h.position.set(0, -0.04, 0.03); j.wrL.add(h);
  }
  if (o.quiver) put('torso', box(0.16, 0.4, 0.12, 0x6b4a2a, 0.0, ty + 0.0, -0.22), box(0.04, 0.18, 0.04, 0xf4f0e6, -0.04, ty + 0.38, -0.22), box(0.04, 0.16, 0.04, 0xf4f0e6, 0.04, ty + 0.38, -0.22));
  if (o.staff) grip('staff', () => { const st = new THREE.Group(); st.add(box(0.06, 1.5, 0.06, 0x7a4f28, 0, -0.52, 0), sph(0.1, o.staff, 0, 0.95 - 0.52, 0, o.staff, 1.1), box(0.18, 0.04, 0.18, 0xc9962f, 0, 0.88 - 0.52, 0)); return st; }, false);
  if (o.spear) grip('spear', () => { const sp = new THREE.Group(); sp.add(box(0.05, 1.6, 0.05, 0x7a4f28, 0, -0.5, 0), cone(0.07, 0.25, 0xdfe3ea, 0, 1.1, 0, 4)); return sp; }, false);
  if (o.hammer) grip('hammer', () => { const hm = new THREE.Group(); hm.add(box(0.05, 0.5, 0.05, 0x7a4f28, 0, -0.15, 0), box(0.24, 0.14, 0.14, 0x55585f, 0, 0.3, 0)); return hm; });
  if (o.lute) put('torso', sph(0.16, 0xb06a3a, 0.0, ty + 0.1, 0.22), box(0.05, 0.4, 0.05, WOOD_D, 0.0, ty + 0.2, 0.3));
  if (o.pack) put('torso', box(0.34, 0.4, 0.2, 0x8a5a2b, 0, ty - 0.02, -0.24), box(0.3, 0.08, 0.22, 0x6b4a2a, 0, ty + 0.36, -0.24));

  if (dwarf) root.scale.set(1.22, 1, 1.12);
  g.scale.setScalar(0.85);
  const hipsRest = J.hips[1];
  g.userData.rig = { root, hips: j.hips, j, hipsRest };
  const dummy = () => new THREE.Group();   // old code swings legs/arms by hand; with a rig that is a no-op and the clips do the work
  g.userData.legs = [dummy(), dummy()]; g.userData.arms = [dummy(), dummy()];
  g.userData.anim = new Animator(g.userData.rig);
  g.userData.style = style;
  return g;
}

// ------------------------------------------------------------------ animation
// Clip format (model_check DW_ANIMS): d seconds, n = frames-1, loop, hit (seconds of the impact), t = per bone Euler XYZ per frame + hipsY/hipsZ.
const BONE_OF = { spine: 'torso', head: 'head', shoulderL: 'shL', shoulderR: 'shR', elbowL: 'elL', elbowR: 'elR', handL: 'wrL', handR: 'wrR', hipL: 'hipL', hipR: 'hipR', kneeL: 'kneeL', kneeR: 'kneeR' };
let compiled = null;
function compileClips() {
  compiled = {}; const e = new THREE.Euler(), q = new THREE.Quaternion();
  for (const [name, c] of Object.entries(CLIPS)) {
    const qs = {};
    for (const b of ['hips', ...Object.keys(BONE_OF)]) {
      if (!c.t[b]) continue; const a = new Float32Array((c.n + 1) * 4);
      c.t[b].forEach((v, i) => { e.set(v[0], v[1], v[2]); q.setFromEuler(e); q.toArray(a, i * 4); });
      qs[b] = a;
    }
    compiled[name] = { d: c.d, n: c.n, loop: !!c.loop, hit: c.hit || 0, q: qs, y: c.t.hipsY, z: c.t.hipsZ };
  }
}
export const clipInfo = name => { if (!compiled) compileClips(); return compiled[name]; };
export const CLIP_NAMES = Object.keys(CLIPS);

const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
// Plays one clip at a time with a short cross-fade. update(dt) advances time and writes the pose.
export class Animator {
  constructor(rig) { this.rig = rig; this.name = null; this.t = 0; this.speed = 1; this.fade = 0; this.fadeDur = 0.2; this.snap = null; this.done = false; this.pending = null; }
  play(name, opt = {}) {
    if (!compiled) compileClips(); if (!compiled[name]) return;
    if (this.name === name && !opt.restart) { if (opt.speed) this.speed = opt.speed; return; }
    this.snap = this.name ? this.pose() : null;
    this.name = name; this.t = opt.at || 0; this.speed = opt.speed || 1; this.fadeDur = opt.fade ?? 0.2; this.fade = this.snap ? 0 : 1; this.done = false; this.pending = opt.then || null;
  }
  pose() { const P = { q: {}, y: this.rig.hips.position.y, z: this.rig.hips.position.z }; for (const [bn, jn] of [['hips', 'hips'], ...Object.entries(BONE_OF)]) P.q[bn] = this.rig.j[jn === 'hips' ? 'hips' : jn]?.quaternion.clone() ?? this.rig.hips.quaternion.clone(); P.q.hips = this.rig.hips.quaternion.clone(); return P; }
  // Follow a clip at a time given from outside (the stage shows any moment T of a fight): switches with a short cross-fade.
  drive(name, t, dt = 0.016) {
    if (!compiled) compileClips(); if (!compiled[name]) return;
    if (this.name !== name) { this.snap = this.name ? this.pose() : null; this.name = name; this.fade = this.snap ? 0 : 1; this.fadeDur = 0.15; this.done = false; this.pending = null; }
    this.t = t; this.speed = 0; this.sample(dt);
  }
  update(dt) { if (!compiled || !compiled[this.name]) return; this.t += dt * this.speed; this.sample(dt); }
  sample(dt) {
    const c = compiled[this.name]; if (!c) return;
    let u = this.t / c.d;
    if (c.loop) u -= Math.floor(u); else if (u >= 1) { u = 1; if (!this.done) { this.done = true; if (this.pending) { const p = this.pending; this.pending = null; this.play(p.name || p, p.opt || {}); return this.sample(0); } } }
    else if (u < 0) u = 0;
    const f = u * c.n, i = Math.min(c.n - 1, Math.floor(f)), kk = f - i;
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt / this.fadeDur);
    const w = this.fade * this.fade * (3 - 2 * this.fade), rig = this.rig;
    for (const bn of ['hips', ...Object.keys(BONE_OF)]) {
      const a = c.q[bn]; if (!a) continue; const joint = bn === 'hips' ? rig.hips : rig.j[BONE_OF[bn]];
      qa.fromArray(a, i * 4); qb.fromArray(a, Math.min(c.n, i + 1) * 4); qa.slerp(qb, kk);
      if (w < 1 && this.snap) joint.quaternion.copy(this.snap.q[bn]).slerp(qa, w); else joint.quaternion.copy(qa);
    }
    const y = c.y[i] + (c.y[Math.min(c.n, i + 1)] - c.y[i]) * kk, z = c.z[i] + (c.z[Math.min(c.n, i + 1)] - c.z[i]) * kk, s = rig.hipsRest / 0.9;
    const hy = y * s, hz = z * s;
    rig.hips.position.y = w < 1 && this.snap ? this.snap.y + (hy - this.snap.y) * w : hy;
    rig.hips.position.z = w < 1 && this.snap ? this.snap.z + (hz - this.snap.z) * w : hz;
  }
}

// Picks idle / walk / run from how fast a character actually moved since the last call (heroes, staff, raiders around the base).
export function autoAnim(m, dt) {
  const a = m.userData.anim; if (!a || dt <= 0) return;
  const u = m.userData, lp = u._lp || (u._lp = m.position.clone());
  const v = Math.hypot(m.position.x - lp.x, m.position.z - lp.z) / dt; lp.copy(m.position);
  u._v = (u._v ?? v) * 0.8 + v * 0.2;                       // smoothed, so a one-frame stop does not flicker
  const want = u._v > 2.6 ? 'runCalm' : u._v > 0.25 ? 'walkCalm' : 'idleEase';
  a.play(want, { speed: want === 'walkCalm' ? Math.max(0.7, Math.min(1.6, u._v / 1.35)) : want === 'runCalm' ? Math.max(0.8, Math.min(1.5, u._v / 3.6)) : 1 });
  a.update(dt);
}

// ------------------------------------------------------------------ the Ancient Golem on the same rig
// Built from separate stone parts (feet, shins, thighs, pelvis, chest, head, shoulders, upper arms, forearms, fists) on the same
// 15 joints as a person, so the walk / attack / flinch / fall clips play on it. Big, with long arms and short legs.
export function makeRigGolem() {
  const J = { hips: [0, 0.82, 0], torso: [0, 0.95, 0], head: [0, 1.6, 0] };
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    J['hip' + s] = [sx * 0.3, 0.82, 0]; J['knee' + s] = [sx * 0.3, 0.46, 0]; J['ank' + s] = [sx * 0.3, 0.14, 0];
    J['sh' + s] = [sx * 0.8, 1.5, 0]; J['el' + s] = [sx * 0.86, 0.92, 0]; J['wr' + s] = [sx * 0.86, 0.42, 0];
  }
  const g = new THREE.Group(), root = new THREE.Group(); g.add(root);
  const j = {}; for (const b of BONES) j[b] = new THREE.Group();
  for (const b of BONES) { const p = PARENT[b]; if (p) { j[b].position.fromArray(J[b].map((v, i) => v - J[p][i])); j[p].add(j[b]); } else { j[b].position.fromArray(J[b]); root.add(j[b]); } }
  const put = (jn, ...ms) => { for (const m of ms.flat()) { m.position.x -= J[jn][0]; m.position.y -= J[jn][1]; m.position.z -= J[jn][2]; j[jn].add(m); } };
  const st = (w, h, d, x, y, z) => tbox(w, h, d, 'stone', x, y, z), glow = (w, h, d, x, y, z, ei = 1.4) => vox(w, h, d, 0x55ffee, x, y, z, 0x33ffd0, ei);
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    put('hip' + s, st(0.44, 0.4, 0.48, sx * 0.3, 0.46, 0));
    put('knee' + s, st(0.4, 0.34, 0.44, sx * 0.3, 0.14, 0));
    put('ank' + s, st(0.52, 0.14, 0.7, sx * 0.3, 0, 0.09));
    put('sh' + s, st(0.5, 0.36, 0.56, sx * 0.8, 1.5 - 0.1, 0), st(0.4, 0.62, 0.42, sx * 0.86, 0.92, 0));
    put('el' + s, st(0.36, 0.5, 0.4, sx * 0.86, 0.42, 0));
    put('wr' + s, st(0.52, 0.46, 0.54, sx * 0.86, -0.04, 0.04));
  }
  put('hips', st(0.98, 0.34, 0.6, 0, 0.7, 0));
  put('torso', st(1.12, 0.72, 0.7, 0, 0.95, 0), vox(0.96, 0.1, 0.62, 0x5d9b45, 0, 1.62, 0), glow(0.3, 0.3, 0.05, 0, 1.25, 0.36, 1.7));   // moss on the shoulders, a glowing core
  put('head', st(0.56, 0.5, 0.52, 0, 1.58, 0.02), glow(0.14, 0.09, 0.04, -0.15, 1.82, 0.28), glow(0.14, 0.09, 0.04, 0.15, 1.82, 0.28), glow(0.4, 0.07, 0.04, 0, 1.64, 0.28, 1.1), vox(0.5, 0.1, 0.46, 0x5d9b45, 0, 2.06, 0));
  g.scale.setScalar(1.5);
  g.userData.rig = { root, hips: j.hips, j, hipsRest: J.hips[1] };
  const dummy = () => new THREE.Group(); g.userData.legs = [dummy(), dummy()]; g.userData.arms = [dummy(), dummy()];
  g.userData.anim = new Animator(g.userData.rig);
  g.userData.clips = { attack: 'attack3', attacks: ['attack3', 'attackJump', 'brawlSwipe', 'brawlPunch', 'attack3', 'attack2'], walk: 'walkCalm', walkSpeed: 0.7, run: 'runCalm', runSpeed: 0.9 };     // heavy swing, slow stride
  return g;
}

// ------------------------------------------------------------------ the Ogre Warchief on the same rig
// A hulking green brute: small head, huge belly and shoulders, thick arms, a spiked club in the right hand.
export function makeRigOgre() {
  const skin = 0x8aa84e, dark = 0x6e8a3e, cloth = 0x6b4a2a, belt = 0x3a2a1a, boots = 0x2a1a0a;
  const J = { hips: [0, 0.58, 0], torso: [0, 0.7, 0], head: [0, 1.2, 0] };
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    J['hip' + s] = [sx * 0.24, 0.58, 0]; J['knee' + s] = [sx * 0.24, 0.32, 0]; J['ank' + s] = [sx * 0.24, 0.1, 0];
    J['sh' + s] = [sx * 0.62, 1.12, 0]; J['el' + s] = [sx * 0.7, 0.72, 0]; J['wr' + s] = [sx * 0.7, 0.4, 0];
  }
  const g = new THREE.Group(), root = new THREE.Group(); g.add(root);
  const j = {}; for (const b of BONES) j[b] = new THREE.Group();
  for (const b of BONES) { const p = PARENT[b]; if (p) { j[b].position.fromArray(J[b].map((v, i) => v - J[p][i])); j[p].add(j[b]); } else { j[b].position.fromArray(J[b]); root.add(j[b]); } }
  const put = (jn, ...ms) => { for (const m of ms.flat()) { m.position.x -= J[jn][0]; m.position.y -= J[jn][1]; m.position.z -= J[jn][2]; j[jn].add(m); } };
  for (const [s, sx] of [['L', 1], ['R', -1]]) {
    put('hip' + s, vox(0.34, 0.3, 0.36, cloth, sx * 0.24, 0.32, 0));
    put('knee' + s, vox(0.3, 0.26, 0.32, skin, sx * 0.24, 0.1, 0));
    put('ank' + s, vox(0.36, 0.12, 0.5, boots, sx * 0.24, 0, 0.07));
    put('sh' + s, vox(0.42, 0.26, 0.46, dark, sx * 0.62, 1.0, 0), vox(0.3, 0.46, 0.32, skin, sx * 0.7, 0.72, 0));
    put('el' + s, vox(0.27, 0.34, 0.3, skin, sx * 0.7, 0.4, 0), vox(0.3, 0.06, 0.32, belt, sx * 0.7, 0.42, 0));
    put('wr' + s, vox(0.34, 0.3, 0.34, dark, sx * 0.7, 0.1, 0.03));
  }
  put('hips', vox(0.7, 0.22, 0.46, cloth, 0, 0.5, 0), vox(0.74, 0.06, 0.5, belt, 0, 0.66, 0), vox(0.14, 0.08, 0.05, GOLD, 0, 0.65, 0.26));
  put('torso', vox(0.98, 0.6, 0.62, skin, 0, 0.72, 0), vox(0.8, 0.34, 0.2, dark, 0, 0.72, 0.36), vox(0.9, 0.2, 0.55, dark, 0, 1.12, 0));          // chest, belly, hunched shoulders
  put('head', vox(0.5, 0.42, 0.46, skin, 0, 1.18, 0.04), vox(0.14, 0.08, 0.04, 0xffe45a, -0.12, 1.4, 0.28, 0xffe45a, 0.8), vox(0.14, 0.08, 0.04, 0xffe45a, 0.12, 1.4, 0.28, 0xffe45a, 0.8),
    vox(0.5, 0.1, 0.12, dark, 0, 1.5, 0.22), vox(0.4, 0.14, 0.12, boots, 0, 1.2, 0.3), cone(0.05, 0.18, 0xf4f0e6, -0.13, 1.18, 0.34, 4), cone(0.05, 0.18, 0xf4f0e6, 0.13, 1.18, 0.34, 4), vox(0.52, 0.1, 0.5, belt, 0, 1.58, 0.02));
  const club = new THREE.Group(); club.add(vox(0.09, 0.8, 0.09, 0x7a4f28, 0, -0.2, 0), vox(0.3, 0.42, 0.3, 0x6b4a2a, 0, 0.5, 0), vox(0.1, 0.1, 0.1, 0xb8bcc4, 0.18, 0.62, 0), vox(0.1, 0.1, 0.1, 0xb8bcc4, -0.18, 0.62, 0), vox(0.1, 0.1, 0.1, 0xb8bcc4, 0, 0.62, 0.18), vox(0.1, 0.1, 0.1, 0xb8bcc4, 0, 0.62, -0.18));
  const holder = new THREE.Group(); holder.add(club); holder.quaternion.set(0.7931, -0.1585, 0.1425, 0.5706); holder.position.set(-0.003, -0.1, -0.002); j.wrR.add(holder);
  g.scale.setScalar(1.55);
  g.userData.rig = { root, hips: j.hips, j, hipsRest: J.hips[1] };
  const dummy = () => new THREE.Group(); g.userData.legs = [dummy(), dummy()]; g.userData.arms = [dummy(), dummy()];
  g.userData.anim = new Animator(g.userData.rig);
  g.userData.clips = { attack: 'attack3', attacks: ['attack3', 'attack2', 'kick', 'brawlSwipe', 'attackJump', 'brawlPunch'], walk: 'walkCalm', walkSpeed: 0.8, run: 'runCalm', runSpeed: 0.9 };
  return g;
}
