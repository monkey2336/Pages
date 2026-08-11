/* Troops, spells, siege machines, heroes, pets, equipment and magic items. */
(function (G) {
  'use strict';

  var HOUR = 3600, DAY = 86400;

  /* ------------------------------------------------------------- troops */
  // labCost / labTime are the level-1 research values; the curve does the rest.
  var TROOPS = [
    // Elixir troops (Barracks)
    { key: 'grunt', name: 'Grunt', res: 'elixir', housing: 1, unlockTH: 1, role: 'Cheap ground swarm, targets resources', dps: 8, hp: 45, speed: 16, targets: 'ground', prefers: 'resources', labCost: 25000, labTime: 2 * HOUR, art: 'grunt', tint: '#8fbf5a' },
    { key: 'slinger', name: 'Slinger', res: 'elixir', housing: 1, unlockTH: 2, role: 'Ranged, hits air and ground', dps: 7, hp: 20, speed: 24, targets: 'both', prefers: 'any', labCost: 30000, labTime: 2 * HOUR, art: 'slinger', tint: '#e0be63' },
    { key: 'sapper', name: 'Sapper', res: 'elixir', housing: 2, unlockTH: 3, role: 'Wall breaker', dps: 6, hp: 20, speed: 24, targets: 'ground', prefers: 'walls', labCost: 40000, labTime: 3 * HOUR, art: 'sapper', tint: '#c98f6b' },
    { key: 'brute', name: 'Brute', res: 'elixir', housing: 5, unlockTH: 3, role: 'Tank, targets defenses', dps: 11, hp: 300, speed: 12, targets: 'ground', prefers: 'defenses', labCost: 60000, labTime: 4 * HOUR, art: 'brute', tint: '#b57a52' },
    { key: 'balloonier', name: 'Balloonier', res: 'elixir', housing: 5, unlockTH: 4, role: 'Air, defense-targeting splash', dps: 25, hp: 150, speed: 10, targets: 'ground', prefers: 'defenses', air: true, labCost: 90000, labTime: 5 * HOUR, art: 'balloon', tint: '#c9d8ea' },
    { key: 'mage', name: 'Mage', res: 'elixir', housing: 4, unlockTH: 5, role: 'Ranged splash damage', dps: 50, hp: 75, speed: 16, targets: 'both', prefers: 'any', labCost: 120000, labTime: 6 * HOUR, art: 'mage', tint: '#a48fd8' },
    { key: 'mender', name: 'Mender', res: 'elixir', housing: 14, unlockTH: 6, role: 'Air healer', dps: 0, hp: 600, speed: 12, targets: 'none', prefers: 'any', air: true, heal: 40, labCost: 200000, labTime: 8 * HOUR, art: 'mender', tint: '#f0d8a8' },
    { key: 'wyrm', name: 'Wyrm', res: 'elixir', housing: 20, unlockTH: 7, role: 'Heavy air, splash', dps: 140, hp: 1900, speed: 8, targets: 'both', prefers: 'any', air: true, labCost: 320000, labTime: 12 * HOUR, art: 'wyrm', tint: '#8f7fd8' },
    { key: 'frostcaller', name: 'Frostcaller', res: 'elixir', housing: 6, unlockTH: 8, role: 'Slows defenses in a cone', dps: 30, hp: 260, speed: 16, targets: 'both', prefers: 'defenses', labCost: 420000, labTime: 14 * HOUR, art: 'frost', tint: '#9fd8ff' },
    { key: 'voltaic', name: 'Voltaic', res: 'elixir', housing: 9, unlockTH: 9, role: 'Chain lightning between 4 targets', dps: 75, hp: 380, speed: 16, targets: 'both', prefers: 'any', labCost: 600000, labTime: 18 * HOUR, art: 'voltaic', tint: '#4d9dff' },
    { key: 'ripper', name: 'Ripper', res: 'elixir', housing: 8, unlockTH: 9, role: 'Ground, seeks and destroys walls', dps: 90, hp: 700, speed: 20, targets: 'ground', prefers: 'walls', labCost: 700000, labTime: 20 * HOUR, art: 'ripper', tint: '#ff8a3c' },
    { key: 'bannerman', name: 'Bannerman', res: 'elixir', housing: 10, unlockTH: 10, role: 'Buffs nearby troop damage +25%', dps: 20, hp: 900, speed: 14, targets: 'ground', prefers: 'any', labCost: 900000, labTime: DAY, art: 'banner', tint: '#ffc93c' },
    { key: 'kiterider', name: 'Kite Rider', res: 'elixir', housing: 12, unlockTH: 11, role: 'Air, jumps walls, single-target burst', dps: 190, hp: 800, speed: 22, targets: 'ground', prefers: 'defenses', air: true, labCost: 1400000, labTime: 30 * HOUR, art: 'kite', tint: '#3fe0a0' },
    { key: 'siegebeetle', name: 'Siege Beetle', res: 'elixir', housing: 16, unlockTH: 12, role: 'Absorbs the first 3 traps triggered', dps: 60, hp: 2600, speed: 10, targets: 'ground', prefers: 'defenses', labCost: 2000000, labTime: 36 * HOUR, art: 'beetle', tint: '#a08a52' },
    { key: 'colossus', name: 'Colossus', res: 'elixir', housing: 30, unlockTH: 13, role: 'Massive ground splash tank', dps: 210, hp: 5200, speed: 8, targets: 'ground', prefers: 'defenses', labCost: 3200000, labTime: 2 * DAY, art: 'colossus', tint: '#7fd0e8' },
    { key: 'prismknight', name: 'Prism Knight', res: 'elixir', housing: 18, unlockTH: 19, role: 'Reflects a share of defense damage back', dps: 160, hp: 3000, speed: 14, targets: 'ground', prefers: 'defenses', labCost: 9000000, labTime: 4 * DAY, art: 'prismknight', tint: '#6fa8ff' },
    { key: 'duskwing', name: 'Duskwing', res: 'elixir', housing: 22, unlockTH: 21, role: 'Air, cloaks for 5s after deploy', dps: 240, hp: 3400, speed: 18, targets: 'both', prefers: 'any', air: true, labCost: 13000000, labTime: 5 * DAY, art: 'duskwing', tint: '#c07bff' },
    { key: 'titanborn', name: 'Titanborn', res: 'elixir', housing: 40, unlockTH: 28, role: 'T5 super-heavy, splits into two on death', dps: 420, hp: 11000, speed: 8, targets: 'ground', prefers: 'defenses', labCost: 30000000, labTime: 9 * DAY, art: 'titanborn', tint: '#22e0ff' },

    // Dark elixir troops (Dark Barracks)
    { key: 'marauder', name: 'Marauder', res: 'dark', housing: 2, unlockTH: 7, role: 'Fast ground, targets dark elixir storage', dps: 30, hp: 150, speed: 32, targets: 'ground', prefers: 'resources', labCost: 8000, labTime: 6 * HOUR, art: 'marauder', tint: '#a49bb4' },
    { key: 'hogback', name: 'Hogback', res: 'dark', housing: 5, unlockTH: 7, role: 'Jumps walls, targets defenses', dps: 60, hp: 550, speed: 24, targets: 'ground', prefers: 'defenses', jumpsWalls: true, labCost: 12000, labTime: 8 * HOUR, art: 'hogback', tint: '#b57a52' },
    { key: 'witchling', name: 'Witchling', res: 'dark', housing: 8, unlockTH: 8, role: 'Revives fallen troops once', dps: 40, hp: 320, speed: 12, targets: 'ground', prefers: 'any', labCost: 20000, labTime: 12 * HOUR, art: 'witchling', tint: '#8f7fd8' },
    { key: 'nightstalker', name: 'Nightstalker', res: 'dark', housing: 10, unlockTH: 9, role: 'Invisible until it attacks', dps: 130, hp: 700, speed: 24, targets: 'ground', prefers: 'defenses', labCost: 28000, labTime: 14 * HOUR, art: 'nightstalker', tint: '#5de0c0' },
    { key: 'ravager', name: 'Ravager', res: 'dark', housing: 15, unlockTH: 10, role: 'Damage increases as it loses HP', dps: 100, hp: 2400, speed: 16, targets: 'ground', prefers: 'any', labCost: 40000, labTime: 18 * HOUR, art: 'ravager', tint: '#ff5a2b' },
    { key: 'hexweaver', name: 'Hexweaver', res: 'dark', housing: 18, unlockTH: 11, role: 'Disables one defense for 12s', dps: 70, hp: 1500, speed: 14, targets: 'ground', prefers: 'defenses', labCost: 55000, labTime: DAY, art: 'hexweaver', tint: '#a05cff' },
    { key: 'bonedrake', name: 'Bone Drake', res: 'dark', housing: 20, unlockTH: 12, role: 'Air, leaves damaging pools on death', dps: 180, hp: 2600, speed: 16, targets: 'both', prefers: 'any', air: true, labCost: 70000, labTime: 30 * HOUR, art: 'bonedrake', tint: '#c8ccd8' },
    { key: 'warlock', name: 'Warlock', res: 'dark', housing: 25, unlockTH: 13, role: 'Spawns a skeleton swarm', dps: 90, hp: 1900, speed: 12, targets: 'ground', prefers: 'any', labCost: 90000, labTime: 2 * DAY, art: 'warlock', tint: '#8f3fff' },
    { key: 'golem', name: 'Golem', res: 'dark', housing: 30, unlockTH: 14, role: 'Tank, splits into golemites', dps: 80, hp: 6400, speed: 8, targets: 'ground', prefers: 'defenses', labCost: 110000, labTime: 3 * DAY, art: 'golem', tint: '#8d879b' },
    { key: 'abyssal', name: 'Abyssal', res: 'dark', housing: 35, unlockTH: 25, role: 'Drains HP from defenses to heal itself', dps: 300, hp: 8200, speed: 12, targets: 'ground', prefers: 'defenses', labCost: 260000, labTime: 7 * DAY, art: 'abyssal', tint: '#ff4dd2' }
  ];

  /* ------------------------------------------------------- siege machines */
  var SIEGE = [
    { key: 'wallram', name: 'Wall Ram', unlockTH: 10, res: 'elixir', housing: 1, role: 'Carries troops, smashes straight through walls', labCost: 1500000, labTime: DAY, art: 'ram', tint: '#a9763f' },
    { key: 'barrackscarriage', name: 'Barracks Carriage', unlockTH: 10, res: 'elixir', housing: 1, role: 'Rolls forward and releases troops on the way', labCost: 1800000, labTime: DAY, art: 'carriage', tint: '#c0a271' },
    { key: 'stoneslinger', name: 'Stone Slinger', unlockTH: 11, res: 'elixir', housing: 1, role: 'Long-range bombardment from the edge', labCost: 2400000, labTime: 30 * HOUR, art: 'slingermachine', tint: '#9a9585' },
    { key: 'logroller', name: 'Log Roller', unlockTH: 12, res: 'elixir', housing: 1, role: 'Flattens a lane of walls and buildings', labCost: 3200000, labTime: 36 * HOUR, art: 'log', tint: '#8b5e34' },
    { key: 'battledrill', name: 'Battle Drill', unlockTH: 13, res: 'elixir', housing: 1, role: 'Tunnels underground toward the core', labCost: 4600000, labTime: 2 * DAY, art: 'battledrill', tint: '#ff8a3c' },
    { key: 'bastionwalker', name: 'Bastion Walker', unlockTH: 20, res: 'elixir', housing: 1, role: 'Mobile tower that jams nearby defenses', labCost: 12000000, labTime: 4 * DAY, art: 'walker', tint: '#40e0d0' },
    { key: 'skyanchor', name: 'Sky Anchor', unlockTH: 24, res: 'elixir', housing: 1, role: 'Deploys air troops mid-base', labCost: 20000000, labTime: 6 * DAY, art: 'anchor', tint: '#8f3fff' }
  ];

  /* ------------------------------------------------------------- spells */
  var SPELLS = [
    { key: 'rage', name: 'Rage', res: 'elixir', slots: 1, unlockTH: 5, role: 'Troops inside hit faster and harder', labCost: 60000, labTime: 4 * HOUR, art: 'rage', tint: '#a48fd8' },
    { key: 'heal', name: 'Heal', res: 'elixir', slots: 1, unlockTH: 6, role: 'Pulses health back into troops in radius', labCost: 90000, labTime: 6 * HOUR, art: 'heal', tint: '#ffd9a8' },
    { key: 'jump', name: 'Jump', res: 'elixir', slots: 1, unlockTH: 7, role: 'Ground troops vault the walls beneath it', labCost: 140000, labTime: 8 * HOUR, art: 'jump', tint: '#8fbf5a' },
    { key: 'freeze', name: 'Freeze', res: 'elixir', slots: 1, unlockTH: 8, role: 'Defenses in radius stop firing', labCost: 220000, labTime: 12 * HOUR, art: 'freeze', tint: '#9fd8ff' },
    { key: 'clone', name: 'Clone', res: 'elixir', slots: 1, unlockTH: 10, role: 'Copies troops that walk into it', labCost: 400000, labTime: 18 * HOUR, art: 'clone', tint: '#3fe0a0' },
    { key: 'invisibility', name: 'Invisibility', res: 'elixir', slots: 1, unlockTH: 11, role: 'Everything inside cannot be targeted', labCost: 600000, labTime: DAY, art: 'invis', tint: '#c9d8ea' },
    { key: 'recall', name: 'Recall', res: 'elixir', slots: 1, unlockTH: 13, role: 'Returns troops in radius to your hand', labCost: 1200000, labTime: 2 * DAY, art: 'recall', tint: '#7fd0e8' },
    { key: 'overcharge', name: 'Overcharge', res: 'elixir', slots: 1, unlockTH: 16, role: 'Defenses in radius overheat and damage themselves', labCost: 4000000, labTime: 3 * DAY, art: 'overcharge', tint: '#ff9a4d' },
    { key: 'bulwark', name: 'Bulwark', res: 'elixir', slots: 1, unlockTH: 19, role: 'Drops a temporary wall segment mid-battle', labCost: 8000000, labTime: 4 * DAY, art: 'bulwark', tint: '#7a86b3' },
    { key: 'gale', name: 'Gale', res: 'elixir', slots: 1, unlockTH: 22, role: 'Pushes your troops forward at speed', labCost: 16000000, labTime: 5 * DAY, art: 'gale', tint: '#5f8cff' },

    { key: 'poison', name: 'Poison', res: 'dark', slots: 0.5, unlockTH: 9, role: 'Damages and slows defending troops', labCost: 16000, labTime: 8 * HOUR, art: 'poison', tint: '#7ce05a' },
    { key: 'earthquake', name: 'Earthquake', res: 'dark', slots: 0.5, unlockTH: 9, role: 'Percentage damage, brutal on walls', labCost: 20000, labTime: 10 * HOUR, art: 'quake', tint: '#a9763f' },
    { key: 'haste', name: 'Haste', res: 'dark', slots: 0.5, unlockTH: 10, role: 'Cheap movement speed boost', labCost: 26000, labTime: 12 * HOUR, art: 'haste', tint: '#ffc93c' },
    { key: 'skeletonspell', name: 'Skeleton', res: 'dark', slots: 0.5, unlockTH: 11, role: 'Spawns a skeleton pack anywhere', labCost: 34000, labTime: 16 * HOUR, art: 'skele', tint: '#e8f0ff' },
    { key: 'batspell', name: 'Bat', res: 'dark', slots: 0.5, unlockTH: 12, role: 'Spawns a swarm of bats', labCost: 44000, labTime: DAY, art: 'bat', tint: '#8f7fd8' },
    { key: 'curse', name: 'Curse', res: 'dark', slots: 0.5, unlockTH: 17, role: 'Defenses in radius deal 40% less damage', labCost: 120000, labTime: 3 * DAY, art: 'curse', tint: '#a05cff' },
    { key: 'siphon', name: 'Siphon', res: 'dark', slots: 0.5, unlockTH: 20, role: 'Converts defense damage into troop healing', labCost: 180000, labTime: 4 * DAY, art: 'siphon', tint: '#00ffc2' },
    { key: 'nightfall', name: 'Nightfall', res: 'dark', slots: 0.5, unlockTH: 23, role: 'Blinds defenses — they fire at random points for 6s', labCost: 260000, labTime: 6 * DAY, art: 'nightfall', tint: '#8f3fff' }
  ];

  /* ------------------------------------------------------------- heroes */
  var HEROES = [
    { key: 'vanguard', name: 'Vanguard', unlockTH: 7, res: 'dark', ability: 'Iron Rally', abilityText: 'Heals himself and spawns a ring of guards.', art: 'vanguard', tint: '#d8b45a', baseCost: 10000, baseTime: 30 * 60, dps: 120, hp: 1200 },
    { key: 'huntress', name: 'Huntress', unlockTH: 9, res: 'dark', ability: 'Veilshot', abilityText: 'Cloaks, heals, and calls a volley of archers.', art: 'huntress', tint: '#9fd8ff', baseCost: 14000, baseTime: 45 * 60, dps: 140, hp: 900 },
    { key: 'warden', name: 'Warden', unlockTH: 11, res: 'elixir', ability: 'Eternal Guard', abilityText: 'Aura of damage reduction; ability grants brief invulnerability.', art: 'warden', tint: '#3fe0a0', baseCost: 3000000, baseTime: HOUR, dps: 90, hp: 1500 },
    { key: 'champion', name: 'Champion', unlockTH: 13, res: 'dark', ability: 'Shield Arc', abilityText: 'Throws a shield that bounces between targets.', art: 'champion', tint: '#ffc93c', baseCost: 60000, baseTime: 2 * HOUR, dps: 200, hp: 2200 },
    { key: 'oracle', name: 'Oracle', unlockTH: 19, res: 'dark', ability: 'True Sight', abilityText: 'Reveals and disables traps in a wide radius.', art: 'oracle', tint: '#6fa8ff', baseCost: 140000, baseTime: 4 * HOUR, dps: 180, hp: 2400 },
    { key: 'ironclad', name: 'Ironclad', unlockTH: 22, res: 'elixir', ability: 'Bulwark Taunt', abilityText: 'Taunts defenses onto himself and absorbs the damage.', art: 'ironclad', tint: '#5f8cff', baseCost: 40000000, baseTime: 6 * HOUR, dps: 160, hp: 5200 },
    { key: 'seer', name: 'Seer', unlockTH: 25, res: 'dark', ability: 'Rewind', abilityText: 'Rewinds nearby troops back to full health.', art: 'seer', tint: '#4d7fff', baseCost: 220000, baseTime: 8 * HOUR, dps: 190, hp: 4200 },
    { key: 'ascendant', name: 'Ascendant', unlockTH: 28, res: 'dark', ability: 'Ascendance', abilityText: 'Capstone ability — scales with every troop still alive.', art: 'ascendant', tint: '#ffd24d', baseCost: 400000, baseTime: 12 * HOUR, dps: 320, hp: 7800 }
  ];

  // Hero level cap follows the Town Hall: a hero gains 6 levels of headroom
  // per Town Hall past its unlock, up to 100.
  function heroMaxLevel(heroKey, th) {
    var h = null;
    for (var i = 0; i < HEROES.length; i++) if (HEROES[i].key === heroKey) h = HEROES[i];
    if (!h || th < h.unlockTH) return 0;
    return Math.min(100, 10 + (th - h.unlockTH) * 6);
  }

  /* --------------------------------------------------- hero equipment */
  var ORES = [
    { key: 'shiny', name: 'Shiny Ore', tint: '#ffd24d' },
    { key: 'glowy', name: 'Glowy Ore', tint: '#7be0ff' },
    { key: 'starry', name: 'Starry Ore', tint: '#c07bff' }
  ];

  var EQUIPMENT = [
    { key: 'ironbanner', name: 'Iron Banner', hero: 'vanguard', unlockTH: 13, effect: '+HP, guards linger twice as long', rarity: 'common' },
    { key: 'oathblade', name: 'Oathblade', hero: 'vanguard', unlockTH: 15, effect: 'Heavy single-target damage on ability', rarity: 'epic' },
    { key: 'silentquiver', name: 'Silent Quiver', hero: 'huntress', unlockTH: 13, effect: 'Longer cloak, +attack speed', rarity: 'common' },
    { key: 'hollowpoint', name: 'Hollowpoint', hero: 'huntress', unlockTH: 16, effect: 'Shots ignore a share of defense HP', rarity: 'epic' },
    { key: 'lifesigil', name: 'Life Sigil', hero: 'warden', unlockTH: 13, effect: 'Aura also heals over time', rarity: 'common' },
    { key: 'ethervault', name: 'Ether Vault', hero: 'warden', unlockTH: 18, effect: 'Invulnerability lasts 2s longer', rarity: 'epic' },
    { key: 'arcshield', name: 'Arc Shield', hero: 'champion', unlockTH: 14, effect: 'Shield bounces to two extra targets', rarity: 'common' },
    { key: 'stormgreaves', name: 'Storm Greaves', hero: 'champion', unlockTH: 19, effect: 'Dashes between targets', rarity: 'epic' },
    { key: 'trapsight', name: 'Trapsight Lens', hero: 'oracle', unlockTH: 19, effect: 'Wider trap-disable radius', rarity: 'common' },
    { key: 'fatethread', name: 'Fate Thread', hero: 'oracle', unlockTH: 22, effect: 'Marks a defense to take double damage', rarity: 'epic' },
    { key: 'bulwarkplate', name: 'Bulwark Plate', hero: 'ironclad', unlockTH: 22, effect: 'Absorbs 40% more damage while taunting', rarity: 'common' },
    { key: 'anvilheart', name: 'Anvil Heart', hero: 'ironclad', unlockTH: 25, effect: 'Reflects absorbed damage on release', rarity: 'epic' },
    { key: 'chronolens', name: 'Chrono Lens', hero: 'seer', unlockTH: 25, effect: 'Rewind reaches further', rarity: 'common' },
    { key: 'echoshard', name: 'Echo Shard', hero: 'seer', unlockTH: 27, effect: 'Rewind triggers a second time at 50%', rarity: 'epic' },
    { key: 'apexcrown', name: 'Apex Crown', hero: 'ascendant', unlockTH: 28, effect: 'Ability scales harder with surviving troops', rarity: 'legendary' },
    { key: 'starforge', name: 'Starforge Edge', hero: 'ascendant', unlockTH: 30, effect: 'Every hit chains to the nearest defense', rarity: 'legendary' }
  ];

  /* -------------------------------------------------------------- pets */
  var PETS = [
    { key: 'emberpup', name: 'Ember Pup', unlockTH: 14, effect: 'Charges the nearest defense with its hero', tint: '#ff8a3c' },
    { key: 'glasswing', name: 'Glasswing', unlockTH: 15, effect: 'Flies ahead and blinds one defense', tint: '#9fd8ff' },
    { key: 'stoneback', name: 'Stoneback', unlockTH: 16, effect: 'Takes hits meant for its hero', tint: '#9a9585' },
    { key: 'nightlynx', name: 'Night Lynx', unlockTH: 18, effect: 'Splits into three shadows on hero ability', tint: '#8f7fd8' },
    { key: 'gildedhawk', name: 'Gilded Hawk', unlockTH: 20, effect: 'Snipes the highest-DPS defense in range', tint: '#ffc93c' },
    { key: 'voidmoth', name: 'Voidmoth', unlockTH: 24, effect: 'Drains defense damage into hero healing', tint: '#8f3fff' },
    { key: 'aegiscub', name: 'Aegis Cub', unlockTH: 29, effect: 'Shields its hero every 10 seconds', tint: '#00ffc2' }
  ];

  /* ------------------------------------------------------- magic items */
  var MAGIC_ITEMS = [
    { key: 'hammer_building', name: 'Hammer of Building', type: 'hammer', target: 'building', effect: 'Instantly completes one building upgrade at max level.' },
    { key: 'hammer_army', name: 'Hammer of Fighting', type: 'hammer', target: 'troop', effect: 'Instantly maxes one troop research.' },
    { key: 'hammer_spell', name: 'Hammer of Spells', type: 'hammer', target: 'spell', effect: 'Instantly maxes one spell research.' },
    { key: 'hammer_hero', name: 'Hammer of Heroes', type: 'hammer', target: 'hero', effect: 'Instantly maxes one hero upgrade.' },
    { key: 'hammer_siege', name: 'Hammer of Siege', type: 'hammer', target: 'siege', effect: 'Instantly maxes one siege machine.' },
    { key: 'rune_gold', name: 'Rune of Gold', type: 'rune', target: 'gold', effect: 'Fills your gold storages.' },
    { key: 'rune_elixir', name: 'Rune of Elixir', type: 'rune', target: 'elixir', effect: 'Fills your elixir storages.' },
    { key: 'rune_dark', name: 'Rune of Dark Elixir', type: 'rune', target: 'dark', effect: 'Fills your dark elixir storage.' },
    { key: 'book_building', name: 'Book of Building', type: 'book', target: 'building', effect: 'Finishes an in-progress building upgrade.' },
    { key: 'book_fighting', name: 'Book of Fighting', type: 'book', target: 'troop', effect: 'Finishes an in-progress troop research.' },
    { key: 'book_spells', name: 'Book of Spells', type: 'book', target: 'spell', effect: 'Finishes an in-progress spell research.' },
    { key: 'book_heroes', name: 'Book of Heroes', type: 'book', target: 'hero', effect: 'Finishes an in-progress hero upgrade.' },
    { key: 'book_everything', name: 'Book of Everything', type: 'book', target: 'any', effect: 'Finishes any one in-progress upgrade.' },
    { key: 'potion_builder', name: 'Builder Potion', type: 'potion', target: 'builder', effect: '10x build speed for 1 hour.', mult: 10, duration: 3600 },
    { key: 'potion_research', name: 'Research Potion', type: 'potion', target: 'research', effect: '24x research speed for 1 hour.', mult: 24, duration: 3600 },
    { key: 'potion_resource', name: 'Resource Potion', type: 'potion', target: 'resource', effect: '10x collector output for 1 day.', mult: 10, duration: 86400 },
    { key: 'potion_power', name: 'Power Potion', type: 'potion', target: 'power', effect: 'Army fights at max level for 1 hour.', mult: 1, duration: 3600 },
    { key: 'potion_training', name: 'Training Potion', type: 'potion', target: 'training', effect: '4x training speed for 1 hour.', mult: 4, duration: 3600 },
    { key: 'potion_hero', name: 'Hero Potion', type: 'potion', target: 'hero', effect: 'Heroes ready instantly for 1 hour.', mult: 1, duration: 3600 },
    { key: 'potion_clock', name: 'Clock Tower Potion', type: 'potion', target: 'clock', effect: 'Clock Tower boost for 30 minutes.', mult: 8, duration: 1800 },
    { key: 'ore_shiny', name: 'Shiny Ore', type: 'ore', target: 'shiny', effect: 'Upgrades common hero equipment.' },
    { key: 'ore_glowy', name: 'Glowy Ore', type: 'ore', target: 'glowy', effect: 'Upgrades epic hero equipment.' },
    { key: 'ore_starry', name: 'Starry Ore', type: 'ore', target: 'starry', effect: 'Upgrades legendary hero equipment.' },
    { key: 'deco_banner', name: 'Victory Banner', type: 'decoration', target: 'deco', effect: 'Cosmetic. Looks good next to the Town Hall.' },
    { key: 'deco_statue', name: 'Ascendant Statue', type: 'decoration', target: 'deco', effect: 'Cosmetic. Very heavy.' }
  ];

  var byKey = function (arr) {
    var m = {};
    arr.forEach(function (x) { m[x.key] = x; });
    return m;
  };

  G.TROOPS = TROOPS;
  G.SIEGE = SIEGE;
  G.SPELLS = SPELLS;
  G.HEROES = HEROES;
  G.PETS = PETS;
  G.ORES = ORES;
  G.EQUIPMENT = EQUIPMENT;
  G.MAGIC_ITEMS = MAGIC_ITEMS;

  G.troopData = byKey(TROOPS);
  G.siegeData = byKey(SIEGE);
  G.spellData = byKey(SPELLS);
  G.heroData = byKey(HEROES);
  G.petData = byKey(PETS);
  G.equipmentData = byKey(EQUIPMENT);
  G.itemData = byKey(MAGIC_ITEMS);
  G.heroMaxLevel = heroMaxLevel;

  // Research max level for troops/spells/siege tracks the Laboratory level,
  // which in turn tracks the Town Hall.
  G.researchMaxLevel = function (unlockTH, th) {
    if (th < unlockTH) return 0;
    // Early units keep climbing for a long time; late units arrive strong but
    // with fewer levels of headroom.
    return Math.min(25, 2 + (th - unlockTH));
  };

  // Super troop variants unlock at TH11 (spec section 5).
  G.superTroopOf = function (troop) {
    return { key: 'super_' + troop.key, name: 'Super ' + troop.name, base: troop.key, housing: Math.round(troop.housing * 1.6), cost: 25000, days: 3 };
  };
})(window.G = window.G || {});
