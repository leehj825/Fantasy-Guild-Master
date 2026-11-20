// People data: personality tags, backgrounds, likes and dislikes for heroes. Pure data and helpers (no DOM), so it can be tested in node.
// All text is English; the Korean strings live in lang-ko-people.js.

export const TAGS = {
  timid:     { icon: '😨', label: 'Timid',      desc: 'Careful: survives a little more often, hits a little softer.', mods: { survive: 0.05, pw: 0.97 }, chat: ['Do we really have to go in there?', 'I keep my head down.'] },
  ambitious: { icon: '🎯', label: 'Ambitious',  desc: 'Learns 15% faster.', mods: { xp: 1.15 }, chat: ['One day they will sing my name.', 'I want the hardest quest on the board.'] },
  loyal:     { icon: '🤝', label: 'Loyal',      desc: 'Loses happiness 10% slower and bonds grow faster.', mods: { happy: 0.9, affinity: 1.25 }, chat: ['This guild is my home.', 'I will not leave my friends behind.'] },
  lazy:      { icon: '😴', label: 'Lazy',       desc: 'Tires 10% slower but learns 10% slower.', mods: { decay: 0.1, xp: 0.9 }, chat: ['Five more minutes of rest…', 'Why run when you can walk?'] },
  romantic:  { icon: '💘', label: 'Romantic',   desc: 'Bonds grow 50% faster; may fall in love.', mods: { affinity: 1.5 }, chat: ['The sunset is lovely today.', 'Have you ever written a poem?'] },
  frugal:    { icon: '🪙', label: 'Frugal',     desc: 'Loses happiness 10% slower; spends less at the shop.', mods: { happy: 0.9 }, chat: ['Is this price really fair?', 'I save every coin.'] },
  hothead:   { icon: '🔥', label: 'Hot-headed', desc: '+5% power but falls more often; rivalries grow faster.', mods: { pw: 1.05, survive: -0.05, rivalry: 1.5 }, chat: ['Who do they think they are?', 'Let me at them!'] },
  curious:   { icon: '🔎', label: 'Curious',    desc: '+10% loot from quests.', mods: { loot: 0.1 }, chat: ['What is behind that door?', 'I wonder how that works.'] },
  cheerful:  { icon: '😄', label: 'Cheerful',   desc: 'Loses happiness 15% slower.', mods: { happy: 0.85 }, chat: ['Isn\'t it a beautiful day?', 'Smile, everyone!'] },
  gloomy:    { icon: '🌧️', label: 'Gloomy',    desc: 'Loses happiness 15% faster, but is +3% stronger when it counts.', mods: { happy: 1.15, pw: 1.03 }, chat: ['It will probably rain.', 'Nothing ever goes right.'] },
  proud:     { icon: '🦚', label: 'Proud',      desc: '+4% power, loses happiness 10% faster.', mods: { pw: 1.04, happy: 1.1 }, chat: ['Do you know who I am?', 'Only the best gear for me.'] },
  kind:      { icon: '💗', label: 'Kind',       desc: 'Raises party success by 1% and bonds grow faster.', mods: { succ: 0.01, affinity: 1.15 }, chat: ['Can I help you with that?', 'Everyone deserves a second chance.'] },
};
// tags that do not make sense together
const CLASH = [['cheerful', 'gloomy'], ['timid', 'hothead'], ['lazy', 'ambitious'], ['proud', 'kind']];

// [background, a short line the hero can say about it]
export const BACKGROUNDS = {
  any: [
    ['A farmer’s child who wanted more than turnips.', 'I left the farm for a bigger life.'],
    ['Raised in a harbour town by a fishing family.', 'I still dream of the sea.'],
    ['A former caravan guard who lost a wager.', 'I used to guard wagons for coin.'],
    ['An orphan taught to fight by the town watch.', 'The watch were my family.'],
    ['A failed apprentice looking for a second chance.', 'Everyone gets a second chance, right?'],
    ['A wanderer with no home and a long road behind.', 'I have seen a lot of roads.'],
  ],
  knight: [
    ['Youngest of a ruined noble house.', 'My family name means nothing now.'],
    ['A veteran’s son carrying his father’s shield.', 'This shield was my father’s.'],
    ['A deserter who swore never to run again.', 'I will never run again.'],
    ['A temple guard who left to see the world.', 'The temple was too quiet for me.'],
    ['A blacksmith’s daughter who learned the sword first.', 'I know good steel when I see it.'],
  ],
  ranger: [
    ['Grew up hunting in the deep greenwood.', 'The forest raised me.'],
    ['A poacher’s child, reformed.', 'I know every trick the poachers use.'],
    ['A scout who once guided a royal hunt.', 'I once guided a king’s hunt.'],
    ['Left an elven village to learn the human world.', 'Humans are so loud.'],
    ['A messenger who got tired of letters.', 'I carried a thousand letters.'],
  ],
  wizard: [
    ['A scholar dismissed for asking the wrong questions.', 'They said my questions were dangerous.'],
    ['A hedge witch’s apprentice with a talent for sparks.', 'Sparks come easily to me.'],
    ['A librarian who read one forbidden book.', 'I read just one forbidden book.'],
    ['A star-gazer who saw something in the sky.', 'I saw something in the stars.'],
    ['An alchemist’s child who preferred spells to potions.', 'Potions are slow. Spells are art.'],
  ],
};
const FOODS = ['hearty stew', 'roast boar', 'honey bread', 'mushroom pie', 'herbal tea'];
const LIKE_BLD = ['tavern', 'forge', 'alchemy', 'garden', 'training', 'campfire', 'fountain', 'market'];
const QTYPES = ['combat', 'gather', 'arcane'];

export function pickFrom(arr, r = Math.random) { return arr[Math.floor(r() * arr.length)]; }
// A fresh profile for a hero of class `cls`: two personality tags, a background, likes and dislikes.
export function makeProfile(cls, r = Math.random) {
  const ids = Object.keys(TAGS), tags = [];
  while (tags.length < 2) { const t = pickFrom(ids, r); if (tags.includes(t) || tags.some(x => CLASH.some(([a, b]) => (a === x && b === t) || (b === x && a === t)))) continue; tags.push(t); }
  const bio = pickFrom([...BACKGROUNDS.any, ...(BACKGROUNDS[cls] || []), ...(BACKGROUNDS[cls] || [])], r);
  const likeType = pickFrom(QTYPES, r), dislikeType = pickFrom(QTYPES.filter(x => x !== likeType), r);
  const likes = { type: likeType, bld: pickFrom(LIKE_BLD, r), season: Math.floor(r() * 4), food: pickFrom(FOODS, r) };
  let ds = Math.floor(r() * 4); if (ds === likes.season) ds = (ds + 2) % 4;
  return { tags, bio, likes, dislikes: { type: dislikeType, season: ds } };
}
// Combined effect of a hero's tags: multipliers (pw, xp, happy, affinity, rivalry) and additive bonuses (survive, loot, decay, succ).
export function tagMods(tags = []) {
  const m = { pw: 1, xp: 1, happy: 1, affinity: 1, rivalry: 1, survive: 0, loot: 0, decay: 0, succ: 0 };
  for (const id of tags) { const f = (TAGS[id] || {}).mods || {}; for (const k of Object.keys(f)) { if (['survive', 'loot', 'decay', 'succ'].includes(k)) m[k] += f[k]; else m[k] *= f[k]; } }
  return m;
}
export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];

// Named residents of the town: they are not heroes; they live around the buildings and talk to visitors.
// needs: what the town must have before they move in. look: options for the character builder. anchor: where they spend their day.
export const RESIDENTS = [
  { id: 'marta', name: 'Marta', role: 'Innkeeper', icon: '🍲', needs: { bld: 'tavern' }, anchor: ['tavern'], speed: 1.0, scale: 1,
    look: { skin: 0xf0c8a0, shirt: 0xf4f0e6, sleeve: 0xf4f0e6, apron: 0xf4f0e6, pants: 0x6b4a2a, hair: 0x6b4a2a, belt: false },
    bio: 'Runs the tavern kitchen and knows every hero’s favourite dish.', lines: ['Stew’s hot — come and get it!', 'Wipe your boots before you come in.', 'Heroes eat more than any army I’ve fed.', 'A full belly wins half the battles.'] },
  { id: 'tobin', name: 'Tobin', role: 'Smith’s apprentice', icon: '🔨', needs: { bld: 'forge' }, anchor: ['forge', 'warehouse', 'smelter'], speed: 1.3, scale: 0.92,
    look: { skin: 0xe8b890, shirt: 0x8a5a2b, sleeve: 0x8a5a2b, apron: 0x3b3b40, pants: 0x4a3a2a, hair: 0x4a2c12, boots: 0x2a1a0a },
    bio: 'Carries ore and charcoal all day and dreams of forging a hero’s sword.', lines: ['Mind the sparks!', 'One day I will forge a legendary blade.', 'Master says: hit it while it’s hot.', 'These ingots are heavier than they look.'] },
  { id: 'elsie', name: 'Elsie', role: 'Herbalist', icon: '🌿', needs: { bldAny: ['garden', 'alchemy'] }, anchor: ['garden', 'alchemy'], speed: 0.9, scale: 1,
    look: { skin: 0xf4d0a8, shirt: 0x7ab648, sleeve: 0xe9d3a6, vest: 0x5aa03a, pants: 0x6b4a2a, hair: 0xf0d46a, longHair: true },
    bio: 'Gathers herbs at dawn and sells small remedies to anyone who limps by.', lines: ['Moonpetal for the sleepless, thyme for the brave.', 'That cough needs honey, not a sword.', 'The garden loves the rain.', 'Take a little tea with you.'] },
  { id: 'pip', name: 'Pip', role: 'Child', icon: '🧒', needs: { rank: 1 }, anchor: ['hall'], speed: 3.4, scale: 0.68, wander: 3.2,
    look: { skin: 0xf0c8a0, shirt: 0xb06a3a, sleeve: 0xb06a3a, pants: 0x4a3a2a, hair: 0x6b4a2a, belt: false },
    bio: 'Wants to be a knight and practises with a stick.', lines: ['I’m going to be a hero too!', 'Wren, you can’t catch me!', 'Can I hold your sword?', 'Look, I beat the dragon!'] },
  { id: 'wren', name: 'Wren', role: 'Child', icon: '👧', needs: { rank: 1 }, anchor: ['hall'], speed: 3.1, scale: 0.64, wander: 3.2,
    look: { skin: 0xf4d0a8, shirt: 0xd8d0c0, sleeve: 0xd8d0c0, pants: 0x5a4636, hair: 0xf0d46a, longHair: true, belt: false },
    bio: 'Pip’s best friend, quick on her feet and quicker with a joke.', lines: ['Tag, you’re it!', 'When I grow up I’ll be an archmage.', 'The bard said I sing nicely!', 'Heroes are so tall.'] },
  { id: 'bram', name: 'Bram', role: 'Scribe', icon: '📜', needs: { rank: 1 }, anchor: ['hall'], speed: 0.8, scale: 1, hint: true,
    look: { skin: 0xe6b88a, shirt: 0x5a4a7a, sleeve: 0x5a4a7a, pants: 0x3a3050, hair: 0xdcdcdc, beard: 0xdcdcdc, beardLen: 0.2, hat: 'cap', hatColor: 0x5a4a7a },
    bio: 'Keeps the guild’s records and has opinions about what you should do next.', lines: ['I write down everything, you know.', 'Check the goals panel — there is gold in it.', 'History remembers the brave.', 'Another quill, another day.'] },
];
export const residentHome = (r, G, first) => {   // does the town qualify for this resident?
  const n = r.needs || {};
  if (n.bld && !first(n.bld)) return false;
  if (n.bldAny && !n.bldAny.some(b => first(b))) return false;
  if (n.rank && G.rank < n.rank) return false;
  return true;
};

// ---- personal story lines: three chapters per hero (at levels 3, 6 and 9). {n} stands for the hero's name.
// fx: loy (loyalty), happy, stamina, rep (town reputation), renown, gold, boon ({pw, succ, loot, survive} kept for good), title, chron (chronicle line)
export const ARCS = {
  sibling: { title: 'The Missing Brother', ok: () => true, ch: [
    { lv: 3, text: '{n} heard a rumour that their brother was last seen on the northern road.', choices: [
      { label: 'Pay for a search (−100g)', cost: 100, fx: { loy: 15, happy: 10, chron: '{n} began searching for their brother.' } }, { label: 'Say the guild comes first', fx: { loy: -10, happy: -5 } }] },
    { lv: 6, text: 'A trail leads to a bandit camp. {n} asks to ride out and look.', choices: [
      { label: 'Give them a free day', fx: { loy: 10, happy: 10, stamina: -20 } }, { label: 'Send help along (−150g)', cost: 150, fx: { loy: 20, rep: 2 } }] },
    { lv: 9, text: 'The brother is found alive, a changed man. {n} is grateful beyond words.', choices: [
      { label: 'Invite him to settle in town', fx: { loy: 25, rep: 4, boon: { succ: 0.01 }, title: 'the Reunited', chron: '{n} found their brother and brought him to town.' } }, { label: 'Wish them both well', fx: { loy: 15, boon: { loot: 0.05 }, title: 'the Reunited' } }] },
  ] },
  redemption: { title: 'A Second Chance', ok: h => h.cls === 'knight', ch: [
    { lv: 3, text: '{n} confesses to an old shame: they once abandoned their post.', choices: [
      { label: 'Forgive them', fx: { loy: 20, happy: 10 } }, { label: 'Ask them to prove themselves', fx: { loy: -5, boon: { survive: 0.03 } } }] },
    { lv: 6, text: 'A veteran from {n}’s old company arrives and spits at their feet.', choices: [
      { label: 'Stand by {n}', fx: { loy: 20, rep: -1 } }, { label: 'Let them settle it alone', fx: { loy: 5, happy: -5, boon: { pw: 1.03 } } }] },
    { lv: 9, text: '{n} saved the veteran’s life on the road. The old shame is gone.', choices: [
      { label: 'Honour them before the town', fx: { loy: 25, rep: 3, renown: 2, title: 'the Redeemed', boon: { survive: 0.05 }, chron: '{n} was honoured for redeeming their name.' } }, { label: 'Quietly give them a medal', fx: { loy: 15, title: 'the Redeemed', boon: { pw: 1.02 } } }] },
  ] },
  forbidden: { title: 'The Forbidden Page', ok: h => h.cls === 'wizard', ch: [
    { lv: 3, text: '{n} found a torn page of a forbidden spellbook in the market.', choices: [
      { label: 'Let them study it', fx: { loy: 10, happy: 10, boon: { pw: 1.02 } } }, { label: 'Burn the page', fx: { loy: -10, happy: -10 } }] },
    { lv: 6, text: 'The page whispers at night. {n} cannot sleep.', choices: [
      { label: 'Seal it away together', fx: { loy: 15, stamina: -10 } }, { label: 'Let them keep reading', fx: { loy: 5, boon: { succ: 0.01 } } }] },
    { lv: 9, text: '{n} has mastered the page and bent its power to protect the guild.', choices: [
      { label: 'Name them Keeper of the Page', fx: { loy: 25, renown: 2, title: 'the Keeper', boon: { pw: 1.04 }, chron: '{n} became the Keeper of the Forbidden Page.' } }, { label: 'Lock the page in the vault', fx: { loy: 15, title: 'the Keeper', boon: { survive: 0.03 } } }] },
  ] },
  woods: { title: 'The Call of the Woods', ok: h => h.cls === 'ranger', ch: [
    { lv: 3, text: '{n} keeps staring toward the forest. Something is calling them.', choices: [
      { label: 'Let them wander for a day', fx: { loy: 10, happy: 15, stamina: -15 } }, { label: 'Tell them to focus', fx: { loy: -8 } }] },
    { lv: 6, text: '{n} met a hermit who teaches the old ways of tracking.', choices: [
      { label: 'Support the lessons (−120g)', cost: 120, fx: { loy: 15, boon: { loot: 0.05 } } }, { label: 'Politely decline', fx: { loy: -3 } }] },
    { lv: 9, text: 'The forest has chosen {n}: animals follow them like friends.', choices: [
      { label: 'Let them guard the town edge', fx: { loy: 20, rep: 3, title: 'the Wildcaller', boon: { survive: 0.04 }, chron: '{n} was named Wildcaller by the forest.' } }, { label: 'Take them on bigger hunts', fx: { loy: 15, title: 'the Wildcaller', boon: { loot: 0.08 } } }] },
  ] },
  duel: { title: 'An Old Rival', ok: h => (h.tags || []).includes('hothead') || (h.tags || []).includes('proud'), ch: [
    { lv: 3, text: 'A famous duellist challenged {n} in the tavern.', choices: [
      { label: 'Let them accept', fx: { loy: 10, happy: 5, stamina: -10 } }, { label: 'Make peace instead', fx: { loy: -5, rep: 2 } }] },
    { lv: 6, text: '{n} lost the first duel and has been training day and night.', choices: [
      { label: 'Train with them', fx: { loy: 20, stamina: -15, boon: { pw: 1.02 } } }, { label: 'Tell them to rest', fx: { loy: 5, happy: 5 } }] },
    { lv: 9, text: 'The rematch drew a crowd. {n} won and shook the duellist’s hand.', choices: [
      { label: 'Throw a feast in their honour (−150g)', cost: 150, fx: { loy: 25, rep: 4, title: 'the Duellist', boon: { pw: 1.04 }, chron: '{n} won a famous duel before the whole town.' } }, { label: 'Nod and move on', fx: { loy: 10, title: 'the Duellist', boon: { pw: 1.02 } } }] },
  ] },
};
export function pickArc(h, r = Math.random) { const ids = Object.keys(ARCS).filter(id => ARCS[id].ok(h)); return ids[Math.floor(r() * ids.length)]; }
