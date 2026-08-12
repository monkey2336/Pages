/* The building upgrade sheet.

   Structured the way an upgrade confirmation should be: what the building is
   now, what each stat becomes, what the level unlocks, and what it costs in
   resources and time -- so you can judge the upgrade before committing a
   Builder to it for a week. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine, SP = G.sprites;

  function delta(label, now, next, fmt) {
    fmt = fmt || ui.fmt;
    var gain = next - now;
    return '<div class="stat-box">' +
      '<span class="stat-label">' + ui.esc(label) + '</span>' +
      '<b>' + fmt(now) +
      (gain > 0 ? ' <span class="gain">+ ' + fmt(gain) + '</span>' : '') +
      '</b></div>';
  }

  function flat(label, value) {
    return '<div class="stat-box"><span class="stat-label">' + ui.esc(label) +
      '</span><b>' + value + '</b></div>';
  }

  // How many of a building the next Town Hall lets you own, and what it adds.
  function unlocksAtTH(level) {
    var out = [];
    G.BUILDINGS.forEach(function (bd) {
      var before = G.allowedCount(bd.key, level - 1);
      var after = G.allowedCount(bd.key, level);
      if (after > before) {
        out.push({ bd: bd, isNew: before === 0, extra: after - before });
      }
    });
    return out;
  }

  function statRows(s, b, bd, lvl, next) {
    var rows = '';
    var hasNext = next != null;
    if (bd.hp) {
      rows += delta('Hitpoints', Math.round(bd.hp * Math.pow(1.14, lvl - 1)),
        hasNext ? Math.round(bd.hp * Math.pow(1.14, next - 1)) : 0);
    }
    if (bd.dps) {
      rows += delta(bd.splash ? 'Damage per hit' : 'Damage per second',
        Math.round(bd.dps * Math.pow(1.16, lvl - 1)),
        hasNext ? Math.round(bd.dps * Math.pow(1.16, next - 1)) : 0);
    }
    if (bd.produces) {
      Object.keys(bd.produces).forEach(function (r) {
        rows += delta(r.charAt(0).toUpperCase() + r.slice(1) + ' per hour',
          Math.round(bd.produces[r] * Math.pow(1.35, lvl - 1)),
          hasNext ? Math.round(bd.produces[r] * Math.pow(1.35, next - 1)) : 0);
      });
    }
    if (bd.storage) {
      // Storage capacity is held by the Town Hall and shared across the
      // storages you own, so show this building's share of it.
      Object.keys(bd.storage).forEach(function (r) {
        var caps = E.caps(s);
        var owned = Math.max(1, E.ownedCount(s, b.key));
        rows += flat('Storage capacity', ui.fmt(Math.round((caps[r] || 0) / owned)));
      });
    }
    if (bd.range) rows += flat('Range', bd.range + ' tiles');
    if (bd.dps) rows += flat('Damage type', bd.splash ? 'Area splash' : 'Single target');
    if (bd.targets && bd.targets !== 'none') {
      rows += flat('Targets', bd.targets === 'both' ? 'Ground &amp; Air'
        : bd.targets === 'air' ? 'Air only' : 'Ground only');
    }
    return rows;
  }

  // The lowest Town Hall that allows a given level of a building, or null if
  // no Town Hall ever does -- which is what "max level" actually means.
  function townHallNeededFor(key, level) {
    if (key === 'townhall') return level <= 30 ? level : null;
    for (var th = 1; th <= 30; th++) {
      if (G.buildingMaxLevel(key, th) >= level) return th;
    }
    return null;
  }

  /* Full sheet for one building. `b` is the placed instance. */
  function sheet(s, b) {
    var isTH = b.key === 'townhall';
    var bd = E.bdata(b.key);
    var maxLvl = E.maxLevelFor(s, b.key);
    var next = b.level < maxLvl ? b.level + 1 : null;
    // Blocked by the Town Hall is a different state from finished forever.
    var wantLevel = b.level + 1;
    var needTH = next ? null : townHallNeededFor(b.key, wantLevel);
    var trulyMax = !next && !needTH;
    var name = isTH ? G.thData(b.level).name : bd.name;
    var res = E.buildingResource(b.key);
    var cost = next ? E.buildingCost(s, b.key, next) : 0;
    var secs = next ? E.buildingSeconds(s, b.key, next) : 0;
    var short = cost > (s.resources[res] || 0);
    var pct = Math.round((b.level / Math.max(1, isTH ? 30 : maxLvl)) * 100);

    var title = next
      ? 'Upgrade ' + ui.esc(name) + ' to level ' + next + '?'
      : ui.esc(name) + ' · level ' + b.level;

    var art = isTH
      ? (SP.townHallKey(next || b.level)
        ? SP.img(SP.townHallKey(next || b.level), 190, name)
        : G.art.townHallSVG(next || b.level, 170))
      : G.villageArt(b.key, next || b.level, 170);

    // What the Town Hall's next level opens up.
    var unlocks = '';
    if (isTH && next) {
      var list = unlocksAtTH(next);
      var t = G.thData(next);
      unlocks = '<div class="panel"><h3>Unlocks at ' + ui.esc(t.name) + '</h3>' +
        (list.length
          ? '<div class="unlock-row">' + list.slice(0, 12).map(function (u) {
              return '<div class="unlock-chip' + (u.isNew ? ' is-new' : '') + '" title="' +
                ui.esc(u.bd.name) + '">' +
                (u.isNew ? '<span class="new-flag">New</span>' : '<span class="new-flag more">+' + u.extra + '</span>') +
                G.villageArt(u.bd.key, 1, 46) +
                '<span>' + ui.esc(u.bd.name) + '</span></div>';
            }).join('') + '</div>'
          : '') +
        '<p class="hint" style="margin:8px 0 0">' + ui.esc(t.unlocks.join(', ')) + '</p>' +
        '</div>';
    }

    var footer = '';
    if (b.upgrading) {
      footer = '<div class="panel">' +
        ui.jobHTML(b.upgrading, 'data-act="skip-building" data-id="' + b.id + '"') + '</div>';
    } else if (next) {
      footer = '<div class="confirm-row">' +
        '<button class="btn confirm" data-act="upgrade-building" data-id="' + b.id + '">' +
          '<span class="confirm-label">Confirm</span>' +
          '<span class="confirm-cost' + (short ? ' short' : '') + '">' +
          ui.costHTML(res, cost) + '</span></button>' +
        '<div class="confirm-time"><span class="stat-label">Upgrade time</span><b>' +
          ui.fmtTime(secs) + '</b></div>' +
        '</div>' +
        (short ? '<p class="hint" style="color:#ff9a9a;margin:6px 0 0">Not enough ' + res + '.</p>' : '');
    } else if (needTH) {
      // Blocked, not finished: the level exists, your Town Hall is too low.
      // Show the price it will cost so the wait is something you can plan for.
      var blockedCost = E.buildingCost(s, b.key, wantLevel);
      footer = '<div class="th-note">' +
        '<span class="th-note-mark">!</span>' +
        '<div><b>Note!</b> You need to upgrade your Town Hall to level ' + needTH + '!</div>' +
        '</div>' +
        '<div class="confirm-row">' +
          '<button class="btn confirm locked" disabled>' +
            '<span class="confirm-label">Level ' + wantLevel + ' locked</span>' +
            '<span class="confirm-cost">' + ui.costHTML(res, blockedCost) + '</span>' +
          '</button>' +
          '<div class="confirm-time"><span class="stat-label">Upgrade time</span><b>' +
            ui.fmtTime(E.buildingSeconds(s, b.key, wantLevel)) + '</b></div>' +
        '</div>';
    } else {
      footer = '<div class="max-bar">Max Level</div>';
    }

    return '<h3>' + title + '</h3>' +
      '<div class="level-bar"><i style="width:' + pct + '%"></i>' +
        '<span>level ' + b.level + ' / ' + (isTH ? 30 : maxLvl) + '</span></div>' +
      '<div class="unit-sheet">' +
        '<div class="unit-portrait upgrade">' + art + '</div>' +
        '<div class="unit-stats"><div class="stat-grid">' +
          statRows(s, b, bd, b.level, next) +
        '</div></div>' +
      '</div>' +
      (isTH ? '' : '<p class="hint">' + ui.esc(bd.desc || '') + '</p>') +
      unlocks +
      footer;
  }

  G.upgradeSheet = {
    sheet: sheet,
    unlocksAtTH: unlocksAtTH,
    statRows: statRows,
    townHallNeededFor: townHallNeededFor
  };
})(window.G = window.G || {});
