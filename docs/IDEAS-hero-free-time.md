# Ideas: what heroes do in the town

Problem: between expeditions heroes only stood around the guild hall, and came back to the same spot. The town looked empty while the heroes were out and
crowded in one place when they returned.

Status: items 1–5 are **implemented** (code: `src/main.js`, search for `FREE`, `freeTime`, `startFree`, `rally`, `greetReturn`, `gatherMourners`).
Item 6 is **not built yet**; its design and steps are written down below.

## 1. A daily routine for each hero — done
- Heroes with nothing to do (geared, rested, not on a quest) choose an activity from a weighted list.
- The weight depends on the **time of day** (morning, day, evening, night; the same clock as the day/night light) and on the hero's **personality tags** and traits.
  - Ambitious, hot-headed and proud heroes train. Curious ones read. Lazy ones sit by the fire or sleep. Romantic ones stroll. Frugal ones window-shop.
    Cheerful ones go to the tavern, kind and gloomy ones pay respects at the memorial. Loyal ones walk the lanes. Gluttons love the tavern.
- Activities: train, watch the smith, browse the market, read, sit by the campfire, enjoy the tavern, stroll (fountain, pond, garden, flowers, statue), pay respects, sleep (tent or cottage), walk the lanes.
- Needs still come first: tired heroes go to the tavern, heroes without gear go to the forge or lab.

## 2. Activity spots — done
- Each activity is tied to a building the player built (training yard, forge, market, alchemy lab or trophy hall, campfire, tavern, fountain/pond/garden/flowers/statue, memorial, tent/cottage).
  No building: the activity is not offered (training falls back to sparring on the plaza), so building more makes the town busier.
- A hero claims a **spot** near the building's door. Spots are spread around the door and reserved for a while, so heroes do not stack.
- Heroes face the building while they use it, and a mood icon shows what they are doing.

## 3. Small passive rewards — done
Each finished activity gives a small reward and a floating text (at most once every ~18 s per hero, so it cannot replace expeditions):
- Training: a little experience (more with more training yards). Reading: a little experience and sometimes +1 mana.
- Market: 2–4 gold. Tavern: a little happiness and 1 gold. Campfire, stroll, forge, memorial: happiness (the memorial also adds loyalty). Sleep: stamina and a little happiness.

## 4. Social scenes — done
- A bonded hero looks for a partner who is already doing an activity and joins them at the same place.
- Friends and siblings chat (💬), sweethearts share a stroll (💕), mentors and apprentices train together (🎓), rivals only meet at the training yard (⚡).
- Each shared scene adds affinity, so bonds grow just by living in the same town.

## 5. Reactions to events — done
- **Returns:** when a party comes back, up to four free heroes gather at the plaza to cheer (👏, +happiness), and most of the returning party heads to the tavern to celebrate.
- **Loss:** when a hero falls, their friends first, then others (up to four) gather at the memorial garden with candles (🕯, +loyalty).
- **Raids:** when raiders arrive, free heroes drop what they are doing and stand at the gate (🛡) until the defense is resolved. Heroes you pick at the defense posts still muster as before.

## 6. Town jobs for idle heroes — NOT built yet (design only)
Idea: the player can assign a free hero to a standing **job** in town. The hero stands at a post and does it until reassigned or until they are needed.
This is the most game-like option, but players would have to manage it, so build it last and keep it optional.

Suggested steps:
1. **Data:** add `h.job` (`null` or `{ id, slot }`) to heroes, persist it in the save, and define `JOBS`:
   - `gate` (guard the gate): standing post near the hall's south gap; counts as +defense in raids and prevents the 🛡 rally.
   - `farm` (help on the farm): works near a farm; slightly faster grain.
   - `forge` (carry ore): near the forge; slightly faster crafting.
   - `lab` (gather herbs): near the garden/lab; a little herb income.
   - `patrol`: walks a loop on the lanes; raises town reputation slowly and lowers the chance of sabotage events.
2. **Slots:** every job has 1–2 slots per matching building. Compute `jobSlots()` from the buildings; show used/total.
3. **UI:** in the hero panel (Abilities tab) add a "Job" row with the available jobs and a clear button; in the Heroes screen show a small job icon on the card and add a "Working" filter.
4. **Behavior:** in `freeTime(h)`, if `h.job` is set, skip the random choice: walk to the job's post (spot near the building's door), stay there, and run a small periodic effect.
   Needs still come first (stamina, gear); an expedition takes the hero away and the job resumes afterwards.
5. **Balance:** the effects must stay small (a few percent) and never beat expeditions. Add an upkeep or mood cost for staying on the job all day (e.g. loyal/lazy tags like or dislike jobs).
6. **Raids and events:** workers at the gate join the defense automatically; heroes on the farm run to the hall during raids.
7. **Tests:** a headless test that assigns each job, runs the simulation for a few minutes, and checks that the hero stays at the post, the effect applies, nothing double-counts, and old saves without `h.job` load.
8. **Docs/UI text:** Korean translations, a one-line coach tip the first time the Job row is visible.
