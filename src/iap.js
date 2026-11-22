// In-app purchases behind one small interface (like ads.js). On Android the page talks to the Play Billing wrapper through `window.AndroidBilling`
// (isReady(), owned(id), price(id), buy(id)); the wrapper answers with window.__iapResult(id, ok). In a browser, add ?mockiap to the address to
// try the shop with a free fake purchase; without it the shop stays hidden.
// Products (create them as one-time "in-app products" in the Play Console with these ids):
//   remove_ads    - removes the banner (rewarded offers stay optional)
//   starter_pack  - one-time gold, Mythril and materials
const KEY = 'fantasy-guild-master-iap';
export const PRODUCTS = {
  remove_ads: { icon: '🚫', name: 'Remove banner ads', desc: 'Removes the banner at the bottom of the screen. Optional reward offers still work.', price: '$2.99' },
  starter_pack: { icon: '🎁', name: 'Starter pack', desc: '2,500 gold, 2 Mythril, 30 ore, 30 wood and 20 herbs. One time only.', price: '$1.99' },
};
let pending = null, owned = new Set();
try { owned = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { /* none */ }
const native = () => typeof window !== 'undefined' && window.AndroidBilling && typeof window.AndroidBilling.isReady === 'function';
const mock = () => { try { return /[?&]mockiap/.test(location.search); } catch (e) { return false; } };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...owned])); } catch (e) { /* ignore */ } };
export const IAP = {
  get available() { return native() ? window.AndroidBilling.isReady() : mock(); },
  owned(id) { return native() ? !!window.AndroidBilling.owned(id) || owned.has(id) : owned.has(id); },
  price(id) { if (native()) { const p = window.AndroidBilling.price(id); if (p) return p; } return PRODUCTS[id].price; },
  buy(id) {
    if (!PRODUCTS[id] || pending) return Promise.resolve(false);
    return new Promise(resolve => {
      pending = { id, resolve, done: ok => { if (!pending || pending.id !== id) return; pending = null; if (ok) { owned.add(id); save(); } resolve(!!ok); } };
      if (native()) { try { window.AndroidBilling.buy(id); } catch (e) { pending.done(false); } } else if (mock()) setTimeout(() => pending && pending.done(true), 600); else pending.done(false);
    });
  },
};
if (typeof window !== 'undefined') window.__iapResult = (id, ok) => { if (pending && pending.id === id) pending.done(!!ok); };
