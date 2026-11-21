// Rewarded ads, behind one small interface so the game never talks to an ad SDK directly.
//  - On Android the page talks to the native wrapper through `window.AndroidAds` (see MainActivity.java): isReady() and show(requestId);
//    the wrapper answers with window.__adResult(requestId, rewarded).
//  - In a browser there is no ad network. Add ?mockads to the address (or set localStorage 'fantasy-guild-master-mockads' = '1') to get a
//    fake 3-second ad for testing; without it, ad offers never appear.
// Pacing lives here: one global gap between ads and a per-hour limit for each placement, so ads stay an occasional, optional bonus.
const KEY = 'fantasy-guild-master-ads', MOCK_KEY = 'fantasy-guild-master-mockads';
const PLACEMENTS = {            // perHour: most offers an hour; gap: seconds before this placement can be offered again
  doubleLoot: { perHour: 6, gap: 0 },
  restGuild: { perHour: 8, gap: 240 },
  diveRescue: { perHour: 4, gap: 0 },
};
const GLOBAL_GAP = 180, SESSION_MAX = 10;
const log = [];                 // {t, placement} of finished ads
let enabled = true, pending = null, seq = 0, lastEnd = -1e9;
try { enabled = localStorage.getItem(KEY) !== 'off'; } catch (e) { /* default on */ }
const now = () => performance.now() / 1000;
const mock = () => { try { return /[?&]mockads/.test(location.search) || localStorage.getItem(MOCK_KEY) === '1'; } catch (e) { return false; } };
const native = () => typeof window !== 'undefined' && window.AndroidAds && typeof window.AndroidAds.isReady === 'function';

export const Ads = {
  get enabled() { return enabled; },
  setEnabled(on) { enabled = !!on; try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch (e) { /* ignore */ } },
  // can an offer for this placement be shown right now?
  canShow(placement) {
    const P = PLACEMENTS[placement]; if (!enabled || !P || pending) return false;
    if (!(native() ? window.AndroidAds.isReady() : mock())) return false;
    const t = now(); if (t - lastEnd < GLOBAL_GAP && log.length) return false; if (log.length >= SESSION_MAX) return false;
    const mine = log.filter(x => x.placement === placement);
    if (mine.length && t - mine[mine.length - 1].t < P.gap) return false;
    if (mine.filter(x => t - x.t < 3600).length >= P.perHour) return false;
    return true;
  },
  // show an ad; resolves true only if the player earned the reward
  show(placement) {
    if (!this.canShow(placement)) return Promise.resolve(false);
    return new Promise(resolve => {
      const id = ++seq; pending = { id, resolve, placement };
      const done = ok => { if (!pending || pending.id !== id) return; pending = null; lastEnd = now(); if (ok) log.push({ t: now(), placement }); resolve(!!ok); };
      pending.done = done;
      if (native()) { try { window.AndroidAds.show(String(id)); } catch (e) { done(false); } }
      else mockAd(done);
    });
  },
};
// the native wrapper calls this when an ad finishes
if (typeof window !== 'undefined') window.__adResult = (id, rewarded) => { if (pending && String(pending.id) === String(id)) pending.done(!!rewarded); };

function mockAd(done) {   // a stand-in for browsers and tests
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:99;background:#000d;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font:20px sans-serif;gap:10px';
  el.innerHTML = '<div style="font-size:42px">📺</div><div>Ad playing… <b id="mockSec">3</b></div>';
  document.body.appendChild(el); let s = 3; const iv = setInterval(() => { s--; const b = el.querySelector('#mockSec'); if (b) b.textContent = s; if (s <= 0) { clearInterval(iv); el.remove(); done(true); } }, 1000);
}
