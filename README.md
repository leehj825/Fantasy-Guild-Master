# Fantasy Guild Master

Isometric 3D low-poly tycoon built with Three.js (WebGL), following the game design document.
You are the Guild Master of a new adventurers' outpost: build facilities, craft gear, attract heroes and send them on quests.

## Run
Static site, no build step. Serve the folder and open `index.html`:

```bash
python3 -m http.server 8123
```

Then visit http://localhost:8123/ . A model viewer lives at `/gallery.html` (buildings, props and characters side by side).

## Controls
- Camera: left-drag pans · right-drag (or Shift-drag) orbits and tilts · wheel zooms · two fingers on touch: pinch = zoom, twist = rotate, drag up/down = tilt
- Keys: ←/→ rotate · ↑/↓ tilt · +/− zoom · `V` toggles perspective 3D · `Home` resets · on-screen camera buttons bottom-left
- Click a building: open its menu
- Toolbar (or keys `B` `Q` `R` `T` `U`): Build, Quests, Recruit, Research, Upgrades
- Placement: click to place, right-click / `Esc` to cancel

## What's in
- Orthographic isometric camera, sun with shadow mapping, flickering forge / cauldron / lantern point lights, InstancedMesh forest
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
- **Quest decisions:** choose your own party with live odds, pick an approach (Cautious / Standard / Bold), and handle modifiers (Elite, Cursed, Storm, Armored, Poisoned, Rush, Bounty, Hoard) that demand specific classes, gear grades or potions. Six story events offer choices with lasting consequences.
- **Pressure:** raids scale with renown and rank, arrive as a watchable defence battle (guards, Guard Towers, mustered heroes), and every 4th raid is a warchief. Losing costs gold, stock and renown.
- **Dive relics:** pick 1 of 3 relics at every checkpoint (Iron Skin, Vampiric Blades, Gold Magnet, ...).
- **Hero depth:** promotions (Paladin / Warden / Archmage), a talent choice at levels 3 and 6, friendships and rivalries that change party odds, and a Hall of the Fallen.
- Events: monster incursion (sound the alarm), wandering merchant, royal demand
- HTML/CSS HUD overlay with floating world UI (gold popups, mood bubbles, progress bars)
