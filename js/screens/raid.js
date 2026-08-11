/* Raid screen: scout a target, commit the army, read the battle report. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine;
  var targets = null;

  function rollTargets(s) {
    targets = [E.generateTarget(s, 'easy'), E.generateTarget(s, 'fair'), E.generateTarget(s, 'hard')];
  }

  function targetCard(s, t, i) {
    var power = E.armyPower(s);
    var ratio = power / Math.max(1, t.power);
    var odds = ratio > 1.6 ? ['ok', 'Favourable'] : ratio > 0.9 ? ['warn', 'Even'] : ['bad', 'Risky'];
    return '<div class="card" style="flex-direction:column">' +
      '<div style="display:flex;gap:10px;width:100%">' +
        '<div class="icon">' + G.art.townHallSVG(t.th, 52) + '</div>' +
        '<div class="body"><div class="title">' + ui.esc(t.name) + '<small>TH' + t.th + '</small></div>' +
        '<div class="desc">' + ui.esc(t.thName) + ' · defense rating ' + ui.fmt(t.power) + '</div>' +
        '<div class="stat-row">' +
          '<span>' + ui.costHTML('gold', t.loot.gold) + '</span>' +
          '<span>' + ui.costHTML('elixir', t.loot.elixir) + '</span>' +
          (t.loot.dark ? '<span>' + ui.costHTML('dark', t.loot.dark) + '</span>' : '') +
        '</div></div>' +
      '</div>' +
      '<div style="width:100%;margin-top:8px;display:flex;gap:8px;align-items:center">' +
        '<span class="pill ' + odds[0] + '">' + odds[1] + '</span>' +
        '<button class="btn sm" data-act="attack" data-idx="' + i + '">Attack</button>' +
      '</div></div>';
  }

  function reportRow(r) {
    var stars = '★★★'.slice(0, r.stars) + '☆☆☆'.slice(0, 3 - r.stars);
    return '<tr>' +
      '<td>' + (r.kind === 'attack' ? 'Raid on ' : 'Defended vs ') + ui.esc(r.target) + '</td>' +
      '<td><span class="stars">' + stars + '</span></td>' +
      '<td class="num">' + r.destruction + '%</td>' +
      '<td class="num">' + (r.kind === 'attack' ? '+' : '−') + ui.fmt(r.loot.gold) + ' / ' +
        (r.kind === 'attack' ? '+' : '−') + ui.fmt(r.loot.elixir) +
        (r.loot.dark ? ' / ' + (r.kind === 'attack' ? '+' : '−') + ui.fmt(r.loot.dark) : '') + '</td>' +
      '<td class="num">' + (r.trophies >= 0 ? '+' : '') + r.trophies + '</td>' +
      '</tr>';
  }

  function render(s) {
    if (!targets) rollTargets(s);
    var shield = s.shieldUntil > Date.now();
    var head = '<h2 class="screen-head">Raid</h2>' +
      '<p class="screen-sub">Battles resolve by comparing your army, heroes, spells and research against the target\'s defenses. ' +
      'Loot scales with destruction and the Town Hall gap. Your army is spent either way.</p>';

    var status = '<div class="panel"><h3>Warband</h3><div class="stat-row">' +
      '<span>Army power <b>' + ui.fmt(E.armyPower(s)) + '</b></span>' +
      '<span>Housing used <b>' + E.armyUsed(s) + '/' + E.campCapacity(s) + '</b></span>' +
      '<span>Home defense <b>' + ui.fmt(E.defensePower(s)) + '</b></span>' +
      '<span>Trophies <b>' + s.trophies + '</b></span>' +
      '<span>Shield <b>' + (shield ? ui.fmtTime((s.shieldUntil - Date.now()) / 1000) : 'none') + '</b></span>' +
      '</div>' +
      (s.settings.godMode ? '<p class="hint" style="color:#ffb3bd;margin-top:8px">God mode raids are on — troops take no damage.</p>' : '') +
      '</div>';

    var scout = '<div class="panel"><h3>Scouted bases</h3>' +
      '<div class="grid-cards">' + targets.map(function (t, i) { return targetCard(s, t, i); }).join('') + '</div>' +
      '<button class="btn ghost" style="margin-top:10px" data-act="reroll">Scout new bases</button></div>';

    var log = s.raidLog.length
      ? '<div class="panel"><h3>Battle log</h3><table class="list">' +
        '<tr><th>Battle</th><th>Stars</th><th class="num">Destruction</th><th class="num">Loot</th><th class="num">Trophies</th></tr>' +
        s.raidLog.map(reportRow).join('') + '</table></div>'
      : '';

    return head + status + scout + log;
  }

  ui.actions['reroll'] = function () { rollTargets(G.state); ui.render(); };

  ui.actions['attack'] = function (el) {
    var s = G.state;
    var t = targets[parseInt(el.getAttribute('data-idx'), 10)];
    if (!t) return;
    var r = E.raid(s, t);
    if (!r.ok) { ui.toast(r.why, true); return; }
    var res = r.result;
    var stars = '★★★'.slice(0, res.stars) + '☆☆☆'.slice(0, 3 - res.stars);
    ui.modal('<h3>Battle report — ' + ui.esc(res.target) + '</h3>' +
      '<p class="screen-sub"><span class="stars" style="font-size:22px">' + stars + '</span> · ' +
      res.destruction + '% destruction</p>' +
      '<div class="panel"><h3>Loot</h3><div class="stat-row">' +
        '<span>' + ui.costHTML('gold', res.loot.gold) + '</span>' +
        '<span>' + ui.costHTML('elixir', res.loot.elixir) + '</span>' +
        '<span>' + ui.costHTML('dark', res.loot.dark) + '</span>' +
        '<span>Trophies <b>' + (res.trophies >= 0 ? '+' : '') + res.trophies + '</b></span>' +
      '</div></div>' +
      '<button class="btn wide" data-act="close-modal">Back to the village</button>');
    rollTargets(s);
    ui.render();
  };

  ui.register('raid', {
    title: 'Raid',
    render: render,
    badge: function (s) { return s.shieldUntil > Date.now() ? 'shield' : ''; }
  });
})(window.G = window.G || {});
