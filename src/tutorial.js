// First-run guide: a short card that points at the next thing to do and advances by itself.
import { tr } from './i18n.js';

export function createTutorial({ G, first, toast }) {
  const $ = id => document.getElementById(id);
  const STEPS = [
    { text: 'Welcome, Guild Master! Tap "Build" and place a Tavern so heroes have somewhere to rest. Drag the golden plot, rotate it with ⟲ ⟳, then press ✔ Build.', hl: '#toolbar [data-open=build]', done: () => !!first('tavern') },
    { text: 'Now build a Forge. It turns Iron Ore into weapons that your heroes buy.', hl: '#toolbar [data-open=build]', done: () => !!first('forge') },
    { text: 'Heroes walk to the Forge for weapons (watch their thought bubbles). Wait until a hero shows ✅, or tap any hero to see their details.', hl: '', done: () => G.heroes.some(h => h.gear) },
    { text: 'Open "Quests" and send your first party. Use "Auto-send", or "Choose party…" for full control over who goes and how.', hl: '#toolbar [data-open=quests]', done: () => G.questsDone > 0 || G.quests.some(q => q.state === 'active') },
    { text: 'Tap the 👁 row under "Expeditions" (top right) to watch the fight live. Before the finale you can cast Enchant, send a potion, or recall.', hl: '#expeds', done: () => G.flags.tutWatched || (G.questsDone > 0 && !G.quests.some(q => q.state === 'active')) },
    { text: 'Tap a building to open it, then press "Upgrade" to make it better. The level cap rises with your Guild Rank.', hl: '', done: () => G.buildings.some(b => b.level > 1) },
    { text: 'Open "Upgrades" to see your Guild Rank and its requirements. Goals in the top-right panel pay rewards. Build partner buildings close together for bonuses!', hl: '#toolbar [data-open=upgrades]', done: () => G.flags.tutRank },
  ];
  let lit = [];
  function highlight(sel) {
    lit.forEach(e => e.classList.remove('tut-hl')); lit = sel ? [...document.querySelectorAll(sel)] : [];
    lit.forEach(e => e.classList.add('tut-hl'));
  }
  function render() {
    const card = $('tutorial'), i = G.flags.tut || 0;
    if (G.flags.tutDone || i >= STEPS.length) { card.classList.add('hidden'); highlight(''); return; }
    card.classList.remove('hidden'); $('tutStep').textContent = tr('Tutorial') + ` ${i + 1}/${STEPS.length}`; $('tutText').textContent = tr(STEPS[i].text); highlight(STEPS[i].hl);
  }
  function init() {
    if (G.flags.tut === undefined && !G.flags.tutDone) {
      if (G.buildings.length > 2 || G.questsDone > 0) G.flags.tutDone = 1; else G.flags.tut = 0;   // existing guilds skip the guide
    }
    if ($('tutDemo')) $('tutDemo').onclick = () => { if (window.__startDemo) window.__startDemo(); };
    $('tutSkip').onclick = () => { G.flags.tutDone = 1; render(); toast('Tutorial skipped. You can reopen it in Settings.'); };
    render();
  }
  function tick() {
    if (G.flags.tutDone) return;
    let i = G.flags.tut || 0;
    if (i < STEPS.length && STEPS[i].done()) {
      i++; G.flags.tut = i;
      if (i >= STEPS.length) { G.flags.tutDone = 1; toast('🎓 Tutorial complete! Check the goals panel for what to do next.'); } else toast('✅ Good! Next step…');
      render();
    }
  }
  function restart() { G.flags.tutDone = 0; G.flags.tut = 0; G.flags.tutWatched = 0; G.flags.tutRank = 0; render(); }
  return { init, tick, render, restart };
}
