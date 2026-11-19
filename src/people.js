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
