/* Village screen: the draggable base layout, build menu and building details. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine;
  var selectedId = null;
  // The view frames just the part of the grid you are actually using, so an
  // eight-building village is not lost in a 48x48 field.
  var view = { x0: 0, y0: 0, span: G.GRID };

  function computeView(s) {
    var minX = G.GRID, minY = G.GRID, maxX = 0, maxY = 0, any = false;
    function fold(x, y, size) {
      any = true;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + size); maxY = Math.max(maxY, y + size);
    }
    s.buildings.forEach(function (b) { fold(b.x, b.y, E.bdata(b.key).size); });
    s.walls.forEach(function (w) { fold(w.x, w.y, 1); });
    if (!any) return { x0: 0, y0: 0, span: G.GRID };
    var pad = 3;
    var span = Math.max(maxX - minX, maxY - minY) + pad * 2;
    span = Math.max(12, Math.min(G.GRID, span));
    var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    var x0 = Math.max(0, Math.min(G.GRID - span, Math.round(cx - span / 2)));
    var y0 = Math.max(0, Math.min(G.GRID - span, Math.round(cy - span / 2)));
    return { x0: x0, y0: y0, span: span };
  }

  function tileHTML(s, o, isWall) {
    var pct = 100 / view.span;
    var bd = isWall ? null : E.bdata(o.key);
    var size = isWall ? 1 : (bd ? bd.size : 3);
    var style = 'left:' + ((o.x - view.x0) * pct) + '%;top:' + ((o.y - view.y0) * pct) + '%;' +
      'width:' + (size * pct) + '%;height:' + (size * pct) + '%;';
    if (isWall) {
      var skin = G.WALL.skin(o.level);
      style += 'background:' + skin.fill + ';box-shadow:inset 0 -3px 0 ' + skin.edge + ';';
      if (skin.glow) style += 'outline:1px solid ' + skin.glow + '55;';
      return '<div class="tile wall' + (selectedId === o.id ? ' selected' : '') +
        '" data-id="' + o.id + '" data-wall="1" style="' + style + '" title="Wall level ' + o.level + ' · ' + skin.name + '"></div>';
    }
    var art = o.key === 'townhall' ? null : bd.art;
    var svg = o.key === 'townhall'
      ? G.art.townHallSVG(o.level, 64, true)
      : G.art.buildingSVG(art, G.thData(s.th).palette, 48, tintFor(bd));
    return '<div class="tile ' + o.key + (selectedId === o.id ? ' selected' : '') + '" data-id="' + o.id + '" style="' + style +
      '" title="' + ui.esc(o.key === 'townhall' ? G.thData(o.level).name : bd.name) + ' · level ' + o.level + '">' +
      svg +
      '<span class="lvl">' + o.level + '</span>' +
      (o.upgrading ? '<span class="clock"></span>' : '') +
      '</div>';
  }

  function tintFor(bd) {
    var p = G.thData(G.state.th).palette;
    if (bd.cat === 'defense') return p.stone;
    if (bd.cat === 'resource') return p.accent;
    if (bd.cat === 'army') return p.accent2;
    if (bd.cat === 'trap') return p.roof;
    return p.stone;
  }

  function render(s) {
    var busy = E.busyBuilders(s), total = s.builders.length;
    var jobs = E.inProgressJobs(s);
    var shield = s.shieldUntil > Date.now();

    var html = '<h2 class="screen-head">' + ui.esc(G.thData(s.th).name) + '</h2>' +
      '<p class="screen-sub">' + ui.esc(G.thData(s.th).lore) + '</p>' +
      '<div class="village-tools">' +
        '<button class="btn" data-act="open-build">Build</button>' +
        '<button class="btn ghost" data-act="buy-wall">Buy wall segment · ' +
          ui.fmt(E.wallCost(1)) + ' gold</button>' +
        '<span class="pill' + (busy === total ? ' warn' : ' ok') + '">Builders ' + (total - busy) + '/' + total + ' free</span>' +
        (shield ? '<span class="pill ok">Shield ' + ui.fmtTime((s.shieldUntil - Date.now()) / 1000) + '</span>' : '') +
        '<span class="pill">Walls ' + s.walls.length + '/' + G.WALL.countAt(s.th) + '</span>' +
        '<span class="pill">Trophies ' + s.trophies + '</span>' +
        '<span class="hint">Drag anything to rearrange. Click for details.</span>' +
      '</div>';

    if (jobs.length) {
      html += '<div class="panel"><h3>In progress</h3><div class="grid-cards">' +
        jobs.map(function (j) {
          return '<div class="card"><div class="body"><div class="title">' + ui.esc(j.label) +
            '<small>' + j.kind + '</small></div>' +
            ui.jobHTML(j, 'data-act="skip-job" data-idx="' + jobs.indexOf(j) + '"') + '</div></div>';
        }).join('') + '</div></div>';
    }

    view = computeView(s);
    html += '<div class="village-wrap" id="village" style="--cells:' + view.span + '">' +
      s.walls.map(function (w) { return tileHTML(s, w, true); }).join('') +
      s.buildings.map(function (b) { return tileHTML(s, b, false); }).join('') +
      '</div>';
    return html;
  }

  /* ------------------------------------------------------------- drag */
  function mount(host, s) {
    var wrap = host.querySelector('#village');
    if (!wrap) return;
    var drag = null;

    wrap.addEventListener('pointerdown', function (ev) {
      var tile = ev.target.closest('.tile');
      if (!tile) return;
      var rect = wrap.getBoundingClientRect();
      var tr = tile.getBoundingClientRect();
      drag = {
        el: tile,
        id: tile.getAttribute('data-id'),
        isWall: tile.hasAttribute('data-wall'),
        dx: ev.clientX - tr.left,
        dy: ev.clientY - tr.top,
        rect: rect,
        moved: false,
        startX: ev.clientX,
        startY: ev.clientY
      };
      tile.setPointerCapture(ev.pointerId);
    });

    wrap.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      var dist = Math.abs(ev.clientX - drag.startX) + Math.abs(ev.clientY - drag.startY);
      if (dist > 4) {
        drag.moved = true;
        drag.el.classList.add('dragging');
      }
      if (!drag.moved) return;
      var x = ev.clientX - drag.rect.left - drag.dx;
      var y = ev.clientY - drag.rect.top - drag.dy;
      drag.el.style.left = (x / drag.rect.width * 100) + '%';
      drag.el.style.top = (y / drag.rect.height * 100) + '%';
    });

    function endDrag(ev) {
      if (!drag) return;
      var d = drag;
      drag = null;
      d.el.classList.remove('dragging');
      if (!d.moved) {
        selectedId = d.id;
        openDetails(d.id, d.isWall);
        return;
      }
      var x = Math.round(parseFloat(d.el.style.left) / 100 * view.span) + view.x0;
      var y = Math.round(parseFloat(d.el.style.top) / 100 * view.span) + view.y0;
      var obj = d.isWall
        ? G.state.walls.filter(function (w) { return w.id === d.id; })[0]
        : G.state.buildings.filter(function (b) { return b.id === d.id; })[0];
      if (!obj) { ui.render(); return; }
      var size = d.isWall ? 1 : E.bdata(obj.key).size;
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
    wrap.addEventListener('pointerup', endDrag);
    wrap.addEventListener('pointercancel', endDrag);
  }

  function live(host) { ui.tickTimers(host); }

  /* ---------------------------------------------------------- details */
  function openDetails(id, isWall) {
    var s = G.state;
    if (isWall) {
      var w = s.walls.filter(function (x) { return x.id === id; })[0];
      if (!w) return;
      var skin = G.WALL.skin(w.level);
      var max = E.wallMax(s);
      var cost = E.wallCost(w.level + 1);
      ui.modal('<h3>Wall segment</h3>' +
        '<p class="screen-sub">Level ' + w.level + ' · ' + ui.esc(skin.name) +
        (w.level >= max ? ' · maxed for Town Hall ' + s.th : '') + '</p>' +
        '<div style="height:26px;border-radius:5px;background:' + skin.fill +
          ';box-shadow:inset 0 -6px 0 ' + skin.edge + ';margin-bottom:12px"></div>' +
        (w.level < max
          ? '<button class="btn wide" data-act="upgrade-wall" data-id="' + w.id + '">Upgrade to ' +
            (w.level + 1) + ' · ' + ui.fmt(cost) + ' gold</button>'
          : '<p class="hint">Raise the Town Hall to unlock wall level ' + (max + 1) + '.</p>') +
        '<p class="hint" style="margin-top:10px">Upgrade hundreds at a time from the Laboratory → Walls.</p>');
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
        '<div>' + (isTH ? G.art.townHallSVG(b.level, 120) : G.art.buildingSVG(bd.art, G.thData(s.th).palette, 72, tintFor(bd))) + '</div>' +
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
        body += '<div class="panel" style="margin-top:12px"><h3>Town Hall ' + next + ' — ' + ui.esc(t.name) + '</h3>' +
          '<div style="display:flex;gap:12px;align-items:center">' + G.art.townHallSVG(next, 90) +
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

    if (!isTH) {
      body += '<button class="btn ghost wide" style="margin-top:8px" data-act="sell-building" data-id="' + b.id + '">Remove building</button>';
    }
    ui.modal(body);
  }

  /* ---------------------------------------------------------- actions */
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
          '<div class="icon">' + G.art.buildingSVG(bd.art, G.thData(s.th).palette, 40, tintFor(bd)) + '</div>' +
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
