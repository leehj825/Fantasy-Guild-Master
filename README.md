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
- Drag: pan · Wheel / pinch: zoom · Click a building: open its menu
- Toolbar (or keys `B` `Q` `R` `T` `U`): Build, Quests, Recruit, Research, Upgrades
- Placement: click to place, right-click / `Esc` to cancel

## What's in
- Orthographic isometric camera, sun with shadow mapping, flickering forge / cauldron / lantern point lights, InstancedMesh forest
- Procedural low-poly models (`src/models.js`) modelled on the concept art: timber tavern, stone forge, alchemy lab, waystone portal, tents, market stall, carts, crates, training dummies, racks, flasks, planters, anvils, lanterns, giant mushrooms, standing stones; knights, elf rangers, wizards, dwarves, villagers, guards
- Hero state machine (idle → hungry → tavern → needs gear → shop → ready → quest), classes with distinct needs
- Crafting (forge / lab), quest board with party dispatch and mana enchanting, staff & wages, research, outpost upgrades
- Events: monster incursion (sound the alarm), wandering merchant, royal demand
- HTML/CSS HUD overlay with floating world UI (gold popups, mood bubbles, progress bars)
