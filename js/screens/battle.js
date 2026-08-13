/* The battle screen: the enemy base drawn on a canvas, a troop tray to deploy
   from, and the fight playing out in front of you.

   Canvas rather than DOM, because a raid is a hundred sprites plus projectiles,
   explosions and damage flashes all moving at once -- work the browser is happy
   to do at 60fps on a canvas and miserable doing with elements. The sprites are
   the same PNGs the village uses, drawn through the same isometric projection,
   so a base looks the same whether you are building it or knocking it down. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine, SP = G.sprites;
  var TILE_W = SP.TILE_W, TILE_H = SP.TILE_H;

  var live = null;          // the running battle
  var raf = null;
  var picked = null;        // troop key selected in the tray
  var pickedHero = false;
  var lastFrame = 0;
  var acc = 0;
  var speed = 1;            // 0.5x to 4x, chosen from the top bar

  /* --------------------------------------------------------- image cache */
  var images = {};
  function img(name) {
    if (!name) return null;
    if (images[name] !== undefined) return images[name];
    var sp = SP.get(name);
    if (!sp) { images[name] = null; return null; }
    var im = new Image();
    im.src = sp.file;
    im.__sp = sp;
    images[name] = im;
    return im;
  }

  /* ---------------------------------------------------------- projection */
  function project(view, gx, gy) {
    return {
      x: view.ox + (gx - gy) * (TILE_W / 2) * view.scale,
      y: view.oy + (gx + gy) * (TILE_H / 2) * view.scale
    };
  }

  function fitView(b, canvas) {
    var span = Math.max(12, Math.max(b.bounds.maxX - b.bounds.minX, b.bounds.maxY - b.bounds.minY) + 3);
    var cx = (b.bounds.minX + b.bounds.maxX) / 2;
    var cy = (b.bounds.minY + b.bounds.maxY) / 2;
    // Room for the tallest halls above the grid, and for the tray below it,
    // but no more than that -- the base should fill the screen it is on.
    var wNeeded = span * TILE_W;
    var hNeeded = span * TILE_H + 210;
    var scale = Math.min(canvas.width / wNeeded, canvas.height / hNeeded);
    var mid = { x: (cx - cy) * (TILE_W / 2) * scale, y: (cx + cy) * (TILE_H / 2) * scale };
    return { scale: scale, ox: canvas.width / 2 - mid.x, oy: canvas.height / 2 - mid.y + 24 };
  }

  /* ------------------------------------------------------------ drawing */
  function drawGround(ctx, b, view) {
    var pad = 3;
    var pts = [
      project(view, b.bounds.minX - pad, b.bounds.minY - pad),
      project(view, b.bounds.maxX + pad, b.bounds.minY - pad),
      project(view, b.bounds.maxX + pad, b.bounds.maxY + pad),
      project(view, b.bounds.minX - pad, b.bounds.maxY + pad)
    ];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    var g = ctx.createLinearGradient(pts[0].x, pts[0].y, pts[2].x, pts[2].y);
    g.addColorStop(0, '#6f9a52');
    g.addColorStop(1, '#4e7439');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }

  function drawSprite(ctx, view, name, gx, gy, size, opts) {
    var im = img(name);
    if (!im || !im.complete || !im.naturalWidth) return false;
    var sp = im.__sp;
    var c = project(view, gx + size / 2, gy + size / 2);
    var w = sp.w * view.scale, h = sp.h * view.scale;
    var x = c.x - sp.anchorX * view.scale;
    var y = c.y - sp.anchorY * view.scale;
    ctx.save();
    if (opts && opts.alpha != null) ctx.globalAlpha = opts.alpha;
    if (opts && opts.flash) {
      ctx.filter = 'brightness(' + (1 + opts.flash * 1.6) + ')';
    }
    ctx.drawImage(im, x, y, w, h);
    ctx.restore();
    return true;
  }

  /* ---------------------------------------------------------- animation */
  // Animated troops ship as one atlas per troop: a row per clip, a column per
  // frame, and a rect in the manifest saying where each row sits and where the
  // troop's feet are inside a cell.
  //
  // Only two facings are rendered -- towards the camera and away from it --
  // and each is mirrored at draw time, which covers the four diagonals an
  // isometric board moves along for half the art. The unmirrored front sprite
  // walks down-left and the unmirrored back sprite walks up-right, so a
  // heading needs mirroring whenever it runs against its own clip's grain.
  var CLIP_SECONDS = { walk: 0.72, attack: 0.55, death: 0.6 };
  var DEATH_LINGER = 1.4;        // seconds a body stays before it fades out

  function troopLevel(t) {
    return t.lvl || 1;
  }

  function animState(t) {
    var dx = (t.faceX - t.faceY), dy = (t.faceX + t.faceY);   // screen-ish
    var back = dy < 0;
    var mirror = (dx > 0) !== back;
    var strip = t.dead ? 'death' : (t.swinging ? 'attack' : 'walk');
    var elapsed = t.dead ? t.deathT : t.animT;
    return { clip: strip + (back ? 'Back' : ''), strip: strip,
             mirror: mirror, elapsed: elapsed };
  }

  function drawAnim(ctx, view, sheet, t, opts) {
    var sp = SP.get(sheet);
    if (!sp || !sp.clips) return false;
    var im = img(sheet);
    if (!im || !im.complete || !im.naturalWidth) return false;
    var st = animState(t);
    var c = sp.clips[st.clip] || sp.clips[st.strip];
    if (!c) return false;

    var span = CLIP_SECONDS[st.strip] || 0.7;
    var i;
    if (st.strip === 'death') {
      // A death plays once and holds its last pose while the body fades.
      i = Math.min(c.n - 1, Math.floor(st.elapsed / span * c.n));
    } else {
      i = Math.floor(st.elapsed / span * c.n) % c.n;
    }

    var p = project(view, t.x, t.y);
    var w = c.fw * view.scale, h = c.fh * view.scale;
    var ax = (st.mirror ? c.fw - c.ax : c.ax) * view.scale;
    ctx.save();
    if (opts && opts.alpha != null) ctx.globalAlpha = opts.alpha;
    ctx.translate(p.x - ax, p.y - c.ay * view.scale);
    if (st.mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(im, c.x + i * c.fw, c.y, c.fw, c.fh, 0, 0, w, h);
    ctx.restore();
    return true;
  }

  function drawShadow(ctx, view, gx, gy, size, alpha) {
    var c = project(view, gx, gy);
    ctx.save();
    ctx.globalAlpha = 0.3 * (alpha == null ? 1 : alpha);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, size * TILE_W * 0.36 * view.scale, size * TILE_H * 0.36 * view.scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function healthBar(ctx, view, gx, gy, frac, width, colour) {
    if (frac >= 1) return;
    var c = project(view, gx, gy);
    var w = width * view.scale, h = 5 * view.scale;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(c.x - w / 2, c.y - 34 * view.scale, w, h);
    ctx.fillStyle = colour;
    ctx.fillRect(c.x - w / 2, c.y - 34 * view.scale, w * Math.max(0, frac), h);
    ctx.restore();
  }

  function draw(ctx, b, canvas) {
    var view = fitView(b, canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGround(ctx, b, view);

    // Everything on the ground plane, painted back to front.
    var items = [];
    b.walls.forEach(function (w) {
      if (w.dead) return;
      items.push({ z: w.x + w.y, kind: 'wall', o: w });
    });
    b.buildings.forEach(function (o) {
      items.push({ z: o.x + o.y + o.size, kind: 'building', o: o });
    });
    b.troops.forEach(function (t) {
      // The dead stay on the field long enough to fall over. Past that they
      // are gone, so a long raid does not end up paved with bodies.
      if (t.dead && t.deathT > DEATH_LINGER) return;
      items.push({ z: t.x + t.y, kind: 'troop', o: t });
    });
    items.sort(function (a, c) { return a.z - c.z; });

    items.forEach(function (it) {
      var o = it.o;
      if (it.kind === 'wall') {
        if (!drawSprite(ctx, view, SP.wallKey(o.level), o.x, o.y, 1)) {
          var c = project(view, o.x + 0.5, o.y + 0.5);
          ctx.fillStyle = G.WALL.skin(o.level).fill;
          ctx.fillRect(c.x - 12 * view.scale, c.y - 16 * view.scale, 24 * view.scale, 20 * view.scale);
        }
        healthBar(ctx, view, o.x + 0.5, o.y + 0.5, o.hp / o.maxHp, 26, '#ff6b6b');
      } else if (it.kind === 'building') {
        if (o.dead) {
          // rubble
          var rc = project(view, o.x + o.size / 2, o.y + o.size / 2);
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#4a4238';
          ctx.beginPath();
          ctx.ellipse(rc.x, rc.y, o.size * TILE_W * 0.3 * view.scale, o.size * TILE_H * 0.3 * view.scale, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#2f2a22';
          for (var k = 0; k < 4; k++) {
            ctx.fillRect(rc.x - 14 * view.scale + k * 8 * view.scale,
              rc.y - 6 * view.scale + (k % 2) * 5 * view.scale,
              7 * view.scale, 5 * view.scale);
          }
          ctx.restore();
          return;
        }
        drawShadow(ctx, view, o.x + o.size / 2, o.y + o.size / 2, o.size);
        var name = o.key === 'townhall' ? SP.townHallKey(o.level) : SP.buildingKey(o.key, o.level);
        var hurt = 1 - o.hp / o.maxHp;
        if (!drawSprite(ctx, view, name, o.x, o.y, o.size, { flash: hurt > 0.02 ? 0 : 0 })) {
          var bc = project(view, o.x + o.size / 2, o.y + o.size / 2);
          ctx.fillStyle = '#8b8378';
          ctx.fillRect(bc.x - 18 * view.scale, bc.y - 26 * view.scale, 36 * view.scale, 30 * view.scale);
        }
        healthBar(ctx, view, o.x + o.size / 2, o.y + o.size / 2, o.hp / o.maxHp, o.size * 20, '#7ee08a');
      } else {
        var lvl = troopLevel(o);
        var fade = o.dead ? Math.max(0, 1 - o.deathT / DEATH_LINGER) : 1;
        var alpha = Math.min(fade, o.spawn < 0.25 ? o.spawn / 0.25 : 1);
        drawShadow(ctx, view, o.x, o.y, 0.6, alpha);
        if (!drawAnim(ctx, view, SP.animKey(o.key, lvl), o, { alpha: alpha })) {
          var tk = o.hero ? SP.heroKey(o.key, lvl) : SP.unitKey(o.key, lvl);
          if (!drawSprite(ctx, view, tk, o.x - 0.5, o.y - 0.5, 1, { alpha: alpha })) {
            var tc = project(view, o.x, o.y);
            ctx.fillStyle = (G.troopData[o.key] || {}).tint || '#fff';
            ctx.beginPath();
            ctx.arc(tc.x, tc.y - 8 * view.scale, 7 * view.scale, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (!o.dead) healthBar(ctx, view, o.x, o.y, o.hp / o.maxHp, 22, '#8fd8ff');
      }
    });

    // Projectiles above everything on the ground.
    b.shots.forEach(function (sh) {
      var f = Math.min(1, sh.t / sh.dur);
      var px = sh.x + (sh.tx - sh.x) * f;
      var py = sh.y + (sh.ty - sh.y) * f;
      var p = project(view, px, py);
      var arc = Math.sin(f * Math.PI) * 26 * view.scale;
      ctx.save();
      ctx.fillStyle = sh.splash ? '#ffca6b' : '#ffe9a8';
      ctx.shadowColor = '#ffb03c';
      ctx.shadowBlur = 10 * view.scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y - arc, (sh.splash ? 5 : 3.4) * view.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Effects last.
    b.effects.forEach(function (e) {
      var p = project(view, e.x, e.y);
      var f = e.life / e.ttl;
      ctx.save();
      if (e.kind === 'boom') {
        var r = (e.big ? 46 : 22) * view.scale * (0.4 + f * 1.3);
        ctx.globalAlpha = 1 - f;
        var g2 = ctx.createRadialGradient(p.x, p.y - 8, 0, p.x, p.y - 8, r);
        g2.addColorStop(0, '#fff2c8');
        g2.addColorStop(0.4, '#ffa63c');
        g2.addColorStop(1, 'rgba(120,40,10,0)');
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(p.x, p.y - 8 * view.scale, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'hit' || e.kind === 'spark') {
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = e.kind === 'hit' ? '#fff0c0' : '#9fe8ff';
        ctx.lineWidth = 2.2 * view.scale;
        for (var i = 0; i < 5; i++) {
          var a = (i / 5) * Math.PI * 2 + f * 2;
          var r1 = 5 * view.scale, r2 = (11 + f * 12) * view.scale;
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(a) * r1, p.y - 10 * view.scale + Math.sin(a) * r1 * 0.5);
          ctx.lineTo(p.x + Math.cos(a) * r2, p.y - 10 * view.scale + Math.sin(a) * r2 * 0.5);
          ctx.stroke();
        }
      } else if (e.kind === 'flash') {
        ctx.globalAlpha = 1 - f;
        ctx.fillStyle = '#fff6d8';
        ctx.beginPath();
        ctx.arc(p.x, p.y - 14 * view.scale, 9 * view.scale * (1 - f), 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === 'spawn') {
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = '#9fe8ff';
        ctx.lineWidth = 3 * view.scale;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, (10 + f * 26) * view.scale, (5 + f * 13) * view.scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.kind === 'death') {
        ctx.globalAlpha = 1 - f;
        ctx.fillStyle = '#d8d8e0';
        for (var k2 = 0; k2 < 6; k2++) {
          var ang = (k2 / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(ang) * f * 20 * view.scale,
            p.y - 10 * view.scale + Math.sin(ang) * f * 10 * view.scale,
            2.6 * view.scale * (1 - f), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    });

    return view;
  }

  /* --------------------------------------------------------------- loop */
  function frame(now) {
    if (!live) return;
    var host = document.getElementById('battleCanvas');
    if (!host) { stop(); return; }
    var dt = Math.min(0.1, (now - lastFrame) / 1000 || 0);
    lastFrame = now;
    acc += dt * speed;
    // Capped so a slow frame at 4x cannot spiral into hundreds of catch-up
    // steps and lock the tab up.
    var steps = 0;
    while (acc >= G.battle.TICK && steps < 12) {
      G.battle.step(live, G.battle.TICK);
      acc -= G.battle.TICK;
      steps++;
    }
    if (acc > G.battle.TICK * 12) acc = 0;
    var ctx = host.getContext('2d');
    draw(ctx, live, host);
    paintHud();
    if (live.over) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  /* ---------------------------------------------------------------- hud */
  function paintHud() {
    var bar = document.getElementById('battleHud');
    if (!bar || !live) return;
    var mins = Math.floor(live.time / 60), secs = Math.floor(live.time % 60);
    bar.innerHTML =
      '<div class="bt-stat"><span>Destruction</span><b>' + live.destruction + '%</b></div>' +
      '<div class="bt-stars">' +
        [0, 1, 2].map(function (i) {
          return '<i class="' + (live.stars > i ? 'on' : '') + '"></i>';
        }).join('') +
      '</div>' +
      '<div class="bt-stat"><span>Time</span><b>' + mins + ':' + (secs < 10 ? '0' : '') + secs + '</b></div>';
  }

  // Watching a raid at 1x is the point; watching the last forty seconds of a
  // won one is not. Half speed is there for reading a messy fight.
  var SPEEDS = [0.5, 1, 2, 4];

  function speedButtons() {
    return SPEEDS.map(function (v) {
      return '<button class="bt-sp' + (speed === v ? ' on' : '') +
        '" data-act="bt-speed" data-v="' + v + '">' +
        (v === 0.5 ? '&frac12;' : v) + '&times;</button>';
    }).join('');
  }

  function trayHTML(b) {
    var out = Object.keys(b.hand).map(function (k) {
      var t = G.troopData[k];
      var key = SP.unitKey(k, 1);
      return '<button class="bt-troop' + (picked === k && !pickedHero ? ' on' : '') +
        '" data-act="bt-pick" data-key="' + k + '">' +
        (key ? SP.img(key, 42, t.name) : '') +
        '<span class="bt-n">' + b.hand[k] + '</span>' +
        '<span class="bt-name">' + ui.esc(t.name) + '</span></button>';
    }).join('');
    out += Object.keys(b.heroes).filter(function (k) { return b.heroes[k]; }).map(function (k) {
      var h = G.heroData[k];
      var key = SP.heroKey(k, 1);
      return '<button class="bt-troop hero' + (picked === k && pickedHero ? ' on' : '') +
        '" data-act="bt-pick" data-key="' + k + '" data-hero="1">' +
        (key ? SP.img(key, 42, h.name) : '') +
        '<span class="bt-name">' + ui.esc(h.name) + '</span></button>';
    }).join('');
    return out || '<span class="hint">Everything is deployed.</span>';
  }

  function render() {
    if (!live) {
      return '<h2 class="screen-head">No battle</h2>' +
        '<p class="screen-sub">Pick a target on the Raid screen.</p>';
    }
    // The battle takes the whole screen: the base is the screen, and the HUD
    // and the troop tray sit on top of it. Anything else -- the site header,
    // the nav, a page that scrolls -- is in the way during a raid.
    return '<div class="battle-wrap" id="battleWrap">' +
      '<canvas id="battleCanvas"></canvas>' +
      '<div class="battle-top">' +
        '<div class="bt-target"><b>' + ui.esc(live.target.name) + '</b>' +
          '<span>Town Hall ' + live.target.th + '</span></div>' +
        '<div id="battleHud" class="bt-hud"></div>' +
        '<div class="bt-speed" id="btSpeed">' + speedButtons() + '</div>' +
        '<button class="btn ghost sm" data-act="bt-end">End raid</button>' +
      '</div>' +
      '<div class="bt-hint" id="btHint">Pick a troop, then tap the ground to drop it</div>' +
      '<div class="bt-tray" id="btTray">' + trayHTML(live) + '</div>' +
      '</div>';
  }

  function mount(host) {
    if (!live) return;
    var canvas = host.querySelector('#battleCanvas');
    if (!canvas) return;
    document.body.classList.add('in-battle');
    function size() {
      var r = canvas.parentElement.getBoundingClientRect();
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(320, Math.round(r.width * dpr));
      canvas.height = Math.max(240, Math.round(r.height * dpr));
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
    }
    size();
    if (mount._ro) mount._ro.disconnect();
    mount._ro = new ResizeObserver(size);
    mount._ro.observe(canvas.parentElement);

    canvas.addEventListener('pointerdown', function (ev) {
      if (!live || live.over) return;
      if (!picked) { ui.toast('Pick a troop first', true); return; }
      var r = canvas.getBoundingClientRect();
      var dpr = canvas.width / r.width;
      var px = (ev.clientX - r.left) * dpr;
      var py = (ev.clientY - r.top) * dpr;
      var view = fitView(live, canvas);
      // Screen back to grid: invert the isometric projection.
      var ux = (px - view.ox) / view.scale;
      var uy = (py - view.oy) / view.scale;
      var gx = (ux / (TILE_W / 2) + uy / (TILE_H / 2)) / 2;
      var gy = (uy / (TILE_H / 2) - ux / (TILE_W / 2)) / 2;
      if (G.battle.deploy(live, picked, gx, gy, pickedHero)) {
        var tray = document.getElementById('btTray');
        if (tray) tray.innerHTML = trayHTML(live);
        var hint = document.getElementById('btHint');
        if (hint) hint.style.opacity = 0;
        if (!live.hand[picked]) { picked = null; pickedHero = false; }
      }
    });

    lastFrame = performance.now();
    acc = 0;
    stop();
    raf = requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------- finish */
  function finish() {
    stop();
    if (!live || live.awarded) return;
    live.awarded = true;
    var res = E.finishBattle(G.state, live.target, live.destruction, live.stars);
    var l = res.looted;
    ui.modal(
      '<h3>' + (live.stars ? 'Victory' : 'Defeat') + '</h3>' +
      '<div class="bt-result">' +
        '<div class="bt-stars big">' + [0, 1, 2].map(function (i) {
          return '<i class="' + (live.stars > i ? 'on' : '') + '"></i>';
        }).join('') + '</div>' +
        '<div class="bt-pct">' + live.destruction + '%</div>' +
      '</div>' +
      '<div class="stat-grid">' +
        '<div class="stat-box"><span class="stat-label">Gold</span><b>' + ui.fmt(l.gold) + '</b></div>' +
        '<div class="stat-box"><span class="stat-label">Elixir</span><b>' + ui.fmt(l.elixir) + '</b></div>' +
        (l.dark ? '<div class="stat-box"><span class="stat-label">Dark elixir</span><b>' + ui.fmt(l.dark) + '</b></div>' : '') +
        '<div class="stat-box"><span class="stat-label">Trophies</span><b>' +
          (res.trophies >= 0 ? '+' : '') + res.trophies + '</b></div>' +
      '</div>' +
      '<button class="btn wide" data-act="bt-leave">Back to the village</button>');
  }

  /* ------------------------------------------------------------ actions */
  ui.actions['bt-pick'] = function (el) {
    picked = el.getAttribute('data-key');
    pickedHero = el.hasAttribute('data-hero');
    var tray = document.getElementById('btTray');
    if (tray && live) tray.innerHTML = trayHTML(live);
  };
  ui.actions['bt-speed'] = function (el) {
    speed = parseFloat(el.getAttribute('data-v')) || 1;
    var host = document.getElementById('btSpeed');
    if (host) host.innerHTML = speedButtons();
  };
  ui.actions['bt-end'] = function () {
    if (!live) return;
    if (!live.over) { live.over = true; finish(); return; }
    // Already finished and the result was dismissed: just leave.
    document.body.classList.remove('in-battle');
    live = null;
    ui.go('village');
  };
  ui.actions['bt-leave'] = function () {
    ui.closeModal();
    live = null;
    picked = null;
    document.body.classList.remove('in-battle');
    ui.go('village');
  };

  G.startBattle = function (target) {
    live = G.battle.create(G.state, target);
    picked = null;
    pickedHero = false;
    speed = 1;
    ui.go('battle');
  };

  ui.register('battle', {
    title: 'Battle',
    render: render,
    mount: mount,
    hidden: function () { return !live; }
  });
})(window.G = window.G || {});
