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
  // The board never reframes. It is the whole grid, always, so a building
  // stays where you put it on screen instead of the camera sliding around
  // every time you add or remove something. What moves is you: zoom and pan.
  function computeView() {
    return { x0: 0, y0: 0, span: G.GRID };
  }

  // Start zoomed in on the middle of the field, where a village begins, not
  // pulled back far enough to see all 52 tiles of empty grass.
  function cam(s) {
    if (!s.settings.cam) s.settings.cam = { z: 2.4, x: 0, y: 0 };
    return s.settings.cam;
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

  /* ----------------------------------------------------------- scenery */
  // The village stands in a wood. The forest is deliberately fixed -- it does
  // not re-theme with the Town Hall the way the base does -- and it is
  // scattered from a seeded generator so it stays put between renders instead
  // of reshuffling every time a timer ticks.
  // Two sets mixed together. The procedural conifers are still the better
  // trees, so they stay; the KayKit models are added for variety, because a
  // wood built from five shapes reads as five shapes no matter how good each
  // one is. The ground detail is all theirs -- there was none before.
  var TREES = ['pine', 'pinetall', 'oak', 'oakold', 'birch',
               'ktree1', 'ktree2', 'ktree3', 'ktree4', 'ktree5',
               'kdead1', 'kdead2'];
  var UNDERGROWTH = ['bush', 'flowers', 'rock', 'stump', 'log',
                     'kbush1', 'kbush2', 'kbush3', 'kbush4',
                     'krock1', 'krock2', 'krock3', 'krock4', 'koutcrop',
                     'kgrass1', 'kgrass2', 'kgrass3'];
  var BAND = 7;          // how many tiles of wood to grow beyond the plot
  var Z_BASE = 1000;     // keeps every z-index positive, scenery included

  // mulberry32: a real PRNG sequence. A sin-based hash keyed on the loop index
  // lays trees out on visible diagonals, because neighbouring indices produce
  // neighbouring values -- exactly the pattern a wood should not have.
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var sceneryCache = { key: null, list: [] };

  function sceneryFor(m, span) {
    var key = m + span;
    if (sceneryCache.key === key) return sceneryCache.list;
    var rand = prng(0x5eed + span);
    var list = [];
    // The flat board is letterboxed left and right, so the wood has to run
    // further out sideways there to reach the edge of the viewport.
    var bandX = m === 'flat' ? BAND * 2.6 : BAND;
    var bandY = m === 'flat' ? BAND * 1.2 : BAND;
    var cap = m === 'flat' ? 260 : 165;
    var loX = -bandX, hiX = span + bandX;
    var loY = -bandY, hiY = span + bandY;
    var edge = 0.9;                      // clearance kept around the plot
    for (var i = 0; i < 2000 && list.length < cap; i++) {
      var x = loX + rand() * (hiX - loX);
      var y = loY + rand() * (hiY - loY);
      var keep = rand(), pick = rand(), which = rand();
      var sc = rand(), fl = rand();
      if (x > -edge && x < span + edge && y > -edge && y < span + edge) continue;
      // Thicker the further out you go, so the treeline reads as depth rather
      // than a hedge planted round the base.
      var out = Math.min(
        Math.max(-x, x - span, 0) / bandX + Math.max(-y, y - span, 0) / bandY, 2) / 2;
      if (keep > (m === 'flat' ? 0.4 : 0.3) + out * 0.9) continue;
      var kind = pick < 0.6
        ? TREES[Math.floor(which * TREES.length)]
        : UNDERGROWTH[Math.floor(which * UNDERGROWTH.length)];
      list.push({ kind: kind, x: x, y: y, scale: 0.8 + sc * 0.5, flip: fl > 0.5 });
    }
    sceneryCache = { key: key, list: list };
    return list;
  }

  function propHTML(m, p) {
    var sprite = SP.get('sc_' + p.kind);
    if (!sprite) return '';
    var scale = spriteScale(m) * p.scale;
    var c = centreFor(m, p.x, p.y, 1);
    var left = c.x - sprite.anchorX * scale;
    var top = c.y - sprite.anchorY * scale;
    var shW = (m === 'flat' ? FLAT_T : TILE_W) * 0.7 * p.scale;
    return '<div class="iso-prop" style="left:' + left.toFixed(1) + 'px;top:' + top.toFixed(1) +
      'px;width:' + (sprite.w * scale).toFixed(1) + 'px;height:' + (sprite.h * scale).toFixed(1) +
      'px;z-index:' + (Z_BASE + Math.round((p.x + p.y + 1) * 10)) +
      ';--anchor-x:' + (sprite.anchorX * scale).toFixed(1) + 'px' +
      ';--anchor-y:' + (sprite.anchorY * scale).toFixed(1) + 'px' +
      ';--shadow-w:' + shW.toFixed(1) + 'px;--shadow-h:' + (shW * 0.5).toFixed(1) + 'px' +
      (p.flip ? ';transform:scaleX(-1)' : '') + '">' +
      (sprite.drawnShadow ? '<i class="shade"></i>' : '') +
      '<img src="' + sprite.file + '" draggable="false" alt="">' + '</div>';
  }

  function sceneryHTML(m, span) {
    return sceneryFor(m, span).map(function (p) { return propHTML(m, p); }).join('');
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
    var z = Z_BASE + Math.round((lx + ly + size) * 10);

    if (sprite) {
      var scale = spriteScale(m);
      var c = centreFor(m, lx, ly, size);
      var left = c.x - sprite.anchorX * scale;
      var top = c.y - sprite.anchorY * scale;
      // Ground shadow is drawn, not baked. A baked shadow is clipped by the
      // sprite's own frame and can never fall across the building beside it.
      var shW = size * (m === 'flat' ? FLAT_T : TILE_W) * 0.92;
      var shH = shW * (m === 'flat' ? 0.5 : 0.5);
      return '<div class="iso-obj" style="left:' + left.toFixed(1) + 'px;top:' + top.toFixed(1) +
        'px;width:' + (sprite.w * scale).toFixed(1) + 'px;height:' + (sprite.h * scale).toFixed(1) +
        'px;z-index:' + z +
        ';--anchor-x:' + (sprite.anchorX * scale).toFixed(1) + 'px' +
        ';--anchor-y:' + (sprite.anchorY * scale).toFixed(1) + 'px' +
        ';--shadow-w:' + shW.toFixed(1) + 'px;--shadow-h:' + shH.toFixed(1) + 'px" ' + attrs + '>' +
        (sprite.drawnShadow ? '<i class="shade"></i>' : '') +
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
        '<button class="btn" data-act="open-build">Shop</button>' +
        '<button class="btn ghost" data-act="buy-wall">Buy wall · ' + ui.fmt(E.wallCost(1)) + ' gold</button>' +
        '<button class="btn ghost" data-act="toggle-view">' +
          (m === 'flat' ? 'Board: 2D' : 'Board: isometric') + '</button>' +
        '<span class="zoom-tools">' +
          '<button class="btn ghost sm" data-act="zoom-out" title="Zoom out">&minus;</button>' +
          '<button class="btn ghost sm" data-act="zoom-reset" title="Fit the whole field">Fit</button>' +
          '<button class="btn ghost sm" data-act="zoom-in" title="Zoom in">+</button>' +
        '</span>' +
        '<span class="pill' + (busy === total ? ' warn' : ' ok') + '">Builders ' + (total - busy) + '/' + total + '</span>' +
        (shield ? '<span class="pill ok">Shield ' + ui.fmtTime((s.shieldUntil - Date.now()) / 1000) + '</span>' : '') +
        '<span class="pill">Walls ' + s.walls.length + '/' + G.WALL.countAt(s.th) + '</span>' +
        '<span class="pill" title="' + ui.esc(era.blurb) + '">' + ui.esc(era.name) + '</span>' +
        '<span class="hint">Drag a building to move it · drag the ground to pan · pinch or scroll to zoom</span>' +
      '</div>';

    if (jobs.length) {
      html += '<div class="panel"><h3>In progress</h3><div class="grid-cards">' +
        jobs.map(function (j, i) {
          return '<div class="card"><div class="body"><div class="title">' + ui.esc(j.label) +
            '<small>' + j.kind + '</small></div>' +
            ui.jobHTML(j, 'data-act="skip-job" data-idx="' + i + '"') + '</div></div>';
        }).join('') + '</div></div>';
    }

    var objects = sceneryHTML(m, view.span) +
      s.walls.map(function (w) { return objectHTML(s, w, true); }).join('') +
      s.buildings.map(function (b) { return objectHTML(s, b, false); }).join('');

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

    // Zoom 1 shows the whole field; you zoom in from there. Camera state
    // lives in the save, so the board looks the same when you come back.
    var c = cam(s);
    var baseScale = 1;

    function fit() {
      var stageW = parseFloat(stage.style.width);
      var stageH = parseFloat(stage.style.height);
      var avail = viewport.clientWidth;
      var availH = viewport.clientHeight;
      baseScale = Math.min(avail / stageW, availH / stageH);
      var scale = baseScale * (c.z || 1);
      // Keep the pan inside the field, allowing for the margin the zoom adds.
      var maxX = Math.max(0, (stageW * scale - avail) / 2);
      var maxY = Math.max(0, (stageH * scale - availH) / 2);
      c.x = Math.max(-maxX, Math.min(maxX, c.x || 0));
      c.y = Math.max(-maxY, Math.min(maxY, c.y || 0));
      stage.style.transform = 'scale(' + scale + ')';
      stage.style.left = ((avail - stageW * scale) / 2 + c.x) + 'px';
      stage.style.top = ((availH - stageH * scale) / 2 + c.y) + 'px';
      stage.dataset.scale = scale;
    }
    if (!c.z) c.z = 2.4;
    fit();
    if (mount._ro) mount._ro.disconnect();
    mount._ro = new ResizeObserver(fit);
    mount._ro.observe(viewport);

    // Zoom about the pointer, so what you are looking at stays put.
    function zoomAt(factor, clientX, clientY) {
      var r = viewport.getBoundingClientRect();
      var px = (clientX == null ? r.width / 2 : clientX - r.left) - r.width / 2;
      var py = (clientY == null ? r.height / 2 : clientY - r.top) - r.height / 2;
      var was = c.z;
      c.z = Math.max(1, Math.min(5, c.z * factor));
      var k = c.z / was;
      c.x = (c.x - px) * k + px;
      c.y = (c.y - py) * k + py;
      fit();
    }

    viewport.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      zoomAt(ev.deltaY < 0 ? 1.12 : 1 / 1.12, ev.clientX, ev.clientY);
    }, { passive: false });

    ui.actions['zoom-in'] = function () { zoomAt(1.35); };
    ui.actions['zoom-out'] = function () { zoomAt(1 / 1.35); };
    ui.actions['zoom-reset'] = function () { c.z = 1; c.x = 0; c.y = 0; fit(); };

    // Two fingers pinch to zoom; one finger on open ground pans the board.
    var pinch = null, pan = null;
    var points = {};
    viewport.addEventListener('pointerdown', function (ev) {
      points[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(points);
      if (ids.length === 2) {
        var a = points[ids[0]], b2 = points[ids[1]];
        pinch = { d: Math.hypot(a.x - b2.x, a.y - b2.y) };
        pan = null;
      } else if (!ev.target.closest('.iso-obj')) {
        pan = { x: ev.clientX, y: ev.clientY, cx: c.x, cy: c.y };
      }
    });
    viewport.addEventListener('pointermove', function (ev) {
      if (!points[ev.pointerId]) return;
      points[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(points);
      if (pinch && ids.length >= 2) {
        var a = points[ids[0]], b2 = points[ids[1]];
        var d = Math.hypot(a.x - b2.x, a.y - b2.y);
        if (pinch.d > 0) {
          zoomAt(d / pinch.d, (a.x + b2.x) / 2, (a.y + b2.y) / 2);
        }
        pinch.d = d;
      } else if (pan) {
        c.x = pan.cx + (ev.clientX - pan.x);
        c.y = pan.cy + (ev.clientY - pan.y);
        fit();
      }
    });
    function releasePoint(ev) {
      delete points[ev.pointerId];
      if (Object.keys(points).length < 2) pinch = null;
      if (!Object.keys(points).length) pan = null;
    }
    viewport.addEventListener('pointerup', releasePoint);
    viewport.addEventListener('pointercancel', releasePoint);

    var drag = null;
    var objects = stage.querySelector('.iso-objects');

    // Which object is under the pointer. Sprites are rectangular PNGs whose
    // empty corners overlap their neighbours, so hit-testing by element grabs
    // whichever image happens to be on top -- usually not the building you
    // aimed at. Resolve by tile instead, the way you actually see the board,
    // and only fall back to the element when the pointer is off the grid
    // (the spire of a tall tower rises well above its own tile).
    function pickAt(clientX, clientY, fallbackEl) {
      var s2 = G.state;
      var rect = objects.getBoundingClientRect();
      var scale = parseFloat(stage.dataset.scale) || 1;
      var g = gridFromScreen(m, (clientX - rect.left) / scale, (clientY - rect.top) / scale);
      var tx = Math.floor(g.x) + view.x0, ty = Math.floor(g.y) + view.y0;
      var hit = null;
      s2.buildings.forEach(function (b) {
        var size = E.bdata(b.key).size;
        if (tx >= b.x && tx < b.x + size && ty >= b.y && ty < b.y + size) hit = b;
      });
      if (!hit) {
        s2.walls.forEach(function (w) {
          if (tx === w.x && ty === w.y) hit = w;
        });
      }
      if (!hit) return fallbackEl;
      return objects.querySelector('.iso-obj[data-id="' + hit.id + '"]') || fallbackEl;
    }

    objects.addEventListener('pointerdown', function (ev) {
      var el = pickAt(ev.clientX, ev.clientY, ev.target.closest('.iso-obj'));
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
    var body = G.upgradeSheet.sheet(s, b) +
      appearancePanel(b.key, b.level, Math.max(E.maxLevelFor(s, b.key), b.level));
    if (b.key !== 'townhall') {
      body += '<button class="btn ghost wide" style="margin-top:8px" data-act="sell-building" data-id="' +
        b.id + '">Remove building</button>';
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

  // Buying is its own screen now -- the board button just takes you there.
  ui.actions['open-build'] = function () { ui.go('shop'); };

  ui.actions['build-new'] = function (el) {
    var r = E.buildNew(G.state, el.getAttribute('data-key'));
    if (ui.report(r, 'Under construction')) { ui.closeModal(); ui.render(); }
  };

  ui.actions['open-screen'] = function (el) {
    ui.closeModal();
    ui.go(el.getAttribute('data-screen'));
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
    live: live
  });
})(window.G = window.G || {});
