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
  chest: () => { noise(0.1, 0.2, 1200); [880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.25, 'sine', 0.11, 0.1 + i * 0.06)); },
};
export function sfx(name) {
  if (!prefs.sfx) return; const c = ensure(); if (!c || c.state !== 'running') return;
  const now = performance.now(), gap = (name === 'hit' || name === 'ehit') ? 70 : (name === 'coin' ? 120 : 40);
  if (last[name] && now - last[name] < gap) return; last[name] = now; if (SFX[name]) SFX[name]();
}
// quiet ambient music: a slow pad plus random pentatonic notes; darker and busier in battle
const SC = { base: [0, 2, 4, 7, 9], battle: [0, 3, 5, 7, 10] };
function startMusic() {
  if (musicTimer) return; let step = 0;
  musicTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running' || !prefs.music) return;
    const battle = mood === 'battle', root = battle ? 110 : 174.6, sc = SC[mood];
    if (step % 16 === 0) for (const semi of (battle ? [0, 3, 7] : [0, 4, 7])) tone(root * Math.pow(2, semi / 12), 4.2, 'triangle', 0.32, 0, musicBus);
    if (Math.random() < (battle ? 0.7 : 0.35)) tone(root * 2 * Math.pow(2, sc[Math.floor(Math.random() * sc.length)] / 12), 0.7, 'sine', 0.3, 0, musicBus);
    if (battle && step % 2 === 0) tone(root / 2, 0.18, 'square', 0.09, 0, musicBus);
    step++;
  }, 250);
}
