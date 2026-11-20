# Ideas: living heroes and a living town

Status: **implemented** (all six steps of the suggested order). Code: `src/people.js` (data and helpers), `src/lang-ko-people.js` (Korean), and the
people systems in `src/main.js` (search for `makeProfile`, `recomputeBond`, `syncResidents`, `townTick`, `tickPeople`, `tickFestival`).
Not done from this document: villager romance/mentor ties with named residents, protecting villagers in raids, relations map as a full screen, and
second promotion titles. The text below is the original proposal.

## Where the game is today

- **Hero traits:** five (Clumsy, Lucky, Glutton, Brave, Scholar), but only on VIP heroes. Ordinary heroes have a name and a class.
- **Bonds:** at arrival a hero gets up to two random links (friend 28%, rival 14%). In a party a friend pair gives +4% success, a rival pair −4%. Nothing explains or changes a bond.
- **Stories:** the 18 story events happen to the whole guild; no hero has a personal story.
- **Chatter:** short lines by class, trait and mood (`CHAT` in `src/main.js`).
- **Memory:** fallen heroes go to the Hall of the Fallen; the Guild Chronicle records big events.
- **Townsfolk:** only the hired staff (smith, alchemist, cook, bard, guards, porters), the wandering merchant, caravans and raiders. They walk a fixed route or stand at a workplace; they have no names or needs.

The town therefore feels like heroes walking between buildings and nobody else living there.

## Part 1 – Every hero is a person

### 1.1 Personality and background for all heroes
- Give **every** hero two personality tags at arrival (e.g. timid, ambitious, loyal, lazy, romantic, frugal, hot-headed, curious). Effects are small; the point is to change lines, moods and choices.
- One-line **background** shown in the hero panel and quoted in chatter and events: "youngest of a ruined noble house", "orphan turned pickpocket", "a veteran's daughter".
- **Likes and dislikes:** favourite food or building, hated quest type or weather. A match raises happiness, a clash lowers it.

### 1.2 Relationships that change, with reasons
- More bond types: friend, rival, mentor/apprentice, sweethearts, siblings, saviour.
- **Affinity grows** by questing together; rivals reconcile after a shared win and sour after a shared defeat.
- **Scenes:** two friends sit together at the tavern, rivals spar at the training grounds. Placement plus speech bubbles are enough.
- **Grief:** when a close companion falls, the survivor loses morale or swears revenge (a short event with a choice).

### 1.3 Personal story lines
- Each hero unlocks short chapters at levels 3, 6 and 9 (e.g. "searching for a lost brother" becomes a 3-step personal quest).
- Choices shift loyalty and personality; results go to the Chronicle.
- The last chapter can grant a title or a look change (links to the planned second promotion).
- Start with VIP heroes, then add a pool of templates for ordinary heroes.

### 1.4 Loyalty and conflict
- A loyalty value moves with pay, morale, results and friends. High loyalty unlocks bonuses; low loyalty causes complaints, quarrels, rival offers and finally leaving.

### 1.5 How to show it
- Hero panel tabs: Personality / Background / Relations / Story.
- A relations map (heroes as dots, green lines for friends, red for rivals).
- Party picker icons that flag good and bad pairings.

## Part 2 – A town that is not only heroes

Answer to "should the town have people other than heroes?": **yes.** Heroes should be the visitors and the stars; the town should have residents whose lives the heroes' visits touch. Keep them cheap (simple models, no full AI) and make each one matter to a system the game already has.

### 2.1 Named residents with a job and a need
Small cast (6–12 at first), each with a name, a one-line story and a visible routine:
- **Innkeeper / cook:** serves meals; cheers or complains depending on heroes' mood. Already close to the existing Cook staff.
- **Blacksmith's apprentice:** carries ore from the warehouse to the forge; levels with the forge.
- **Herbalist:** collects herbs near the garden; sells small potions to heroes.
- **Merchant and stall keepers:** the market becomes a place with people, not only a menu.
- **Children:** run around the fountain and imitate heroes (play-fighting). Pure charm, cheap to build.
- **Elders / scribe:** keep the Chronicle; give advice lines that hint at the next goal.
- **Farmers and woodcutters:** produce the trickle of wood/herbs the game already pays out, visibly.

### 2.2 Townsfolk with needs that heroes can answer
- **Requests board:** villagers post tiny jobs (find a lost goat, escort the cart, fix the well). Fast, low-risk quests for rookies, paying reputation with the town.
- **Town reputation:** a second meter beside guild renown. High reputation gives discounts, free recruits and more visitors; low reputation shuts shops.
- **Seasonal festivals** (ties to the seasons already in the game): harvest feast, midwinter lights; heroes and villagers attend; a donation choice gives buffs.

### 2.3 Population as a growth system
- Residents arrive as the guild grows (tents, cottages). Each cottage adds a villager; villagers add gold (taxes) and work, and they raise the hero capacity indirectly (more beds, more food).
- Raids threaten them: protect villagers during a defence or lose some (ties to the existing raid and guard systems).

### 2.4 Hero–villager interaction (the part that makes both feel alive)
- Heroes have relationships with villagers too: a romance with the baker, a mentor who is the old smith, a rival in the market. This becomes a source of personal stories (Part 1.3).
- Heroes' likes and dislikes can point at villagers ("loves Marta's stew").
- Rescuing or losing a named villager appears in the Chronicle.

## Part 3 – Combining both

| Hero idea | Villager counterpart | Payoff |
|---|---|---|
| Background and likes | Residents who match them (baker, smith, scribe) | Concrete places where a hero is happy |
| Bonds with reasons | Scenes at tavern, fountain, market | The town visibly reflects relations |
| Personal story lines | Villager requests and named NPC characters | Stories with a cast, not just text |
| Loyalty | Town reputation | One economy of trust: heroes, villagers, guild |
| Grief and memorial | Statue/banner, scribe and elders | The town remembers the fallen |

## Suggested order

1. **Personality and background for every hero** (data plus chatter; cheap, large effect).
2. **Bond changes with reasons and a few scenes** (reuse tavern and training placement).
3. **Three or four named residents with routines** (apprentice, herbalist, innkeeper, children) reusing the rigged character builder and the existing staff code.
4. **Villager request board and town reputation.**
5. **Personal story lines** (VIP first), then loyalty and conflict.
6. **Festivals and population growth** once the seasons and residents are in.

## Implementation notes

- Residents can reuse `makeRigChar` looks with `autoAnim` (idle/walk), so no new animation work is needed.
- Keep NPC counts low on phones (the weak-device path already starts on classic bodies).
- New text goes through `tr()`; `npm test` includes a Korean coverage check for fixed toast messages.
- Persist new data in `G.flags` or hero objects (saved already); add fields to `serialize` only if they are not covered.
