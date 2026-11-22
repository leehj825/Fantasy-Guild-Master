// Browser smoke test: boots the game, builds a bit of everything, saves, then loads saves that are missing newer fields
// (old saves must still open). Run with: node tests/smoke.e2e.cjs   (needs `playwright` installed and a static server on PORT, default 8123)
const { chromium } = require('playwright');
const URL = `http://localhost:${process.env.PORT || 8123}/index.html`, KEY = 'fantasy-guild-master-save-v1';
let failed = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) failed++; };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
  const errs = [], ctx = await b.newContext();
  const boot = async (prep) => {
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); if (prep) { await p.evaluate(prep); await p.reload(); }
    await p.waitForTimeout(3500); return p;
  };
  // 1. fresh start, build many things, save
  let p = await boot();
  const r = await p.evaluate(() => {
    const A = window.__api, G = window.__G; G.gold = 20000; G.renown = 30; G.rank = 2;
    ['tavern', 'forge', 'market', 'farm', 'bakery', 'well', 'portal', 'memorial'].forEach((t, i) => A.addBuilding(t, 8 + (i % 4) * 5, 10 + Math.floor(i / 4) * 5));
    while (G.heroes.length < 4) A.spawnHero('knight');
    ['dog', 'cat'].forEach(k => A.ACT.petbuy({ k })); A.ACT.theme({ k: 'azure' }); G.flags.pets = ['dog', 'cat']; A.pushEvent('merchant');
    A.passPts(50); A.saveGame(true); return { b: G.buildings.length, h: G.heroes.length };
  });
  ok(r.b >= 9 && r.h >= 4, `built town (${r.b} buildings, ${r.h} heroes)`);
  await p.close();
  // 2. reload that save
  p = await boot();
  ok(await p.evaluate(() => window.__G.buildings.length >= 9), 'normal save reloads');
  await p.close();
  // 3. old-style saves: strip newer fields
  const variants = {
    'no flags': d => { delete d.g.flags; },
    'no hero extras': d => { d.heroes.forEach(h => { for (const k of ['charm', 'diary', 'tags', 'bio', 'likes', 'dislikes', 'arc', 'bonds', 'aff', 'loy', 'marks', 'boon', 'title']) delete h[k]; }); },
    'no building specs': d => { d.buildings.forEach(x => { delete x.spec; }); },
    'empty flags object': d => { d.g.flags = {}; },
  };
  for (const [name, fn] of Object.entries(variants)) {
    p = await boot(`(() => { const d = JSON.parse(localStorage.getItem('${KEY}')); (${fn.toString()})(d); localStorage.setItem('${KEY}', JSON.stringify(d)); })()`);
    ok(await p.evaluate(() => window.__G.buildings.length >= 2 && window.__G.heroes.length >= 1), `old save loads: ${name}`);
    await p.waitForTimeout(1500); await p.close();
  }
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); process.exit(failed ? 1 : 0);
})();
