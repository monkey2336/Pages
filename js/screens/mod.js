/* Moderator panel — the hidden dev menu from spec section 8.
   Reached by long-pressing the Town Hall badge, or from this tab once revealed. */
(function (G) {
  'use strict';

  var ui = G.ui, E = G.engine;
  var revealed = false;

  G.revealMod = function () {
    revealed = true;
    ui.go('mod');
    ui.toast('Moderator panel unlocked.');
  };

  function render(s) {
    var itemRows = G.MAGIC_ITEMS.map(function (i) {
      return '<tr><td>' + ui.esc(i.name) + '</td>' +
        '<td class="num"><input type="number" min="0" max="999" value="' + (s.items[i.key] || 0) +
        '" data-item="' + i.key + '" style="width:84px"></td>' +
        '<td><button class="btn sm ghost" data-act="mod-set-item" data-key="' + i.key + '">Set</button></td></tr>';
    }).join('');

    return '<h2 class="screen-head">Moderator Panel</h2>' +
      '<div class="mod-warning">Changes made here flag this save file. Kept separate from normal play — exactly as the spec asks.' +
      (s.moderated ? ' <b>This save is already flagged.</b>' : '') + '</div>' +

      '<div class="panel"><h3>Resources</h3>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">' +
          ['gold', 'elixir', 'dark', 'gems'].map(function (r) {
            return '<label class="field">' + r +
              '<input type="number" min="0" value="' + Math.floor(s.resources[r] || 0) + '" data-res="' + r + '">' +
              '<button class="btn sm" data-act="mod-set-res" data-key="' + r + '">Set ' + r + '</button></label>';
          }).join('') +
        '</div>' +
        '<div class="village-tools" style="margin-top:10px">' +
          '<button class="btn ghost" data-act="mod-fill">Fill all storages</button>' +
          '<button class="btn ghost" data-act="mod-gems-max">Gems → 9,999,999</button>' +
        '</div></div>' +

      '<div class="panel"><h3>Town Hall jump</h3>' +
        '<div class="stat-row" style="margin-bottom:8px"><span>Currently <b>TH' + s.th + ' — ' +
          ui.esc(G.thData(s.th).name) + '</b></span></div>' +
        '<input type="range" min="1" max="30" value="' + s.th + '" id="thSlider" data-act="mod-th-preview">' +
        '<div id="thPreview" style="display:flex;gap:14px;align-items:center;margin:10px 0">' + previewHTML(s.th) + '</div>' +
        '<button class="btn" data-act="mod-jump">Jump to that Town Hall</button>' +
        '<p class="hint" style="margin-top:8px">Jumping unlocks and places every building that Town Hall allows, and tops up walls.</p>' +
      '</div>' +

      '<div class="panel"><h3>Switches</h3>' +
        '<div class="village-tools">' +
          '<label class="toggle"><input type="checkbox" data-act="mod-instant"' +
            (s.settings.instantBuild ? ' checked' : '') + '> Instant build — all timers resolve immediately</label>' +
        '</div>' +
        '<div class="village-tools">' +
          '<label class="toggle"><input type="checkbox" data-act="mod-god"' +
            (s.settings.godMode ? ' checked' : '') + '> God mode raids — troops take no damage</label>' +
        '</div>' +
        '<div class="village-tools" style="margin-top:8px">' +
          '<button class="btn" data-act="mod-unlock-all">Unlock all — max troops, spells, heroes, buildings</button>' +
          '<button class="btn ghost" data-act="mod-items-99">Give 99 of every magic item</button>' +
          '<button class="btn ghost" data-act="mod-shield">Grant 24h shield</button>' +
        '</div></div>' +

      '<div class="panel"><h3>Magic item counts</h3>' +
        '<table class="list"><tr><th>Item</th><th class="num">Count</th><th></th></tr>' + itemRows + '</table></div>' +

      '<div class="panel"><h3>Save file</h3>' +
        '<div class="stat-row" style="margin-bottom:10px">' +
          '<span>Raids won <b>' + s.stats.raidsWon + '</b></span>' +
          '<span>Lost <b>' + s.stats.raidsLost + '</b></span>' +
          '<span>Upgrades <b>' + s.stats.upgradesDone + '</b></span>' +
          '<span>Flagged <b>' + (s.moderated ? 'yes' : 'no') + '</b></span>' +
        '</div>' +
        '<div class="village-tools">' +
          '<button class="btn ghost" data-act="export-save">Export save</button>' +
          '<button class="btn ghost" data-act="import-save">Import save</button>' +
          '<button class="btn danger" data-act="reset-save">Start a new village</button>' +
        '</div></div>';
  }

  function previewHTML(level) {
    var t = G.thData(level);
    return G.art.townHallSVG(level, 96) +
      '<div><b>' + ui.esc(t.name) + '</b><br><span class="hint">' + ui.esc(t.lore) + '</span><br>' +
      '<span class="hint">' + t.tier + ' · ' + t.builders + ' builders · ' + t.campCapacity + ' housing</span></div>';
  }

  function mount(host) {
    var slider = host.querySelector('#thSlider');
    if (!slider) return;
    slider.addEventListener('input', function () {
      host.querySelector('#thPreview').innerHTML = previewHTML(parseInt(slider.value, 10));
    });
  }

  /* ---------------------------------------------------------- actions */
  function numFor(sel) {
    var el = document.querySelector(sel);
    return el ? parseFloat(el.value) || 0 : 0;
  }

  ui.actions['mod-set-res'] = function (el) {
    var res = el.getAttribute('data-key');
    E.mod.setResource(G.state, res, numFor('[data-res="' + res + '"]'));
    ui.toast(res + ' set.');
    ui.render();
  };
  ui.actions['mod-fill'] = function () {
    var s = G.state, caps = E.caps(s);
    E.mod.setResource(s, 'gold', caps.gold);
    E.mod.setResource(s, 'elixir', caps.elixir);
    E.mod.setResource(s, 'dark', caps.dark);
    ui.toast('Storages filled.');
    ui.render();
  };
  ui.actions['mod-gems-max'] = function () {
    E.mod.setGems(G.state, 9999999);
    ui.toast('Gems set to the cap.');
    ui.render();
  };
  ui.actions['mod-jump'] = function () {
    var slider = document.querySelector('#thSlider');
    var lvl = slider ? parseInt(slider.value, 10) : G.state.th;
    E.mod.jumpToTH(G.state, lvl);
    ui.toast('Jumped to ' + G.thData(lvl).name + '.');
    ui.render();
  };
  ui.actions['mod-instant'] = function (el) {
    E.mod.setInstantBuild(G.state, el.checked);
    ui.toast('Instant build ' + (el.checked ? 'on' : 'off') + '.');
    ui.render();
  };
  ui.actions['mod-god'] = function (el) {
    E.mod.godMode(G.state, el.checked);
    ui.toast('God mode raids ' + (el.checked ? 'on' : 'off') + '.');
    ui.render();
  };
  ui.actions['mod-unlock-all'] = function () {
    E.mod.unlockAll(G.state);
    ui.toast('Everything unlocked and maxed for this Town Hall.');
    ui.render();
  };
  ui.actions['mod-items-99'] = function () {
    E.mod.maxAllItems(G.state, 99);
    ui.toast('99 of every magic item.');
    ui.render();
  };
  ui.actions['mod-set-item'] = function (el) {
    var key = el.getAttribute('data-key');
    E.mod.setItem(G.state, key, numFor('[data-item="' + key + '"]'));
    ui.toast(G.itemData[key].name + ' updated.');
    ui.render();
  };
  ui.actions['mod-shield'] = function () {
    G.state.shieldUntil = Date.now() + 24 * 3600 * 1000;
    G.state.moderated = true;
    ui.toast('Shield granted for 24 hours.');
    ui.render();
  };
  ui.actions['export-save'] = function () {
    ui.modal('<h3>Save data</h3><p class="screen-sub">Copy this somewhere safe.</p>' +
      '<textarea style="width:100%;height:220px;background:#0006;color:var(--ink);border:1px solid var(--panelEdge);border-radius:8px;padding:8px">' +
      ui.esc(JSON.stringify(G.state)) + '</textarea>');
  };
  ui.actions['import-save'] = function () {
    ui.modal('<h3>Import save</h3><p class="screen-sub">Paste an exported save file.</p>' +
      '<textarea id="importBox" style="width:100%;height:180px;background:#0006;color:var(--ink);border:1px solid var(--panelEdge);border-radius:8px;padding:8px"></textarea>' +
      '<button class="btn wide" style="margin-top:8px" data-act="import-save-go">Load it</button>');
  };
  ui.actions['import-save-go'] = function () {
    var box = document.querySelector('#importBox');
    try {
      var parsed = JSON.parse(box.value);
      if (!parsed || !parsed.resources) throw new Error('bad save');
      G.state = parsed;
      E.syncBuilders(G.state);
      E.syncLabSlots(G.state);
      G.store.save(G.state);
      ui.closeModal();
      ui.toast('Save loaded.');
      ui.render();
    } catch (e) {
      ui.toast('That is not a valid save file', true);
    }
  };
  ui.actions['reset-save'] = function () {
    ui.modal('<h3>Start a new village?</h3>' +
      '<p class="screen-sub">This wipes the current save permanently.</p>' +
      '<button class="btn danger wide" data-act="reset-save-confirm">Yes, wipe it</button>' +
      '<button class="btn ghost wide" style="margin-top:8px" data-act="close-modal">Keep playing</button>');
  };
  ui.actions['reset-save-confirm'] = function () {
    G.store.wipe();
    G.state = E.newGame();
    G.store.save(G.state);
    ui.closeModal();
    ui.go('village');
    ui.toast('New village founded.');
  };

  ui.register('mod', {
    title: 'Moderator',
    render: render,
    mount: mount,
    hidden: function (s) { return !revealed && !s.moderated; }
  });
})(window.G = window.G || {});
