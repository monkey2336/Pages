/* Village screen: the base you drag buildings around on, the build menu and
   the building details.

   Two board modes share one set of sprites:
     iso  - the Clash-style 2:1 diamond board (default)
     flat - a straight-on square grid, the same 3D buildings standing on it
   Both pin sprites by the manifest anchor, so a building's base always sits on
   its own tile whichever board is showing. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine, SP = G.sprites;
  var TILE_W = SP.TILE_W, TILE_H = SP.TILE_H;
  var CELL = TILE_W / Math.SQRT2;      // pre-transform size of an iso ground cell
  var FLAT_T = 54;                     // tile size on the flat board
  var HEAD = 190;                      // headroom above the grid for tall halls
  var FOOT = 70;

  var selectedId = null;
  var view = { x0: 0, y0: 0, span: 16 };

  function mode(s) {
    return (s.settings && s.settings.view) === 'flat' ? 'flat' : 'iso';
  }

  /* ------------------------------------------------------------ framing */
  function computeView(s) {
    var minX = G.GRID, minY = G.GRID, maxX = 0, maxY = 0, any = false;
    function fold(x, y, size) {
      any = true;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + size); maxY = Math.max(maxY, y + size);
    }
    s.buildings.forEach(function (b) { fold(b.x, b.y, E.bdata(b.key).size); });
    s.walls.forEach(function (w) { fold(w.x, w.y, 1); });
    if (!any) return { x0: 0, y0: 0, span: 14 };
    var pad = 2;
    var span = Math.max(maxX - minX, maxY - minY) + pad * 2;
    span = Math.max(12, Math.min(G.GRID, span));
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    return {
      x0: Math.max(0, Math.min(G.GRID - span, Math.round(cx - span / 2))),
      y0: Math.max(0, Math.min(G.GRID - span, Math.round(cy - span / 2))),
      span: span
    };
  }

  /* --------------------------------------------------------- projection */
  function centreFor(m, lx, ly, size) {
    if (m === 'flat') {
      return { x: (lx + size / 2) * FLAT_T, y: (ly + size / 2) * FLAT_T };
    }
    return SP.tileCentre(lx, ly, size);
  }

  function gridFromScreen(m, x, y) {
    if (m === 'flat') return { x: x / FLAT_T, y: y / FLAT_T };
    return SP.screenToGrid(x, y);
  }

  // Sprites are authored at 64px per tile for the iso board; the flat board
  // uses smaller tiles, so scale to match.
  function spriteScale(m) {
    return m === 'flat' ? (FLAT_T / TILE_W) * 1.3 : 1;
  }

  function tintFor(bd) {
    var p = G.thData(G.state.th).palette;
    if (bd.cat === 'defense') return p.stone;
    if (bd.cat === 'resource') return p.accent;
    if (bd.cat === 'army') return p.accent2;
    if (bd.cat === 'trap') return p.roof;
    return p.stone;
  }

  function spriteNameFor(o, isWall) {
    if (isWall) return SP.wallKey(o.level);
    return o.key === 'townhall' ? SP.townHallKey(o.level) : SP.buildingKey(o.key, o.level);
  }

  /* ------------------------------------------------------------ objects */
  function objectHTML(s, o, isWall) {
    var m = mode(s);
    var bd = isWall ? null : E.bdata(o.key);
    var size = isWall ? 1 : bd.size;
    var lx = o.x - view.x0, ly = o.y - view.y0;
    var name = spriteNameFor(o, isWall);
    var label = isWall
      ? 'Wall level ' + o.level + ' · ' + G.WALL.skin(o.level).name
      : (o.key === 'townhall' ? G.thData(o.level).name : bd.name) + ' · level ' + o.level;
    var attrs = 'data-id="' + o.id + '"' + (isWall ? ' data-wall="1"' : '') +
      ' title="' + ui.esc(label) + '"' +
      (selectedId === o.id ? ' data-selected="1"' : '');
    var badge = (isWall ? '' : '<span class="lvl">' + o.level + '</span>') +
      (o.upgrading ? '<span class="clock"></span>' : '');
    var sprite = name && SP.get(name);
    var z = Math.round((lx + ly + size) * 10);

    if (sprite) {
      var scale = spriteScale(m);
      var c = centreFor(m, lx, ly, size);
      var left = c.x - sprite.anchorX * scale;
      var top = c.y - sprite.anchorY * scale;
      return '<div class="iso-obj" style="left:' + left.toFixed(1) + 'px;top:' + top.toFixed(1) +
        'px;width:' + (sprite.w * scale).toFixed(1) + 'px;height:' + (sprite.h * scale).toFixed(1) +
        'px;z-index:' + z +
        ';--anchor-x:' + (sprite.anchorX * scale).toFixed(1) + 'px' +
        ';--anchor-y:' + (sprite.anchorY * scale).toFixed(1) + 'px" ' + attrs + '>' +
        '<img src="' + sprite.file + '" draggable="false" alt="">' + badge + '</div>';
    }

    // Vector fallback: sit the SVG on the tile.
    var c2 = centreFor(m, lx, ly, size);
    var w = size * (m === 'flat' ? FLAT_T : TILE_W) * 0.92;
    var svg = isWall
      ? '<div class="wall-fallback" style="background:' + G.WALL.skin(o.level).fill + '"></div>'
      : (o.key === 'townhall'
        ? G.art.townHallSVG(o.level, w, true)
        : G.art.buildingSVG(bd.art, G.thData(s.th).palette, w, tintFor(bd)));
    return '<div class="iso-obj fallback" style="left:' + (c2.x - w / 2) + 'px;top:' +
      (c2.y - w * 0.8) + 'px;width:' + w + 'px;height:' + w + 'px;z-index:' + z +
      '" ' + attrs + '>' + svg + badge + '</div>';
  }

  /* ------------------------------------------------------------- render */
  function render(s) {
    view = computeView(s);
    var m = mode(s);
    var busy = E.busyBuilders(s), total = s.builders.length;
    var jobs = E.inProgressJobs(s);
    var shield = s.shieldUntil > Date.now();
    var th = G.thData(s.th);
    var era = G.eraForTH(s.th);

    var html = '<div class="village-head">' +
      '<div class="village-title"><h2>' + ui.esc(th.name) + '</h2>' +
      '<p>' + ui.esc(th.lore) + '</p></div></div>' +
      '<div class="village-tools">' +
        '<button class="btn" data-act="open-build">Build</button>' +
        '<button class="btn ghost" data-act="buy-wall">Buy wall · ' + ui.fmt(E.wallCost(1)) + ' gold</button>' +
        '<button class="btn ghost" data-act="toggle-view">' +
          (m === 'flat' ? 'Board: 2D' : 'Board: isometric') + '</button>' +
        '<span class="pill' + (busy === total ? ' warn' : ' ok') + '">Builders ' + (total - busy) + '/' + total + '</span>' +
        (shield ? '<span class="pill ok">Shield ' + ui.fmtTime((s.shieldUntil - Date.now()) / 1000) + '</span>' : '') +
        '<span class="pill">Walls ' + s.walls.length + '/' + G.WALL.countAt(s.th) + '</span>' +
        '<span class="pill" title="' + ui.esc(era.blurb) + '">' + ui.esc(era.name) + '</span>' +
        '<span class="hint">Drag to rearrange · click for details</span>' +
      '</div>';

    if (jobs.length) {
      html += '<div class="panel"><h3>In progress</h3><div class="grid-cards">' +
        jobs.map(function (j, i) {
          return '<div class="card"><div class="body"><div class="title">' + ui.esc(j.label) +
            '<small>' + j.kind + '</small></div>' +
            ui.jobHTML(j, 'data-act="skip-job" data-idx="' + i + '"') + '</div></div>';
        }).join('') + '</div></div>';
    }

    var objects = s.walls.map(function (w) { return objectHTML(s, w, true); })
      .concat(s.buildings.map(function (b) { return objectHTML(s, b, false); })).join('');

    if (m === 'flat') {
      var side = view.span * FLAT_T;
      html += '<div class="iso-viewport" id="village">' +
        '<div class="iso-stage" id="isoStage" style="width:' + side + 'px;height:' +
          (side + HEAD) + 'px">' +
          '<div class="flat-ground" style="width:' + side + 'px;height:' + side +
            'px;top:' + HEAD + 'px;--cell:' + FLAT_T + 'px"></div>' +
          '<div class="iso-objects" style="left:0px;top:' + HEAD + 'px">' + objects + '</div>' +
        '</div></div>';
    } else {
      var stageW = view.span * TILE_W;
      var stageH = view.span * TILE_H + HEAD + FOOT;
      var originX = view.span * TILE_W / 2;
      var groundSide = view.span * CELL;
      html += '<div class="iso-viewport" id="village">' +
        '<div class="iso-stage" id="isoStage" style="width:' + stageW + 'px;height:' + stageH + 'px">' +
          '<div class="iso-ground" style="width:' + groundSide + 'px;height:' + groundSide +
            'px;--cell:' + CELL.toFixed(3) + 'px;transform:translate(' + originX + 'px,' + HEAD +
            'px) scaleY(0.5) rotate(45deg)"></div>' +
          '<div class="iso-objects" style="left:' + originX + 'px;top:' + HEAD + 'px">' +
            objects +
          '</div>' +
        '</div></div>';
    }
    return html;
  }

  /* --------------------------------------------------------------- drag */
  function mount(host, s) {
    var viewport = host.querySelector('#village');
    var stage = host.querySelector('#isoStage');
    if (!viewport || !stage) return;
    var m = mode(s);

    function fit() {
      var stageW = parseFloat(stage.style.width);
      var stageH = parseFloat(stage.style.height);
      var avail = viewport.clientWidth;
      var availH = viewport.clientHeight;
      var scale = Math.min(avail / stageW, availH / stageH);
      stage.style.transform = 'scale(' + scale + ')';
      stage.style.left = ((avail - stageW * scale) / 2) + 'px';
      stage.style.top = ((availH - stageH * scale) / 2) + 'px';
      stage.dataset.scale = scale;
    }
    fit();
    if (mount._ro) mount._ro.disconnect();
    mount._ro = new ResizeObserver(fit);
    mount._ro.observe(viewport);

    var drag = null;
    var objects = stage.querySelector('.iso-objects');

    objects.addEventListener('pointerdown', function (ev) {
      var el = ev.target.closest('.iso-obj');
      if (!el) return;
      drag = {
        el: el,
        id: el.getAttribute('data-id'),
        isWall: el.hasAttribute('data-wall'),
        startX: ev.clientX,
        startY: ev.clientY,
        left: parseFloat(el.style.left),
        top: parseFloat(el.style.top),
        scale: parseFloat(stage.dataset.scale) || 1,
        moved: false
      };
      el.setPointerCapture(ev.pointerId);
    });

    objects.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var dx = (ev.clientX - drag.startX) / drag.scale;
      var dy = (ev.clientY - drag.startY) / drag.scale;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) {
        drag.moved = true;
        drag.el.classList.add('dragging');
      }
      if (!drag.moved) return;
      drag.el.style.left = (drag.left + dx) + 'px';
      drag.el.style.top = (drag.top + dy) + 'px';
    });

    function endDrag() {
      if (!drag) return;
      var d = drag;
      drag = null;
      d.el.classList.remove('dragging');
      if (!d.moved) {
        selectedId = d.id;
        openDetails(d.id, d.isWall);
        return;
      }
      var obj = d.isWall
        ? G.state.walls.filter(function (w) { return w.id === d.id; })[0]
        : G.state.buildings.filter(function (b) { return b.id === d.id; })[0];
      if (!obj) { ui.render(); return; }
      var size = d.isWall ? 1 : E.bdata(obj.key).size;
      // Convert the sprite's new anchor position back into grid coordinates.
      var name = spriteNameFor(obj, d.isWall);
      var sprite = name && SP.get(name);
      var scale = spriteScale(m);
      var tile = m === 'flat' ? FLAT_T : TILE_W;
      var ax = sprite ? sprite.anchorX * scale : size * tile * 0.46;
      var ay = sprite ? sprite.anchorY * scale : size * tile * 0.8;
      var g = gridFromScreen(m, parseFloat(d.el.style.left) + ax, parseFloat(d.el.style.top) + ay);
      var x = Math.round(g.x - size / 2) + view.x0;
      var y = Math.round(g.y - size / 2) + view.y0;
      x = Math.max(0, Math.min(G.GRID - size, x));
      y = Math.max(0, Math.min(G.GRID - size, y));
      if (G.store.occupied(G.state, x, y, size, size, obj.id)) {
        ui.toast('Something is already there', true);
      } else {
        obj.x = x;
        obj.y = y;
      }
      ui.render();
    }
    objects.addEventListener('pointerup', endDrag);
    objects.addEventListener('pointercancel', endDrag);
  }

  function live(host) { ui.tickTimers(host); }

  /* ---------------------------------------------------------- details */
  function buildingArt(key, level, px) {
    var name = key === 'townhall' ? SP.townHallKey(level) : SP.buildingKey(key, level);
    if (name) return SP.img(name, px, '');
    var bd = E.bdata(key);
    return key === 'townhall'
      ? G.art.townHallSVG(level, px)
      : G.art.buildingSVG(bd.art, G.thData(G.state.th).palette, px, tintFor(bd));
  }
  G.villageArt = buildingArt;

  // Every level has its own design, so the upgrade button can always show you
  // exactly what you are buying.
  function appearancePanel(key, level, maxLevel) {
    if (key === 'townhall') return '';
    var era = G.eraFor(level, G.BUILDING_ART_SPAN);
    var next = level + 1;
    var html = '<div class="panel"><h3>Appearance</h3>' +
      '<div class="stat-row" style="margin-bottom:8px">' +
        '<span>Design <b>' + level + ' of ' + G.BUILDING_ART_SPAN + '</b></span>' +
        '<span>Built from <b>' + ui.esc(era.name) + '</b></span>' +
      '</div>' +
      '<p class="hint" style="margin:0 0 10px">' + ui.esc(era.blurb) +
      ' Every level is its own design — materials and ornament change with each upgrade.</p>';
    if (next <= Math.min(G.BUILDING_ART_SPAN, maxLevel)) {
      html += '<div class="art-compare">' +
        '<figure>' + buildingArt(key, level, 92) + '<figcaption>level ' + level + '</figcaption></figure>' +
        '<span class="art-arrow">→</span>' +
        '<figure>' + buildingArt(key, next, 92) + '<figcaption>level ' + next + '</figcaption></figure>' +
        '</div>';
    }
    return html + '</div>';
  }

  function openDetails(id, isWall) {
    var s = G.state;
    if (isWall) {
      var w = s.walls.filter(function (x) { return x.id === id; })[0];
      if (!w) return;
      var skin = G.WALL.skin(w.level);
      var max = E.wallMax(s);
      var wEra = G.wallEra(w.level);
      var nextW = w.level < max ? w.level + 1 : null;
      ui.modal('<h3>Wall segment</h3>' +
        '<p class="screen-sub">Level ' + w.level + ' · ' + ui.esc(skin.name) + ' · ' +
        ui.esc(wEra.name) + (w.level >= max ? ' · maxed for Town Hall ' + s.th : '') + '</p>' +
        (nextW
          ? '<div class="art-compare">' +
            '<figure>' + (SP.wallKey(w.level) ? SP.img(SP.wallKey(w.level), 96, 'wall') : '') +
              '<figcaption>level ' + w.level + '</figcaption></figure>' +
            '<span class="art-arrow">→</span>' +
            '<figure>' + (SP.wallKey(nextW) ? SP.img(SP.wallKey(nextW), 96, 'wall') : '') +
              '<figcaption>level ' + nextW + ' · ' + ui.esc(G.WALL.skin(nextW).name) + '</figcaption></figure>' +
            '</div>' +
            '<button class="btn wide" data-act="upgrade-wall" data-id="' + w.id + '">Upgrade to ' +
            nextW + ' · ' + ui.fmt(E.wallCost(nextW)) + ' gold</button>'
          : '<div style="text-align:center">' +
            (SP.wallKey(w.level) ? SP.img(SP.wallKey(w.level), 110, 'wall') : '') + '</div>' +
            '<p class="hint">Raise the Town Hall to unlock wall level ' + (max + 1) + '.</p>') +
        '<p class="hint" style="margin-top:10px">Walls are cut from the same materials as your buildings at that level, so a base always matches. Upgrade hundreds at a time from the Laboratory → Walls.</p>');
      return;
    }

    var b = s.buildings.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    var isTH = b.key === 'townhall';
    var bd = E.bdata(b.key);
    var name = isTH ? G.thData(b.level).name : bd.name;
    var maxLvl = E.maxLevelFor(s, b.key);
    var next = b.level + 1;
    var body = '<h3>' + ui.esc(name) + '</h3>' +
      '<p class="screen-sub">' + (isTH ? ui.esc(G.thData(b.level).lore) : ui.esc(bd.desc || '')) + '</p>' +
      '<div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">' +
        '<div>' + buildingArt(b.key, b.level, isTH ? 150 : 110) + '</div>' +
        '<div class="stat-row" style="flex-direction:column;gap:4px">' +
          '<span>Level <b>' + b.level + '</b> / ' + maxLvl + '</span>' +
          (bd.dps ? '<span>DPS <b>' + Math.round(bd.dps * Math.pow(1.16, b.level - 1)) + '</b></span>' : '') +
          (bd.hp ? '<span>HP <b>' + Math.round(bd.hp * Math.pow(1.14, b.level - 1)) + '</b></span>' : '') +
          (bd.produces ? '<span>Output <b>' + Object.keys(bd.produces).map(function (r) {
            return ui.fmt(bd.produces[r] * Math.pow(1.35, b.level - 1)) + ' ' + r + '/hr';
          }).join(', ') + '</b></span>' : '') +
        '</div>' +
      '</div>';

    if (b.upgrading) {
      body += '<div class="panel">' + ui.jobHTML(b.upgrading, 'data-act="skip-building" data-id="' + b.id + '"') + '</div>';
    } else if (next <= maxLvl) {
      var cost = E.buildingCost(s, b.key, next);
      var res = E.buildingResource(b.key);
      var secs = E.buildingSeconds(s, b.key, next);
      body += '<button class="btn wide" data-act="upgrade-building" data-id="' + b.id + '">' +
        'Upgrade to ' + next + ' · ' + ui.fmt(cost) + ' ' + res + ' · ' + ui.fmtTime(secs) + '</button>';
      if (isTH) {
        var t = G.thData(next);
        body += '<div class="panel" style="margin-top:12px"><h3>Next: ' + ui.esc(t.name) + '</h3>' +
          '<div style="display:flex;gap:12px;align-items:center">' +
          (SP.townHallKey(next) ? SP.img(SP.townHallKey(next), 110, t.name) : G.art.townHallSVG(next, 100)) +
          '<div><p class="hint" style="margin:0 0 6px">' + ui.esc(t.lore) + '</p>' +
          '<p class="hint" style="margin:0">Unlocks: ' + ui.esc(t.unlocks.join(', ')) + '</p>' +
          '<div class="swatches" style="justify-content:flex-start;margin-top:8px">' +
            ['accent', 'accent2', 'roof', 'stone', 'wall', 'glow'].map(function (k) {
              return '<i style="background:' + t.palette[k] + '"></i>';
            }).join('') + '</div></div></div></div>';
      }
    } else {
      body += '<p class="hint">Maxed for Town Hall ' + s.th + '.</p>';
    }

    body += appearancePanel(b.key, b.level, Math.max(maxLvl, b.level));

    if (!isTH) {
      body += '<button class="btn ghost wide" style="margin-top:8px" data-act="sell-building" data-id="' + b.id + '">Remove building</button>';
    }
    ui.modal(body);
  }

  /* ---------------------------------------------------------- actions */
  ui.actions['toggle-view'] = function () {
    var s = G.state;
    s.settings.view = mode(s) === 'flat' ? 'iso' : 'flat';
    ui.toast(s.settings.view === 'flat' ? 'Flat 2D board' : 'Isometric board');
    ui.render();
  };

  ui.actions['open-build'] = function () {
    var s = G.state;
    var cats = [['resource', 'Resource'], ['army', 'Army'], ['defense', 'Defenses'], ['trap', 'Traps']];
    var html = '<h3>Build</h3><p class="screen-sub">Everything your Town Hall allows. Greyed rows need a higher Town Hall.</p>';
    cats.forEach(function (c) {
      var rows = G.BUILDINGS.filter(function (bd) { return bd.cat === c[0]; }).map(function (bd) {
        var allowed = G.allowedCount(bd.key, s.th);
        var owned = E.ownedCount(s, bd.key);
        var canB = allowed > owned;
        var cost = E.buildingCost(s, bd.key, 1);
        var afford = s.resources[bd.res] >= cost;
        var locked = s.th < bd.unlockTH;
        return '<div class="card' + (locked || !canB ? ' locked' : '') + '">' +
          '<div class="icon">' + buildingArt(bd.key, 1, 46) + '</div>' +
          '<div class="body"><div class="title">' + ui.esc(bd.name) +
            '<small>' + owned + '/' + allowed + '</small></div>' +
          '<div class="desc">' + ui.esc(bd.desc || '') + '</div>' +
          (locked
            ? '<span class="pill">Town Hall ' + bd.unlockTH + '</span>'
            : canB
              ? '<button class="btn sm" data-act="build-new" data-key="' + bd.key + '">Build · ' +
                ui.fmt(cost) + ' ' + bd.res + '</button>' + (afford ? '' : ' <span class="cost short">short</span>')
              : '<span class="pill">Limit reached</span>') +
          '</div></div>';
      }).join('');
      html += '<div class="panel"><h3>' + c[1] + '</h3><div class="grid-cards">' + rows + '</div></div>';
    });
    ui.modal(html);
  };

  ui.actions['build-new'] = function (el) {
    var r = E.buildNew(G.state, el.getAttribute('data-key'));
    if (ui.report(r, 'Under construction')) { ui.closeModal(); ui.render(); }
  };

  ui.actions['upgrade-building'] = function (el) {
    var r = E.startUpgrade(G.state, el.getAttribute('data-id'));
    if (ui.report(r, 'Upgrade started')) { ui.closeModal(); ui.render(); }
  };

  ui.actions['skip-building'] = function (el) {
    var s = G.state;
    var b = s.buildings.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
    if (!b || !b.upgrading) return;
    var r = E.skipWithGems(s, { kind: 'building', ref: b, ends: b.upgrading.ends });
    if (ui.report(r)) { ui.closeModal(); ui.render(); }
  };

  ui.actions['skip-job'] = function (el) {
    var jobs = E.inProgressJobs(G.state);
    var job = jobs[parseInt(el.getAttribute('data-idx'), 10)];
    if (!job) return;
    if (ui.report(E.skipWithGems(G.state, job))) ui.render();
  };

  ui.actions['sell-building'] = function (el) {
    var s = G.state;
    var id = el.getAttribute('data-id');
    var b = s.buildings.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    if (b.upgrading) { ui.toast('Finish the upgrade first', true); return; }
    s.buildings = s.buildings.filter(function (x) { return x.id !== id; });
    var refund = Math.round(E.buildingCost(s, b.key, b.level) * 0.3);
    E.addResource(s, E.buildingResource(b.key), refund);
    ui.closeModal();
    ui.toast('Removed. Refunded ' + ui.fmt(refund) + '.');
    ui.render();
  };

  ui.actions['buy-wall'] = function () {
    if (ui.report(E.buyWall(G.state), 'Wall segment placed')) ui.render();
  };

  ui.actions['upgrade-wall'] = function (el) {
    var s = G.state;
    var w = s.walls.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
    if (!w) return;
    var cost = E.wallCost(w.level + 1);
    if (!E.spend(s, 'gold', cost)) { ui.toast('Not enough gold', true); return; }
    w.level++;
    s.stats.upgradesDone++;
    ui.closeModal();
    ui.render();
  };

  ui.register('village', {
    title: 'Village',
    render: render,
    mount: mount,
    live: live,
    badge: function (s) {
      var free = s.builders.length - E.busyBuilders(s);
      return free ? free + ' free' : '';
    }
  });
})(window.G = window.G || {});
