/* Army screen: train troops into your camps and brew spells. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine, SP = G.sprites;

  // Blender render when we have one, vector silhouette otherwise.
  function unitIcon(u, px, level) {
    var key = SP.unitKey(u.key, level || 1);
    return key ? SP.img(key, px, u.name) : G.art.unitSVG(u.art, u.tint, px, u.air);
  }

  function capacityPanel(s) {
    var used = E.armyUsed(s), cap = E.campCapacity(s);
    var sUsed = E.spellSlotsUsed(s), sCap = E.spellCapacity(s);
    return '<div class="panel"><h3>Army camps</h3>' +
      '<div class="stat-row" style="margin-bottom:8px">' +
        '<span>Housing <b>' + used + '</b> / ' + cap + '</span>' +
        '<span>Spell slots <b>' + sUsed + '</b> / ' + sCap + '</span>' +
        '<span>Army power <b>' + ui.fmt(E.armyPower(s)) + '</b></span>' +
      '</div>' +
      '<div class="progress"><i style="width:' + (cap ? Math.min(100, used / cap * 100) : 0) + '%"></i></div>' +
      '<div class="village-tools" style="margin-top:10px">' +
        '<button class="btn ghost" data-act="clear-army">Dismiss army</button>' +
        '<button class="btn ghost" data-act="clear-spells">Pour out spells</button>' +
        '<span class="hint">Your army and spells are spent when you raid.</span>' +
      '</div></div>';
  }

  function currentArmyPanel(s) {
    var keys = Object.keys(s.army).filter(function (k) { return s.army[k] > 0; });
    var spells = Object.keys(s.spellsBrewed || {}).filter(function (k) { return s.spellsBrewed[k] > 0; });
    if (!keys.length && !spells.length) return '';
    return '<div class="panel"><h3>Ready to deploy</h3><div class="grid-cards">' +
      keys.map(function (k) {
        var t = G.troopData[k];
        return '<div class="card"><div class="icon">' +
          unitIcon(t, 58, Math.max(1, E.researchLevel(s, k))) + '</div>' +
          '<div class="body"><div class="title">' + ui.esc(t.name) + '<small>×' + s.army[k] + '</small></div>' +
          '<div class="desc">' + (t.housing * s.army[k]) + ' housing · lvl ' + Math.max(1, E.researchLevel(s, k)) + '</div>' +
          '</div></div>';
      }).join('') +
      spells.map(function (k) {
        var sp = G.spellData[k];
        return '<div class="card"><div class="icon">' + G.art.spellSVG(sp.tint, 40) + '</div>' +
          '<div class="body"><div class="title">' + ui.esc(sp.name) + '<small>×' + s.spellsBrewed[k] + '</small></div>' +
          '<div class="desc">' + ui.esc(sp.role) + '</div></div></div>';
      }).join('') +
      '</div></div>';
  }

  function troopPanel(s, res, title) {
    var list = G.TROOPS.filter(function (t) { return t.res === res; });
    return '<div class="panel"><h3>' + title + '</h3><div class="grid-cards">' +
      list.map(function (t) {
        var unlocked = E.troopUnlocked(s, t.key);
        var cost = E.troopCost(s, t.key);
        var lvl = Math.max(1, E.researchLevel(s, t.key));
        var superOn = s.superTroops[t.key] > Date.now();
        return '<div class="card' + (unlocked ? '' : ' locked') + '">' +
          '<div class="icon info-hit" data-act="unit-info" data-key="' + t.key + '" title="Stats">' +
            unitIcon(t, 50, lvl) + '</div><div class="body">' +
          '<div class="title"><span class="info-hit" data-act="unit-info" data-key="' + t.key + '">' +
            (superOn ? 'Super ' : '') + ui.esc(t.name) + '</span>' +
            '<small>' + t.housing + ' housing</small></div>' +
          '<div class="desc">' + ui.esc(t.role) + '</div>' +
          (unlocked
            ? '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
              '<button class="btn sm" data-act="train" data-key="' + t.key + '" data-n="1">+1 · ' + ui.fmt(cost) + '</button>' +
              '<button class="btn sm ghost" data-act="train" data-key="' + t.key + '" data-n="5">+5</button>' +
              '<button class="btn sm ghost" data-act="train" data-key="' + t.key + '" data-n="999">Fill</button>' +
              '</div><div class="timer">level ' + lvl + ' · ' + t.res + '</div>'
            : '<span class="pill">' + (s.th < t.unlockTH ? 'Town Hall ' + t.unlockTH
                : 'Needs ' + (t.res === 'dark' ? 'Dark Barracks' : 'Barracks')) + '</span>') +
          '</div></div>';
      }).join('') + '</div></div>';
  }

  function spellPanel(s) {
    return '<div class="panel"><h3>Spell brewing</h3><div class="grid-cards">' +
      G.SPELLS.map(function (sp) {
        var unlocked = E.spellUnlocked(s, sp.key);
        var cost = E.spellCost(s, sp.key);
        return '<div class="card' + (unlocked ? '' : ' locked') + '">' +
          '<div class="icon info-hit" data-act="unit-info" data-key="' + sp.key + '">' +
            G.art.spellSVG(sp.tint, 40) + '</div><div class="body">' +
          '<div class="title"><span class="info-hit" data-act="unit-info" data-key="' + sp.key + '">' +
            ui.esc(sp.name) + '</span>' + '<small>' + sp.slots + ' slot' + (sp.slots === 1 ? '' : 's') + '</small></div>' +
          '<div class="desc">' + ui.esc(sp.role) + '</div>' +
          (unlocked
            ? '<button class="btn sm" data-act="brew" data-key="' + sp.key + '">Brew · ' + ui.fmt(cost) + ' ' + sp.res + '</button>'
            : '<span class="pill">' + (s.th < sp.unlockTH ? 'Town Hall ' + sp.unlockTH : 'Needs Spell Factory') + '</span>') +
          '</div></div>';
      }).join('') + '</div></div>';
  }

  function siegePanel(s) {
    if (s.th < 10) return '';
    return '<div class="panel"><h3>Siege machines</h3><div class="grid-cards">' +
      G.SIEGE.map(function (m) {
        var lvl = E.researchLevel(s, m.key);
        var locked = s.th < m.unlockTH || E.ownedCount(s, 'siegeworkshop') === 0;
        return '<div class="card' + (locked ? ' locked' : '') + '">' +
          '<div class="icon info-hit" data-act="unit-info" data-key="' + m.key + '">' +
            unitIcon(m, 58, Math.max(1, lvl)) + '</div><div class="body">' +
          '<div class="title"><span class="info-hit" data-act="unit-info" data-key="' + m.key + '">' +
            ui.esc(m.name) + '</span>' + '<small>' + (locked ? 'TH' + m.unlockTH : 'lvl ' + lvl) + '</small></div>' +
          '<div class="desc">' + ui.esc(m.role) + '</div>' +
          (locked ? '<span class="pill">Needs Siege Workshop · TH' + m.unlockTH + '</span>'
                  : '<span class="pill ok">Available</span>') +
          '</div></div>';
      }).join('') + '</div></div>';
  }

  function render(s) {
    return '<h2 class="screen-head">Army</h2>' +
      '<p class="screen-sub">Troops sit in your camps until you raid. Research their levels in the Laboratory — a level 8 Grunt costs the same housing as a level 1 one.</p>' +
      capacityPanel(s) + currentArmyPanel(s) +
      troopPanel(s, 'elixir', 'Elixir troops · Barracks') +
      (s.th >= 7 ? troopPanel(s, 'dark', 'Dark elixir troops · Dark Barracks') : '') +
      (s.th >= 5 ? spellPanel(s) : '') +
      siegePanel(s);
  }

  ui.actions['train'] = function (el) {
    var r = E.trainTroop(G.state, el.getAttribute('data-key'), parseInt(el.getAttribute('data-n'), 10));
    if (r.ok) ui.toast('Trained ' + r.trained); else ui.toast(r.why, true);
    ui.render();
  };
  ui.actions['brew'] = function (el) {
    var r = E.brewSpell(G.state, el.getAttribute('data-key'), 1);
    if (r.ok) ui.toast('Brewed ' + r.made); else ui.toast(r.why, true);
    ui.render();
  };
  ui.actions['clear-army'] = function () { E.clearArmy(G.state); ui.render(); };
  ui.actions['clear-spells'] = function () { E.clearSpells(G.state); ui.render(); };

  ui.register('army', {
    title: 'Army',
    render: render,
    badge: function (s) {
      var used = E.armyUsed(s);
      return used ? used + '/' + E.campCapacity(s) : '';
    }
  });
})(window.G = window.G || {});
