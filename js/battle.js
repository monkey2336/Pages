/* The battle simulation.

   Raids used to be a power comparison that printed a result. This runs the
   fight: an enemy base laid out on the same grid the village uses, troops you
   place yourself, defenses that shoot back, and a destruction percentage that
   comes out of what actually got destroyed.

   No DOM in here. The simulation advances in fixed steps and exposes plain
   arrays; js/screens/battle.js draws them. */
(function (G) {
  'use strict';

  var TICK = 1 / 20;             // simulation step, seconds
  var BATTLE_SECONDS = 180;
  var MELEE_RANGE = 0.9;         // tiles

  // Troop stats are written for the power-comparison raid, where they only
  // ever had to be right relative to each other. In a fought battle they meet
  // building hitpoints and defense damage directly, so both need lifting to
  // land a raid in the two-minute range rather than wiping in twenty seconds.
  // Exposed for tuning rather than buried.
  var TUNE = { hp: 9, dps: 5, defense: 1.1, growth: 1.18 };

  /* --------------------------------------------------------- enemy base */
  // Built on the same grid and the same rules the player's own village uses,
  // so a target reads as somebody's base rather than scattered furniture.
  function buildBase(th) {
    var fake = {
      th: th, buildings: [], walls: [],
      resources: { gold: 0, elixir: 0, dark: 0, gems: 0 }
    };
    // The Town Hall is not in the buildings table, so store.addBuilding refuses
    // it -- place it by hand at the centre, which is also what the wall rings
    // and the spiral placement key off.
    var mid = Math.floor(G.GRID / 2) - 2;
    fake.buildings.push({ id: 'e_th', key: 'townhall', level: th, x: mid, y: mid, upgrading: null });
    var wallsWanted = Math.min(G.WALL.countAt(th), 160);
    var wallLevel = Math.max(1, Math.min(30, th));
    while (fake.walls.length < wallsWanted) G.store.addWall(fake, wallLevel);
    G.BUILDINGS.forEach(function (bd) {
      var allowed = G.allowedCount(bd.key, th);
      for (var i = 0; i < allowed; i++) {
        G.store.addBuilding(fake, bd.key, Math.max(1, Math.min(G.buildingMaxLevel(bd.key, th), th)));
      }
    });
    return fake;
  }

  function buildingStats(key, level) {
    var bd = G.buildingData(key);
    if (key === 'townhall') {
      return { hp: Math.round(1500 * Math.pow(1.16, level - 1)), dps: 0, range: 0,
               targets: 'none', splash: false, size: 4, cat: 'townhall' };
    }
    if (!bd) return null;
    return {
      hp: Math.round((bd.hp || 300) * Math.pow(1.14, level - 1)),
      dps: bd.dps ? bd.dps * Math.pow(1.16, level - 1) : 0,
      range: bd.range || 0,
      targets: bd.targets || 'none',
      splash: !!bd.splash,
      size: bd.size,
      cat: bd.cat
    };
  }

  /* ------------------------------------------------------------- battle */
  function create(state, target) {
    var base = buildBase(target.th);
    var b = {
      target: target,
      time: BATTLE_SECONDS,
      over: false,
      started: false,
      buildings: [],
      walls: [],
      troops: [],
      shots: [],
      effects: [],
      destroyedCount: 0,
      totalCount: 0,
      thDestroyed: false,
      stars: 0,
      destruction: 0,
      // what you have left to place, taken from the camps
      hand: {},
      heroes: {},
      bounds: { minX: 999, minY: 999, maxX: 0, maxY: 0 }
    };

    base.buildings.forEach(function (o) {
      var st = buildingStats(o.key, o.level);
      if (!st) return;
      b.buildings.push({
        key: o.key, level: o.level, x: o.x, y: o.y, size: st.size,
        hp: st.hp, maxHp: st.hp, dps: st.dps, range: st.range,
        targets: st.targets, splash: st.splash, cat: st.cat,
        cooldown: 0, dead: false,
        // Reaction timers, all "seconds since". The renderer reads them to
        // kick a barrel back when it fires, flash the sprite when it is hit
        // and collapse it when it dies; the simulation is what knows when
        // those things happened.
        fireT: 99, hitT: 99, deadT: 0, aimX: 0, aimY: -1
      });
      b.bounds.minX = Math.min(b.bounds.minX, o.x);
      b.bounds.minY = Math.min(b.bounds.minY, o.y);
      b.bounds.maxX = Math.max(b.bounds.maxX, o.x + st.size);
      b.bounds.maxY = Math.max(b.bounds.maxY, o.y + st.size);
    });
    base.walls.forEach(function (w) {
      b.walls.push({ x: w.x, y: w.y, level: w.level, dead: false, hitT: 99,
                     hp: Math.round(300 * Math.pow(1.18, w.level - 1)),
                     maxHp: Math.round(300 * Math.pow(1.18, w.level - 1)) });
    });
    b.totalCount = b.buildings.length;
    buildGrid(b);

    Object.keys(state.army || {}).forEach(function (k) {
      if (state.army[k] > 0) b.hand[k] = state.army[k];
    });
    Object.keys(state.heroes || {}).forEach(function (k) {
      var hs = state.heroes[k];
      if (hs && hs.level > 0) b.heroes[k] = 1;
    });
    return b;
  }

  /* -------------------------------------------------------------- paths */
  // Troops used to walk straight at their target and chew through whatever
  // wall got in the way. Real ones go round if there is a way round. A
  // breadth-first flood from the target over the walkable tiles gives a
  // distance field; a troop just steps to whichever neighbour is closer to
  // the goal. It only falls back to hitting the wall when the base is sealed,
  // which is exactly when hitting the wall is the right answer.
  function gridIndex(b, gx, gy) {
    var x = Math.floor(gx) - b.grid.x0, y = Math.floor(gy) - b.grid.y0;
    if (x < 0 || y < 0 || x >= b.grid.w || y >= b.grid.h) return -1;
    return y * b.grid.w + x;
  }

  function buildGrid(b) {
    var pad = 6;
    var x0 = Math.max(0, b.bounds.minX - pad), y0 = Math.max(0, b.bounds.minY - pad);
    var w = (b.bounds.maxX + pad) - x0, h = (b.bounds.maxY + pad) - y0;
    b.grid = { x0: x0, y0: y0, w: w, h: h };
    b.blocked = new Uint8Array(w * h);
    b.wallEpoch = 0;
    b.fields = {};
    refreshBlocked(b);
  }

  function refreshBlocked(b) {
    b.blocked.fill(0);
    for (var i = 0; i < b.walls.length; i++) {
      var wl = b.walls[i];
      if (wl.dead) continue;
      var idx = gridIndex(b, wl.x, wl.y);
      if (idx >= 0) b.blocked[idx] = 1;
    }
    b.fields = {};                 // every cached path is stale now
  }

  function fieldFor(b, target) {
    var key = target.x + ',' + target.y + ',' + b.wallEpoch;
    if (b.fields[key]) return b.fields[key];
    var w = b.grid.w, h = b.grid.h;
    var dist32 = new Int32Array(w * h).fill(-1);
    var queue = [];
    var size = target.size || 1;
    for (var ty = 0; ty < size; ty++) {
      for (var tx = 0; tx < size; tx++) {
        var id = gridIndex(b, target.x + tx, target.y + ty);
        if (id >= 0) { dist32[id] = 0; queue.push(id); }
      }
    }
    for (var qi = 0; qi < queue.length; qi++) {
      var cur = queue[qi];
      var cx = cur % w, cy = (cur - cx) / w;
      var d = dist32[cur];
      for (var k = 0; k < 4; k++) {
        var nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        var ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var ni = ny * w + nx;
        if (dist32[ni] !== -1 || b.blocked[ni]) continue;
        dist32[ni] = d + 1;
        queue.push(ni);
      }
    }
    b.fields[key] = dist32;
    return dist32;
  }

  // Where to step next: the neighbouring tile closest to the goal, or null if
  // the goal cannot be reached without breaking something.
  function nextStep(b, t, target) {
    var f = fieldFor(b, target);
    var here = gridIndex(b, t.x, t.y);
    if (here < 0) return null;
    var w = b.grid.w;
    var best = null, bestD = f[here] === -1 ? Infinity : f[here];
    var cx = here % w, cy = (here - cx) / w;
    for (var k = 0; k < 8; k++) {
      var dx = [1, -1, 0, 0, 1, 1, -1, -1][k];
      var dy = [0, 0, 1, -1, 1, -1, 1, -1][k];
      var nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= b.grid.h) continue;
      var ni = ny * w + nx;
      if (b.blocked[ni] || f[ni] === -1) continue;
      if (f[ni] < bestD) { bestD = f[ni]; best = { x: nx + b.grid.x0 + 0.5, y: ny + b.grid.y0 + 0.5 }; }
    }
    return best;
  }

  /* ------------------------------------------------------------ helpers */
  function centreOf(o) {
    return { x: o.x + (o.size || 1) / 2, y: o.y + (o.size || 1) / 2 };
  }
  function dist(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* Remember which way a troop is pointing. Kept as a unit vector in grid
     space so the renderer can work out the facing without re-deriving it from
     positions that have already moved on. */
  function face(t, dx, dy) {
    var len = Math.hypot(dx, dy);
    if (len < 1e-4) return;
    t.faceX = dx / len;
    t.faceY = dy / len;
  }

  // What a troop wants to hit. Falls back to anything once its preference is
  // gone, which is what stops an army standing still at the end of a raid.
  function pickTarget(b, t) {
    var pref = t.prefers;
    var best = null, bestD = Infinity, bestPref = false;
    for (var i = 0; i < b.buildings.length; i++) {
      var o = b.buildings[i];
      if (o.dead) continue;
      var c = centreOf(o);
      var d = dist(t.x, t.y, c.x, c.y);
      var isPref =
        (pref === 'defenses' && o.dps > 0) ||
        (pref === 'resources' && o.cat === 'resource') ||
        (pref === 'any');
      if (isPref && !bestPref) { best = o; bestD = d; bestPref = true; continue; }
      if (isPref === bestPref && d < bestD) { best = o; bestD = d; }
    }
    return best;
  }

  function wallBlocking(b, t, tx, ty) {
    if (t.air || t.jumpsWalls) return null;
    // A wall matters if it sits on the step the troop is about to take.
    var dx = tx - t.x, dy = ty - t.y;
    var len = Math.hypot(dx, dy) || 1;
    var nx = t.x + (dx / len) * 0.8, ny = t.y + (dy / len) * 0.8;
    for (var i = 0; i < b.walls.length; i++) {
      var w = b.walls[i];
      if (w.dead) continue;
      if (nx >= w.x - 0.1 && nx <= w.x + 1.1 && ny >= w.y - 0.1 && ny <= w.y + 1.1) return w;
    }
    return null;
  }

  function addEffect(b, kind, x, y, extra) {
    var e = { kind: kind, x: x, y: y, life: 0, ttl: extra && extra.ttl || 0.45 };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    b.effects.push(e);
  }

  /* ---------------------------------------------------------- deploying */
  function deploy(b, key, x, y, isHero) {
    if (b.over) return false;
    if (isHero) {
      if (!b.heroes[key]) return false;
      b.heroes[key] = 0;
    } else {
      if (!b.hand[key]) return false;
      b.hand[key] -= 1;
      if (b.hand[key] <= 0) delete b.hand[key];
    }
    var d = isHero ? G.heroData[key] : G.troopData[key];
    var lvl = 1;
    var hp = (d.hp || 200) * TUNE.hp;
    var dps = (d.dps || 20) * TUNE.dps;
    if (!isHero) {
      // Research has to climb as fast as defenses do. A defense reaches level
      // 30 growing at 1.16 a level; research stops at 25, so it needs a
      // steeper curve to arrive in the same place, or a maxed army at Town
      // Hall 30 walks into a base five times its weight.
      var r = (G.state && G.state.research && G.state.research[key]) || 1;
      lvl = r;
      hp *= Math.pow(TUNE.growth, r - 1);
      dps *= Math.pow(TUNE.growth, r - 1);
    } else {
      var hs = G.state && G.state.heroes && G.state.heroes[key];
      var hl = hs ? hs.level : 1;
      lvl = hl;
      hp = 800 * TUNE.hp * Math.pow(1.035, hl - 1);
      dps = 60 * TUNE.dps * Math.pow(1.035, hl - 1);
    }
    b.troops.push({
      key: key, hero: !!isHero, x: x, y: y, lvl: lvl,
      hp: hp, maxHp: hp, dps: dps,
      speed: (d.speed || 16) / 16 * 1.1,        // tiles per second
      air: !!d.air, jumpsWalls: !!d.jumpsWalls,
      prefers: d.prefers || 'any',
      targets: d.targets || 'ground',
      heal: d.heal || 0,
      target: null, hitTimer: 0, dead: false, spawn: 0,
      // Animation bookkeeping. The simulation owns it because only the
      // simulation knows whether a troop is walking or swinging; the renderer
      // just reads it. faceX/faceY is the heading in grid units.
      animT: 0, swinging: false, deathT: 0, faceX: 0, faceY: 1
    });
    b.started = true;
    addEffect(b, 'spawn', x, y, { ttl: 0.5 });
    return true;
  }

  /* --------------------------------------------------------------- step */
  function step(b, dt) {
    if (b.over) return;
    if (b.started) b.time -= dt;

    var i, j;

    // ---- troops
    for (i = 0; i < b.troops.length; i++) {
      var t = b.troops[i];
      if (t.dead) { t.deathT += dt; continue; }
      t.animT += dt;
      t.swinging = false;
      t.spawn += dt;
      if (t.spawn < 0.25) continue;             // brief drop-in

      if (t.heal) {                              // healers follow the pack
        var friend = null, fd = Infinity;
        for (j = 0; j < b.troops.length; j++) {
          var o2 = b.troops[j];
          if (o2 === t || o2.dead || o2.hp >= o2.maxHp) continue;
          var d2 = dist(t.x, t.y, o2.x, o2.y);
          if (d2 < fd) { fd = d2; friend = o2; }
        }
        if (friend) {
          friend.hp = Math.min(friend.maxHp, friend.hp + t.heal * dt);
          if (fd > 2) {
            face(t, friend.x - t.x, friend.y - t.y);
            t.x += (friend.x - t.x) / fd * t.speed * dt;
            t.y += (friend.y - t.y) / fd * t.speed * dt;
          }
          continue;
        }
      }

      if (!t.target || t.target.dead) t.target = pickTarget(b, t);
      if (!t.target) continue;
      var c = centreOf(t.target);
      var reach = MELEE_RANGE + (t.target.size || 1) / 2;
      var d = dist(t.x, t.y, c.x, c.y);

      if (d > reach) {
        // Anything that walks follows the flow field; fliers and jumpers go
        // straight, which is the whole point of being able to fly or jump.
        var aim = c;
        if (!t.air && !t.jumpsWalls) {
          var stepTo = nextStep(b, t, t.target);
          if (stepTo) aim = stepTo;
        }
        if (aim !== c) {
          var ad = dist(t.x, t.y, aim.x, aim.y) || 1;
          face(t, aim.x - t.x, aim.y - t.y);
          t.x += (aim.x - t.x) / ad * t.speed * dt;
          t.y += (aim.y - t.y) / ad * t.speed * dt;
          continue;
        }
        var wall = wallBlocking(b, t, c.x, c.y);
        if (wall) {
          t.swinging = true;
          face(t, wall.x + 0.5 - t.x, wall.y + 0.5 - t.y);
          wall.hp -= t.dps * dt;
          t.hitTimer -= dt;
          if (t.hitTimer <= 0) {
            addEffect(b, 'hit', wall.x + 0.5, wall.y + 0.5);
            wall.hitT = 0;
            t.hitTimer = 0.35;
          }
          if (wall.hp <= 0) {
            wall.dead = true;
            b.wallEpoch++;
            refreshBlocked(b);
            addEffect(b, 'boom', wall.x + 0.5, wall.y + 0.5, { ttl: 0.5 });
          }
          continue;
        }
        face(t, c.x - t.x, c.y - t.y);
        t.x += (c.x - t.x) / d * t.speed * dt;
        t.y += (c.y - t.y) / d * t.speed * dt;
      } else {
        t.swinging = true;
        face(t, c.x - t.x, c.y - t.y);
        t.target.hp -= t.dps * dt;
        t.hitTimer -= dt;
        if (t.hitTimer <= 0) {
          addEffect(b, 'hit', c.x, c.y);
          t.target.hitT = 0;
          t.hitTimer = 0.35;
        }
        if (t.target.hp <= 0 && !t.target.dead) {
          t.target.dead = true;
          t.target.deadT = 0;
          b.destroyedCount++;
          if (t.target.key === 'townhall') b.thDestroyed = true;
          addEffect(b, 'boom', c.x, c.y, { ttl: 0.75, big: true });
          t.target = null;
        }
      }
    }

    // ---- defenses
    for (i = 0; i < b.buildings.length; i++) {
      var g = b.buildings[i];
      if (g.dead || g.dps <= 0) continue;
      g.cooldown -= dt;
      if (g.cooldown > 0) continue;
      var gc = centreOf(g);
      var victim = null, vd = Infinity;
      for (j = 0; j < b.troops.length; j++) {
        var u = b.troops[j];
        if (u.dead) continue;
        if (g.targets === 'ground' && u.air) continue;
        if (g.targets === 'air' && !u.air) continue;
        var du = dist(gc.x, gc.y, u.x, u.y);
        if (du <= g.range && du < vd) { vd = du; victim = u; }
      }
      if (!victim) continue;
      g.cooldown = 0.8;
      g.fireT = 0;
      g.aimX = victim.x - gc.x;
      g.aimY = victim.y - gc.y;
      b.shots.push({
        x: gc.x, y: gc.y, tx: victim.x, ty: victim.y,
        t: 0, dur: Math.max(0.12, vd / 14),
        dmg: g.dps * 0.8 * TUNE.defense, splash: g.splash, from: g.key
      });
      addEffect(b, 'flash', gc.x, gc.y, { ttl: 0.16 });
    }

    // ---- projectiles
    for (i = b.shots.length - 1; i >= 0; i--) {
      var sh = b.shots[i];
      sh.t += dt;
      if (sh.t < sh.dur) continue;
      addEffect(b, sh.splash ? 'boom' : 'spark', sh.tx, sh.ty, { ttl: sh.splash ? 0.4 : 0.2 });
      for (j = 0; j < b.troops.length; j++) {
        var v = b.troops[j];
        if (v.dead) continue;
        var dd = dist(sh.tx, sh.ty, v.x, v.y);
        if (dd <= (sh.splash ? 1.6 : 0.6)) {
          v.hp -= sh.dmg * (sh.splash ? 1 : 1);
          if (v.hp <= 0) {
            v.dead = true;
            v.deathT = 0;
            addEffect(b, 'death', v.x, v.y, { ttl: 0.5 });
          }
        }
      }
      b.shots.splice(i, 1);
    }

    // ---- reaction timers
    for (i = 0; i < b.buildings.length; i++) {
      var rb = b.buildings[i];
      rb.fireT += dt; rb.hitT += dt;
      if (rb.dead) rb.deadT += dt;
    }
    for (i = 0; i < b.walls.length; i++) b.walls[i].hitT += dt;

    // ---- effects age out
    for (i = b.effects.length - 1; i >= 0; i--) {
      b.effects[i].life += dt;
      if (b.effects[i].life >= b.effects[i].ttl) b.effects.splice(i, 1);
    }

    // ---- scoring
    b.destruction = b.totalCount ? Math.round((b.destroyedCount / b.totalCount) * 100) : 0;
    var stars = 0;
    if (b.destruction >= 50) stars++;
    if (b.thDestroyed) stars++;
    if (b.destruction >= 100) stars++;
    b.stars = stars;

    var alive = false;
    for (i = 0; i < b.troops.length; i++) if (!b.troops[i].dead) { alive = true; break; }
    var handEmpty = !Object.keys(b.hand).length && !Object.keys(b.heroes).some(function (k) { return b.heroes[k]; });
    if (b.time <= 0 || b.destruction >= 100 || (b.started && !alive && handEmpty)) {
      b.over = true;
      b.time = Math.max(0, b.time);
    }
  }

  G.battle = {
    TUNE: TUNE,
    create: create,
    step: step,
    deploy: deploy,
    TICK: TICK,
    BATTLE_SECONDS: BATTLE_SECONDS,
    centreOf: centreOf
  };
})(window.G = window.G || {});
