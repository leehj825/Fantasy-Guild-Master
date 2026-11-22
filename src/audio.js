// Procedural sound: every effect and the background music are synthesised with WebAudio (no audio files).
const KEY = 'fantasy-guild-master-audio';
let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, musicTimer = null, mood = 'base';
const prefs = { sfx: true, music: true }, last = {};
try { Object.assign(prefs, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* defaults */ }

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = prefs.sfx ? 0.5 : 0; sfxBus.connect(master);
  musicBus = ctx.createGain(); musicBus.gain.value = prefs.music ? 0.2 : 0; musicBus.connect(master);
  const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, n); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  startMusic(); return ctx;
}
export function unlock() { const c = ensure(); unlocked = true; if (c && c.state === 'suspended' && !document.hidden) c.resume(); }
// Silence everything while the page or app is in the background (tab hidden, phone locked, app switched), resume when it returns.
let unlocked = false;
function setHidden(hide) {
  if (!ctx) return;
  if (hide) { if (ctx.state === 'running') ctx.suspend(); }
  else if (unlocked && !document.hidden) ctx.resume();
}
if (typeof document !== 'undefined' && typeof addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => setHidden(document.hidden));
  addEventListener('pagehide', () => setHidden(true)); addEventListener('pageshow', () => setHidden(false));
  window.__audioHidden = setHidden;   // the Android wrapper calls this from onPause / onResume
}
export const audioState = () => (ctx ? ctx.state : 'none');
export const getPrefs = () => ({ ...prefs });
export function setPref(k, on) {
  prefs[k] = !!on; try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  if (ctx) { sfxBus.gain.value = prefs.sfx ? 0.5 : 0; musicBus.gain.value = prefs.music ? 0.2 : 0; }
}
export function setMusicMood(m) { mood = m; }
let style = 0;   // 0 spring, 1 summer, 2 autumn, 3 winter
export function setMusicStyle(i) { style = i | 0; }

function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, bus = sfxBus, slideTo = null) {
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.3, lp = 2000, when = 0, bus = sfxBus) {
  const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = lp; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + dur + 0.05);
}
const SFX = {
  click: () => tone(660, 0.05, 'square', 0.07),
  deny: () => tone(150, 0.2, 'sawtooth', 0.13, 0, sfxBus, 90),
  coin: () => { tone(1318, 0.09, 'sine', 0.13); tone(1760, 0.14, 'sine', 0.11, 0.07); },
  build: () => { noise(0.16, 0.35, 500); tone(180, 0.22, 'triangle', 0.3, 0, sfxBus, 90); [523, 659, 784].forEach((f, i) => tone(f, 0.18, 'triangle', 0.13, 0.12 + i * 0.07)); },
  horn: () => { tone(196, 0.35, 'sawtooth', 0.13, 0, sfxBus, 262); tone(262, 0.3, 'sawtooth', 0.1, 0.25); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, 'triangle', 0.17, i * 0.12)),
  lose: () => [330, 262, 196].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.11, i * 0.18)),
  hit: () => { noise(0.07, 0.22, 3000); tone(220, 0.08, 'square', 0.07, 0, sfxBus, 110); },
  ehit: () => { noise(0.09, 0.2, 900); tone(110, 0.1, 'square', 0.07); },
  die: () => tone(300, 0.35, 'sawtooth', 0.1, 0, sfxBus, 60),
  level: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, 0.2, 'sine', 0.13, i * 0.07)),
  chime: () => { tone(1047, 0.4, 'sine', 0.13); tone(1568, 0.5, 'sine', 0.09, 0.12); },
  raid: () => { tone(98, 0.9, 'sawtooth', 0.18, 0, sfxBus, 82); tone(147, 0.9, 'sawtooth', 0.11, 0.1); },
  goal: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, i * 0.08)),
  trap: () => { noise(0.12, 0.3, 2500); tone(900, 0.08, 'square', 0.1); tone(200, 0.25, 'sawtooth', 0.14, 0.08, sfxBus, 70); },
  craft: () => { for (let i = 0; i < 3; i++) { noise(0.06, 0.3, 4000, i * 0.14); tone(1400 + i * 120, 0.12, 'triangle', 0.1, i * 0.14); } [784, 988, 1319].forEach((f, i) => tone(f, 0.3, 'sine', 0.11, 0.5 + i * 0.08)); },
  bond: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, 'sine', 0.12, i * 0.05)); noise(0.3, 0.12, 6000, 0.1); },
  fire: () => { noise(0.5, 0.2, 1800); noise(0.4, 0.14, 900, 0.15); },
  splash: () => { noise(0.5, 0.25, 1200); tone(300, 0.3, 'sine', 0.08, 0, sfxBus, 120); },
  chest: () => { noise(0.1, 0.2, 1200); [880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.25, 'sine', 0.11, 0.1 + i * 0.06)); },
};
export function sfx(name) {
  if (!prefs.sfx) return; const c = ensure(); if (!c || c.state !== 'running') return;
  const now = performance.now(), gap = (name === 'hit' || name === 'ehit') ? 70 : (name === 'coin' ? 120 : 40);
  if (last[name] && now - last[name] < gap) return; last[name] = now; if (SFX[name]) SFX[name]();
}
// quiet ambient music: a slow pad plus random pentatonic notes; darker and busier in battle
const SC = { base: [0, 2, 4, 7, 9], battle: [0, 3, 5, 7, 10] };
const SEASON_SC = [[0, 2, 4, 7, 9], [0, 2, 4, 7, 9, 11], [0, 3, 5, 7, 10], [0, 3, 7, 10, 12]], SEASON_ROOT = [174.6, 196, 164.8, 146.8], SEASON_NOTE = [0.35, 0.45, 0.3, 0.18];
// ambient layer: seasonal and weather textures under the music (wind, rain, birds, crickets, crackle); follows the music switch
let ambTimer = null, ambBus = null, ambKind = null;
export function setAmbient(kind) { ambKind = kind; }   // 'rain', 'fire', 'flood' or null (then the season decides)
function startAmbient() {
  if (ambTimer) return; ambBus = ctx.createGain(); ambBus.gain.value = 0.55; ambBus.connect(musicBus); let n = 0;
  ambTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running' || !prefs.music || battleNow()) return; n++;
    const k = ambKind || ['birds', 'insects', 'wind', 'snow'][style];
    if (k === 'rain') { if (n % 2 === 0) noise(0.6, 0.12, 7000, 0, ambBus); }
    else if (k === 'fire') { if (Math.random() < 0.7) noise(0.08 + Math.random() * 0.1, 0.18, 3000, 0, ambBus); }
    else if (k === 'flood') { if (n % 3 === 0) noise(0.9, 0.12, 900, 0, ambBus); }
    else if (k === 'birds') { if (Math.random() < 0.18) { const f = 2200 + Math.random() * 1400; tone(f, 0.07, 'sine', 0.06, 0, ambBus, f * 1.25); tone(f * 1.1, 0.07, 'sine', 0.05, 0.09, ambBus, f * 1.4); } }
    else if (k === 'insects') { if (Math.random() < 0.5) for (let i = 0; i < 3; i++) tone(4200, 0.025, 'square', 0.015, i * 0.045, ambBus); }
    else if (k === 'wind') { if (n % 4 === 0) noise(1.4, 0.07, 500 + Math.random() * 500, 0, ambBus); if (Math.random() < 0.08) tone(1900 + Math.random() * 500, 0.1, 'sine', 0.04, 0, ambBus); }
    else if (k === 'snow') { if (n % 4 === 0) noise(1.8, 0.06, 380, 0, ambBus); }
  }, 400);
}
const battleNow = () => mood === 'battle';
function startMusic() {
  startAmbient();
  if (musicTimer) return; let step = 0;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running' || !prefs.music) return;
    const battle = mood === 'battle', root = battle ? 110 : SEASON_ROOT[style], sc = battle ? SC.battle : SEASON_SC[style];
    if (step % 16 === 0) for (const semi of (battle ? [0, 3, 7] : style >= 2 ? [0, 3, 7] : [0, 4, 7])) tone(root * Math.pow(2, semi / 12), 4.2, 'triangle', 0.32, 0, musicBus);
    if (Math.random() < (battle ? 0.7 : SEASON_NOTE[style])) tone(root * 2 * Math.pow(2, sc[Math.floor(Math.random() * sc.length)] / 12), 0.7, 'sine', 0.3, 0, musicBus);
    if (battle && step % 2 === 0) tone(root / 2, 0.18, 'square', 0.09, 0, musicBus);
    step++;
  }, 250);
}
