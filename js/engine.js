/* Game rules: economy, builders, laboratory, hero hall, army, raids,
   magic items, gems and the moderator panel. */
(function (G) {
  'use strict';

  var HOUR = 3600;
  var engine = {};
  var listeners = [];

  function emit() { listeners.forEach(function (fn) { fn(); }); }
  engine.onChange = function (fn) { listeners.push(fn); };

  /* --------------------------------------------------------- lifecycle */
  function newGame() {
    var s = G.store.freshState();
    // Town Hall is a real object on the grid with its own entry.
    var mid = Math.floor(G.GRID / 2) - 2;
    s.buildings.push({ id: G.store.uid(), key: 'townhall', level: 1, x: mid, y: mid, upgrading: null });
    G.store.addBuilding(s, 'goldmine');
    G.store.addBuilding(s, 'elixircollector');
    G.store.addBuilding(s, 'goldstorage');
    G.store.addBuilding(s, 'elixirstorage');
    G.store.addBuilding(s, 'barracks');
    G.store.addBuilding(s, 'cannon');
    G.store.addBuilding(s, 'cannon');
    syncBuilders(s);
    syncLabSlots(s);
    return s;
  }

  // The Town Hall is not in BUILDINGS (its data lives in TOWN_HALLS), so give
  // lookups a shim with the same shape.
  var TOWNHALL_SHIM = { key: 'townhall', name: 'Town Hall', cat: 'townhall', art: 'herohall', res: 'gold', size: 4 };
  function bdata(key) {
    if (key === 'townhall') return TOWNHALL_SHIM;
    return G.buildingData(key);
  }
  engine.bdata = bdata;

  function townHallBuilding(s) {
    for (var i = 0; i < s.buildings.length; i++) if (s.buildings[i].key === 'townhall') return s.buildings[i];
    return null;
  }
  engine.townHallBuilding = townHallBuilding;

  /* ---------------------------------------------------------- builders */
  function syncBuilders(s) {
    var want = G.thData(s.th).builders + (s.extraBuilders || 0);
    while (s.builders.length < want) s.builders.push({ id: 'b' + (s.builders.length + 1), job: null });
    // never remove a builder that already exists (gem-bought ones persist)
  }
  function syncLabSlots(s) {
    var want = 1 + Math.floor(s.th / 10);
    while (s.labSlots.length < want) s.labSlots.push({ id: 'l' + (s.labSlots.length + 1), job: null });
  }
  function freeBuilder(s) {
    for (var i = 0; i < s.builders.length; i++) if (!s.builders[i].job) return s.builders[i];
    return null;
  }
  function freeLabSlot(s) {
    for (var i = 0; i < s.labSlots.length; i++) if (!s.labSlots[i].job) return s.labSlots[i];
    return null;
  }
  engine.freeBuilder = freeBuilder;
  engine.freeLabSlot = freeLabSlot;
  engine.busyBuilders = function (s) {
    return s.builders.filter(function (b) { return b.job; }).length;
  };

  /* --------------------------------------------------------- resources */
  // What your storages actually hold.
  //
  // The Town Hall curve is the ceiling for your level; how much of it you get
  // depends on the storages you have built and how far you have upgraded them.
  // A quarter comes from the Town Hall's own vault, so a village with no
  // storages still works; the rest is earned. Build and upgrade every storage
  // your Town Hall allows and you reach the full curve -- which is the number
  // every price in the game is quoted against.
  var STORAGE_FOR = { gold: 'goldstorage', elixir: 'elixirstorage', dark: 'darkstorage' };
  var TOWN_HALL_SHARE = 0.5;

  function storageFraction(s, res) {
    var key = STORAGE_FOR[res];
    var allowed = G.allowedCount(key, s.th);
    if (!allowed) return 1;                       // nothing to build yet
    var maxLvl = Math.max(1, G.buildingMaxLevel(key, s.th));
    var built = 0;
    s.buildings.forEach(function (b) {
      if (b.key !== key) return;
      // Standing it up is most of the win; upgrading it is the rest. Weighted
      // this way because prices are quoted against the full curve, and a
      // player who has built their storages but not yet maxed them should
      // still be able to afford what their Town Hall unlocked.
      built += 0.5 + 0.5 * Math.min(1, b.level / maxLvl);
    });
    var frac = Math.min(1, built / allowed);
    return TOWN_HALL_SHARE + (1 - TOWN_HALL_SHARE) * frac;
  }
  engine.storageFraction = storageFraction;

  function caps(s) {
    var th = G.thData(s.th);
    return {
      gold: Math.round(th.storageCap * storageFraction(s, 'gold')),
      elixir: Math.round(th.storageCap * storageFraction(s, 'elixir')),
      dark: Math.round(th.darkStorageCap * storageFraction(s, 'dark'))
    };
  }
  engine.caps = caps;

  function boostActive(s, key) {
    return (s.boosts[key] || 0) > Date.now();
  }
  engine.boostActive = boostActive;

  function productionPerHour(s) {
    var out = { gold: 0, elixir: 0, dark: 0 };
    s.buildings.forEach(function (b) {
      var bd = bdata(b.key);
      if (!bd || !bd.produces || b.upgrading) return;
      Object.keys(bd.produces).forEach(function (res) {
        out[res] += bd.produces[res] * Math.pow(1.46, b.level - 1);
      });
    });
    var mult = 1;
    if (boostActive(s, 'potion_resource')) mult *= 10;
    if (boostActive(s, 'clocktower')) mult *= 8;
    out.gold = Math.round(out.gold * mult);
    out.elixir = Math.round(out.elixir * mult);
    out.dark = Math.round(out.dark * mult * 10) / 10;
    return out;
  }
  engine.productionPerHour = productionPerHour;

  function addResource(s, res, amount) {
    var c = caps(s);
    s.resources[res] = Math.max(0, Math.min(c[res] != null ? c[res] : Infinity, (s.resources[res] || 0) + amount));
  }
  engine.addResource = addResource;

  function canAfford(s, res, amount) {
    return (s.resources[res] || 0) >= amount;
  }
  function spend(s, res, amount) {
    if (!canAfford(s, res, amount)) return false;
    s.resources[res] -= amount;
    return true;
  }
  engine.canAfford = canAfford;
  engine.spend = spend;

  /* ------------------------------------------------------ speed & time */
  function buildSpeed(s) {
    var m = 1;
    if (boostActive(s, 'potion_builder')) m *= 10;
    if (boostActive(s, 'clocktower')) m *= 8;
    return m;
  }
  function researchSpeed(s) {
    var m = 1;
    if (boostActive(s, 'potion_research')) m *= 24;
    if (boostActive(s, 'clocktower')) m *= 8;
    return m;
  }
  engine.buildSpeed = buildSpeed;
  engine.researchSpeed = researchSpeed;

  function gemsToSkip(secondsLeft) {
    if (secondsLeft <= 0) return 0;
    if (secondsLeft <= 60) return 1;
    return Math.max(1, Math.round(Math.pow(secondsLeft, 0.62) / 7));
  }
  engine.gemsToSkip = gemsToSkip;

  /* -------------------------------------------------- upgrade costings */
  // Prices are quoted as a share of the storage you will own when that level
  // becomes available, so nothing in the game is ever priced above the
  // storages that gate it. The per-category weights keep a Gold Mine cheaper
  // than an Inferno Tower at the same Town Hall.
  var COST_WEIGHT = { resource: 0.16, army: 0.22, defense: 0.20, trap: 0.07, townhall: 0.5 };

  function buildingCost(s, key, level) {
    if (key === 'townhall') return G.thData(level).upgradeCost;
    var bd = bdata(key);
    var thAt = bd.unlockTH + level - 2;
    var weight = COST_WEIGHT[bd.cat] || 0.2;
    return Math.max(50, Math.round(weight * G.capCurve(bd.res, thAt)));
  }
  function buildingSeconds(s, key, level) {
    if (key === 'townhall') return G.thData(level).upgradeSeconds;
    var bd = bdata(key);
    return G.timeFor(bd.baseTime, level, s.th);
  }
  function buildingResource(key) {
    if (key === 'townhall') return 'gold';
    return bdata(key).res;
  }
  engine.buildingCost = buildingCost;
  engine.buildingSeconds = buildingSeconds;
  engine.buildingResource = buildingResource;

  function maxLevelFor(s, key) {
    if (key === 'townhall') return 30;
    return G.buildingMaxLevel(key, s.th);
  }
  engine.maxLevelFor = maxLevelFor;

  /* ------------------------------------------------------- build & buy */
  function ownedCount(s, key) {
    return s.buildings.filter(function (b) { return b.key === key; }).length;
  }
  engine.ownedCount = ownedCount;

  function canBuild(s, key) {
    var allowed = G.allowedCount(key, s.th);
    return ownedCount(s, key) < allowed;
  }
  engine.canBuild = canBuild;

  function buildNew(s, key) {
    if (!canBuild(s, key)) return { ok: false, why: 'Not available at Town Hall ' + s.th };
    var builder = freeBuilder(s);
    if (!builder && !s.settings.instantBuild) return { ok: false, why: 'All builders are busy' };
    var res = buildingResource(key), cost = buildingCost(s, key, 1);
    if (!canAfford(s, res, cost)) return { ok: false, why: 'Not enough ' + res };
    spend(s, res, cost);
    var b = G.store.addBuilding(s, key, 1);
    if (s.settings.instantBuild) {
      s.stats.upgradesDone++;
      return { ok: true, building: b };
    }
    var secs = buildingSeconds(s, key, 1);
    b.upgrading = { from: 0, to: 1, ends: Date.now() + secs * 1000 / buildSpeed(s), total: secs };
    builder.job = { type: 'building', targetId: b.id };
    return { ok: true, building: b };
  }
  engine.buildNew = buildNew;

  function startUpgrade(s, buildingId) {
    var b = s.buildings.filter(function (x) { return x.id === buildingId; })[0];
    if (!b) return { ok: false, why: 'No such building' };
    if (b.upgrading) return { ok: false, why: 'Already upgrading' };
    var next = b.level + 1;
    if (b.key === 'townhall') {
      if (next > 30) return { ok: false, why: 'Town Hall 30 is the summit' };
    } else if (next > maxLevelFor(s, b.key)) {
      return { ok: false, why: 'Needs a higher Town Hall' };
    }
    var builder = freeBuilder(s);
    if (!builder && !s.settings.instantBuild) return { ok: false, why: 'All builders are busy' };
    var res = buildingResource(b.key), cost = buildingCost(s, b.key, next);
    if (!canAfford(s, res, cost)) return { ok: false, why: 'Not enough ' + res };
    spend(s, res, cost);
    if (s.settings.instantBuild) {
      applyLevel(s, b, next);
      return { ok: true };
    }
    var secs = buildingSeconds(s, b.key, next);
    b.upgrading = { from: b.level, to: next, ends: Date.now() + secs * 1000 / buildSpeed(s), total: secs };
    builder.job = { type: 'building', targetId: b.id };
    return { ok: true };
  }
  engine.startUpgrade = startUpgrade;

  function applyLevel(s, b, level) {
    b.level = level;
    b.upgrading = null;
    s.stats.upgradesDone++;
    if (b.key === 'townhall') {
      s.th = level;
      syncBuilders(s);
      syncLabSlots(s);
    }
  }

  function finishBuilding(s, b) {
    if (!b.upgrading) return;
    applyLevel(s, b, b.upgrading.to);
    s.builders.forEach(function (bl) {
      if (bl.job && bl.job.targetId === b.id) bl.job = null;
    });
  }
  engine.finishBuilding = finishBuilding;

  /* -------------------------------------------------------------- walls */
  function wallMax(s) { return G.WALL.maxLevelAt(s.th); }
  engine.wallMax = wallMax;

  // Walls are the gold sink of the late game, but priced so a full ring stays
  // reachable rather than absurd.
  function wallCost(level) {
    return Math.round(G.WALL.baseCost * Math.pow(G.WALL.costGrowth, level - 1));
  }
  engine.wallCost = wallCost;

  function buyWall(s) {
    var allowed = G.WALL.countAt(s.th);
    if (s.walls.length >= allowed) return { ok: false, why: 'Wall limit reached for Town Hall ' + s.th };
    var cost = wallCost(1);
    if (!spend(s, 'gold', cost)) return { ok: false, why: 'Not enough gold' };
    G.store.addWall(s, 1);
    return { ok: true };
  }
  engine.buyWall = buyWall;

  // Walls upgrade instantly for gold — no builder, which is why bulk upgrades
  // from the Laboratory are the sane way to handle hundreds of segments.
  function upgradeWalls(s, count) {
    var max = wallMax(s);
    var sorted = s.walls.slice().sort(function (a, b) { return a.level - b.level; });
    var done = 0, spent = 0;
    for (var i = 0; i < sorted.length && done < count; i++) {
      var w = sorted[i];
      if (w.level >= max) continue;
      var cost = wallCost(w.level + 1);
      if (!canAfford(s, 'gold', cost)) break;
      spend(s, 'gold', cost);
      w.level++;
      spent += cost;
      done++;
      s.stats.upgradesDone++;
    }
    return { ok: done > 0, done: done, spent: spent, why: done ? null : 'Not enough gold, or every wall is maxed' };
  }
  engine.upgradeWalls = upgradeWalls;

  engine.wallSummary = function (s) {
    var byLevel = {};
    s.walls.forEach(function (w) { byLevel[w.level] = (byLevel[w.level] || 0) + 1; });
    return byLevel;
  };

  /* -------------------------------------------------------- laboratory */
  function labUnlocked(s) { return ownedCount(s, 'laboratory') > 0; }
  engine.labUnlocked = labUnlocked;

  function researchLevel(s, key) { return s.research[key] || 0; }
  engine.researchLevel = researchLevel;

  function researchTarget(key) {
    return G.troopData[key] || G.spellData[key] || G.siegeData[key] || null;
  }
  engine.researchTarget = researchTarget;

  function researchMax(s, key) {
    var t = researchTarget(key);
    if (!t) return 0;
    return G.researchMaxLevel(t.unlockTH, s.th);
  }
  engine.researchMax = researchMax;

  function researchCost(s, key, level) {
    var t = researchTarget(key);
    var thAt = t.unlockTH + level - 2;
    return Math.max(200, Math.round(0.35 * G.capCurve(t.res || 'elixir', thAt)));
  }
  function researchSeconds(s, key, level) {
    var t = researchTarget(key);
    return Math.round(Math.min(25 * 86400, t.labTime * Math.pow(1.71, Math.max(0, level - 2))));
  }
  engine.researchCost = researchCost;
  engine.researchSeconds = researchSeconds;

  function startResearch(s, key) {
    var t = researchTarget(key);
    if (!t) return { ok: false, why: 'Unknown research' };
    if (s.th < t.unlockTH) return { ok: false, why: 'Unlocks at Town Hall ' + t.unlockTH };
    if (!labUnlocked(s)) return { ok: false, why: 'Build the Laboratory first' };
    var cur = researchLevel(s, key);
    var next = cur + 1;
    if (next > researchMax(s, key)) return { ok: false, why: 'Laboratory needs a higher Town Hall' };
    var already = s.labSlots.some(function (sl) { return sl.job && sl.job.key === key; });
    if (already) return { ok: false, why: 'Already in the lab' };
    var slot = freeLabSlot(s);
    if (!slot && !s.settings.instantBuild) return { ok: false, why: 'Laboratory is busy' };
    var res = t.res || 'elixir';
    var cost = researchCost(s, key, next);
    if (!canAfford(s, res, cost)) return { ok: false, why: 'Not enough ' + res };
    spend(s, res, cost);
    if (s.settings.instantBuild) {
      s.research[key] = next;
      s.stats.upgradesDone++;
      return { ok: true };
    }
    var secs = researchSeconds(s, key, next);
    slot.job = { key: key, to: next, ends: Date.now() + secs * 1000 / researchSpeed(s), total: secs };
    return { ok: true };
  }
  engine.startResearch = startResearch;

  function finishResearch(s, slot) {
    if (!slot.job) return;
    s.research[slot.job.key] = slot.job.to;
    s.stats.upgradesDone++;
    slot.job = null;
  }

  /* --------------------------------------------------------- hero hall */
  function heroHallLevel(s) {
    var h = s.buildings.filter(function (b) { return b.key === 'herohall'; })[0];
    return h ? h.level : 0;
  }
  engine.heroHallLevel = heroHallLevel;

  function heroState(s, key) {
    if (!s.heroes[key]) s.heroes[key] = { level: 0, upgrading: null, equipment: [], pet: null };
    return s.heroes[key];
  }
  engine.heroState = heroState;

  function heroUnlocked(s, key) {
    var h = G.heroData[key];
    return !!h && s.th >= h.unlockTH && heroHallLevel(s) > 0;
  }
  engine.heroUnlocked = heroUnlocked;

  function heroCost(key, level) {
    var h = G.heroData[key];
    // A hero gains 6 levels of headroom per Town Hall, so price level L against
    // the storage available at the Town Hall that unlocks it.
    var thAt = h.unlockTH + (level - 10) / 6;
    return Math.max(100, Math.round(0.3 * G.capCurve(h.res, thAt)));
  }
  function heroSeconds(s, key, level) {
    var h = G.heroData[key];
    return Math.round(Math.min(25 * 86400, h.baseTime * Math.pow(1.12, Math.max(0, level - 1))));
  }
  engine.heroCost = heroCost;
  engine.heroSeconds = heroSeconds;

  function heroSlotsBusy(s) {
    return Object.keys(s.heroes).filter(function (k) { return s.heroes[k].upgrading; }).length;
  }
  function heroSlotsTotal(s) { return 1 + Math.floor(s.th / 12); }
  engine.heroSlotsBusy = heroSlotsBusy;
  engine.heroSlotsTotal = heroSlotsTotal;

  function upgradeHero(s, key) {
    var h = G.heroData[key];
    if (!h) return { ok: false, why: 'Unknown hero' };
    if (!heroUnlocked(s, key)) return { ok: false, why: 'Hero Hall unlocks ' + h.name + ' at Town Hall ' + h.unlockTH };
    var hs = heroState(s, key);
    if (hs.upgrading) return { ok: false, why: 'Already training' };
    var next = hs.level + 1;
    if (next > G.heroMaxLevel(key, s.th)) return { ok: false, why: 'Needs a higher Town Hall' };
    if (heroSlotsBusy(s) >= heroSlotsTotal(s) && !s.settings.instantBuild) {
      return { ok: false, why: 'The Hero Hall can only train ' + heroSlotsTotal(s) + ' hero(es) at once' };
    }
    var cost = heroCost(key, next);
    if (!canAfford(s, h.res, cost)) return { ok: false, why: 'Not enough ' + h.res };
    spend(s, h.res, cost);
    if (s.settings.instantBuild) {
      hs.level = next;
      s.stats.upgradesDone++;
      return { ok: true };
    }
    var secs = heroSeconds(s, key, next);
    hs.upgrading = { to: next, ends: Date.now() + secs * 1000 / buildSpeed(s), total: secs };
    return { ok: true };
  }
  engine.upgradeHero = upgradeHero;

  function equipmentUnlocked(s, eqKey) {
    var e = G.equipmentData[eqKey];
    return !!e && s.th >= e.unlockTH && ownedCount(s, 'blacksmith') > 0;
  }
  engine.equipmentUnlocked = equipmentUnlocked;

  function toggleEquipment(s, heroKey, eqKey) {
    var hs = heroState(s, heroKey);
    var i = hs.equipment.indexOf(eqKey);
    if (i >= 0) { hs.equipment.splice(i, 1); return { ok: true }; }
    if (!equipmentUnlocked(s, eqKey)) return { ok: false, why: 'Forge it in the Blacksmith first' };
    if (hs.equipment.length >= 2) return { ok: false, why: 'Only 2 equipment slots per hero' };
    hs.equipment.push(eqKey);
    return { ok: true };
  }
  engine.toggleEquipment = toggleEquipment;

  function assignPet(s, heroKey, petKey) {
    if (ownedCount(s, 'pethouse') === 0) return { ok: false, why: 'Build the Pet House first' };
    var p = G.petData[petKey];
    if (p && s.th < p.unlockTH) return { ok: false, why: 'Unlocks at Town Hall ' + p.unlockTH };
    // one pet may only serve one hero
    Object.keys(s.heroes).forEach(function (k) {
      if (k !== heroKey && s.heroes[k].pet === petKey) s.heroes[k].pet = null;
    });
    var hs = heroState(s, heroKey);
    hs.pet = hs.pet === petKey ? null : petKey;
    return { ok: true };
  }
  engine.assignPet = assignPet;

  /* -------------------------------------------------------------- army */
  function campCapacity(s) {
    var th = G.thData(s.th);
    var camps = s.buildings.filter(function (b) { return b.key === 'armycamp'; });
    // Before the first Army Camp exists you can still muster a starting squad.
    if (!camps.length) return Math.min(20, th.campCapacity);
    var allowed = G.allowedCount('armycamp', s.th) || 1;
    var levelShare = camps.reduce(function (a, c) { return a + c.level; }, 0);
    var maxShare = allowed * Math.max(1, G.buildingMaxLevel('armycamp', s.th));
    return Math.max(10, Math.round(th.campCapacity * Math.min(1, (camps.length / allowed) * 0.5 + (levelShare / maxShare) * 0.5)));
  }
  engine.campCapacity = campCapacity;

  function armyUsed(s) {
    return Object.keys(s.army).reduce(function (a, k) {
      var t = G.troopData[k];
      return a + (t ? t.housing * s.army[k] : 0);
    }, 0);
  }
  engine.armyUsed = armyUsed;

  // The best level you own of a building, which is what gates troops: two
  // level 3 Barracks unlock what one level 3 Barracks unlocks.
  function bestLevel(s, key) {
    var best = 0;
    s.buildings.forEach(function (b) {
      if (b.key === key && b.level > best) best = b.level;
    });
    return best;
  }
  engine.bestLevel = bestLevel;

  function troopUnlocked(s, key) {
    var t = G.troopData[key];
    if (!t) return false;
    if (s.th < t.unlockTH) return false;
    return bestLevel(s, t.barracks) >= t.barracksLevel;
  }
  engine.troopUnlocked = troopUnlocked;

  // Why a troop is locked, in the words the player needs to act on.
  function troopBlockedBy(s, key) {
    var t = G.troopData[key];
    if (!t) return 'Unknown troop';
    if (s.th < t.unlockTH) return 'Town Hall ' + t.unlockTH;
    var have = bestLevel(s, t.barracks);
    var name = t.barracks === 'darkbarracks' ? 'Dark Barracks' : 'Barracks';
    if (have === 0) return 'Build a ' + name;
    if (have < t.barracksLevel) return name + ' level ' + t.barracksLevel;
    return '';
  }
  engine.troopBlockedBy = troopBlockedBy;

  // Training costs nothing. Camp space is the only limit on an army, so the
  // resources you collect go into upgrading the base rather than into
  // rebuilding the same army after every raid.
  function troopCost() {
    return 0;
  }
  engine.troopCost = troopCost;

  function trainTroop(s, key, n) {
    n = n || 1;
    var t = G.troopData[key];
    if (!troopUnlocked(s, key)) return { ok: false, why: 'Not unlocked yet' };
    var trained = 0;
    for (var i = 0; i < n; i++) {
      if (armyUsed(s) + t.housing > campCapacity(s)) break;
      s.army[key] = (s.army[key] || 0) + 1;
      trained++;
    }
    if (!trained) return { ok: false, why: 'No camp space left' };
    return { ok: true, trained: trained };
  }
  engine.trainTroop = trainTroop;

  function clearArmy(s) { s.army = {}; }
  engine.clearArmy = clearArmy;

  /* ------------------------------------------------------------ spells */
  function spellsOf(s) {
    if (!s.spellsBrewed) s.spellsBrewed = {};
    return s.spellsBrewed;
  }
  engine.spellsOf = spellsOf;

  function spellCapacity(s) {
    if (ownedCount(s, 'spellfactory') === 0) return 0;
    return G.thData(s.th).spellCapacity;
  }
  engine.spellCapacity = spellCapacity;

  function spellSlotsUsed(s) {
    var brewed = spellsOf(s);
    return Object.keys(brewed).reduce(function (a, k) {
      var sp = G.spellData[k];
      return a + (sp ? sp.slots * brewed[k] : 0);
    }, 0);
  }
  engine.spellSlotsUsed = spellSlotsUsed;

  function spellUnlocked(s, key) {
    var sp = G.spellData[key];
    if (!sp) return false;
    if (s.th < sp.unlockTH) return false;
    return ownedCount(s, sp.res === 'dark' ? 'darkspellfactory' : 'spellfactory') > 0;
  }
  engine.spellUnlocked = spellUnlocked;

  function spellCost(s, key) {
    var sp = G.spellData[key];
    var lvl = Math.max(1, researchLevel(s, key));
    return Math.round((sp.res === 'dark' ? 120 : 12000) * Math.pow(1.15, lvl - 1));
  }
  engine.spellCost = spellCost;

  function brewSpell(s, key, n) {
    n = n || 1;
    var sp = G.spellData[key];
    if (!spellUnlocked(s, key)) return { ok: false, why: 'Build the matching Spell Factory first' };
    var made = 0;
    var brewed = spellsOf(s);
    for (var i = 0; i < n; i++) {
      if (spellSlotsUsed(s) + sp.slots > spellCapacity(s)) break;
      var cost = spellCost(s, key);
      if (!canAfford(s, sp.res, cost)) break;
      spend(s, sp.res, cost);
      brewed[key] = (brewed[key] || 0) + 1;
      made++;
    }
    if (!made) return { ok: false, why: 'No spell slots or not enough ' + sp.res };
    return { ok: true, made: made };
  }
  engine.brewSpell = brewSpell;

  function clearSpells(s) { s.spellsBrewed = {}; }
  engine.clearSpells = clearSpells;

  function activateSuperTroop(s, baseKey) {
    var t = G.troopData[baseKey];
    if (!t) return { ok: false, why: 'Unknown troop' };
    if (s.th < 11) return { ok: false, why: 'Super troops unlock at Town Hall 11' };
    if (researchLevel(s, baseKey) < 3) return { ok: false, why: 'Research ' + t.name + ' to level 3 first' };
    var cost = 25000;
    if (!canAfford(s, 'dark', cost)) return { ok: false, why: 'Needs ' + cost.toLocaleString() + ' dark elixir' };
    spend(s, 'dark', cost);
    s.superTroops[baseKey] = Date.now() + 3 * 86400 * 1000;
    return { ok: true };
  }
  engine.activateSuperTroop = activateSuperTroop;

  /* -------------------------------------------------------------- raid */
  // Version A of the spec: raids resolve by power comparison rather than a
  // live battle, but with enough texture to read like a real attack report.
  function armyPower(s) {
    var troopPower = 0;
    Object.keys(s.army).forEach(function (k) {
      var t = G.troopData[k];
      if (!t) return;
      var lvl = Math.max(1, researchLevel(s, k));
      var mult = Math.pow(1.15, lvl - 1) * (s.superTroops[k] > Date.now() ? 1.5 : 1);
      troopPower += (t.dps * 6 + t.hp * 0.5) * mult * s.army[k];
    });
    var heroPower = 0;
    Object.keys(s.heroes).forEach(function (k) {
      var h = G.heroData[k], hs = s.heroes[k];
      if (!h || !hs.level) return;
      // Each hero's gear boosts that hero, not the whole army.
      heroPower += (h.dps * 6 + h.hp * 0.5) * Math.pow(1.04, hs.level - 1) *
        (1 + hs.equipment.length * 0.06 + (hs.pet ? 0.08 : 0));
    });
    var power = troopPower + heroPower;
    // Spells are a bounded force multiplier, not a stacking exponent.
    var brewed = s.spellsBrewed || {};
    var spellBonus = 0;
    Object.keys(brewed).forEach(function (k) {
      var sp = G.spellData[k];
      if (!sp) return;
      var lvl = Math.max(1, researchLevel(s, k));
      spellBonus += (0.03 + lvl * 0.004) * sp.slots * brewed[k];
    });
    power *= 1 + Math.min(0.6, spellBonus);
    if (boostActive(s, 'potion_power')) power *= 1.35;
    return Math.round(power);
  }
  engine.armyPower = armyPower;

  function defensePower(s) {
    var power = 0;
    s.buildings.forEach(function (b) {
      var bd = bdata(b.key);
      if (!bd) return;
      if (bd.cat === 'defense') power += ((bd.dps || 0) * 2 + (bd.hp || 0) * 0.15) * Math.pow(1.16, b.level - 1);
      else if (bd.cat === 'trap') power += 40 * Math.pow(1.15, b.level - 1);
    });
    s.walls.forEach(function (w) { power += 3 * Math.pow(1.12, w.level - 1); });
    return Math.round(power);
  }
  engine.defensePower = defensePower;

  // What a fully built base at a given Town Hall would field. Used to rate
  // raid targets and offline attackers, so difficulty tracks progression
  // instead of a hand-waved curve.
  function expectedDefensePower(th) {
    var power = 0;
    G.BUILDINGS.forEach(function (bd) {
      var n = G.allowedCount(bd.key, th);
      if (!n) return;
      var lvl = G.buildingMaxLevel(bd.key, th);
      if (bd.cat === 'defense') power += n * ((bd.dps || 0) * 2 + (bd.hp || 0) * 0.15) * Math.pow(1.16, lvl - 1);
      else if (bd.cat === 'trap') power += n * 40 * Math.pow(1.15, lvl - 1);
    });
    power += G.WALL.countAt(th) * 3 * Math.pow(1.12, G.WALL.maxLevelAt(th) - 1);
    return Math.round(power);
  }
  engine.expectedDefensePower = expectedDefensePower;

  function generateTarget(s, difficulty) {
    var thDelta = difficulty === 'easy' ? -1 : difficulty === 'hard' ? 1 : 0;
    var targetTH = Math.max(1, Math.min(30, s.th + thDelta));
    var t = G.thData(targetTH);
    var basePower = Math.max(120, expectedDefensePower(targetTH));
    var variance = difficulty === 'easy' ? 0.55 + Math.random() * 0.25
      : difficulty === 'hard' ? 1.0 + Math.random() * 0.35
      : 0.75 + Math.random() * 0.35;
    var namePool = ['Redhollow', 'Ashfen', 'Crownmoor', 'Vellstead', 'Grimwatch', 'Duskmere',
      'Ironvale', 'Saltcairn', 'Thornrest', 'Highbarrow', 'Nullreach', 'Emberfall'];
    return {
      name: namePool[Math.floor(Math.random() * namePool.length)] + ' ' + (100 + Math.floor(Math.random() * 899)),
      th: targetTH,
      thName: t.name,
      power: Math.round(basePower * variance),
      loot: {
        gold: Math.round(t.storageCap * (0.05 + Math.random() * 0.12)),
        elixir: Math.round(t.storageCap * (0.05 + Math.random() * 0.12)),
        dark: Math.round(t.darkStorageCap * (0.04 + Math.random() * 0.1))
      }
    };
  }
  engine.generateTarget = generateTarget;

  function raid(s, target) {
    var power = armyPower(s);
    if (s.settings.godMode) power *= 1000;
    if (armyUsed(s) === 0 && !s.settings.godMode) {
      return { ok: false, why: 'Train an army first' };
    }
    var ratio = power / Math.max(1, target.power);
    // destruction curve: an even fight lands near 55%, double strength near 95%
    var destruction = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-0.8 * ratio)))));
    var stars = 0;
    if (destruction >= 50) stars++;
    if (destruction >= 65) stars++;      // Town Hall taken
    if (destruction >= 100) stars++;
    var thDiff = target.th - s.th;
    var lootScale = Math.max(0.25, Math.min(1.4, 1 + thDiff * 0.2)) * (destruction / 100);
    var looted = {
      gold: Math.round(target.loot.gold * lootScale),
      elixir: Math.round(target.loot.elixir * lootScale),
      dark: Math.round(target.loot.dark * lootScale)
    };
    addResource(s, 'gold', looted.gold);
    addResource(s, 'elixir', looted.elixir);
    addResource(s, 'dark', looted.dark);
    var trophyDelta = stars > 0 ? Math.round((6 + thDiff * 4) * stars / 2) : -Math.round(8 + Math.random() * 12);
    s.trophies = Math.max(0, s.trophies + trophyDelta);
    if (stars > 0) s.stats.raidsWon++; else s.stats.raidsLost++;
    s.stats.goldLooted += looted.gold;
    s.stats.elixirLooted += looted.elixir;
    s.stats.darkLooted += looted.dark;
    // Losing the army is the cost of a raid.
    if (!s.settings.godMode) {
      s.army = {};
      s.spellsBrewed = {};
    }
    var entry = {
      at: Date.now(), kind: 'attack', target: target.name, targetTH: target.th,
      stars: stars, destruction: destruction, loot: looted, trophies: trophyDelta
    };
    s.raidLog.unshift(entry);
    s.raidLog = s.raidLog.slice(0, 30);
    return { ok: true, result: entry };
  }
  engine.raid = raid;
  // The result of a battle you actually fought, rather than one resolved by
  // comparing two numbers. Loot scales with what got destroyed, and the army
  // is spent either way.
  function finishBattle(s, target, destruction, stars) {
    var thDiff = target.th - s.th;
    var lootScale = Math.max(0.25, Math.min(1.4, 1 + thDiff * 0.2)) * (destruction / 100);
    var looted = {
      gold: Math.round(target.loot.gold * lootScale),
      elixir: Math.round(target.loot.elixir * lootScale),
      dark: Math.round(target.loot.dark * lootScale)
    };
    addResource(s, 'gold', looted.gold);
    addResource(s, 'elixir', looted.elixir);
    addResource(s, 'dark', looted.dark);
    var trophyDelta = stars > 0
      ? Math.round((6 + thDiff * 4) * stars / 2)
      : -Math.round(8 + Math.random() * 12);
    s.trophies = Math.max(0, s.trophies + trophyDelta);
    if (stars > 0) s.stats.raidsWon++; else s.stats.raidsLost++;
    s.stats.goldLooted += looted.gold;
    s.stats.elixirLooted += looted.elixir;
    s.stats.darkLooted += looted.dark;
    if (!s.settings.godMode) { s.army = {}; s.spellsBrewed = {}; }
    var entry = {
      at: Date.now(), kind: 'attack', target: target.name, targetTH: target.th,
      stars: stars, destruction: destruction, loot: looted, trophies: trophyDelta
    };
    s.raidLog.unshift(entry);
    s.raidLog = s.raidLog.slice(0, 30);
    G.store.save(s);
    return { ok: true, looted: looted, trophies: trophyDelta, result: entry };
  }
  engine.finishBattle = finishBattle;


  // Offline defense: while you were gone, someone tried the base.
  function simulateDefense(s, elapsedSeconds) {
    if (elapsedSeconds < 1800) return null;
    if (s.shieldUntil > Date.now()) return null;
    if (Math.random() > Math.min(0.7, elapsedSeconds / 86400)) return null;
    // Raiders scale with what your Town Hall should be fielding, so a
    // neglected base is punished and a maxed one holds.
    var attackerPower = Math.max(120, expectedDefensePower(s.th)) * (0.7 + Math.random() * 0.8);
    var def = Math.max(1, defensePower(s));
    var ratio = attackerPower / def;
    var destruction = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-0.8 * ratio)))));
    var stars = (destruction >= 50 ? 1 : 0) + (destruction >= 65 ? 1 : 0) + (destruction >= 100 ? 1 : 0);
    var take = destruction / 100 * 0.18;
    var lost = {
      gold: Math.round((s.resources.gold || 0) * take),
      elixir: Math.round((s.resources.elixir || 0) * take),
      dark: Math.round((s.resources.dark || 0) * take * 0.6)
    };
    s.resources.gold -= lost.gold;
    s.resources.elixir -= lost.elixir;
    s.resources.dark -= lost.dark;
    var trophyDelta = stars > 0 ? -Math.round(6 + stars * 6) : Math.round(6 + Math.random() * 8);
    s.trophies = Math.max(0, s.trophies + trophyDelta);
    // Heavy losses buy you a shield, per the spec's defend step.
    if (stars >= 2) s.shieldUntil = Date.now() + (stars === 3 ? 16 : 12) * HOUR * 1000;
    var entry = {
      at: Date.now(), kind: 'defense', target: 'Raider', targetTH: s.th,
      stars: stars, destruction: destruction, loot: lost, trophies: trophyDelta,
      shielded: stars >= 2
    };
    s.raidLog.unshift(entry);
    s.raidLog = s.raidLog.slice(0, 30);
    return entry;
  }

  /* ------------------------------------------------------- magic items */
  function inProgressJobs(s) {
    var jobs = [];
    s.buildings.forEach(function (b) {
      if (b.upgrading) jobs.push({ kind: 'building', label: bdata(b.key).name + ' → ' + b.upgrading.to, ends: b.upgrading.ends, ref: b });
    });
    s.labSlots.forEach(function (sl) {
      if (sl.job) {
        var t = researchTarget(sl.job.key);
        jobs.push({ kind: 'research', label: t.name + ' → ' + sl.job.to, ends: sl.job.ends, ref: sl });
      }
    });
    Object.keys(s.heroes).forEach(function (k) {
      var hs = s.heroes[k];
      if (hs.upgrading) jobs.push({ kind: 'hero', label: G.heroData[k].name + ' → ' + hs.upgrading.to, ends: hs.upgrading.ends, ref: hs, key: k });
    });
    return jobs.sort(function (a, b) { return a.ends - b.ends; });
  }
  engine.inProgressJobs = inProgressJobs;

  function finishJob(s, job) {
    if (job.kind === 'building') finishBuilding(s, job.ref);
    else if (job.kind === 'research') finishResearch(s, job.ref);
    else if (job.kind === 'hero') {
      job.ref.level = job.ref.upgrading.to;
      job.ref.upgrading = null;
      s.stats.upgradesDone++;
    }
  }
  engine.finishJob = finishJob;

  function useItem(s, itemKey, arg) {
    var item = G.itemData[itemKey];
    if (!item) return { ok: false, why: 'Unknown item' };
    if ((s.items[itemKey] || 0) <= 0) return { ok: false, why: 'You have none of those' };

    function consume() { s.items[itemKey]--; }

    if (item.type === 'rune') {
      var c = caps(s);
      s.resources[item.target] = c[item.target] || 0;
      consume();
      return { ok: true, msg: item.name + ' filled your ' + item.target + ' storage.' };
    }

    if (item.type === 'potion') {
      var key = itemKey === 'potion_clock' ? 'clocktower' : itemKey;
      s.boosts[key] = Date.now() + item.duration * 1000;
      consume();
      return { ok: true, msg: item.name + ' is active.' };
    }

    if (item.type === 'book') {
      var jobs = inProgressJobs(s).filter(function (j) {
        if (item.target === 'any') return true;
        if (item.target === 'building') return j.kind === 'building';
        if (item.target === 'hero') return j.kind === 'hero';
        if (item.target === 'troop' || item.target === 'spell') return j.kind === 'research';
        return false;
      });
      var job = arg ? jobs.filter(function (j) { return j.label === arg; })[0] || jobs[0] : jobs[0];
      if (!job) return { ok: false, why: 'Nothing in progress for that book' };
      finishJob(s, job);
      consume();
      return { ok: true, msg: item.name + ' finished ' + job.label + '.' };
    }

    if (item.type === 'hammer') {
      if (item.target === 'building') {
        var b = arg ? s.buildings.filter(function (x) { return x.id === arg; })[0] : null;
        if (!b) {
          // default: the lowest-level upgradable building
          var candidates = s.buildings.filter(function (x) { return x.level < maxLevelFor(s, x.key); })
            .sort(function (a, c) { return a.level - c.level; });
          b = candidates[0];
        }
        if (!b) return { ok: false, why: 'Nothing left to hammer' };
        var target = maxLevelFor(s, b.key);
        applyLevel(s, b, target);
        s.builders.forEach(function (bl) { if (bl.job && bl.job.targetId === b.id) bl.job = null; });
        consume();
        return { ok: true, msg: item.name + ' maxed ' + bdata(b.key).name + ' to level ' + target + '.' };
      }
      if (item.target === 'hero') {
        var hk = arg || Object.keys(s.heroes).filter(function (k) { return heroUnlocked(s, k); })[0];
        if (!hk) return { ok: false, why: 'No hero available' };
        var hs2 = heroState(s, hk);
        hs2.level = G.heroMaxLevel(hk, s.th);
        hs2.upgrading = null;
        consume();
        return { ok: true, msg: item.name + ' maxed ' + G.heroData[hk].name + '.' };
      }
      // troop / spell / siege
      var pool = item.target === 'troop' ? G.TROOPS : item.target === 'spell' ? G.SPELLS : G.SIEGE;
      var pick = arg ? researchTarget(arg) : pool.filter(function (t) {
        return s.th >= t.unlockTH && researchLevel(s, t.key) < researchMax(s, t.key);
      })[0];
      if (!pick) return { ok: false, why: 'Nothing left to hammer' };
      s.research[pick.key] = researchMax(s, pick.key);
      s.labSlots.forEach(function (sl) { if (sl.job && sl.job.key === pick.key) sl.job = null; });
      consume();
      return { ok: true, msg: item.name + ' maxed ' + pick.name + '.' };
    }

    if (item.type === 'ore' || item.type === 'decoration') {
      return { ok: false, why: item.name + ' is spent from the Hero Hall / village, not here' };
    }
    return { ok: false, why: 'Nothing happened' };
  }
  engine.useItem = useItem;

  /* -------------------------------------------------------------- gems */
  function skipWithGems(s, job) {
    var left = Math.max(0, (job.ends - Date.now()) / 1000);
    var cost = gemsToSkip(left);
    if ((s.resources.gems || 0) < cost) return { ok: false, why: 'Needs ' + cost + ' gems' };
    s.resources.gems -= cost;
    finishJob(s, job);
    return { ok: true, msg: 'Finished for ' + cost + ' gems.' };
  }
  engine.skipWithGems = skipWithGems;

  function buyBuilder(s) {
    var owned = s.builders.length;
    var prices = [0, 0, 500, 1000, 2000, 3000, 4000, 5000, 6000];
    var cost = prices[owned] || 8000;
    if ((s.resources.gems || 0) < cost) return { ok: false, why: 'Needs ' + cost + ' gems' };
    s.resources.gems -= cost;
    s.extraBuilders = (s.extraBuilders || 0) + 1;
    s.builders.push({ id: 'b' + (owned + 1), job: null });
    return { ok: true, msg: 'Builder hired.' };
  }
  engine.buyBuilder = buyBuilder;

  /* -------------------------------------------------- moderator panel */
  var mod = {};
  mod.setGems = function (s, n) {
    s.resources.gems = Math.max(0, Math.min(9999999, Math.round(n)));
    s.moderated = true;
  };
  mod.setItem = function (s, key, n) {
    var item = G.itemData[key];
    if (!item) return;
    // The moderator panel may exceed the normal hold limit; that is the point
    // of it, but it still flags the save.
    s.items[key] = Math.max(0, Math.min(999, Math.round(n)));
    s.moderated = true;
  };

  // Normal gameplay grants respect the hold limit.
  engine.grantItem = function (s, key, n) {
    var item = G.itemData[key];
    if (!item) return 0;
    var before = s.items[key] || 0;
    var after = Math.min(item.cap, before + (n || 1));
    s.items[key] = after;
    return after - before;
  };
  mod.setResource = function (s, res, n) {
    s.resources[res] = Math.max(0, Math.round(n));
    s.moderated = true;
  };
  mod.jumpToTH = function (s, level) {
    level = Math.max(1, Math.min(30, Math.round(level)));
    s.th = level;
    var th = townHallBuilding(s);
    if (th) { th.level = level; th.upgrading = null; }
    syncBuilders(s);
    syncLabSlots(s);
    // Lay the wall rings first so they stay rings, then fill the space with
    // every building this Town Hall unlocks.
    var wallsWanted = G.WALL.countAt(level);
    while (s.walls.length < wallsWanted) G.store.addWall(s, Math.max(1, Math.floor(level / 2)));
    G.BUILDINGS.forEach(function (bd) {
      var allowed = G.allowedCount(bd.key, level);
      var have = ownedCount(s, bd.key);
      for (var i = have; i < allowed; i++) G.store.addBuilding(s, bd.key, 1);
    });
    s.moderated = true;
  };
  mod.setInstantBuild = function (s, on) {
    s.settings.instantBuild = !!on;
    s.moderated = true;
    if (on) {
      s.buildings.forEach(function (b) { if (b.upgrading) finishBuilding(s, b); });
      s.labSlots.forEach(function (sl) { if (sl.job) finishResearch(s, sl); });
      Object.keys(s.heroes).forEach(function (k) {
        var hs = s.heroes[k];
        if (hs.upgrading) { hs.level = hs.upgrading.to; hs.upgrading = null; }
      });
    }
  };
  mod.unlockAll = function (s) {
    s.settings.unlockAll = true;
    s.moderated = true;
    G.TROOPS.concat(G.SPELLS, G.SIEGE).forEach(function (t) {
      if (s.th >= t.unlockTH) s.research[t.key] = G.researchMaxLevel(t.unlockTH, s.th);
    });
    G.HEROES.forEach(function (h) {
      if (s.th >= h.unlockTH) {
        var hs = heroState(s, h.key);
        hs.level = G.heroMaxLevel(h.key, s.th);
        hs.upgrading = null;
      }
    });
    s.buildings.forEach(function (b) {
      b.level = b.key === 'townhall' ? s.th : Math.max(b.level, maxLevelFor(s, b.key));
      b.upgrading = null;
    });
    s.walls.forEach(function (w) { w.level = wallMax(s); });
    s.builders.forEach(function (bl) { bl.job = null; });
  };
  mod.godMode = function (s, on) {
    s.settings.godMode = !!on;
    s.moderated = true;
  };
  mod.maxAllItems = function (s, n) {
    G.MAGIC_ITEMS.forEach(function (i) { s.items[i.key] = n; });
    s.moderated = true;
  };
  engine.mod = mod;

  /* -------------------------------------------------------------- tick */
  function tick(s, now) {
    now = now || Date.now();
    var elapsed = Math.max(0, (now - s.lastTick) / 1000);
    if (elapsed <= 0) return { defense: null };
    s.lastTick = now;

    // production (offline progress included)
    var prod = productionPerHour(s);
    addResource(s, 'gold', prod.gold * elapsed / HOUR);
    addResource(s, 'elixir', prod.elixir * elapsed / HOUR);
    addResource(s, 'dark', prod.dark * elapsed / HOUR);

    // finish anything whose timer elapsed
    s.buildings.forEach(function (b) {
      if (b.upgrading && b.upgrading.ends <= now) finishBuilding(s, b);
    });
    s.labSlots.forEach(function (sl) {
      if (sl.job && sl.job.ends <= now) finishResearch(s, sl);
    });
    Object.keys(s.heroes).forEach(function (k) {
      var hs = s.heroes[k];
      if (hs.upgrading && hs.upgrading.ends <= now) {
        hs.level = hs.upgrading.to;
        hs.upgrading = null;
        s.stats.upgradesDone++;
      }
    });
    // expire super troops
    Object.keys(s.superTroops).forEach(function (k) {
      if (s.superTroops[k] <= now) delete s.superTroops[k];
    });

    var defense = elapsed > 1800 ? simulateDefense(s, elapsed) : null;
    return { defense: defense };
  }
  engine.tick = tick;
  engine.newGame = newGame;
  engine.syncBuilders = syncBuilders;
  engine.syncLabSlots = syncLabSlots;

  G.engine = engine;
})(window.G = window.G || {});
