# Ascendancy — a base builder

A single-player, offline base-building strategy game in the Clash of Clans mould,
extended to **30 Town Hall levels**, with a wide troop, spell and hero roster and a
moderator panel for setting gems and magic items.

Every name in the game is original, so nothing here depends on another publisher's IP.

Open `index.html` in a browser. There is no build step, no server and no network
access — progress saves to `localStorage` and continues where you left off,
including resources earned while the tab was closed.

---

## What is in it

### One design per level, not per tier

Nothing in this game shares a model between levels:

- **Buildings** have **30 designs each** — one per Town Hall level. A level 4
  Cannon is timber and river stone; a level 18 Cannon is pale ashlar with gold
  ribs; a level 29 Cannon is dark composite with a lit core.
- **Walls** have 30 designs, cut from the *same materials* as buildings at that
  level, so the wall you are standing behind always matches the base behind it.
- **Troops** have **25 designs each** — one per research level. Same silhouette,
  better kit: a helmet replaces the cap, then pauldrons, then a lit sigil.
- **Heroes** share a design every 4 levels across their 100-level climb.

The materials are five anchor eras — Timber &amp; Thatch, Cut Stone &amp; Steel,
Gilded Masonry, Arcane Alloy, Ascendant Core — blended continuously in
`js/data/themes.js`, with a small deterministic nudge per level so no two
levels share a palette. Ornament density rises with level too: rivets, trim
bands, banners, lit windows and orbit rings all scale in.

Because the game and the renderer read the same table, the sprite you see is
always the design the UI says you have. Upgrade dialogs show the current design
next to the one you are buying, and the Town Halls tab shows the matching
wall, buildings and troop kit for every level.

### Thirty distinct Town Halls
Each Town Hall level is its own identity rather than the same building with a
bigger number on it:

| | |
|---|---|
| **Name and lore** | Thatch Post, Iron Keep, Obsidian Seat, Golden Ziggurat, Prism Cathedral, Voidhold, Singularity Ark, Apex Ascendancy… |
| **Colour palette** | 30 hand-picked palettes (sky, ground, panel, accent, glow, roof, stone, wall). The **entire interface re-skins** to the palette of the Town Hall you are sitting in. |
| **Architecture** | A different 3D model per level — cottages, keeps, colonnades, monoliths, forges, spires, ziggurats, nexuses, orbital halls, shield crowns — varying in body, roof, tower count, banners, terraces, orbit rings and floating orbs. |
| **Wall skin** | Wall level tracks Town Hall level, and each of the 30 levels has its own named skin, from Wooden Palisade to Ascendant. |

The **Town Halls** tab is a gallery of all 30 with their palettes, design
descriptors and unlock lists.

### A dedicated Laboratory
One hall for every kind of upgrade, in five tabs:

- **Walls** — bulk upgrade 1 / 10 / 50 / as-much-as-your-gold-allows. Always
  takes the lowest-level segments first. Shows the cost to max every segment.
- **Buildings** — every building you own, grouped and sorted by level, upgraded
  in place. These consume Builders.
- **Troops**, **Spells**, **Siege** — research that occupies the Laboratory's
  research slots (you gain a slot every 10 Town Hall levels). Super troop
  activation lives here too, from Town Hall 11.

### A dedicated Hero Hall
Eight heroes — Vanguard, Huntress, Warden, Champion, Oracle, Ironclad, Seer and
Ascendant — each with an ability, a resource, two **equipment** slots forged in
the Blacksmith, and a **pet** from the Pet House. The Hall trains heroes on its
own queue rather than consuming Builders, and gains a concurrent training slot
every 12 Town Hall levels.

### Everything else from the spec
- **Economy** — Gold, Elixir, Dark Elixir, Gems and Magic Items, with storage
  caps, collectors that run while you are away, and real-time upgrade timers.
- **Village** — a draggable layout on a 52×52 grid, in either the Clash-style
  isometric board or a flat 2D board (toggle on the Village screen); the
  buildings are the same 3D renders either way. New wall
  segments lay themselves out as concentric rings around the Town Hall.
- **Raids** — resolved by power comparison (spec's build option A): your army,
  hero levels, research and brewed spells against a target rated at what a real
  base of that Town Hall would field. Stars, destruction, loot scaled by the
  Town Hall gap, trophies, and offline defenses that grant a shield after heavy
  losses.
- **Magic items** — Hammers, Runes, Books, Potions and Ore, all usable.
- **Moderator panel** — hidden until you long-press the Town Hall badge (or
  press <kbd>Shift</kbd>+<kbd>M</kbd>): set gems, set any magic item count, set
  resources, jump to any Town Hall, instant build, unlock all, god-mode raids.
  Any use flags the save file, exactly as the spec asks.

---

## Balance

Two rules keep 30 levels of progression coherent:

1. **Prices are quoted as a share of the storage you will own when that level
   unlocks.** Buildings, research, heroes and walls all derive their cost from
   the storage-capacity curve, so no upgrade is ever priced above the storages
   that gate it. `tools/` includes the audit that checks this for all 30 levels.
2. **Raid targets are rated by simulation, not by a hand-tuned curve.** A
   target's defense rating is computed from what a fully built base at that
   Town Hall would actually field, so difficulty tracks progression by
   construction.

A maxed army against a same-Town-Hall target lands roughly 50–90% destruction
across the whole progression.

---

## Art pipeline

All sprites are **procedurally modelled in Blender from primitives, in code** —
no downloaded models, so the entire asset set is original.

```bash
pip install bpy==5.0.1
node tools/export_data.js > tools/gamedata.json   # game tables -> JSON
python tools/render_sprites.py                    # -> assets/sprites/*.png
```

`render_sprites.py` builds each asset from boxes, cylinders, cones and tori,
bevels everything for a chunky stylised read, lights it with a warm key, a cool
fill and a rim, and renders it with Cycles through a **true 2:1 isometric
orthographic camera at 64px per village tile** — so a rendered footprint lines
up exactly with the CSS diamond grid. Each model is auto-scaled to its tile
footprint and framed from its own bounding box.

The renderer writes `assets/sprites/sprites.json` and `js/sprites-manifest.js`,
recording where world origin lands in every image. The game pins sprites to
tiles by that anchor, which is also how level badges and build-timer clocks know
where a building's base is.

~2,500 sprites: 30 Town Halls, 50 buildings x 30 levels, 30 wall levels,
28 troops and 8 heroes x 25 levels, siege machines and a ground tile. If a sprite is missing the game falls back to the vector art in
`js/art.js`, so it still runs with no assets at all.

---

## Layout

```
index.html               entry point, loads everything in order
css/style.css            theming; palette variables are rewritten per Town Hall
js/data/townhalls.js     30 Town Halls: palettes, designs, capacities, unlocks
js/data/buildings.js     buildings, defenses, traps, wall skins
js/data/army.js          troops, dark troops, siege, spells, heroes, pets, items
js/art.js                procedural SVG fallback art
js/sprites.js            sprite lookup + isometric projection helpers
js/sprites-manifest.js   generated sprite manifest
js/state.js              save/load, the grid, placement, cost curves
js/engine.js             all game rules
js/ui.js                 shell: theming, nav, toasts, modals
js/screens/*.js          one file per screen
js/main.js               boot, game clock, autosave, moderator gesture
tools/                   Blender renderer and data export
```

Screens register themselves with `G.ui.register()`, so adding one is a single
file; the engine never touches the DOM and the UI never mutates state except
through `G.engine`.
