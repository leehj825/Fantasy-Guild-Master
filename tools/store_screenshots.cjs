// Makes Play Store screenshots (phone portrait + landscape) from a town the script builds. Needs playwright and a static server on :8123.
// Output: docs/store/*.png
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--no-sandbox'] });
  fs.mkdirSync('docs/store', { recursive: true });
  for (const [name, w, h] of [['phone', 540, 960], ['land', 960, 540]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 }), p = await ctx.newPage();
    await p.goto('http://localhost:8123/index.html'); await p.waitForTimeout(3000); for (let i = 0; i < 6; i++) { await p.click('#camOut'); await p.waitForTimeout(80); }
    await p.evaluate(() => {
      const A = window.__api, G = window.__G; G.gold = 8000; G.renown = 25; G.rank = 2; G.flags.tutDone = 1; A.tutorial.render();
      const spots = [['tavern', 10, 12], ['forge', 16, 12], ['market', 10, 17], ['farm', 20, 17], ['bakery', 15, 17], ['well', 8, 8], ['fountain', 13, 8], ['portal', 21, 11], ['memorial', 6, 14]];
      spots.forEach(([t, x, z]) => { try { A.addBuilding(t, x, z); } catch (e) { /* skip */ } });
      while (G.heroes.length < 6) A.spawnHero();
      G.flags.pets = ['dog', 'cat']; G.heroes.forEach(h => { h.level = 3 + (h.id % 3); });
    });
    await p.waitForTimeout(2500); await p.screenshot({ path: `docs/store/${name}-1-town.png` });
    await p.evaluate(() => window.__api.openModal('quests')); await p.waitForTimeout(500); await p.screenshot({ path: `docs/store/${name}-2-quests.png` });
    await p.evaluate(() => window.__api.openModal('hero', window.__G.heroes[0].id)); await p.waitForTimeout(500); await p.screenshot({ path: `docs/store/${name}-3-hero.png` });
    await p.evaluate(() => window.__api.openModal('upgrades')); await p.waitForTimeout(500); await p.screenshot({ path: `docs/store/${name}-4-guild.png` });
    await p.evaluate(() => { window.__api.closeModal(); window.__api.setPhoto(true); }); await p.waitForTimeout(800); await p.screenshot({ path: `docs/store/${name}-5-photo.png` });
    await ctx.close();
  }
  await b.close();
})();
