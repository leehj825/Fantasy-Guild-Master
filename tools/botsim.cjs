// Bot-driven balance simulation: a simple bot plays the economy headlessly for N minutes (default 60) and prints gold/renown/rank curves.
// Needs playwright and a static server on :8123 (python3 -m http.server 8123). Exits non-zero if the page errors or the economy runs away.
const { chromium } = require('playwright');
const MIN = +(process.argv[2] || 60);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--ignore-gpu-blocklist'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 500 } })).newPage(); const errs = [];
  p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:8123/index.html'); await p.waitForTimeout(1200);
  const res = await p.evaluate(async (MIN) => {
    const G = window.__G, a = window.__api, S = window.__sim; G.flags.tutDone = 1; window.__api.tutorial.render();
    const SRC = { gold: {}, renown: {} };
    for (const k of ['gold', 'renown']) { let v = G[k]; Object.defineProperty(G, k, { get() { return v; }, set(n) { const d = n - v; if (d > 0) { const st = (new Error().stack.split('\n')[2] || '').trim().replace(/^at /, '').split(' ')[0]; SRC[k][st] = (SRC[k][st] || 0) + d; } v = n; } }); }
    const log = [], t0 = G.time; let botT = 0, lastLog = -1, firstQuest = null, firstRank = {}, diveFirst = null;
    const spot = (type) => { const t = { tavern: [4, 3], forge: [4, 3], alchemy: [4, 3], warehouse: [4, 3], smelter: [3, 2], market: [3, 2], tent: [2, 2], tower: [2, 2], portal: [3, 3], garden: [3, 2] }[type]; const cands = []; for (let x = 3; x <= 24; x++) for (let z = 3; z <= 24; z++) cands.push([x, z, Math.hypot(x + t[0] / 2 - 14.5, z + t[1] / 2 - 13)]); cands.sort((p, q) => p[2] - q[2]);
      for (const [x, z] of cands) { if (z >= 14 && z <= 18 && x >= 10 && x <= 20) continue; for (const rot of [0]) if (a.canPlace(type, x, z, rot)) return [x, z]; } return null; };
    const COST = { tavern: 200, forge: 300, market: 120, tent: 80, alchemy: 450, warehouse: 250, smelter: 350, tower: 400, portal: 700, garden: 90 };
    const want = [['tavern', () => 1], ['forge', () => 1], ['tent', () => 1], ['market', () => 1], ['alchemy', () => G.renown >= 3 ? 1 : 0], ['tent', () => 2], ['warehouse', () => G.renown >= 2 ? 1 : 0], ['tent', () => 3], ['garden', () => 1], ['smelter', () => G.rank >= 1 ? 1 : 0], ['tower', () => G.rank >= 1 ? 1 : 0], ['portal', () => G.renown >= 6 ? 1 : 0], ['tent', () => 4], ['warehouse', () => 2], ['tower', () => 2]];
    const count = t => G.buildings.filter(b => b.type === t).length;
    const bot = () => {
      // build
      for (const [t, n] of want) { if (count(t) < n() && G.gold >= COST[t] * 1.15 && G.renown >= (window.__BUILD ? 0 : 0)) { const s = spot(t); if (s) { G.gold -= COST[t]; a.addBuilding(t, s[0], s[1], 0); break; } } }
      // staff (smith, cook, guard) when rich
      for (const k of ['smith', 'cook', 'guard', 'alch', 'porter']) { const c = S.staffCost(k); if (G.staff[k] < 2 && G.gold > c * 2.5 && G.gold > 600) { G.gold -= c; G.staff[k]++; break; } }
      // upgrades: forge, tavern, alchemy... when comfortable
      for (const bld of G.buildings.filter(x => ['forge', 'tavern', 'alchemy', 'smelter', 'warehouse'].includes(x.type)).sort((p, q) => p.level - q.level)) { const c = 150 * bld.level + 100; if (bld.level < a.maxLevel() && G.gold > c * 2 && G.wood >= 5 * bld.level && S.hasRare(S.upReq(bld))) { G.gold -= c; G.wood -= 5 * bld.level; S.spendRare(S.upReq(bld)); bld.level++; break; } }
      // outpost/board upgrades
      if (G.outpost < 5 && G.gold > 300 * (G.outpost + 1) * 2.5 && G.heroes.length >= a.popCap?.() - 1) { G.gold -= 300 * (G.outpost + 1); G.outpost++; }
      // research cheapest
      const t = Object.entries(S.TECHS).filter(([k, v]) => !G.research[k] && !v[3] && G.gold > v[2] * 2.5).sort((p, q) => p[1][2] - q[1][2])[0]; if (t) { G.gold -= t[1][2]; G.research[t[0]] = true; }
      // rank up
      if (G.rank < 3) a.ACT.rankup({});
      // stories: take the first affordable choice
      if (G.flags.pending) { const st = S.STORIES.find(x => x.id === G.flags.pending); const i = st.choices.findIndex(c => !c.ok || c.ok()); if (i >= 0) S.chooseStory(i); }
      // orders
      G.orders.forEach(o => S.deliverOrder(o.id));
      // quests: send the best-value quest that fits
      const rd = S.readyHeroes(); const open = G.quests.filter(q => q.state === 'open' && !q.special || q.special && q.state === 'open').sort((x, y) => y.gold / y.diff - x.gold / x.diff);
      for (const q of open) { const party = S.bestParty(q); if (party.length >= q.minH && a.chanceFor(q, party, {}) > 0.55) { a.dispatch(q.id, false, party, { approach: 'standard' }); if (firstQuest === null) firstQuest = Math.round(G.time - t0); break; } }
      // raids: muster
      const rq = a.raidQuest(); if (rq && !rq.mustered && rq.chance < 0.85) S.musterHeroes();
      // dive when possible; bank at floor 10 / low hp
      const dq = G.quests.find(x => x.dive);
      if (!dq && count('portal') && S.readyHeroes().length >= 3 && G.heroes.length >= 5) { a.dispatchDive(); if (diveFirst === null) diveFirst = Math.round(G.time - t0); }
      if (dq && dq.offer) a.pickRelic?.(dq, 0);
      if (dq && !dq.offer && dq.relics && false) {}
      if (dq && dq.cleared >= 10 + 5 * Math.floor(G.rank) && !dq.script.wiped) S.resolveDive(dq, 'recalled');
      // flyer
      if (G.heroes.length < a.popCap?.() && G.gold > 400 && Math.random() < 0.02) a.ACT.flyer({});
    };
    window.__api.pickRelic = window.__api.pickRelic || null;
    for (let step = 0; step < MIN * 120; step++) {   // dt 0.5s
      S.updateEconomy(0.5); G.heroes.slice().forEach(h => S.updateHero(h, 0.5)); S.updateGoblins(0.5);
      botT += 0.5; if (botT >= 2) { botT = 0; bot(); }
      const m = Math.floor((G.time - t0) / 60);
      if (m !== lastLog) { lastLog = m; log.push({ min: m, gold: Math.round(G.gold), renown: G.renown, heroes: G.heroes.length, cap: window.__G.heroes.length, rank: G.rank, quests: G.questsDone, bld: G.buildings.length, dive: G.diveBest, goals: Object.keys(G.goalsDone).length, raidsWon: G.stats.raidsWon, mythril: G.rare.mythril }); }
      if (G.rank >= 1 && !firstRank[1]) firstRank[1] = Math.round((G.time - t0) / 60); if (G.rank >= 2 && !firstRank[2]) firstRank[2] = Math.round((G.time - t0) / 60); if (G.rank >= 3 && !firstRank[3]) firstRank[3] = Math.round((G.time - t0) / 60);
    }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => k + ':' + Math.round(v)).join('  ');
    return { src: { gold: top(SRC.gold), renown: top(SRC.renown) }, log, firstQuestSec: firstQuest, rankMinutes: firstRank, diveFirstSec: diveFirst };
  }, MIN).catch(e => 'ERR ' + e.stack);
  if (typeof res === 'string') console.log(res); else {
    console.log('first quest at', res.firstQuestSec, 's | rank-up minutes', JSON.stringify(res.rankMinutes), '| first dive at', res.diveFirstSec, 's');
    console.log('GOLD sources  ', res.src.gold); console.log('RENOWN sources', res.src.renown); console.log('min  gold  renown heroes rank quests bld dive goals raids mythril');
    res.log.filter(r => r.min % 5 === 0 || r.min < 5).forEach(r => console.log(String(r.min).padStart(3), String(r.gold).padStart(7), String(r.renown).padStart(5), String(r.heroes).padStart(5), String(r.rank).padStart(4), String(r.quests).padStart(6), String(r.bld).padStart(4), String(r.dive).padStart(4), String(r.goals).padStart(5), String(r.raidsWon).padStart(5), String(r.mythril).padStart(5)));
  }
  console.log(errs.join('\n') || 'no errors'); await b.close();
  if (errs.length) process.exit(1);
  if (typeof res !== 'string') { const last = res.log[res.log.length - 1]; if (!last || last.renown > 120 || last.heroes < 3) { console.log('BALANCE CHECK FAILED: renown ' + (last && last.renown) + ', heroes ' + (last && last.heroes)); process.exit(1); } }
  else process.exit(1);
})();
