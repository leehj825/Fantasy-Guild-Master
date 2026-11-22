// Display-time translation layer. All code and data stay in English; text is translated where it is shown
// (toasts, modals, HUD, logs). The Korean dictionary lives in lang-ko.js.
import { KO_DICT, makeKoRules } from './lang-ko.js';
import { JA_DICT } from './lang-ja.js';

export const LANGS = { en: 'English', ko: '한국어', ja: '日本語 (partial)' };
let lang = 'en', dict = {}, rules = [], rx = null;
const cache = new Map(), listeners = new Set(), KEY = 'fantasy-guild-master-lang';
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const getLang = () => lang;
export function onLangChange(f) { listeners.add(f); }
export function initLang() {
  let l = null; try { l = localStorage.getItem(KEY); } catch (e) { /* storage unavailable */ }
  if (!l) l = (navigator.language || '').toLowerCase().startsWith('ko') ? 'ko' : (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  applyLang(LANGS[l] ? l : 'en', false);
}
export function setLang(l) { if (LANGS[l] && l !== lang) applyLang(l, true); }
function applyLang(l, persist) {
  lang = l; cache.clear(); document.documentElement.lang = l;
  if (l === 'ko') {
    dict = KO_DICT; rules = makeKoRules(tr);
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);   // longest phrase first
    rx = new RegExp('(?<![A-Za-z])(?:' + keys.map(esc).join('|') + ')(?![A-Za-z])', 'g');
  } else if (l === 'ja') {
    dict = JA_DICT; rules = [];
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    rx = new RegExp('(?<![A-Za-z])(?:' + keys.map(esc).join('|') + ')(?![A-Za-z])', 'g');
  } else { dict = {}; rules = []; rx = null; }
  if (persist) { try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ } }
  translateStatic(); listeners.forEach(f => f(l));
}

// translate one piece of text: exact entry, then full-sentence rules, then phrase-by-phrase glossary
export function tr(s) {
  if (lang === 'en' || !s) return s;
  s = String(s); const hit = cache.get(s); if (hit !== undefined) return hit;
  const core0 = s.trim(); let out;
  if (!/[A-Za-z]/.test(core0)) out = s;
  else {
    const lead = s.slice(0, s.indexOf(core0)), trail = s.slice(s.indexOf(core0) + core0.length);
    // ignore leading decoration such as "☐ ", "✔ ", "👁 " when looking for an exact entry or a sentence rule
    const pre = core0.match(/^[^A-Za-z0-9]*/)[0], core = core0.slice(pre.length);
    if (dict[core0] !== undefined) out = lead + dict[core0] + trail;
    else if (core && dict[core] !== undefined) out = lead + pre + dict[core] + trail;
    else {
      let done = false;
      for (const [re, fn] of rules) { const m = core0.match(re); if (m) { out = lead + fn(...m.slice(1)) + trail; done = true; break; } const m2 = core && core !== core0 ? core.match(re) : null; if (m2) { out = lead + pre + fn(...m2.slice(1)) + trail; done = true; break; } }
      if (!done) out = lead + core0.replace(rx, m => dict[m] ?? m) + trail;
    }
  }
  if (lang === 'ko') out = out.replace(/(\d)g(?![A-Za-z])/g, '$1골드');   // gold shorthand
  if (cache.size > 6000) cache.clear(); cache.set(s, out); return out;
}
// translate the text segments (and title attributes) of an HTML string
export function trHtml(html) {
  if (lang === 'en' || !html) return html;
  return ('>' + html + '<').replace(/>([^<>]+)</g, (m, t) => '>' + tr(t) + '<').replace(/(title)="([^"]*)"/g, (m, a, v) => `${a}="${tr(v)}"`).slice(1, -1);
}
// static page text (toolbar, buttons, tooltips): remember the English original so the language can switch back and forth
export function translateStatic(root = document.body) {
  if (!root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement; if (!p || p.closest('#modalBody,#world,#stageEl,#watchLog,#toasts,#wParty,#wSwitch,#objList,#expeds,#royal,#weekly,#banner,#placeHint')) continue;
    if (n.__en === undefined) { if (!/[A-Za-z]/.test(n.nodeValue)) continue; n.__en = n.nodeValue; }
    n.nodeValue = tr(n.__en);
  }
  root.querySelectorAll('[title]').forEach(el => { if (el.dataset.en === undefined) el.dataset.en = el.getAttribute('title'); el.setAttribute('title', tr(el.dataset.en)); });
}
