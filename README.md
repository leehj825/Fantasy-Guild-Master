# Fantasy Guild Master

Isometric 3D low-poly tycoon built with Three.js (WebGL), following the game design document.
You are the Guild Master of a new adventurers' outpost: build facilities, craft gear, attract heroes and send them on quests.

## Run
Static site, no build step. Serve the folder and open `index.html`:

```bash
python3 -m http.server 8123
```

Then visit http://localhost:8123/ . A model viewer lives at `/gallery.html` (buildings, props and characters side by side).

## Languages
English and 한국어 (Korean). Pick a language in ⚙ Settings; it is remembered and defaults to your browser language. All code and data stay in English: text is translated where it is shown by `src/i18n.js` using the dictionary in `src/lang-ko.js` (add another language by adding a dictionary).

## Controls
- Camera: left-drag pans · right-drag (or Shift-drag) orbits and tilts · wheel zooms · two fingers on touch: pinch = zoom, twist = rotate, drag up/down = tilt
- Keys: ←/→ rotate · ↑/↓ tilt · +/− zoom · `Home` resets · on-screen camera buttons bottom-left
- Click a building: open its menu
- Toolbar (or keys `B` `Q` `R` `T` `U`): Build, Quests, Map, Recruit, Research, Upgrades
- Placement: click to place, right-click / `Esc` to cancel

## What's in
- Perspective 3D camera, sun with shadow mapping, flickering forge / cauldron / lantern point lights, InstancedMesh forest
- Procedural low-poly models (`src/models.js`) modelled on the concept art: timber tavern, stone forge, alchemy lab, waystone portal, tents, market stall, carts, crates, training dummies, racks, flasks, planters, anvils, lanterns, giant mushrooms, standing stones; knights, elf rangers, wizards, dwarves, villagers, guards
- Hero state machine (idle → hungry → tavern → needs gear → shop → ready → quest), classes with distinct needs
- Crafting (forge / lab), quest board with party dispatch and mana enchanting, staff & wages, research, outpost upgrades
- Watch expeditions live: tap a quest in the Expeditions panel (or 👁 Watch in the Quests window). The camera flies to a stage (Goblin Woods / Sunken Ruins / Deep Cave) and follows the party through 3 scripted encounters and the loot chest, with HP bars, damage numbers, a combat log and a base picture-in-picture. The fight is a pure function of quest progress, so you can join late, speed up, or leave and return. Before the finale you can cast Enchant, send a healing Potion from the lab, or Recall the party.
- **Endless Dive** (Waystone Portal): send 2-4 geared heroes through the portal for floors that get harder forever. Hero HP is real and carries from floor to floor; potions heal, a Ward cuts damage for 3 floors. Loot banks automatically every 5 floors or when you Bank & leave; a wipe-out loses what is unbanked. Rare drops (Mythril 💎, Dragon Scales 🐉, Phoenix Feathers 🪶) unlock research and upgrades. Fully watchable, saved and restored.
- **Warehouse + orders:** Warehouses raise Forge/Lab stock limits; Royal Demands and visible Trade Caravans ask for bulk swords and potions before a deadline.
- **Heroes:** click one for a detail panel; rare VIP heroes (more likely with a Portal) carry traits (Clumsy, Lucky, Glutton, Brave, Scholar). Heroes path around buildings with grid A*.
- **Save/load:** autosaves to the browser (every 15 s and on leave); quests keep running up to 10 minutes while away.
- **Guild ranks and goals:** Outpost → Hold → Keep → Fortress (level caps, beds, quest slots, unlocks; costs include rare materials and dive depth) and a 27-goal ladder that pays gold, renown and rare materials.
- **Crafting depth:** Iron/Steel/Mythril weapons and Minor/Greater/Superior potions, a Smeltery (ore → ingots), and **adjacency bonuses** (Smeltery+Forge, Garden+Lab, Market+Tavern, Campfire+Tavern, Warehouse) with a live preview while placing.
- **Living market:** prices drift and spike with news; buy low, sell high.
- **Quest decisions:** choose your own party with live odds, pick an approach (Cautious / Standard / Bold), and handle modifiers (Elite, Cursed, Storm, Armored, Poisoned, Rush, Bounty, Hoard) that demand specific classes, gear grades or potions. Eighteen story events offer choices with lasting consequences.
- **Pressure:** raids scale with renown and rank, arrive as a watchable defence battle (guards, Guard Towers, mustered heroes), and every 4th raid is a warchief. Losing costs gold, stock and renown.
- **Dive relics:** pick 1 of 3 relics at every checkpoint (Iron Skin, Vampiric Blades, Gold Magnet, ...).
- **Hero depth:** promotions (Paladin / Warden / Archmage), a talent choice at levels 3 and 6, friendships and rivalries that change party odds, and a Hall of the Fallen.
- **Rigged characters:** people use the 15-joint rig and motion clips from the model_check library (`src/rigchar.js`, `src/clips.js`): idle, walk, run, sword slashes, bow, bolt/fire magic, heal/bless, flinch and fall. Melee heroes run up to the enemy to strike and run back. Pick Rigged blocky / Rigged rounded / Classic in ⚙ Settings. `rigtest.html` compares the styles.
- **Tutorial:** a seven-step guide card for new guilds (skip or restart it in ⚙ Settings).
- **Sound:** all effects and ambient/battle music are synthesised with WebAudio (no audio files); toggle in ⚙ Settings.
- **Territory + world map:** buy land to expand the base (the pathfinding grid grows with it) and unlock Greenwood, Stonepeak, Ashen Ruins; each region has its own enemies, loot weights and levelling perk.
- **Guild factions:** pick Vanguard, Arcane Circle or Rangers once; each gives a different edge and changes the look of your Guild Hall.
- **Korean UI:** switch language in ⚙ Settings; text is translated at display time, code stays English.
- **Tests:** `npm test` runs pure-logic tests (scripts, dive, relics, translation); CI runs them on every push.
- **Quality of life:** "Send all possible" and an Auto-send queue for quests, a ✅/📜 pill for ready heroes and open quests, background notifications (browser), three save slots plus text export/import.
- **Battles:** formations (Battle line / Shield wall / Skirmish), class skills during watched fights (Shield Wall, Volley, Nova), heal beams and ward bubbles, straight-flying arrows, fire/arcane bolts, boss blow telegraphs, camera shake, dust and scorch marks, rain on some expeditions, varied attacks for giants.
- **People:** every hero has two personality tags, a background, likes/dislikes, loyalty and a three-chapter personal story; bonds are an affinity that grows or sours (friends, sweethearts, mentors, rivals) with tavern scenes, grief and a relations map; named residents (innkeeper, apprentice, herbalist, children, scribe) plus villagers per cottage; villager requests and a town reputation; seasonal festivals.
- **Calmer mid-game:** a 📬 inbox collects stories, events and festival offers (with Auto-handling policies), weekly guild orders give three fresh goals every 5 minutes, skills have cooldowns and you can tap a hero in a boss's red circle to dodge, and you can lay cobble paths and palisade walls.
- **Free-form town:** no fixed roads — streets wear into the grass where heroes and villagers walk (and can be paved with one button), new buildings are linked by short cobble paths, paths can be dragged out by hand, plus ponds, flower beds, young trees and town squares (fountain/statue/monument with buildings nearby).
- **Long-term:** six hero classes (Rogue, Cleric, Alchemist join Knight, Ranger, Wizard), three more regions with their own bosses and class weaknesses, a codex with 14 achievements, a rival guild with contested quests, landmarks that appear as the land grows, and Legacy — pass the guild to an heir for permanent family perks.
- **Ads (optional):** rewarded offers — double a quest's loot, rest tired heroes, rescue a wiped dive — go through `src/ads.js` (one small interface). On Android the wrapper uses AdMob (banner strip under the game plus rewarded ads, with the UMP consent form); debug builds use Google's *test* ad units and release builds use the real ones. In a browser add `?mockads` to try the offers with a fake 3-second ad. Offers can be switched off in Settings. Pacing: one ad per 3 minutes at most, per-placement hourly limits.
- **Seasons and time:** four seasons with perks and falling petals/leaves/snow, a day-night cycle, hero chatter, a Guild Chronicle diary, decor with a happiness perk (fountain, banner, statue) and the Ember Colossus legend questline after Fortress.
- **Tools:** `tools/botsim.cjs` (balance bot, weekly CI workflow), `tools/i18n_audit.mjs` (untranslated toast check, run by `npm test`), `tools/pick_clips.mjs` (builds `src/clips.js`).
- Events: monster incursion (sound the alarm), wandering merchant, royal demand
- HTML/CSS HUD overlay with floating world UI (gold popups, mood bubbles, progress bars)
