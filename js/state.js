/* Save state, cost/time curves and the village grid. */
(function (G) {
  'use strict';

  var SAVE_KEY = 'basebuilder.save.v1';
  var GRID = 52;                 // village grid; battles use the spec's 30x30 field
  var MAX_TIME = 25 * 86400;     // spec: upgrade times cap at 25 days

  G.GRID = GRID;

  /* ------------------------------------------------------------- curves */
  // cost(level) = base * 1.62^(level-1)   time(level) = base * 1.71^(level-1)
  function costFor(base, level) {
    return Math.round(base * Math.pow(1.62, level - 1));
  }
  function timeFor(base, level, th) {
    var t = base * Math.pow(1.71, level - 1);
    var tier = G.thData(th || 1);
    return Math.round(Math.min(MAX_TIME, tier.maxUpgradeSeconds, t));
  }
  G.costFor = costFor;
  G.timeFor = timeFor;

  /* -------------------------------------------------------- fresh save */
  function freshState() {
    var s = {
      version: 1,
      createdAt: Date.now(),
      lastTick: Date.now(),
      moderated: false,
      th: 1,
      name: 'New Village',
      resources: { gold: 500, elixir: 500, dark: 0, gems: 250 },
      items: {},
      buildings: [],
      walls: [],
      builders: [],
      labSlots: [],
      research: {},          // troop/spell/siege key -> level
      heroes: {},            // hero key -> { level, upgrading }
      army: {},              // trained troops
      superTroops: {},       // key -> expiry timestamp
      trophies: 0,
      shieldUntil: 0,
      raidLog: [],
      boosts: {},            // potion key -> expiry timestamp
      stats: { raidsWon: 0, raidsLost: 0, goldLooted: 0, elixirLooted: 0, darkLooted: 0, upgradesDone: 0 },
      settings: { instantBuild: false, godMode: false, unlockAll: false }
    };
    G.MAGIC_ITEMS.forEach(function (i) { s.items[i.key] = 0; });
    // Starter kit so a new village has something to click.
    s.items.potion_builder = 1;
    s.items.rune_gold = 1;
    return s;
  }

  /* --------------------------------------------------------- placement */
  // The Town Hall lives in TOWN_HALLS rather than BUILDINGS, so its footprint
  // has to be spelled out here or collision checks would miss a whole ring of
  // its tiles.
  function footprint(key) {
    if (key === 'townhall') return 4;
    var bd = G.buildingData(key);
    return bd ? bd.size : 3;
  }

  function occupied(state, x, y, w, h, ignoreId) {
    if (x < 0 || y < 0 || x + w > GRID || y + h > GRID) return true;
    var i, b;
    for (i = 0; i < state.buildings.length; i++) {
      b = state.buildings[i];
      if (b.id === ignoreId) continue;
      var bw = footprint(b.key);
      if (x < b.x + bw && x + w > b.x && y < b.y + bw && y + h > b.y) return true;
    }
    for (i = 0; i < state.walls.length; i++) {
      var wl = state.walls[i];
      if (wl.id === ignoreId) continue;
      if (x < wl.x + 1 && x + w > wl.x && y < wl.y + 1 && y + h > wl.y) return true;
    }
    return false;
  }

  // Spiral out from the middle of the grid looking for a free footprint.
  function findSpot(state, size) {
    var cx = Math.floor(GRID / 2), cy = Math.floor(GRID / 2);
    for (var ring = 0; ring < GRID; ring++) {
      for (var dx = -ring; dx <= ring; dx++) {
        for (var dy = -ring; dy <= ring; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          var x = cx + dx, y = cy + dy;
          if (!occupied(state, x, y, size, size)) return { x: x, y: y };
        }
      }
    }
    return { x: 0, y: 0 };
  }

  var nextId = 1;
  function uid() { return 'o' + (nextId++) + '_' + Math.random().toString(36).slice(2, 6); }

  function addBuilding(state, key, level) {
    var bd = G.buildingData(key);
    if (!bd) return null;
    var spot = findSpot(state, bd.size);
    var b = { id: uid(), key: key, level: level || 1, x: spot.x, y: spot.y, upgrading: null };
    state.buildings.push(b);
    return b;
  }

  // Walls default to concentric rings around the Town Hall so a fresh layout
  // reads as a base rather than a pile of bricks. Players can drag them after.
  function findWallSpot(state) {
    var th = state.buildings.filter(function (b) { return b.key === 'townhall'; })[0];
    var cx = th ? th.x + 2 : Math.floor(GRID / 2);
    var cy = th ? th.y + 2 : Math.floor(GRID / 2);
    // Rings are spaced 5 apart so there is a 4-tile corridor between them for
    // buildings to sit in.
    for (var r = 5; r < GRID; r += 5) {
      var cells = [], x, y;
      for (x = cx - r; x <= cx + r; x++) { cells.push([x, cy - r]); cells.push([x, cy + r]); }
      for (y = cy - r + 1; y < cy + r; y++) { cells.push([cx - r, y]); cells.push([cx + r, y]); }
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        if (c[0] >= 0 && c[1] >= 0 && c[0] < GRID && c[1] < GRID && !occupied(state, c[0], c[1], 1, 1)) {
          return { x: c[0], y: c[1] };
        }
      }
    }
    return findSpot(state, 1);
  }

  function addWall(state, level) {
    var spot = findWallSpot(state);
    var w = { id: uid(), x: spot.x, y: spot.y, level: level || 1 };
    state.walls.push(w);
    return w;
  }

  /* ------------------------------------------------------- persistence */
  function save(state) {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object' || !s.resources) return null;
      // keep saves from older sessions loadable as data grows
      G.MAGIC_ITEMS.forEach(function (i) { if (s.items[i.key] == null) s.items[i.key] = 0; });
      s.walls = s.walls || [];
      s.raidLog = s.raidLog || [];
      s.boosts = s.boosts || {};
      s.superTroops = s.superTroops || {};
      s.settings = s.settings || { instantBuild: false, godMode: false, unlockAll: false };
      // ids must not collide with newly minted ones
      s.buildings.concat(s.walls).forEach(function (o) {
        var n = parseInt(String(o.id).replace(/^o/, ''), 10);
        if (n >= nextId) nextId = n + 1;
      });
      return s;
    } catch (e) {
      return null;
    }
  }

  function wipe() {
    try { window.localStorage.removeItem(SAVE_KEY); } catch (e) {}
  }

  G.store = {
    SAVE_KEY: SAVE_KEY,
    freshState: freshState,
    save: save,
    load: load,
    wipe: wipe,
    addBuilding: addBuilding,
    addWall: addWall,
    findSpot: findSpot,
    findWallSpot: findWallSpot,
    footprint: footprint,
    occupied: occupied,
    uid: uid
  };
})(window.G = window.G || {});
