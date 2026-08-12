/* Buildings, defenses and traps.
   `counts` is a list of [townHall, howManyYouMayOwn] steps.
   `maxAt` gives the max level of that building at a given Town Hall. */
(function (G) {
  'use strict';

  var HOUR = 3600, DAY = 86400;

  function B(o) {
    o.counts = o.counts || [[o.unlockTH, 1]];
    o.size = o.size || 3;
    o.baseTime = o.baseTime || 60;
    o.res = o.res || 'gold';
    return o;
  }

  var BUILDINGS = [
    /* ---------------------------------------------------------- resource */
    B({ key: 'goldmine', name: 'Gold Mine', cat: 'resource', art: 'mine', res: 'elixir', unlockTH: 1, size: 3,
        baseCost: 150, baseTime: 60, produces: { gold: 2600 },
        counts: [[1, 1], [2, 2], [3, 3], [4, 4], [6, 5], [8, 6], [11, 7], [15, 8]],
        desc: 'Pumps gold out of the ground while you are away.' }),
    B({ key: 'elixircollector', name: 'Elixir Collector', cat: 'resource', art: 'collector', res: 'gold', unlockTH: 1, size: 3,
        baseCost: 150, baseTime: 60, produces: { elixir: 2600 },
        counts: [[1, 1], [2, 2], [3, 3], [4, 4], [6, 5], [8, 6], [11, 7], [15, 8]],
        desc: 'Draws elixir from the earth into a bubbling tank.' }),
    B({ key: 'darkdrill', name: 'Dark Drill', cat: 'resource', art: 'drill', res: 'gold', unlockTH: 7, size: 3,
        baseCost: 100000, baseTime: 4 * HOUR, produces: { dark: 340 },
        counts: [[7, 1], [8, 2], [9, 3], [12, 4], [16, 5], [22, 6]],
        desc: 'Bores into the dark seam. Slow, valuable, loud.' }),
    B({ key: 'goldstorage', name: 'Gold Storage', cat: 'resource', art: 'vault', res: 'elixir', unlockTH: 1, size: 3,
        baseCost: 300, baseTime: 120, storage: { gold: 1 },
        counts: [[1, 1], [3, 2], [6, 3], [9, 4]],
        desc: 'Holds your gold. Raiders can only take what is inside.' }),
    B({ key: 'elixirstorage', name: 'Elixir Storage', cat: 'resource', art: 'tank', res: 'gold', unlockTH: 1, size: 3,
        baseCost: 300, baseTime: 120, storage: { elixir: 1 },
        counts: [[1, 1], [3, 2], [6, 3], [9, 4]],
        desc: 'Holds your elixir under pressure.' }),
    B({ key: 'darkstorage', name: 'Dark Elixir Storage', cat: 'resource', art: 'darkvault', res: 'gold', unlockTH: 7, size: 3,
        baseCost: 150000, baseTime: 6 * HOUR, storage: { dark: 1 },
        counts: [[7, 1]],
        desc: 'A sealed sphere of dark elixir at the heart of the base.' }),
    B({ key: 'treasury', name: 'Treasury', cat: 'resource', art: 'treasury', res: 'gold', unlockTH: 4, size: 3,
        baseCost: 5000, baseTime: 30 * 60,
        desc: 'Protects a slice of your loot from every raid.' }),
    B({ key: 'clocktower', name: 'Clock Tower', cat: 'resource', art: 'clock', res: 'gold', unlockTH: 5, size: 3,
        baseCost: 20000, baseTime: HOUR,
        desc: 'Boost: all timers in the village run 8x faster for a while.' }),

    /* -------------------------------------------------------------- army */
    B({ key: 'barracks', name: 'Barracks', cat: 'army', art: 'barracks', res: 'elixir', unlockTH: 1, size: 3,
        baseCost: 200, baseTime: 60,
        counts: [[1, 1]],
        desc: 'Trains elixir troops. Each level unlocks the next troop in the roster.' }),
    B({ key: 'darkbarracks', name: 'Dark Barracks', cat: 'army', art: 'darkbarracks', res: 'elixir', unlockTH: 3, size: 3,
        baseCost: 2000, baseTime: 20 * 60,
        counts: [[3, 1]],
        desc: 'Trains dark troops. Each level unlocks the next of them.' }),
    B({ key: 'armycamp', name: 'Army Camp', cat: 'army', art: 'camp', res: 'elixir', unlockTH: 2, size: 4,
        baseCost: 250, baseTime: 120,
        counts: [[2, 1], [4, 2], [7, 3], [10, 4], [17, 5]],
        desc: 'Holds your standing army. Camp levels raise housing space.' }),
    B({ key: 'laboratory', name: 'Laboratory', cat: 'army', art: 'lab', res: 'elixir', unlockTH: 2, size: 3,
        baseCost: 800, baseTime: 20 * 60,
        desc: 'The research hall: upgrade walls, buildings, troops and spells here.' }),
    B({ key: 'spellfactory', name: 'Spell Factory', cat: 'army', art: 'spell', res: 'elixir', unlockTH: 5, size: 3,
        baseCost: 20000, baseTime: 2 * HOUR,
        desc: 'Brews elixir spells.' }),
    B({ key: 'darkspellfactory', name: 'Dark Spell Factory', cat: 'army', art: 'darkspell', res: 'elixir', unlockTH: 9, size: 3,
        baseCost: 250000, baseTime: 8 * HOUR,
        desc: 'Brews dark spells. Two dark spells fill one spell slot.' }),
    B({ key: 'siegeworkshop', name: 'Siege Workshop', cat: 'army', art: 'siege', res: 'elixir', unlockTH: 10, size: 3,
        baseCost: 1500000, baseTime: 12 * HOUR,
        desc: 'Builds siege machines that carry your army into the base.' }),
    B({ key: 'pethouse', name: 'Pet House', cat: 'army', art: 'pethouse', res: 'elixir', unlockTH: 14, size: 3,
        baseCost: 12000000, baseTime: DAY,
        desc: 'Home of hero pets. Each hero may take one to battle.' }),
    B({ key: 'herohall', name: 'Hero Hall', cat: 'army', art: 'herohall', res: 'gold', unlockTH: 7, size: 4,
        baseCost: 80000, baseTime: 4 * HOUR,
        desc: 'Seat of your heroes: levels, abilities, equipment and pets.' }),
    B({ key: 'blacksmith', name: 'Blacksmith', cat: 'army', art: 'smith', res: 'gold', unlockTH: 13, size: 3,
        baseCost: 8000000, baseTime: 18 * HOUR,
        desc: 'Forges and upgrades hero equipment with ore.' }),

    /* ---------------------------------------------------------- defenses */
    B({ key: 'cannon', name: 'Cannon', cat: 'defense', art: 'cannon', unlockTH: 1, size: 3,
        baseCost: 250, baseTime: 60, dps: 9, hp: 420, targets: 'ground', range: 9,
        counts: [[1, 2], [2, 3], [3, 4], [4, 5], [6, 6], [8, 7], [11, 8], [15, 9], [22, 10]],
        desc: 'Reliable single-target ground damage.' }),
    B({ key: 'archertower', name: 'Archer Tower', cat: 'defense', art: 'archer', unlockTH: 2, size: 3,
        baseCost: 1000, baseTime: 180, dps: 11, hp: 380, targets: 'both', range: 11,
        counts: [[2, 1], [3, 2], [4, 3], [5, 4], [7, 5], [9, 6], [12, 7], [16, 8], [23, 9]],
        desc: 'Hits air and ground at good range.' }),
    B({ key: 'mortar', name: 'Mortar', cat: 'defense', art: 'mortar', unlockTH: 4, size: 3,
        baseCost: 8000, baseTime: HOUR, dps: 20, hp: 400, targets: 'ground', range: 12, splash: true,
        counts: [[4, 1], [6, 2], [8, 3], [10, 4], [14, 5]],
        desc: 'Lobs shells into swarms. Blind at close range.' }),
    B({ key: 'airdefense', name: 'Air Defense', cat: 'defense', art: 'airdef', unlockTH: 5, size: 3,
        baseCost: 22000, baseTime: 2 * HOUR, dps: 80, hp: 800, targets: 'air', range: 10,
        counts: [[5, 1], [6, 2], [8, 3], [11, 4], [17, 5]],
        desc: 'Rockets. Deletes air units, ignores ground entirely.' }),
    B({ key: 'wizardtower', name: 'Wizard Tower', cat: 'defense', art: 'wizard', unlockTH: 6, size: 3,
        baseCost: 180000, baseTime: 4 * HOUR, dps: 45, hp: 620, targets: 'both', range: 7, splash: true,
        counts: [[6, 1], [7, 2], [9, 3], [11, 4], [14, 5]],
        desc: 'Short-range splash for both layers.' }),
    B({ key: 'airsweeper', name: 'Air Sweeper', cat: 'defense', art: 'sweeper', unlockTH: 6, size: 3,
        baseCost: 150000, baseTime: 3 * HOUR, dps: 0, hp: 750, targets: 'air', range: 15,
        counts: [[6, 1], [9, 2]],
        desc: 'Blasts air troops backwards in a cone.' }),
    B({ key: 'tesla', name: 'Hidden Tesla', cat: 'defense', art: 'tesla', unlockTH: 7, size: 2,
        baseCost: 260000, baseTime: 5 * HOUR, dps: 58, hp: 600, targets: 'both', range: 7,
        counts: [[7, 2], [8, 3], [9, 4], [11, 5], [13, 6], [18, 7]],
        desc: 'Stays buried until an attacker walks over it.' }),
    B({ key: 'bombtower', name: 'Bomb Tower', cat: 'defense', art: 'bombtower', unlockTH: 8, size: 3,
        baseCost: 400000, baseTime: 8 * HOUR, dps: 60, hp: 900, targets: 'ground', range: 6, splash: true,
        counts: [[8, 1], [9, 2], [12, 3], [16, 4]],
        desc: 'Splash damage, and a parting explosion on death.' }),
    B({ key: 'xbow', name: 'X-Bow', cat: 'defense', art: 'xbow', unlockTH: 9, size: 3,
        baseCost: 1000000, baseTime: 10 * HOUR, dps: 90, hp: 1500, targets: 'both', range: 14,
        counts: [[9, 1], [10, 2], [11, 3], [13, 4]],
        desc: 'Long range rapid fire, configurable ground or air.' }),
    B({ key: 'inferno', name: 'Inferno Tower', cat: 'defense', art: 'inferno', unlockTH: 10, size: 3,
        baseCost: 2500000, baseTime: 14 * HOUR, dps: 140, hp: 1800, targets: 'both', range: 9,
        counts: [[10, 1], [11, 2], [13, 3], [17, 4]],
        desc: 'Single beam that ramps, or multi-beam that spreads.' }),
    B({ key: 'eagle', name: 'Eagle Artillery', cat: 'defense', art: 'eagle', unlockTH: 12, size: 4,
        baseCost: 6000000, baseTime: DAY, dps: 300, hp: 4000, targets: 'both', range: 30, splash: true,
        counts: [[12, 1]],
        desc: 'Wakes after enough housing space lands, then shells the whole map.' }),
    B({ key: 'scattershot', name: 'Scattershot', cat: 'defense', art: 'scatter', unlockTH: 13, size: 4,
        baseCost: 9000000, baseTime: DAY, dps: 180, hp: 4200, targets: 'ground', range: 9, splash: true,
        counts: [[13, 1], [14, 2]],
        desc: 'Flings clustered stone that shatters over a wide area.' }),
    B({ key: 'monolith', name: 'Monolith', cat: 'defense', art: 'monolithdef', unlockTH: 16, size: 4,
        baseCost: 30000000, baseTime: 3 * DAY, dps: 220, hp: 6000, targets: 'both', range: 9,
        counts: [[16, 1]],
        desc: 'Damage scales with the maximum HP of whatever it hits.' }),
    B({ key: 'multiarcher', name: 'Multi-Archer Tower', cat: 'defense', art: 'multiarcher', unlockTH: 17, size: 3,
        baseCost: 34000000, baseTime: 3 * DAY, dps: 150, hp: 3000, targets: 'both', range: 12,
        counts: [[17, 1], [19, 2]],
        desc: 'Three archers, three targets, no reload gap.' }),
    B({ key: 'ricochet', name: 'Ricochet Cannon', cat: 'defense', art: 'ricochet', unlockTH: 18, size: 4,
        baseCost: 42000000, baseTime: 4 * DAY, dps: 200, hp: 4500, targets: 'ground', range: 10,
        counts: [[18, 1], [20, 2]],
        desc: 'Shot bounces to a second target behind the first.' }),
    B({ key: 'prismtower', name: 'Prism Tower', cat: 'defense', art: 'prism', unlockTH: 19, size: 3,
        baseCost: 55000000, baseTime: 4 * DAY, dps: 240, hp: 4800, targets: 'both', range: 11,
        counts: [[19, 1], [21, 2]],
        desc: 'Splits its beam across three targets at once.' }),
    B({ key: 'gravitywell', name: 'Gravity Well', cat: 'defense', art: 'gravity', unlockTH: 22, size: 4,
        baseCost: 90000000, baseTime: 6 * DAY, dps: 60, hp: 5200, targets: 'air', range: 12,
        counts: [[22, 1], [24, 2]],
        desc: 'Slows air units in radius and drags them to the ground.' }),
    B({ key: 'nullfield', name: 'Null Field Generator', cat: 'defense', art: 'nullfield', unlockTH: 23, size: 3,
        baseCost: 110000000, baseTime: 7 * DAY, dps: 0, hp: 5600, targets: 'none', range: 10,
        counts: [[23, 1]],
        desc: 'Spells cast inside the field simply fail.' }),
    B({ key: 'orbitalbeacon', name: 'Orbital Beacon', cat: 'defense', art: 'orbital', unlockTH: 25, size: 4,
        baseCost: 180000000, baseTime: 9 * DAY, dps: 400, hp: 7000, targets: 'both', range: 30, splash: true,
        counts: [[25, 1]],
        desc: 'Marks the largest troop cluster, then drops a delayed strike on it.' }),
    B({ key: 'fracture', name: 'Fracture Cannon', cat: 'defense', art: 'fracturecannon', unlockTH: 26, size: 4,
        baseCost: 220000000, baseTime: 10 * DAY, dps: 260, hp: 7400, targets: 'ground', range: 10,
        counts: [[26, 1], [28, 2]],
        desc: 'Damage ramps the longer it stays on one target.' }),
    B({ key: 'aegisgrid', name: 'Aegis Grid', cat: 'defense', art: 'aegis', unlockTH: 29, size: 4,
        baseCost: 320000000, baseTime: 14 * DAY, dps: 0, hp: 8000, targets: 'none', range: 12,
        counts: [[29, 1]],
        desc: 'Grants every defense in radius a regenerating shield.' }),
    B({ key: 'singularity', name: 'Singularity Core', cat: 'defense', art: 'singularity', unlockTH: 28, size: 5,
        baseCost: 400000000, baseTime: 18 * DAY, dps: 500, hp: 12000, targets: 'both', range: 14, splash: true,
        counts: [[28, 1]],
        desc: 'Capstone. Pulls troops inward, then detonates the charge.' }),

    /* ------------------------------------------------------------- traps */
    B({ key: 'bomb', name: 'Bomb', cat: 'trap', art: 'trapbomb', unlockTH: 3, size: 1,
        baseCost: 400, baseTime: 60, dps: 60,
        counts: [[3, 2], [5, 4], [8, 6], [11, 8], [15, 10], [22, 12]],
        desc: 'Cheap ground splash. Hidden until triggered.' }),
    B({ key: 'springtrap', name: 'Spring Trap', cat: 'trap', art: 'trapspring', unlockTH: 4, size: 1,
        baseCost: 2000, baseTime: 120,
        counts: [[4, 2], [7, 4], [10, 6], [14, 8]],
        desc: 'Ejects ground troops off the map entirely.' }),
    B({ key: 'airbomb', name: 'Air Bomb', cat: 'trap', art: 'trapair', unlockTH: 5, size: 1,
        baseCost: 4000, baseTime: 180, dps: 90,
        counts: [[5, 2], [8, 4], [12, 6], [18, 8]],
        desc: 'Splash damage against air units only.' }),
    B({ key: 'giantbomb', name: 'Giant Bomb', cat: 'trap', art: 'trapgiant', unlockTH: 6, size: 2,
        baseCost: 12000, baseTime: 300, dps: 200,
        counts: [[6, 1], [8, 2], [11, 3], [15, 4], [21, 5]],
        desc: 'Big splash, slows survivors briefly.' }),
    B({ key: 'seekingmine', name: 'Seeking Air Mine', cat: 'trap', art: 'trapseek', unlockTH: 9, size: 1,
        baseCost: 60000, baseTime: 600, dps: 900,
        counts: [[9, 1], [11, 2], [14, 3], [20, 4]],
        desc: 'Hunts the largest air unit in range and removes it.' }),
    B({ key: 'skeletontrap', name: 'Skeleton Trap', cat: 'trap', art: 'trapskull', unlockTH: 8, size: 1,
        baseCost: 40000, baseTime: 600,
        counts: [[8, 1], [10, 2], [13, 3], [19, 4]],
        desc: 'Spawns skeletons to stall the push.' }),
    B({ key: 'tornadotrap', name: 'Tornado Trap', cat: 'trap', art: 'traptornado', unlockTH: 14, size: 2,
        baseCost: 3000000, baseTime: 12 * HOUR, dps: 40,
        counts: [[14, 1]],
        desc: 'Holds troops in place and grinds them down.' }),
    B({ key: 'mirrortrap', name: 'Mirror Trap', cat: 'trap', art: 'trapmirror', unlockTH: 18, size: 2,
        baseCost: 20000000, baseTime: 2 * DAY,
        counts: [[18, 1], [21, 2]],
        desc: 'Spawns a hostile copy of the strongest troop that triggers it.' }),
    B({ key: 'empmine', name: 'EMP Mine', cat: 'trap', art: 'trapemp', unlockTH: 16, size: 1,
        baseCost: 14000000, baseTime: DAY,
        counts: [[16, 2], [19, 3], [24, 4]],
        desc: 'Disables troop abilities in radius for 8 seconds.' }),
    B({ key: 'quicksand', name: 'Quicksand Pit', cat: 'trap', art: 'trapsand', unlockTH: 17, size: 2,
        baseCost: 18000000, baseTime: DAY,
        counts: [[17, 1], [20, 2], [25, 3]],
        desc: 'Halves movement speed across a wide area.' })
  ];

  var BY_KEY = {};
  BUILDINGS.forEach(function (b) { BY_KEY[b.key] = b; });

  // How many of this building you may own at a given Town Hall.
  function allowedCount(key, th) {
    var b = BY_KEY[key];
    if (!b || th < b.unlockTH) return 0;
    var n = 0;
    for (var i = 0; i < b.counts.length; i++) {
      if (th >= b.counts[i][0]) n = b.counts[i][1];
    }
    return n;
  }

  // Max level of a building at a given Town Hall. Defenses and resource
  // buildings gain a level per Town Hall after unlock; late-game structures
  // move at half that pace so they stay meaningful.
  function maxLevel(key, th) {
    var b = BY_KEY[key];
    if (!b || th < b.unlockTH) return 0;
    var span = th - b.unlockTH + 2;   // one level of headroom past the unlock
    // 30 is a hard ceiling: there is exactly one design per level, and the
    // art runs 1..30, so no building may outrun the set of looks it has.
    if (b.unlockTH >= 16 || b.cat === 'trap') return Math.max(1, Math.min(30, Math.ceil(span / 1.5)));
    return Math.min(30, span);
  }

  G.BUILDINGS = BUILDINGS;
  G.buildingData = function (key) { return BY_KEY[key]; };
  G.allowedCount = allowedCount;
  G.buildingMaxLevel = maxLevel;

  /* ------------------------------------------------------------- walls */
  // Walls are their own thing: one item, thousands of segments, upgraded in
  // bulk from the Laboratory.
  G.WALL = {
    key: 'wall', name: 'Walls', cat: 'wall', art: 'wall', res: 'gold',
    baseCost: 30, baseTime: 30, costGrowth: 1.55,
    desc: 'Every segment can be raised one level at a time, or in bulk from the Lab.',
    // segment allowance per Town Hall
    countAt: function (th) {
      if (th < 2) return 0;
      return Math.min(400, 25 + (th - 2) * 13);
    },
    maxLevelAt: function (th) { return th; },
    // Wall skins change with level — this is what makes a TH25 wall read
    // differently from a TH3 wall.
    skin: function (level) {
      var skins = [
        { name: 'Wooden Palisade', fill: '#a9763f', edge: '#6f4a24' },
        { name: 'Stacked Stone', fill: '#9a9585', edge: '#5f5c52' },
        { name: 'Cut Granite', fill: '#b6b2a6', edge: '#6f6c62' },
        { name: 'Iron-Banded', fill: '#8b949b', edge: '#4a5057' },
        { name: 'Studded Iron', fill: '#7f8b9c', edge: '#3f4754' },
        { name: 'Blackstone', fill: '#5c5768', edge: '#2f2b38' },
        { name: 'Emberstone', fill: '#9c6f4f', edge: '#5c3a24' },
        { name: 'Forged Ember', fill: '#b5713c', edge: '#6b3d16' },
        { name: 'Cobalt Plate', fill: '#6b81a1', edge: '#33415c' },
        { name: 'Molten Core', fill: '#985c46', edge: '#5c2a1c', glow: '#ff7a3c' },
        { name: 'Warded Jade', fill: '#5f8b78', edge: '#2c4a3e', glow: '#3fe0a0' },
        { name: 'Gilded', fill: '#b89c5e', edge: '#6b5522', glow: '#ffc93c' },
        { name: 'Skyglass', fill: '#7c929a', edge: '#3d4c52', glow: '#7fd0e8' },
        { name: 'Overgrown', fill: '#6f9066', edge: '#33482f', glow: '#7ce05a' },
        { name: 'Ivory', fill: '#c2baa8', edge: '#7a7263', glow: '#fff4d8' },
        { name: 'Runed Obsidian', fill: '#63657a', edge: '#2b2c38', glow: '#a05cff' },
        { name: 'Quiverwall', fill: '#5f9089', edge: '#2b4a45', glow: '#35d6c0' },
        { name: 'Foundry Steel', fill: '#9c7654', edge: '#513723', glow: '#ff9a4d' },
        { name: 'Prismatic', fill: '#7a86b3', edge: '#39406b', glow: '#6fa8ff' },
        { name: 'Auroral', fill: '#5c8697', edge: '#2a4652', glow: '#40e0d0' },
        { name: 'Nexus Link', fill: '#72639a', edge: '#372c52', glow: '#c07bff' },
        { name: 'Gravitic', fill: '#526889', edge: '#243247', glow: '#5f8cff' },
        { name: 'Null Alloy', fill: '#5b606c', edge: '#282c33', glow: '#c8ccd8' },
        { name: 'Voidglass', fill: '#4f4266', edge: '#211a2e', glow: '#8f3fff' },
        { name: 'Orbital Alloy', fill: '#516194', edge: '#232c47', glow: '#4d7fff' },
        { name: 'Fractured', fill: '#955c6d', edge: '#4a2632', glow: '#ff4d6d' },
        { name: 'Titanforged', fill: '#997d43', edge: '#4f3d18', glow: '#ffb02e' },
        { name: 'Corebound', fill: '#457b8f', edge: '#1c3b47', glow: '#22e0ff' },
        { name: 'Aegis Lattice', fill: '#4a8c83', edge: '#1c423c', glow: '#00ffc2' },
        { name: 'Ascendant', fill: '#66528c', edge: '#2b2047', glow: '#ffd24d' }
      ];
      return skins[Math.max(1, Math.min(30, level)) - 1];
    }
  };
})(window.G = window.G || {});
