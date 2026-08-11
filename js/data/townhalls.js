/* Town Hall progression 1..30.
   Every level is its own identity: name, tier, lore line, a full colour palette
   that re-themes the whole UI, and a design descriptor the art layer turns into
   a unique piece of Town Hall architecture. */
(function (G) {
  'use strict';

  // Each palette is deliberately distinct from its neighbours. Order of the
  // ramp across 30 levels: thatch/earth -> stone -> iron -> ember -> cobalt ->
  // gold -> crystal -> void -> cosmic.
  var TH = [
    {
      level: 1, name: 'Thatch Post', tier: 'Tutorial',
      lore: 'Four poles, a straw roof, and more ambition than lumber.',
      palette: {
        sky1: '#8fb96a', sky2: '#5c8446', ground: '#6f9a4e', groundAlt: '#628c46',
        panel: '#2e2a1f', panelEdge: '#4b432f', ink: '#f4efdf', dim: '#bcb197',
        accent: '#d8b45a', accent2: '#8fbf5a', glow: '#ffe9a8',
        roof: '#c9a963', stone: '#a08a63', wall: '#b59a6d'
      },
      design: { body: 'hut', roof: 'thatch', towers: 0, banners: 1, steps: 0, windows: 1, rings: 0, orbs: 0, motif: 'straw' },
      unlocks: ['Cannon', 'Barracks', 'Gold Mine', 'Elixir Collector', 'Walls']
    },
    {
      level: 2, name: 'Timber Hall', tier: 'Tutorial',
      lore: 'Planed beams, a proper door, and a bell that mostly works.',
      palette: {
        sky1: '#9cc06f', sky2: '#557f42', ground: '#79a355', groundAlt: '#6b9549',
        panel: '#332b1e', panelEdge: '#57462d', ink: '#f6f0de', dim: '#c2b393',
        accent: '#e0be63', accent2: '#7fb85c', glow: '#ffeeb0',
        roof: '#8b5e34', stone: '#a98f66', wall: '#c0a271'
      },
      design: { body: 'lodge', roof: 'plank', towers: 0, banners: 2, steps: 1, windows: 2, rings: 0, orbs: 0, motif: 'beam' },
      unlocks: ['Archer Tower', 'Army Camp', '2nd Gold Mine']
    },
    {
      level: 3, name: 'Stone Lodge', tier: 'Tutorial',
      lore: 'The first walls that do not burn.',
      palette: {
        sky1: '#a8bd8a', sky2: '#5a7550', ground: '#7d9a63', groundAlt: '#6f8c57',
        panel: '#2c2f2a', panelEdge: '#4a5044', ink: '#f2f3ea', dim: '#b7bcaa',
        accent: '#cfc08a', accent2: '#8ab77a', glow: '#f0f4cf',
        roof: '#6d6a5c', stone: '#9a9585', wall: '#a9a491'
      },
      design: { body: 'stonehouse', roof: 'tile', towers: 1, banners: 2, steps: 1, windows: 2, rings: 0, orbs: 0, motif: 'block' },
      unlocks: ['Wall Level 3', 'Gold Storage', 'Elixir Storage']
    },
    {
      level: 4, name: 'Iron Keep', tier: 'Early',
      lore: 'Banded doors, an iron rim, and the first mortar in the yard.',
      palette: {
        sky1: '#9fb3b8', sky2: '#4d6068', ground: '#6f8a72', groundAlt: '#627d66',
        panel: '#242a2e', panelEdge: '#3d4750', ink: '#eef3f6', dim: '#a8b5bd',
        accent: '#b9c6cf', accent2: '#7fa8b5', glow: '#dff0f7',
        roof: '#4f5a63', stone: '#8b949b', wall: '#9aa3a9'
      },
      design: { body: 'keep', roof: 'peak', towers: 2, banners: 2, steps: 2, windows: 3, rings: 0, orbs: 0, motif: 'rivet' },
      unlocks: ['Mortar', 'Laboratory', 'Builder III']
    },
    {
      level: 5, name: 'Bastion Hall', tier: 'Early',
      lore: 'Sightlines cleared, sky watched. The Air Defense hums.',
      palette: {
        sky1: '#93a9c4', sky2: '#465a78', ground: '#68806f', groundAlt: '#5b7363',
        panel: '#20262f', panelEdge: '#384456', ink: '#eaf1f9', dim: '#a2b0c3',
        accent: '#8fb6e0', accent2: '#c9d8ea', glow: '#d6e8ff',
        roof: '#3f5470', stone: '#7f8b9c', wall: '#8f9bad'
      },
      design: { body: 'bastion', roof: 'peak', towers: 2, banners: 3, steps: 2, windows: 3, rings: 0, orbs: 0, motif: 'arrowslit' },
      unlocks: ['Air Defense', 'Spell Factory', 'Wall Level 5']
    },
    {
      level: 6, name: 'Granite Court', tier: 'Early',
      lore: 'A courtyard wide enough for a wizard to miss with.',
      palette: {
        sky1: '#b0a9bd', sky2: '#5b5170', ground: '#6f7a72', groundAlt: '#626d66',
        panel: '#282434', panelEdge: '#463e5c', ink: '#f2eefb', dim: '#b6acc7',
        accent: '#a48fd8', accent2: '#d4c6f0', glow: '#e8dcff',
        roof: '#584a72', stone: '#8d879b', wall: '#9c94ad'
      },
      design: { body: 'court', roof: 'dome', towers: 3, banners: 3, steps: 2, windows: 4, rings: 0, orbs: 0, motif: 'arch' },
      unlocks: ['Wizard Tower', 'Air Sweeper', 'Giant Bomb']
    },
    {
      level: 7, name: 'Obsidian Seat', tier: 'Mid',
      lore: 'Black glass floors. Somewhere below, the first drill bites.',
      palette: {
        sky1: '#6b6577', sky2: '#2b2733', ground: '#4f5358', groundAlt: '#454a4e',
        panel: '#191722', panelEdge: '#332e42', ink: '#efeaf6', dim: '#a49bb4',
        accent: '#8f7fd8', accent2: '#5de0c0', glow: '#c9b8ff',
        roof: '#2f2a3d', stone: '#5c5768', wall: '#6b6579'
      },
      design: { body: 'obsidian', roof: 'spike', towers: 3, banners: 2, steps: 3, windows: 3, rings: 0, orbs: 1, motif: 'shard' },
      unlocks: ['Dark Drill', 'Dark Barracks', 'Vanguard (Hero)', 'Hero Hall']
    },
    {
      level: 8, name: 'Emberforge Hall', tier: 'Mid',
      lore: 'The forge never cools; the bomb tower was born here.',
      palette: {
        sky1: '#b57a52', sky2: '#5d2f22', ground: '#6b5340', groundAlt: '#5e4837',
        panel: '#2a1a14', panelEdge: '#4d2c1e', ink: '#fdeee2', dim: '#cfa78f',
        accent: '#ff8a3c', accent2: '#ffc76b', glow: '#ffd9a8',
        roof: '#7a3a1e', stone: '#8a6247', wall: '#9c6f4f'
      },
      design: { body: 'forge', roof: 'chimney', towers: 2, banners: 3, steps: 3, windows: 4, rings: 0, orbs: 1, motif: 'ember' },
      unlocks: ['Bomb Tower', 'Dark Elixir Storage', 'Skeleton Trap']
    },
    {
      level: 9, name: 'Cobalt Citadel', tier: 'Mid',
      lore: 'Blue steel, a huntress on the parapet, X-Bows in crates.',
      palette: {
        sky1: '#6d90c9', sky2: '#243c6b', ground: '#4f6a86', groundAlt: '#455d76',
        panel: '#141d33', panelEdge: '#26365c', ink: '#e8f0ff', dim: '#9db3d6',
        accent: '#4d9dff', accent2: '#9fd8ff', glow: '#bfe2ff',
        roof: '#1f335c', stone: '#5b708f', wall: '#6b81a1'
      },
      design: { body: 'citadel', roof: 'peak', towers: 4, banners: 4, steps: 3, windows: 5, rings: 0, orbs: 1, motif: 'plate' },
      unlocks: ['X-Bow', 'Huntress (Hero)', 'Dark Spell Factory']
    },
    {
      level: 10, name: 'Inferno Spire', tier: 'Late',
      lore: 'A tower of contained fire. Do not touch the railings.',
      palette: {
        sky1: '#c96b4a', sky2: '#4a1d18', ground: '#6a4438', groundAlt: '#5c3a30',
        panel: '#26100e', panelEdge: '#4f1f18', ink: '#ffeee6', dim: '#d6a08c',
        accent: '#ff5a2b', accent2: '#ffb03a', glow: '#ffcf9a',
        roof: '#6b2114', stone: '#83503f', wall: '#985c46'
      },
      design: { body: 'spire', roof: 'flame', towers: 2, banners: 3, steps: 3, windows: 4, rings: 1, orbs: 1, motif: 'inferno' },
      unlocks: ['Inferno Tower', 'Siege Workshop', 'Builder V']
    },
    {
      level: 11, name: "Warden's Sanctum", tier: 'Late',
      lore: 'A quiet hall of green light where damage forgets to land.',
      palette: {
        sky1: '#6fae8f', sky2: '#1f4a3a', ground: '#4d7a64', groundAlt: '#436c58',
        panel: '#0f2620', panelEdge: '#1e4739', ink: '#e9fbf3', dim: '#9ccfb8',
        accent: '#3fe0a0', accent2: '#a8ffd8', glow: '#c2ffe6',
        roof: '#1a4436', stone: '#537a69', wall: '#5f8b78'
      },
      design: { body: 'sanctum', roof: 'dome', towers: 3, banners: 3, steps: 4, windows: 5, rings: 1, orbs: 2, motif: 'sigil' },
      unlocks: ['Warden (Hero)', 'Super Troops', 'Eagle Artillery groundwork']
    },
    {
      level: 12, name: 'Golden Ziggurat', tier: 'Late',
      lore: 'Terraced gold. The Eagle Artillery sits on the top step.',
      palette: {
        sky1: '#e0bd6e', sky2: '#7a5518', ground: '#8a7440', groundAlt: '#7a6638',
        panel: '#2e2410', panelEdge: '#57421a', ink: '#fff6dd', dim: '#d8c08a',
        accent: '#ffc93c', accent2: '#ffe89a', glow: '#fff0bd',
        roof: '#a2761f', stone: '#a08a52', wall: '#b89c5e'
      },
      design: { body: 'ziggurat', roof: 'flat', towers: 2, banners: 4, steps: 5, windows: 4, rings: 1, orbs: 2, motif: 'terrace' },
      unlocks: ['Eagle Artillery', 'Bomb Tower Lv6', 'Wall Level 12']
    },
    {
      level: 13, name: 'Scatter Crown', tier: 'Endgame',
      lore: 'Twin scattershots crown the roof and fling stone in arcs.',
      palette: {
        sky1: '#8fa8b8', sky2: '#33454f', ground: '#5c7078', groundAlt: '#516369',
        panel: '#16212a', panelEdge: '#2b3d4a', ink: '#ecf6fb', dim: '#a7bcc8',
        accent: '#7fd0e8', accent2: '#d8f2fb', glow: '#cdeeff',
        roof: '#2b414d', stone: '#6b8189', wall: '#7c929a'
      },
      design: { body: 'crown', roof: 'crown', towers: 4, banners: 4, steps: 4, windows: 5, rings: 1, orbs: 2, motif: 'scatter' },
      unlocks: ['Scattershot', 'Champion (Hero)', 'Hero Equipment']
    },
    {
      level: 14, name: 'Verdant Menagerie', tier: 'Endgame',
      lore: 'A living roof, a pet house, and something large that purrs.',
      palette: {
        sky1: '#8fc47a', sky2: '#2f5a34', ground: '#5c8a55', groundAlt: '#517b4c',
        panel: '#14261a', panelEdge: '#264a2c', ink: '#effbe9', dim: '#a8cfa9',
        accent: '#7ce05a', accent2: '#d2ffb0', glow: '#d9ffc2',
        roof: '#2f5c33', stone: '#5f7f58', wall: '#6f9066'
      },
      design: { body: 'menagerie', roof: 'living', towers: 3, banners: 3, steps: 4, windows: 6, rings: 1, orbs: 2, motif: 'vine' },
      unlocks: ['Pet House', 'Pets', 'Tornado Trap']
    },
    {
      level: 15, name: 'Ivory Conclave', tier: 'Endgame',
      lore: 'Pale stone, high windows, and monoliths being quarried below.',
      palette: {
        sky1: '#d9d3c4', sky2: '#7d7364', ground: '#8f8878', groundAlt: '#807a6c',
        panel: '#2b2823', panelEdge: '#4d473d', ink: '#fffaf0', dim: '#cbc3b4',
        accent: '#f0e2c0', accent2: '#c8b48a', glow: '#fff4d8',
        roof: '#6f6656', stone: '#b3ab99', wall: '#c2baa8'
      },
      design: { body: 'conclave', roof: 'dome', towers: 4, banners: 5, steps: 5, windows: 6, rings: 1, orbs: 2, motif: 'column' },
      unlocks: ['4th Hero slot', 'Blacksmith Lv6', 'Wall Level 15']
    },
    {
      level: 16, name: 'Monolith Vault', tier: 'Ascendant',
      lore: 'A black slab drinks light and answers with damage.',
      palette: {
        sky1: '#5f5f6e', sky2: '#232430', ground: '#4a4c56', groundAlt: '#41434c',
        panel: '#14151d', panelEdge: '#2b2d3b', ink: '#eceef7', dim: '#9fa3b5',
        accent: '#a05cff', accent2: '#e0c2ff', glow: '#cdaaff',
        roof: '#241f33', stone: '#55576a', wall: '#63657a'
      },
      design: { body: 'monolith', roof: 'slab', towers: 2, banners: 3, steps: 5, windows: 3, rings: 2, orbs: 2, motif: 'rune' },
      unlocks: ['Monolith', 'EMP Mine', 'Builder VI upgrades']
    },
    {
      level: 17, name: 'Quiver Bastion', tier: 'Ascendant',
      lore: 'Every embrasure holds three archers who never blink.',
      palette: {
        sky1: '#7fb9a6', sky2: '#2a5450', ground: '#4f7d74', groundAlt: '#456e66',
        panel: '#0f2624', panelEdge: '#1f4a45', ink: '#e9fbf8', dim: '#9fcdc4',
        accent: '#35d6c0', accent2: '#b0fff2', glow: '#c8fff4',
        roof: '#1d4a45', stone: '#527f77', wall: '#5f9089'
      },
      design: { body: 'quiver', roof: 'peak', towers: 5, banners: 4, steps: 5, windows: 7, rings: 2, orbs: 2, motif: 'quiver' },
      unlocks: ['Multi-Archer Tower', 'Quicksand Pit', 'Super Troop slot 2']
    },
    {
      level: 18, name: 'Ricochet Foundry', tier: 'Ascendant',
      lore: 'Shot that refuses to stop at the first target.',
      palette: {
        sky1: '#c98f6b', sky2: '#5c3722', ground: '#6f5540', groundAlt: '#614937',
        panel: '#241811', panelEdge: '#48301d', ink: '#fdf0e6', dim: '#cfab90',
        accent: '#ff9a4d', accent2: '#ffd79a', glow: '#ffdfb5',
        roof: '#5f3319', stone: '#8a6748', wall: '#9c7654'
      },
      design: { body: 'foundry', roof: 'chimney', towers: 4, banners: 4, steps: 5, windows: 6, rings: 2, orbs: 2, motif: 'gear' },
      unlocks: ['Ricochet Cannon', 'Mirror Trap', 'Wall Level 18']
    },
    {
      level: 19, name: 'Prism Cathedral', tier: 'Prestige',
      lore: 'Light enters once and leaves as three beams.',
      palette: {
        sky1: '#9fd0ff', sky2: '#3b4f8f', ground: '#5f6f9c', groundAlt: '#54638c',
        panel: '#161b33', panelEdge: '#2c3560', ink: '#f0f4ff', dim: '#aab6dd',
        accent: '#6fa8ff', accent2: '#ff9ae0', glow: '#dcd0ff',
        roof: '#28306b', stone: '#6a76a3', wall: '#7a86b3'
      },
      design: { body: 'cathedral', roof: 'prism', towers: 4, banners: 5, steps: 5, windows: 8, rings: 2, orbs: 3, motif: 'prism' },
      unlocks: ['Prism Tower', 'Oracle (Hero)', 'Starry Ore']
    },
    {
      level: 20, name: 'Aurora Spire', tier: 'Prestige',
      lore: 'The sky above this hall never quite settles on a colour.',
      palette: {
        sky1: '#6fe0c8', sky2: '#2b3f6b', ground: '#4a6f7d', groundAlt: '#406170',
        panel: '#0f2130', panelEdge: '#1f4257', ink: '#e8fbff', dim: '#9dc9d9',
        accent: '#40e0d0', accent2: '#b06fff', glow: '#c6fff2',
        roof: '#173a4f', stone: '#4f7787', wall: '#5c8697'
      },
      design: { body: 'aurora', roof: 'flame', towers: 3, banners: 4, steps: 6, windows: 6, rings: 3, orbs: 3, motif: 'aurora' },
      unlocks: ['Warden Spire', 'Siege Machines Lv5', 'Clock Tower Lv8']
    },
    {
      level: 21, name: 'Nexus Reach', tier: 'Prestige',
      lore: 'Five heroes now answer the same bell.',
      palette: {
        sky1: '#b98fe0', sky2: '#3d2a63', ground: '#5f4f80', groundAlt: '#544572',
        panel: '#1a1230', panelEdge: '#332352', ink: '#f5edff', dim: '#bda8dd',
        accent: '#c07bff', accent2: '#7be0ff', glow: '#e3c8ff',
        roof: '#2b1c4f', stone: '#63548a', wall: '#72639a'
      },
      design: { body: 'nexus', roof: 'crown', towers: 5, banners: 5, steps: 6, windows: 7, rings: 3, orbs: 3, motif: 'link' },
      unlocks: ['5th Hero slot', 'Builder VII', 'Wall Level 21']
    },
    {
      level: 22, name: 'Gravity Sanctum', tier: 'Mythic',
      lore: 'Air units come down here whether they mean to or not.',
      palette: {
        sky1: '#5f7fa8', sky2: '#161f3a', ground: '#3f5470', groundAlt: '#374a63',
        panel: '#0c1224', panelEdge: '#1c2a4a', ink: '#e6eeff', dim: '#95a8c9',
        accent: '#5f8cff', accent2: '#00e5c0', glow: '#b8ccff',
        roof: '#141d3d', stone: '#465b7a', wall: '#526889'
      },
      design: { body: 'gravity', roof: 'well', towers: 4, banners: 4, steps: 6, windows: 6, rings: 4, orbs: 3, motif: 'orbit' },
      unlocks: ['Gravity Well', 'Ironclad (Hero)', 'Glowy Ore Lv12']
    },
    {
      level: 23, name: 'Null Cathedral', tier: 'Mythic',
      lore: 'Inside the field, spells simply decline to happen.',
      palette: {
        sky1: '#7a7f8c', sky2: '#1c1f26', ground: '#454a54', groundAlt: '#3c414a',
        panel: '#0f1116', panelEdge: '#252a34', ink: '#eef0f5', dim: '#9ea4b0',
        accent: '#c8ccd8', accent2: '#5fd0ff', glow: '#dfe6f5',
        roof: '#1b1e26', stone: '#4e535e', wall: '#5b606c'
      },
      design: { body: 'null', roof: 'prism', towers: 4, banners: 3, steps: 6, windows: 5, rings: 4, orbs: 3, motif: 'void' },
      unlocks: ['Null Field Generator', 'Dark Spells Lv10', 'Wall Level 23']
    },
    {
      level: 24, name: 'Voidhold', tier: 'Mythic',
      lore: 'A hall with a hole in the middle that hums.',
      palette: {
        sky1: '#4f3f6b', sky2: '#120c1f', ground: '#3a3050', groundAlt: '#322946',
        panel: '#0b0714', panelEdge: '#1e1533', ink: '#f0e9ff', dim: '#a294bd',
        accent: '#8f3fff', accent2: '#ff5fbf', glow: '#d0a8ff',
        roof: '#160f2b', stone: '#443859', wall: '#4f4266'
      },
      design: { body: 'voidhold', roof: 'slab', towers: 5, banners: 4, steps: 7, windows: 5, rings: 4, orbs: 4, motif: 'void' },
      unlocks: ['6th Hero slot', 'Abyssal (Troop)', 'Super Troop slot 3']
    },
    {
      level: 25, name: 'Orbital Throne', tier: 'Titan',
      lore: 'Targets are chosen from above, then answered from above.',
      palette: {
        sky1: '#7fa8ff', sky2: '#111a3a', ground: '#3f4f7a', groundAlt: '#37456b',
        panel: '#0a1029', panelEdge: '#1b2a55', ink: '#eaf1ff', dim: '#9db0d9',
        accent: '#4d7fff', accent2: '#ffd24d', glow: '#c2d6ff',
        roof: '#131c42', stone: '#455484', wall: '#516194'
      },
      design: { body: 'orbital', roof: 'ring', towers: 4, banners: 5, steps: 7, windows: 6, rings: 5, orbs: 4, motif: 'beacon' },
      unlocks: ['Orbital Beacon', 'Seer (Hero)', 'Abyssal unlocked']
    },
    {
      level: 26, name: 'Fracture Keep', tier: 'Titan',
      lore: 'The longer the beam holds, the less of you remains.',
      palette: {
        sky1: '#e07f7f', sky2: '#4a1424', ground: '#6b3f4f', groundAlt: '#5e3745',
        panel: '#230c16', panelEdge: '#4a1a2b', ink: '#ffecef', dim: '#d69aa8',
        accent: '#ff4d6d', accent2: '#ffb37f', glow: '#ffc2cf',
        roof: '#5c1526', stone: '#82505f', wall: '#955c6d'
      },
      design: { body: 'fracture', roof: 'spike', towers: 5, banners: 4, steps: 7, windows: 6, rings: 4, orbs: 4, motif: 'crack' },
      unlocks: ['Fracture Cannon', 'Hero Equipment Lv24', 'Wall Level 26']
    },
    {
      level: 27, name: 'Titanforge', tier: 'Titan',
      lore: 'Where a seventh hero is poured, cooled and named.',
      palette: {
        sky1: '#d8a24d', sky2: '#4a2f0e', ground: '#6e5a2f', groundAlt: '#604e29',
        panel: '#251a08', panelEdge: '#4d3512', ink: '#fff5e0', dim: '#d4b483',
        accent: '#ffb02e', accent2: '#ff6a2b', glow: '#ffdca3',
        roof: '#5e3c10', stone: '#866c37', wall: '#997d43'
      },
      design: { body: 'titanforge', roof: 'chimney', towers: 5, banners: 5, steps: 7, windows: 7, rings: 4, orbs: 4, motif: 'anvil' },
      unlocks: ['7th Hero slot', 'Siege Machines Lv8', 'Titanborn groundwork']
    },
    {
      level: 28, name: 'Singularity Ark', tier: 'Apex',
      lore: 'The core is fed, not fuelled. T5 troops march out of it.',
      palette: {
        sky1: '#5fe0ff', sky2: '#0d1f33', ground: '#2f5a6b', groundAlt: '#284f5e',
        panel: '#06121c', panelEdge: '#123447', ink: '#e6fbff', dim: '#8fc6d9',
        accent: '#22e0ff', accent2: '#c2ff4d', glow: '#a8f2ff',
        roof: '#0d2c3d', stone: '#3a6b7d', wall: '#457b8f'
      },
      design: { body: 'ark', roof: 'ring', towers: 6, banners: 5, steps: 8, windows: 7, rings: 5, orbs: 5, motif: 'core' },
      unlocks: ['Singularity Core', 'Titanborn (T5)', '8th Hero: Ascendant']
    },
    {
      level: 29, name: 'Aegis Crown', tier: 'Apex',
      lore: 'Every defense inside the crown regrows its own shield.',
      palette: {
        sky1: '#a8ffe0', sky2: '#134a45', ground: '#3f7a72', groundAlt: '#376b64',
        panel: '#062421', panelEdge: '#0f4a44', ink: '#eafff9', dim: '#95d6c9',
        accent: '#00ffc2', accent2: '#ffe066', glow: '#b8fff0',
        roof: '#0b3d38', stone: '#3f7a72', wall: '#4a8c83'
      },
      design: { body: 'aegis', roof: 'crown', towers: 6, banners: 6, steps: 8, windows: 8, rings: 5, orbs: 5, motif: 'shield' },
      unlocks: ['Aegis Grid', 'All defenses max-1', 'Wall Level 29']
    },
    {
      level: 30, name: 'Apex Ascendancy', tier: 'Apex',
      lore: 'Thirty levels of stone, ending in something that is barely a building.',
      palette: {
        sky1: '#ffd24d', sky2: '#2b0f4a', ground: '#4a3a6b', groundAlt: '#41325e',
        panel: '#12082a', panelEdge: '#33185c', ink: '#fff6e6', dim: '#c9a8e0',
        accent: '#ffd24d', accent2: '#ff4dd2', glow: '#ffe9a8',
        roof: '#2a0f4f', stone: '#57457a', wall: '#66528c'
      },
      design: { body: 'apex', roof: 'crown', towers: 6, banners: 6, steps: 9, windows: 9, rings: 6, orbs: 6, motif: 'apex' },
      unlocks: ['Everything at max level', 'Wall Level 30', 'T5 troops for all']
    }
  ];

  // Tier metadata straight from the spec table.
  var TIERS = [
    { from: 1, to: 3, tier: 'Tutorial', builders: 2, maxUpgradeSeconds: 15 * 60 },
    { from: 4, to: 6, tier: 'Early', builders: 3, maxUpgradeSeconds: 6 * 3600 },
    { from: 7, to: 9, tier: 'Mid', builders: 4, maxUpgradeSeconds: 2 * 86400 },
    { from: 10, to: 12, tier: 'Late', builders: 5, maxUpgradeSeconds: 7 * 86400 },
    { from: 13, to: 15, tier: 'Endgame', builders: 6, maxUpgradeSeconds: 14 * 86400 },
    { from: 16, to: 18, tier: 'Ascendant', builders: 6, maxUpgradeSeconds: 16 * 86400 },
    { from: 19, to: 21, tier: 'Prestige', builders: 7, maxUpgradeSeconds: 18 * 86400 },
    { from: 22, to: 24, tier: 'Mythic', builders: 7, maxUpgradeSeconds: 20 * 86400 },
    { from: 25, to: 27, tier: 'Titan', builders: 8, maxUpgradeSeconds: 22 * 86400 },
    { from: 28, to: 30, tier: 'Apex', builders: 8, maxUpgradeSeconds: 25 * 86400 }
  ];

  function tierOf(level) {
    for (var i = 0; i < TIERS.length; i++) {
      if (level >= TIERS[i].from && level <= TIERS[i].to) return TIERS[i];
    }
    return TIERS[TIERS.length - 1];
  }

  // Capacities scale smoothly with TH, per spec section 3.
  function campCapacity(level) {
    return Math.round(20 * Math.pow(400 / 20, (level - 1) / 29));
  }
  function spellCapacity(level) {
    if (level < 5) return 0;
    return Math.round(2 + (15 - 2) * ((level - 5) / 25));
  }
  function storageCap(level) {
    return Math.round(3000 * Math.pow(1.58, level - 1));
  }
  function darkStorageCap(level) {
    if (level < 7) return 0;
    return Math.round(1000 * Math.pow(1.45, level - 7));
  }

  // Continuous versions of the caps. Upgrade prices are quoted as a fraction of
  // the storage you will have when that level unlocks, which keeps every
  // upgrade in the game affordable at the Town Hall that gates it.
  G.capCurve = function (res, thFloat) {
    if (res === 'dark') return Math.max(200, 1000 * Math.pow(1.45, thFloat - 7));
    return 3000 * Math.pow(1.58, thFloat - 1);
  };
  function heroSlots(level) {
    var unlocks = [7, 9, 11, 13, 19, 22, 25, 28];
    var n = 0;
    for (var i = 0; i < unlocks.length; i++) if (level >= unlocks[i]) n++;
    return n;
  }

  // Fold derived values into every entry so the rest of the game can just read.
  TH.forEach(function (t) {
    var tier = tierOf(t.level);
    t.builders = tier.builders;
    t.maxUpgradeSeconds = tier.maxUpgradeSeconds;
    t.campCapacity = campCapacity(t.level);
    t.spellCapacity = spellCapacity(t.level);
    t.storageCap = storageCap(t.level);
    t.darkStorageCap = darkStorageCap(t.level);
    t.wallMaxLevel = t.level;
    t.heroSlots = heroSlots(t.level);
    // Town Hall itself is a building upgrade with its own cost/time.
    t.upgradeCost = Math.round(1000 * Math.pow(1.62, t.level - 2));
    t.upgradeSeconds = Math.min(
      tier.maxUpgradeSeconds,
      Math.round(60 * Math.pow(1.71, t.level - 2))
    );
  });

  G.TOWN_HALLS = TH;
  G.thData = function (level) {
    return TH[Math.max(1, Math.min(30, level)) - 1];
  };
  G.TH_TIERS = TIERS;
})(window.G = window.G || {});
