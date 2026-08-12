/* Magic items, boosts and gem spending. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine;

  var TYPE_LABEL = {
    hammer: 'Hammers — instantly complete an upgrade at your current max',
    rune: 'Runes — instantly fill a storage',
    book: 'Books — finish an upgrade already in progress',
    potion: 'Potions — time-limited multipliers',
    ore: 'Ore — hero equipment currency',
    decoration: 'Decorations'
  };

  // Item tile: art, count over cap, and a use action. Empty tiles grey out
  // rather than disappearing, so the collection reads as a set.
  var TYPE_GLYPH = {
    hammer: '#c9a227', book: '#a8623c', rune: '#7f5fd8',
    potion: '#c05cf0', ore: '#8fb6c9', decoration: '#5f9a6b'
  };

  function itemCard(s, item) {
    var have = s.items[item.key] || 0;
    var usable = have > 0 && item.type !== 'ore' && item.type !== 'decoration';
    var active = item.type === 'potion' &&
      E.boostActive(s, item.key === 'potion_clock' ? 'clocktower' : item.key);
    var full = have >= item.cap;
    return '<div class="item-tile' + (have ? '' : ' empty') + (active ? ' active' : '') +
      '" title="' + ui.esc(item.name + ' — ' + item.effect) + '">' +
      '<div class="item-art" style="--item:' + (TYPE_GLYPH[item.type] || '#888') + '">' +
        '<span class="item-type">' + ui.esc(item.type) + '</span></div>' +
      '<div class="item-name">' + ui.esc(item.name) + '</div>' +
      '<div class="item-count' + (full ? ' full' : '') + '">' + have + '/' + item.cap + '</div>' +
      (active
        ? '<span class="pill ok">Active</span>'
        : usable
          ? '<button class="btn sm" data-act="use-item" data-key="' + item.key + '">Use</button>'
          : '') +
      '</div>';
  }

  function boostsPanel(s) {
    var active = Object.keys(s.boosts).filter(function (k) { return s.boosts[k] > Date.now(); });
    if (!active.length) return '';
    return '<div class="panel"><h3>Active boosts</h3><div class="stat-row">' +
      active.map(function (k) {
        var item = G.itemData[k];
        var name = item ? item.name : (k === 'clocktower' ? 'Clock Tower boost' : k);
        return '<span class="pill ok">' + ui.esc(name) + ' · ' + ui.fmtTime((s.boosts[k] - Date.now()) / 1000) + '</span>';
      }).join('') + '</div></div>';
  }

  function gemsPanel(s) {
    var jobs = E.inProgressJobs(s);
    return '<div class="panel"><h3>Gems</h3>' +
      '<div class="stat-row" style="margin-bottom:10px">' +
        '<span>Held <b>' + ui.fmt(s.resources.gems) + '</b></span>' +
        '<span>Builders <b>' + s.builders.length + '</b></span>' +
      '</div>' +
      '<div class="village-tools">' +
        '<button class="btn" data-act="buy-builder">Hire another builder</button>' +
        '<button class="btn ghost" data-act="gem-resources" data-res="gold">Gold pack · 250 gems</button>' +
        '<button class="btn ghost" data-act="gem-resources" data-res="elixir">Elixir pack · 250 gems</button>' +
        (s.th >= 7 ? '<button class="btn ghost" data-act="gem-resources" data-res="dark">Dark pack · 400 gems</button>' : '') +
        '<button class="btn ghost" data-act="boost-clock">Boost Clock Tower</button>' +
      '</div>' +
      (jobs.length
        ? '<table class="list" style="margin-top:12px"><tr><th>In progress</th><th>Kind</th><th class="num">Finish</th></tr>' +
          jobs.map(function (j, i) {
            var left = Math.max(0, (j.ends - Date.now()) / 1000);
            return '<tr><td>' + ui.esc(j.label) + '</td><td>' + j.kind + '</td>' +
              '<td class="num"><button class="btn sm ghost" data-act="skip-job" data-idx="' + i + '">' +
              E.gemsToSkip(left) + ' gems · ' + ui.fmtTime(left) + '</button></td></tr>';
          }).join('') + '</table>'
        : '<p class="hint" style="margin-top:10px">Nothing is under construction.</p>') +
      '</div>';
  }

  function render(s) {
    var byType = {};
    G.MAGIC_ITEMS.forEach(function (i) {
      (byType[i.type] = byType[i.type] || []).push(i);
    });
    var panels = Object.keys(byType).map(function (type) {
      return '<div class="panel"><h3>' + ui.esc(TYPE_LABEL[type] || type) + '</h3><div class="item-grid">' +
        byType[type].map(function (i) { return itemCard(s, i); }).join('') + '</div></div>';
    }).join('');

    return '<h2 class="screen-head">Items &amp; Gems</h2>' +
      '<p class="screen-sub">Magic items range from finishing an upgrade outright to boosting your village and army. ' +
      'You can only hold a limited number of each at once — the number under each tile is what you hold against that limit. ' +
      'Season rewards and event chests drop them, or set them yourself from the Moderator panel.</p>' +
      boostsPanel(s) + gemsPanel(s) + panels;
  }

  function live(host) { ui.tickTimers(host); }

  ui.actions['use-item'] = function (el) {
    if (ui.report(E.useItem(G.state, el.getAttribute('data-key')))) ui.render();
  };
  ui.actions['buy-builder'] = function () {
    if (ui.report(E.buyBuilder(G.state))) ui.render();
  };
  ui.actions['gem-resources'] = function (el) {
    var s = G.state, res = el.getAttribute('data-res');
    var price = res === 'dark' ? 400 : 250;
    if (s.resources.gems < price) { ui.toast('Needs ' + price + ' gems', true); return; }
    s.resources.gems -= price;
    var caps = E.caps(s);
    E.addResource(s, res, Math.round((caps[res] || 0) * 0.35));
    ui.toast('Resource pack added.');
    ui.render();
  };
  ui.actions['boost-clock'] = function () {
    var s = G.state;
    if (E.ownedCount(s, 'clocktower') === 0) { ui.toast('Build the Clock Tower first', true); return; }
    if (s.resources.gems < 20) { ui.toast('Needs 20 gems', true); return; }
    s.resources.gems -= 20;
    s.boosts.clocktower = Date.now() + 30 * 60 * 1000;
    ui.toast('Clock Tower boosted — everything runs 8× faster.');
    ui.render();
  };

  ui.register('items', { title: 'Items', render: render, live: live });
})(window.G = window.G || {});
