/* The Laboratory: one hall for upgrading walls, buildings, troops, spells and
   siege machines. Walls and buildings are worked by Builders; troops, spells
   and siege machines occupy Laboratory research slots. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine, SP = G.sprites;

  function unitIcon(u, px, level) {
    if (G.spellData[u.key]) return G.art.spellSVG(u.tint, px);
    var key = SP.unitKey(u.key, level || 1);
    return key ? SP.img(key, px, u.name) : G.art.unitSVG(u.art, u.tint, px, u.air);
  }
  var tab = 'walls';

  function tabsHTML() {
    var tabs = [['walls', 'Walls'], ['buildings', 'Buildings'], ['troops', 'Troops'],
                ['spells', 'Spells'], ['siege', 'Siege']];
    return '<div class="tabs">' + tabs.map(function (t) {
      return '<button data-act="lab-tab" data-tab="' + t[0] + '" class="' + (tab === t[0] ? 'active' : '') + '">' + t[1] + '</button>';
    }).join('') + '</div>';
  }

  function slotsHTML(s) {
    if (!E.labUnlocked(s)) {
      return '<div class="panel"><h3>Laboratory offline</h3><p class="hint">Build the Laboratory in the village (Town Hall 4) to start researching troops and spells. Wall and building upgrades below still work.</p></div>';
    }
    var running = s.labSlots.filter(function (sl) { return sl.job; });
    if (!running.length) {
      return '<div class="panel"><h3>Research slots</h3><p class="hint">' +
        s.labSlots.length + ' slot(s) idle.</p></div>';
    }
    return '<div class="panel"><h3>Research in progress</h3><div class="grid-cards">' +
      running.map(function (sl) {
        var t = E.researchTarget(sl.job.key);
        return '<div class="card"><div class="icon">' + unitIcon(t, 46, sl.job.to) +
          '</div><div class="body"><div class="title">' + ui.esc(t.name) + '<small>→ lvl ' + sl.job.to + '</small></div>' +
          ui.jobHTML(sl.job, 'data-act="skip-research" data-key="' + sl.job.key + '"') + '</div></div>';
      }).join('') + '</div></div>';
  }

  /* -------------------------------------------------------------- walls */
  function wallsPanel(s) {
    var max = E.wallMax(s);
    var summary = E.wallSummary(s);
    var levels = Object.keys(summary).map(Number).sort(function (a, b) { return a - b; });
    var pending = s.walls.filter(function (w) { return w.level < max; }).length;
    var lowest = s.walls.filter(function (w) { return w.level < max; })
      .reduce(function (a, w) { return Math.min(a, w.level); }, max);
    var nextCost = pending ? E.wallCost(lowest + 1) : 0;
    var totalToMax = s.walls.reduce(function (a, w) {
      var c = 0;
      for (var l = w.level + 1; l <= max; l++) c += E.wallCost(l);
      return a + c;
    }, 0);

    var rows = levels.map(function (l) {
      var skin = G.WALL.skin(l);
      return '<tr><td><span style="display:inline-block;width:22px;height:12px;border-radius:3px;background:' +
        skin.fill + ';box-shadow:inset 0 -3px 0 ' + skin.edge + ';margin-right:8px;vertical-align:middle"></span>' +
        'Level ' + l + ' — ' + ui.esc(skin.name) + '</td>' +
        '<td class="num">' + summary[l] + '</td>' +
        '<td class="num">' + (l < max ? ui.fmt(E.wallCost(l + 1)) + ' gold each' : '<span class="pill ok">max</span>') + '</td></tr>';
    }).join('');

    return '<div class="panel"><h3>Walls · level cap ' + max + '</h3>' +
      '<div class="stat-row" style="margin-bottom:10px">' +
        '<span>Segments <b>' + s.walls.length + '</b> / ' + G.WALL.countAt(s.th) + '</span>' +
        '<span>Below cap <b>' + pending + '</b></span>' +
        '<span>Cheapest upgrade <b>' + (pending ? ui.fmt(nextCost) + ' gold' : 'all maxed') + '</b></span>' +
        '<span>Cost to max all <b>' + (totalToMax ? ui.fmt(totalToMax) + ' gold' : '—') + '</b></span>' +
        '<span>New segment <b>' + ui.fmt(E.wallCost(1)) + ' gold</b></span>' +
      '</div>' +
      (s.walls.length
        ? '<table class="list"><tr><th>Skin</th><th class="num">Count</th><th class="num">Next level</th></tr>' + rows + '</table>'
        : '<p class="hint">No wall segments yet — buy them from the Village screen.</p>') +
      '<div class="village-tools" style="margin-top:12px">' +
        '<button class="btn" data-act="wall-bulk" data-n="1">Upgrade 1</button>' +
        '<button class="btn" data-act="wall-bulk" data-n="10">Upgrade 10</button>' +
        '<button class="btn" data-act="wall-bulk" data-n="50">Upgrade 50</button>' +
        '<button class="btn ghost" data-act="wall-bulk" data-n="9999">Spend all gold</button>' +
        '<button class="btn ghost" data-act="buy-wall">Buy segment</button>' +
      '</div>' +
      '<p class="hint">Bulk upgrades always take the lowest-level segments first, and stop when gold runs out. ' +
      'Each wall level is cut from the same materials as your buildings at that level, so the base stays one piece.</p>' +
      '</div>';
  }

  /* ---------------------------------------------------------- buildings */
  function buildingsPanel(s) {
    var groups = { townhall: [], defense: [], resource: [], army: [], trap: [] };
    s.buildings.forEach(function (b) {
      var bd = E.bdata(b.key);
      (groups[bd.cat] || groups.army).push(b);
    });
    var labels = { townhall: 'Town Hall', defense: 'Defenses', resource: 'Resource', army: 'Army', trap: 'Traps' };
    var html = '';
    Object.keys(groups).forEach(function (cat) {
      var list = groups[cat];
      if (!list.length) return;
      list.sort(function (a, b) { return a.level - b.level; });
      html += '<div class="panel"><h3>' + labels[cat] + '</h3><div class="grid-cards">' +
        list.map(function (b) {
          var bd = E.bdata(b.key);
          var name = b.key === 'townhall' ? G.thData(b.level).name : bd.name;
          var maxLvl = E.maxLevelFor(s, b.key);
          var next = b.level + 1;
          var res = E.buildingResource(b.key);
          var cost = next <= maxLvl ? E.buildingCost(s, b.key, next) : 0;
          var secs = next <= maxLvl ? E.buildingSeconds(s, b.key, next) : 0;
          var short = cost > (s.resources[res] || 0);
          return '<div class="card">' +
            '<div class="icon">' + (b.key === 'townhall'
              ? (SP.townHallKey(b.level) ? SP.img(SP.townHallKey(b.level), 46, '') : G.art.townHallSVG(b.level, 44))
              : (SP.buildingKey(b.key, b.level) ? SP.img(SP.buildingKey(b.key, b.level), 46, bd.name)
                 : G.art.buildingSVG(bd.art, G.thData(s.th).palette, 40))) + '</div>' +
            '<div class="body"><div class="title">' + ui.esc(name) + '<small>lvl ' + b.level + '/' + maxLvl + '</small></div>' +
            (b.upgrading
              ? ui.jobHTML(b.upgrading, 'data-act="skip-building" data-id="' + b.id + '"')
              : next > maxLvl
                ? '<span class="pill ok">Maxed for TH' + s.th + '</span>'
                : '<button class="btn sm" data-act="upgrade-building-inline" data-id="' + b.id + '">' +
                  'Upgrade · ' + ui.fmt(cost) + ' ' + res + '</button>' +
                  '<div class="timer">' + ui.fmtTime(secs) + (short ? ' · not enough ' + res : '') +
                  (b.key !== 'townhall' ? ' · new design at ' + next : '') + '</div>') +
            '</div></div>';
        }).join('') + '</div></div>';
    });
    return html;
  }

  /* ---------------------------------------------------------- research */
  function researchPanel(s, kind) {
    var pool = kind === 'troops' ? G.TROOPS : kind === 'spells' ? G.SPELLS : G.SIEGE;
    var title = kind === 'troops' ? 'Troop research' : kind === 'spells' ? 'Spell research' : 'Siege machine research';
    var cards = pool.map(function (t) {
      var lvl = E.researchLevel(s, t.key);
      var max = E.researchMax(s, t.key);
      var locked = s.th < t.unlockTH;
      var next = lvl + 1;
      var cost = locked ? 0 : E.researchCost(s, t.key, Math.max(1, next));
      var secs = locked ? 0 : E.researchSeconds(s, t.key, Math.max(1, next));
      var inLab = s.labSlots.some(function (sl) { return sl.job && sl.job.key === t.key; });
      var res = t.res || 'elixir';
      var short = cost > (s.resources[res] || 0);
      var icon = unitIcon(t, 46, Math.max(1, lvl));
      var nextIcon = (!locked && lvl < max) ? unitIcon(t, 40, next) : '';
      var superActive = s.superTroops[t.key] > Date.now();
      return '<div class="card' + (locked ? ' locked' : '') + '">' +
        '<div class="icon">' + icon + '</div><div class="body">' +
        '<div class="title">' + ui.esc(t.name) + '<small>' + (locked ? 'TH' + t.unlockTH : 'lvl ' + lvl + '/' + max) + '</small></div>' +
        '<div class="desc">' + ui.esc(t.role) + (t.housing ? ' · ' + t.housing + ' housing' : '') + '</div>' +
        (locked
          ? '<span class="pill">Unlocks at Town Hall ' + t.unlockTH + '</span>'
          : inLab
            ? '<span class="pill warn">In the lab</span>'
            : lvl >= max
              ? '<span class="pill ok">Maxed for TH' + s.th + '</span>'
              : '<button class="btn sm" data-act="start-research" data-key="' + t.key + '">Research ' + next + ' · ' +
                ui.fmt(cost) + ' ' + res + '</button>' +
                '<div class="timer">' + ui.fmtTime(secs) + (short ? ' · not enough ' + res : '') + '</div>') +
        (nextIcon
          ? '<div class="art-next" title="Design at level ' + next + '">' +
            '<span class="hint">next design</span>' + nextIcon + '</div>'
          : '') +
        (kind === 'troops' && s.th >= 11 && !locked
          ? '<div style="margin-top:6px">' + (superActive
              ? '<span class="pill ok">Super active · ' + ui.fmtTime((s.superTroops[t.key] - Date.now()) / 1000) + '</span>'
              : '<button class="btn sm ghost" data-act="super-troop" data-key="' + t.key + '">Activate Super · 25K dark</button>') +
            '</div>'
          : '') +
        '</div></div>';
    }).join('');
    return '<div class="panel"><h3>' + title + '</h3><div class="grid-cards">' + cards + '</div></div>';
  }

  function render(s) {
    var body;
    if (tab === 'walls') body = wallsPanel(s);
    else if (tab === 'buildings') body = buildingsPanel(s);
    else body = researchPanel(s, tab);

    return '<h2 class="screen-head">Laboratory</h2>' +
      '<p class="screen-sub">Walls and buildings are raised by your Builders; troops, spells and siege machines are researched in the Laboratory\'s ' +
      s.labSlots.length + ' research slot(s). Everything here scales with your Town Hall.</p>' +
      tabsHTML() + slotsHTML(s) + body;
  }

  function live(host) { ui.tickTimers(host); }

  /* ---------------------------------------------------------- actions */
  ui.actions['lab-tab'] = function (el) {
    tab = el.getAttribute('data-tab');
    ui.render();
  };

  ui.actions['wall-bulk'] = function (el) {
    var n = parseInt(el.getAttribute('data-n'), 10);
    var r = E.upgradeWalls(G.state, n);
    if (r.ok) ui.toast('Upgraded ' + r.done + ' segment(s) for ' + ui.fmt(r.spent) + ' gold.');
    else ui.toast(r.why, true);
    ui.render();
  };

  ui.actions['upgrade-building-inline'] = function (el) {
    if (ui.report(E.startUpgrade(G.state, el.getAttribute('data-id')), 'Upgrade started')) ui.render();
  };

  ui.actions['start-research'] = function (el) {
    if (ui.report(E.startResearch(G.state, el.getAttribute('data-key')), 'Research started')) ui.render();
  };

  ui.actions['skip-research'] = function (el) {
    var key = el.getAttribute('data-key');
    var jobs = E.inProgressJobs(G.state).filter(function (j) {
      return j.kind === 'research' && j.ref.job && j.ref.job.key === key;
    });
    if (!jobs.length) return;
    if (ui.report(E.skipWithGems(G.state, jobs[0]))) ui.render();
  };

  ui.actions['super-troop'] = function (el) {
    if (ui.report(E.activateSuperTroop(G.state, el.getAttribute('data-key')), 'Super troop active for 3 days')) ui.render();
  };

  ui.register('lab', {
    title: 'Laboratory',
    render: render,
    live: live,
    badge: function (s) {
      var busy = s.labSlots.filter(function (sl) { return sl.job; }).length;
      return busy ? busy + '/' + s.labSlots.length : '';
    }
  });
})(window.G = window.G || {});
