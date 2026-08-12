/* The Shop: where new buildings and traps are bought.

   Upgrading an existing building and buying another one are different
   decisions, so they live in different places -- the village board handles
   upgrades, this handles the "what else can I put down" question. Cards carry
   the three numbers that decide it: how many you already own against your
   allowance, how long the build takes, and what it costs. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine;

  var CATS = [
    { key: 'army', label: 'Army' },
    { key: 'resource', label: 'Resources' },
    { key: 'defense', label: 'Defenses' },
    { key: 'trap', label: 'Traps' }
  ];

  var activeCat = 'army';

  function art(key, level, px) {
    return G.villageArt ? G.villageArt(key, level, px) : '';
  }

  // The next Town Hall that raises this building's allowance -- the answer to
  // "I am at the limit, so when do I get another one?".
  function nextCountTH(key, th) {
    var now = G.allowedCount(key, th);
    for (var t = th + 1; t <= 30; t++) {
      if (G.allowedCount(key, t) > now) return t;
    }
    return null;
  }

  function statePill(s, bd, owned, allowed) {
    if (s.th < bd.unlockTH) {
      return '<span class="shop-lock">Town Hall ' + bd.unlockTH + '</span>';
    }
    if (owned < allowed) return '';
    var more = nextCountTH(bd.key, s.th);
    return more
      ? '<span class="shop-lock">More at Town Hall ' + more + '</span>'
      : '<span class="shop-lock max">Limit reached</span>';
  }

  function card(s, bd) {
    var allowed = G.allowedCount(bd.key, s.th);
    var owned = E.ownedCount(s, bd.key);
    var locked = s.th < bd.unlockTH;
    var canB = !locked && owned < allowed;
    var cost = E.buildingCost(s, bd.key, 1);
    var secs = E.buildingSeconds(s, bd.key, 1);
    var short = (s.resources[bd.res] || 0) < cost;

    return '<div class="shop-card' + (canB ? '' : ' off') + '">' +
      '<button class="shop-info" data-act="shop-info" data-key="' + bd.key +
        '" title="About the ' + ui.esc(bd.name) + '">i</button>' +
      '<div class="shop-art">' + art(bd.key, 1, 84) + '</div>' +
      '<div class="shop-name">' + ui.esc(bd.name) + '</div>' +
      '<div class="shop-time">' + ui.fmtTime(secs) + '</div>' +
      '<div class="shop-built">Built: <b>' + owned + '/' + (locked ? '—' : allowed) + '</b></div>' +
      statePill(s, bd, owned, allowed) +
      (canB
        ? '<button class="btn shop-buy" data-act="build-new" data-key="' + bd.key + '">' +
            '<span class="shop-buy-label">Build</span>' + ui.costHTML(bd.res, cost, short) + '</button>'
        : '') +
      '</div>';
  }

  // Walls are bought a segment at a time rather than placed like a building,
  // but players look for them in the shop, so they belong on the Defenses tab.
  function wallCard(s) {
    var allowed = G.WALL.countAt(s.th);
    var owned = s.walls.length;
    var cost = E.wallCost(1);
    var canB = owned < allowed;
    var short = s.resources.gold < cost;
    var skinLvl = Math.min(30, Math.max(1, s.th));
    var wKey = G.sprites.wallKey(skinLvl);
    return '<div class="shop-card' + (canB ? '' : ' off') + '">' +
      '<button class="shop-info" data-act="shop-info" data-key="wall" title="About Walls">i</button>' +
      '<div class="shop-art">' + (wKey
        ? G.sprites.img(wKey, 84, 'Wall')
        : '<div class="wall-swatch" style="background:' + G.WALL.skin(skinLvl).fill +
          ';border-color:' + G.WALL.skin(skinLvl).edge + '"></div>') + '</div>' +
      '<div class="shop-name">Wall</div>' +
      '<div class="shop-time">Instant</div>' +
      '<div class="shop-built">Built: <b>' + owned + '/' + allowed + '</b></div>' +
      (canB ? '' : '<span class="shop-lock">More at Town Hall ' + (s.th + 1) + '</span>') +
      (canB
        ? '<button class="btn shop-buy" data-act="buy-wall">' +
            '<span class="shop-buy-label">Buy</span>' + ui.costHTML('gold', cost, short) + '</button>'
        : '') +
      '</div>';
  }

  // Buyable first, then things you have maxed out, then things a higher Town
  // Hall will open -- so the top of the grid is always what you can act on.
  function sortForShop(s, list) {
    return list.slice().sort(function (a, b) {
      function rank(bd) {
        if (s.th < bd.unlockTH) return 2;
        return E.ownedCount(s, bd.key) < G.allowedCount(bd.key, s.th) ? 0 : 1;
      }
      var d = rank(a) - rank(b);
      return d || (a.unlockTH - b.unlockTH);
    });
  }

  function render(s) {
    var busy = E.busyBuilders(s), total = s.builders.length;
    var list = sortForShop(s, G.BUILDINGS.filter(function (bd) { return bd.cat === activeCat; }));
    var cards = list.map(function (bd) { return card(s, bd); }).join('');
    if (activeCat === 'defense' && s.th >= 2) cards = wallCard(s) + cards;

    var tabs = CATS.map(function (c) {
      var n = G.BUILDINGS.filter(function (bd) {
        return bd.cat === c.key && s.th >= bd.unlockTH &&
          E.ownedCount(s, bd.key) < G.allowedCount(bd.key, s.th);
      }).length;
      return '<button class="shop-tab' + (c.key === activeCat ? ' active' : '') +
        '" data-act="shop-cat" data-cat="' + c.key + '">' + ui.esc(c.label) +
        (n ? '<span class="badge">' + n + '</span>' : '') + '</button>';
    }).join('');

    return '<h2 class="screen-head">Buildings &amp; Traps</h2>' +
      '<p class="screen-sub">Everything your Town Hall allows you to own. ' +
      '"Built" counts what stands in your village against the allowance for Town Hall ' + s.th + '. ' +
      'Buying one puts a builder to work and drops it on the first free patch of ground.</p>' +
      '<div class="shop-tabs">' + tabs + '</div>' +
      '<div class="shop-grid">' + cards + '</div>' +
      '<div class="shop-foot">' +
        '<span class="pill' + (busy === total ? ' warn' : ' ok') + '">Builders ' + (total - busy) + '/' + total + '</span>' +
        ui.costHTML('gold', s.resources.gold) +
        ui.costHTML('elixir', s.resources.elixir) +
        (s.th >= 7 ? ui.costHTML('dark', s.resources.dark) : '') +
        '<button class="btn ghost sm" data-nav="village">Back to village</button>' +
      '</div>';
  }

  /* ------------------------------------------------------------- info */
  // What owning one of these is actually worth, before you spend on it.
  function infoModal(s, key) {
    if (key === 'wall') {
      var lvl = Math.min(30, Math.max(1, s.th));
      var skin = G.WALL.skin(lvl);
      return '<h3>Wall</h3>' +
        '<p class="hint">' + ui.esc(G.WALL.desc) + '</p>' +
        '<div class="stat-grid">' +
          '<div class="stat-box"><span class="stat-label">Segments allowed</span><b>' +
            G.WALL.countAt(s.th) + '</b></div>' +
          '<div class="stat-box"><span class="stat-label">Max level</span><b>' +
            G.WALL.maxLevelAt(s.th) + '</b></div>' +
          '<div class="stat-box"><span class="stat-label">Current look</span><b>' +
            ui.esc(skin.name) + '</b></div>' +
          '<div class="stat-box"><span class="stat-label">Segment cost</span><b>' +
            ui.fmt(E.wallCost(1)) + ' gold</b></div>' +
        '</div>' +
        '<p class="hint">Raise them in bulk from the Laboratory — the look changes with the level, ' +
        'matching the era your Town Hall is in.</p>';
    }

    var bd = E.bdata(key);
    var owned = E.ownedCount(s, key);
    var allowed = G.allowedCount(key, s.th);
    var rows = G.upgradeSheet.statRows(s, { key: key, level: 1 }, bd, 1, null);

    // Allowance across the Town Halls, collapsed to the levels where it moves.
    var steps = [], last = 0;
    for (var th = bd.unlockTH; th <= 30; th++) {
      var n = G.allowedCount(key, th);
      if (n !== last) { steps.push({ th: th, n: n }); last = n; }
    }

    return '<h3>' + ui.esc(bd.name) + '</h3>' +
      '<div class="unit-sheet">' +
        '<div class="unit-portrait">' + art(key, Math.max(1, owned ? 1 : 1), 150) + '</div>' +
        '<div class="unit-stats"><div class="stat-grid">' +
          '<div class="stat-box"><span class="stat-label">Owned</span><b>' + owned + ' / ' + allowed + '</b></div>' +
          '<div class="stat-box"><span class="stat-label">Unlocks at</span><b>Town Hall ' + bd.unlockTH + '</b></div>' +
          '<div class="stat-box"><span class="stat-label">Footprint</span><b>' + bd.size + '×' + bd.size + '</b></div>' +
          '<div class="stat-box"><span class="stat-label">Build time</span><b>' +
            ui.fmtTime(E.buildingSeconds(s, key, 1)) + '</b></div>' +
          rows +
        '</div></div>' +
      '</div>' +
      '<p class="hint">' + ui.esc(bd.desc || '') + '</p>' +
      '<div class="panel"><h3>Allowance by Town Hall</h3><div class="unlock-row">' +
        steps.map(function (st) {
          return '<span class="pill' + (s.th >= st.th ? ' ok' : '') + '">TH' + st.th + ' · ' + st.n + '</span>';
        }).join('') +
      '</div></div>';
  }

  /* ---------------------------------------------------------- actions */
  ui.actions['shop-cat'] = function (el) {
    activeCat = el.getAttribute('data-cat');
    ui.render();
  };

  ui.actions['shop-info'] = function (el) {
    ui.modal(infoModal(G.state, el.getAttribute('data-key')));
  };

  ui.register('shop', { title: 'Shop', render: render });

  G.shop = { openCat: function (cat) { activeCat = cat; ui.go('shop'); } };
})(window.G = window.G || {});
